/**
 * Post-deploy verification for the `20261007120000_stamps_only` migration.
 *
 * Read-only. Checks the final schema, data invariants and, when given the
 * JSON produced by stamps-migration-precheck.ts, compares every converted card
 * with the predicted balance (run it while maintenance mode is still on so no
 * new transaction skews the comparison).
 *
 * Usage:
 *   DATABASE_URL=... npx ts-node scripts/stamps-migration-postcheck.ts [--precheck report.json]
 *
 * Exit code 1 when any check fails.
 */
import { readFileSync } from 'fs';
import { PrismaClient } from '@prisma/client';

const MIGRATION = '20261007120000_stamps_only';

const prisma = new PrismaClient();

type Row = Record<string, unknown>;

interface PrecheckReport {
  migration: string;
  merchants: Array<{ id: string; balance_after: number; rewards: Array<{ id: string; after: number }> }>;
  cards: Array<{ id: string; after: number }>;
}

const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));

async function main() {
  const preIdx = process.argv.indexOf('--precheck');
  const precheck: PrecheckReport | null =
    preIdx > -1 && process.argv[preIdx + 1] ? JSON.parse(readFileSync(process.argv[preIdx + 1], 'utf8')) : null;

  const failures: string[] = [];
  const ok: string[] = [];
  const check = (cond: boolean, label: string) => (cond ? ok : failures).push(label);

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    const q = (sql: string) => tx.$queryRawUnsafe<Row[]>(sql);

    const [mig] = await q(`SELECT finished_at, rolled_back_at FROM _prisma_migrations WHERE migration_name = '${MIGRATION}'`);
    check(!!mig?.finished_at && !mig?.rolled_back_at, `migration ${MIGRATION} appliquée`);

    const legacyCols = await q(`
      SELECT table_name || '.' || column_name AS col FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND (table_name, column_name) IN (('merchants','loyalty_type'),('merchants','points_rate'),
              ('merchants','points_rules'),('merchants','conversion_rate'),('loyalty_cards','points'),
              ('transactions','points'),('transactions','loyalty_type'),('lucky_wheel_campaigns','ticket_cost_points'))`);
    check(legacyCols.length === 0, `aucune colonne « points » restante${legacyCols.length ? ` (${legacyCols.map((c) => c.col).join(', ')})` : ''}`);

    const newCols = await q(`
      SELECT COUNT(*)::int AS n FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND (table_name, column_name) IN (('merchants','amount_per_stamp'),('loyalty_cards','stamps'),
              ('transactions','stamps'),('lucky_wheel_campaigns','ticket_cost_stamps'))`);
    check(num(newCols[0].n) === 4, 'colonnes tampons présentes (4/4)');

    const [types] = await q(`
      SELECT to_regtype('"LoyaltyType"') IS NULL AS loyalty_type_dropped,
             enum_range(NULL::"TransactionType")::text AS tx_types`);
    check(types.loyalty_type_dropped === true, 'enum LoyaltyType supprimé');
    check(
      String(types.tx_types) === '{EARN_STAMPS,REDEEM_REWARD,ADJUST_STAMPS,LOYALTY_PROGRAM_CHANGE,LUCKY_WHEEL_WIN}',
      `TransactionType = ${types.tx_types}`,
    );

    const [inv] = await q(`
      SELECT (SELECT COUNT(*)::int FROM loyalty_cards WHERE stamps < 0) AS negative_cards,
             (SELECT COUNT(*)::int FROM rewards WHERE cout < 1) AS free_rewards,
             (SELECT COUNT(*)::int FROM merchants WHERE amount_per_stamp <= 0) AS bad_rate,
             (SELECT COUNT(*)::int FROM loyalty_cards lc JOIN merchants m ON m.id = lc.merchant_id
               WHERE m.accumulation_limit IS NOT NULL AND lc.stamps > m.accumulation_limit) AS over_limit`);
    check(num(inv.negative_cards) === 0, `aucun solde négatif (${inv.negative_cards})`);
    check(num(inv.free_rewards) === 0, `aucun cadeau à 0 tampon (${inv.free_rewards})`);
    check(num(inv.bad_rate) === 0, `montant par tampon > 0 partout (${inv.bad_rate})`);
    check(num(inv.over_limit) === 0, `aucune carte au-dessus de la limite d'accumulation (${inv.over_limit})`);

    const audits = await q(`
      SELECT a.merchant_id, (a.metadata->'after'->>'totalBalance')::bigint AS after_total,
             (SELECT COALESCE(SUM(lc.stamps), 0)::bigint FROM loyalty_cards lc WHERE lc.merchant_id = a.merchant_id) AS current_total,
             (SELECT COUNT(*)::int FROM transactions t WHERE t.merchant_id = a.merchant_id AND t.type = 'LOYALTY_PROGRAM_CHANGE'
                AND t.note = 'Programme de fidélité modifié : vos points ont été convertis en tampons') AS history_entries,
             (SELECT COUNT(*)::int FROM loyalty_cards lc WHERE lc.merchant_id = a.merchant_id AND lc.deactivated_at IS NULL) AS active_cards
        FROM audit_logs a
       WHERE a.admin_email = 'system:stamps-only-migration' AND a.metadata->>'migration' = '${MIGRATION}'`);
    console.log(`Commerçants convertis (audit) : ${audits.length}`);
    const drifted = audits.filter((a) => num(a.after_total) !== num(a.current_total));
    if (drifted.length) {
      console.log(`  ${drifted.length} commerçant(s) ont un solde total différent de l'instantané de migration (transactions depuis ?)`);
    }
    check(audits.every((a) => a.after_total !== null), 'instantané « after » présent pour chaque commerçant converti');
    check(
      audits.every((a) => num(a.history_entries) >= num(a.active_cards)),
      'entrée d\'historique « conversion » pour chaque carte active',
    );

    if (precheck) {
      check(precheck.migration === MIGRATION, `rapport de pré-vérification pour ${MIGRATION}`);
      const expectedIds = new Set(precheck.merchants.map((m) => m.id));
      const actualIds = new Set(audits.map((a) => String(a.merchant_id)));
      check(
        expectedIds.size === actualIds.size && [...expectedIds].every((id) => actualIds.has(id)),
        `commerçants convertis = prévus (${actualIds.size}/${expectedIds.size})`,
      );

      const cardRows = await q(`SELECT id, stamps FROM loyalty_cards`);
      const stampsById = new Map(cardRows.map((c) => [String(c.id), num(c.stamps)]));
      const cardMismatches = precheck.cards.filter((c) => stampsById.get(c.id) !== c.after);
      check(cardMismatches.length === 0, `soldes conformes aux prévisions (${precheck.cards.length - cardMismatches.length}/${precheck.cards.length})`);
      cardMismatches.slice(0, 20).forEach((c) =>
        console.log(`  carte ${c.id} : prévu ${c.after}, trouvé ${stampsById.get(c.id) ?? 'absente'}`),
      );

      const rewardRows = await q(`SELECT id, cout FROM rewards`);
      const coutById = new Map(rewardRows.map((r) => [String(r.id), num(r.cout)]));
      const expectedRewards = precheck.merchants.flatMap((m) => m.rewards);
      const rewardMismatches = expectedRewards.filter((r) => coutById.get(r.id) !== r.after);
      check(rewardMismatches.length === 0, `coûts des cadeaux conformes (${expectedRewards.length - rewardMismatches.length}/${expectedRewards.length})`);
    }
  });

  ok.forEach((l) => console.log(`OK     ${l}`));
  failures.forEach((l) => console.log(`ÉCHEC  ${l}`));
  if (failures.length) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
