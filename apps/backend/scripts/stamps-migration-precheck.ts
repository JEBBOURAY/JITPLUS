/**
 * Pre-flight report for the `20261007120000_stamps_only` migration.
 *
 * Run it against the production database BEFORE deploying (old schema still
 * in place). Strictly read-only: every query runs in a READ ONLY transaction.
 * The ratio/rounding formulas below must stay identical to
 * prisma/migrations/20261007120000_stamps_only/migration.sql.
 *
 * Usage:
 *   DATABASE_URL=... npx ts-node scripts/stamps-migration-precheck.ts [--out report.json]
 *
 * Exit code 1 when a blocking problem is found (wrong migration state,
 * PostgreSQL < 13, …). Warnings never block.
 */
import { writeFileSync } from 'fs';
import { PrismaClient } from '@prisma/client';

const MIGRATION = '20261007120000_stamps_only';
const PREVIOUS_MIGRATION = '20260819000000_verify_existing_merchants';
const MAX_STAMPS_PER_TX = 20;

const prisma = new PrismaClient();

type Row = Record<string, unknown>;

const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));

const CONVERT_CTE = `
  conv AS (
    SELECT m.id AS merchant_id,
           COALESCE(
             (SELECT MIN(r.cout) FROM rewards r WHERE r.merchant_id = m.id AND r.cout > 0),
             CASE WHEN jsonb_typeof(m.points_rules->'rewardThreshold') = 'number'
                       AND (m.points_rules->>'rewardThreshold')::numeric > 0
                  THEN (m.points_rules->>'rewardThreshold')::numeric END,
             100
           )::numeric / 10 AS pps
      FROM merchants m
     WHERE m.loyalty_type = 'POINTS'
  )`;

async function main() {
  const outIdx = process.argv.indexOf('--out');
  const outFile =
    outIdx > -1 && process.argv[outIdx + 1]
      ? process.argv[outIdx + 1]
      : `stamps-precheck-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;

  const blockers: string[] = [];
  const warnings: string[] = [];

  const report = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    const q = (sql: string) => tx.$queryRawUnsafe<Row[]>(sql);

    // ── Environment & migration state ───────────────────────────────────────
    const [{ version }] = await q(`SELECT current_setting('server_version_num')::int AS version`);
    if (num(version) < 130000) blockers.push(`PostgreSQL ${version} < 13 : gen_random_uuid() indisponible`);

    const migrations = await q(
      `SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY started_at`,
    );
    const pending = migrations.filter((m) => !m.finished_at && !m.rolled_back_at);
    if (pending.length) blockers.push(`Migrations en échec/en cours : ${pending.map((m) => m.migration_name).join(', ')}`);
    if (migrations.some((m) => m.migration_name === MIGRATION && m.finished_at)) {
      blockers.push(`${MIGRATION} est déjà appliquée`);
    }
    const applied = migrations.filter((m) => m.finished_at).map((m) => String(m.migration_name));
    if (applied[applied.length - 1] !== PREVIOUS_MIGRATION) {
      warnings.push(`Dernière migration appliquée : ${applied[applied.length - 1]} (attendu ${PREVIOUS_MIGRATION})`);
    }

    const cols = await q(`
      SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND (table_name, column_name) IN (('merchants','loyalty_type'),('merchants','points_rate'),
              ('merchants','points_rules'),('merchants','conversion_rate'),('loyalty_cards','points'),
              ('transactions','points'),('transactions','loyalty_type'),('lucky_wheel_campaigns','ticket_cost_points'))`);
    if (cols.length !== 8) blockers.push(`Schéma inattendu : ${cols.length}/8 colonnes « points » présentes`);
    if (blockers.length) return null;

    // Pre-existing data that would trip the migration's integrity checks.
    const [bad] = await q(`
      SELECT (SELECT COUNT(*)::int FROM loyalty_cards WHERE points < 0) AS negative_cards,
             (SELECT COUNT(*)::int FROM rewards r JOIN merchants m ON m.id = r.merchant_id
               WHERE r.cout < 1 AND m.loyalty_type IS DISTINCT FROM 'POINTS') AS free_rewards,
             (SELECT COUNT(*)::int FROM merchants WHERE points_rate <= 0 AND loyalty_type IS DISTINCT FROM 'POINTS') AS bad_rate`);
    if (num(bad.negative_cards)) blockers.push(`${bad.negative_cards} carte(s) avec un solde négatif`);
    if (num(bad.free_rewards)) blockers.push(`${bad.free_rewards} cadeau(x) à moins d'1 tampon chez des commerçants tampons`);
    if (num(bad.bad_rate)) blockers.push(`${bad.bad_rate} commerçant(s) tampons avec points_rate <= 0`);
    if (blockers.length) return null;

    // ── Overview ────────────────────────────────────────────────────────────
    const byType = await q(`
      SELECT COALESCE(loyalty_type::text, 'NON CONFIGURÉ') AS loyalty_type,
             COUNT(*)::int AS merchants,
             COUNT(*) FILTER (WHERE deleted_at IS NULL AND is_active)::int AS active
        FROM merchants GROUP BY 1 ORDER BY 1`);

    // ── POINTS merchants to convert ─────────────────────────────────────────
    const merchants = await q(`
      WITH ${CONVERT_CTE}
      SELECT m.id, m.nom, m.is_active, m.deleted_at IS NOT NULL AS deleted, c.pps,
             m.points_rate AS points_rate_before,
             GREATEST(ROUND((COALESCE(NULLIF(m.points_rate, 0), 10) * c.pps)::numeric, 2), 0.01) AS amount_per_stamp_after,
             m.accumulation_limit AS limit_before,
             CASE WHEN m.accumulation_limit IS NULL THEN NULL
                  ELSE GREATEST(ROUND(m.accumulation_limit::numeric / c.pps)::int, 1) END AS limit_after,
             (SELECT COUNT(*)::int FROM loyalty_cards lc WHERE lc.merchant_id = m.id) AS cards,
             (SELECT COUNT(*)::int FROM loyalty_cards lc WHERE lc.merchant_id = m.id AND lc.deactivated_at IS NULL) AS active_cards,
             (SELECT COALESCE(SUM(lc.points), 0)::bigint FROM loyalty_cards lc WHERE lc.merchant_id = m.id) AS balance_before,
             (SELECT COUNT(*)::int FROM loyalty_cards lc
               WHERE lc.merchant_id = m.id AND lc.points > 0 AND ROUND(lc.points::numeric / c.pps) = 0) AS cards_dropping_to_zero,
             (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', r.id, 'titre', r.titre, 'before', r.cout,
                       'after', GREATEST(ROUND(r.cout::numeric / c.pps)::int, 1)) ORDER BY r.cout), '[]'::jsonb)
                FROM rewards r WHERE r.merchant_id = m.id) AS rewards,
             (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', l.id, 'name', l.name, 'status', l.status,
                       'before', l.ticket_cost_points,
                       'after', CASE WHEN l.ticket_cost_points > 0
                                     THEN GREATEST(ROUND(l.ticket_cost_points::numeric / c.pps)::int, 1) ELSE 0 END)), '[]'::jsonb)
                FROM lucky_wheel_campaigns l WHERE l.merchant_id = m.id) AS lucky_wheel,
             (SELECT COUNT(*)::int FROM transactions t
               WHERE t.merchant_id = m.id AND t.type = 'EARN_POINTS' AND t.status = 'ACTIVE'
                 AND t.created_at > NOW() - INTERVAL '90 days'
                 AND FLOOR(t.amount / GREATEST(ROUND((COALESCE(NULLIF(m.points_rate, 0), 10) * c.pps)::numeric, 2), 0.01)) > ${MAX_STAMPS_PER_TX}
             ) AS earns_90d_over_cap
        FROM merchants m JOIN conv c ON c.merchant_id = m.id
       ORDER BY active_cards DESC`);

    const balancesAfter = await q(`
      WITH ${CONVERT_CTE}
      SELECT lc.merchant_id,
             COALESCE(SUM(LEAST(GREATEST(ROUND(lc.points::numeric / c.pps)::int, 0),
               COALESCE(CASE WHEN m.accumulation_limit IS NULL THEN NULL
                             ELSE GREATEST(ROUND(m.accumulation_limit::numeric / c.pps)::int, 1) END, 2147483647))), 0)::bigint AS balance_after
        FROM loyalty_cards lc JOIN conv c ON c.merchant_id = lc.merchant_id JOIN merchants m ON m.id = lc.merchant_id
       GROUP BY lc.merchant_id`);
    const afterById = new Map(balancesAfter.map((r) => [String(r.merchant_id), num(r.balance_after)]));

    const cards = await q(`
      WITH ${CONVERT_CTE}
      SELECT lc.id, lc.merchant_id, lc.client_id, lc.points AS before,
             LEAST(GREATEST(ROUND(lc.points::numeric / c.pps)::int, 0),
               COALESCE(CASE WHEN m.accumulation_limit IS NULL THEN NULL
                             ELSE GREATEST(ROUND(m.accumulation_limit::numeric / c.pps)::int, 1) END, 2147483647)) AS after
        FROM loyalty_cards lc JOIN conv c ON c.merchant_id = lc.merchant_id JOIN merchants m ON m.id = lc.merchant_id
       ORDER BY lc.merchant_id, lc.id`);

    // ── Merchants already on STAMPS with points-denominated history ─────────
    const history = await q(`
      SELECT m.id, m.nom, a.pps AS audited_pps,
             COALESCE(CASE WHEN jsonb_typeof(m.points_rules->'rewardThreshold') = 'number'
                            AND (m.points_rules->>'rewardThreshold')::numeric > 0
                       THEN (m.points_rules->>'rewardThreshold')::numeric END, 100) / GREATEST(m.stamps_for_reward, 1) AS fallback_pps,
             (SELECT COUNT(*)::int FROM transactions t WHERE t.merchant_id = m.id AND t.loyalty_type = 'POINTS'
                AND t.type IN ('EARN_POINTS','REDEEM_REWARD','ADJUST_POINTS') AND t.points <> 0) AS transactions
        FROM merchants m
        LEFT JOIN LATERAL (
          SELECT (al.metadata->'conversion'->>'pointsPerStamp')::numeric AS pps
            FROM audit_logs al
           WHERE al.merchant_id = m.id AND al.action = 'UPDATE_LOYALTY_SETTINGS'
             AND al.metadata->'conversion'->>'oldType' = 'POINTS' AND al.metadata->'conversion'->>'newType' = 'STAMPS'
             AND jsonb_typeof(al.metadata->'conversion'->'pointsPerStamp') = 'number'
             AND (al.metadata->'conversion'->>'pointsPerStamp')::numeric > 0
           ORDER BY al.created_at DESC LIMIT 1) a ON TRUE
       WHERE m.loyalty_type IS DISTINCT FROM 'POINTS'
         AND EXISTS (SELECT 1 FROM transactions t WHERE t.merchant_id = m.id AND t.loyalty_type = 'POINTS'
                       AND t.type IN ('EARN_POINTS','REDEEM_REWARD','ADJUST_POINTS') AND t.points <> 0)`);

    const [txTotals] = await q(`
      SELECT COUNT(*) FILTER (WHERE type = 'EARN_POINTS')::int AS earn,
             COUNT(*) FILTER (WHERE type = 'ADJUST_POINTS')::int AS adjust,
             COUNT(*) FILTER (WHERE type = 'REDEEM_REWARD')::int AS redeem,
             COUNT(*)::int AS total
        FROM transactions`);

    return { byType, merchants, afterById, cards, history, txTotals };
  });

  if (!report) {
    blockers.forEach((b) => console.error(`BLOQUANT : ${b}`));
    process.exitCode = 1;
    return;
  }

  // ── Warnings ──────────────────────────────────────────────────────────────
  for (const m of report.merchants) {
    const label = `${m.nom} (${m.id})`;
    if (num(m.pps) < 1) warnings.push(`${label} : 1 point vaut plus d'1 tampon (ratio ${num(m.pps)}), soldes multipliés`);
    if (num(m.cards_dropping_to_zero) > 0) warnings.push(`${label} : ${m.cards_dropping_to_zero} carte(s) avec un petit solde passent à 0 tampon (arrondi)`);
    if (num(m.earns_90d_over_cap) > 0) warnings.push(`${label} : ${m.earns_90d_over_cap} achat(s) sur 90 j auraient dépassé ${MAX_STAMPS_PER_TX} tampons (plafonnés désormais)`);
    for (const r of m.rewards as Array<{ titre: string; after: number }>) {
      if (r.after > 100) warnings.push(`${label} : le cadeau « ${r.titre} » coûtera ${r.after} tampons`);
    }
  }
  for (const h of report.history) {
    if (h.audited_pps === null) warnings.push(`${h.nom} (${h.id}) : historique en points converti avec le ratio de repli ${num(h.fallback_pps)} (pas de trace d'audit)`);
  }

  // ── Console summary ───────────────────────────────────────────────────────
  console.log(`\n== Migration ${MIGRATION} — pré-vérification ==\n`);
  console.table(report.byType);
  console.log(`Transactions : ${report.txTotals.total} (EARN_POINTS ${report.txTotals.earn}, ADJUST_POINTS ${report.txTotals.adjust}, REDEEM_REWARD ${report.txTotals.redeem})`);
  console.log(`\nCommerçants POINTS convertis : ${report.merchants.length}`);
  console.table(
    report.merchants.map((m) => ({
      nom: m.nom,
      ratio: Number(num(m.pps).toFixed(4)),
      'DH/pt → DH/tampon': `${num(m.points_rate_before)} → ${num(m.amount_per_stamp_after)}`,
      cartes: m.active_cards,
      'solde total': `${num(m.balance_before)} → ${report.afterById.get(String(m.id)) ?? 0}`,
      cadeaux: (m.rewards as Array<{ before: number; after: number }>).map((r) => `${r.before}→${r.after}`).join(' '),
      limite: m.limit_before === null ? '-' : `${m.limit_before} → ${m.limit_after}`,
    })),
  );
  console.log(`\nCommerçants tampons avec un historique en points : ${report.history.length}`);
  if (report.history.length) {
    console.table(report.history.map((h) => ({
      nom: h.nom,
      ratio: num(h.audited_pps ?? h.fallback_pps),
      source: h.audited_pps === null ? 'repli' : 'audit',
      transactions: h.transactions,
    })));
  }
  console.log(`\nAvertissements (${warnings.length}) :`);
  warnings.forEach((w) => console.log(`  - ${w}`));

  const serializable = JSON.parse(
    JSON.stringify(
      {
        migration: MIGRATION,
        generatedAt: new Date().toISOString(),
        byType: report.byType,
        transactions: report.txTotals,
        merchants: report.merchants.map((m) => ({ ...m, balance_after: report.afterById.get(String(m.id)) ?? 0 })),
        history: report.history,
        cards: report.cards,
        warnings,
      },
      (_k, v) => (typeof v === 'bigint' ? Number(v) : v),
    ),
  );
  writeFileSync(outFile, JSON.stringify(serializable, null, 2));
  console.log(`\nRapport détaillé (dont solde avant/après de chaque carte) : ${outFile}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
