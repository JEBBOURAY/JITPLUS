/**
 * Detect merchants whose loyalty conversion may have been affected by the
 * legacy buggy formula (used `conversionRate` instead of `rewardThreshold/stampsForReward`,
 * with FLOOR/integer-division truncation losing residual progress).
 *
 * Strategy:
 *   1. Find all UPDATE_LOYALTY_SETTINGS audit logs where loyaltyTypeChanged = true.
 *   2. Flag those that do NOT have the new `conversion` metadata field —
 *      they were processed by the old code.
 *   3. Output a CSV-like report: merchantId | when | oldType→newType | nb_audit_records.
 *
 * Usage:  npx ts-node scripts/detect-buggy-loyalty-conversions.ts
 *
 * No DB writes. Read-only audit.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface MetadataShape {
  loyaltyType?: string;
  loyaltyTypeChanged?: boolean;
  conversion?: unknown; // present only with the new code
  conversionRate?: number;
  stampsForReward?: number;
}

(async () => {
  // 1. Pull every loyalty-settings audit log
  const logs = await prisma.auditLog.findMany({
    where: { action: 'UPDATE_LOYALTY_SETTINGS' as any },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      merchantId: true,
      targetId: true,
      createdAt: true,
      metadata: true,
    },
  });

  console.log(`\nTotal UPDATE_LOYALTY_SETTINGS audit logs: ${logs.length}`);

  // 2. Filter to type-switches only
  const typeSwitches = logs.filter((l) => {
    const m = (l.metadata as MetadataShape | null) ?? {};
    return m.loyaltyTypeChanged === true;
  });
  console.log(`Type switches (loyaltyTypeChanged=true): ${typeSwitches.length}`);

  // 3. Buckets: legacy (no .conversion) vs fixed (has .conversion)
  const legacy = typeSwitches.filter((l) => {
    const m = (l.metadata as MetadataShape | null) ?? {};
    return m.conversion == null;
  });
  const fixed = typeSwitches.filter((l) => {
    const m = (l.metadata as MetadataShape | null) ?? {};
    return m.conversion != null;
  });
  console.log(`  ↳ processed by LEGACY (buggy) code: ${legacy.length}`);
  console.log(`  ↳ processed by FIXED code:          ${fixed.length}`);

  if (legacy.length === 0) {
    console.log(`\n✓ No suspicious conversions found.\n`);
    await prisma.$disconnect();
    return;
  }

  // 4. Group by merchant and report
  const byMerchant = new Map<string, typeof legacy>();
  for (const l of legacy) {
    const mid = l.merchantId || l.targetId || '(unknown)';
    const arr = byMerchant.get(mid) ?? [];
    arr.push(l);
    byMerchant.set(mid, arr);
  }

  console.log(`\n── Merchants needing review (${byMerchant.size}) ──`);
  console.log(`merchantId\tname\tswitches\tlast_event\tlast_dto`);

  for (const [mid, events] of byMerchant) {
    const merchant = await prisma.merchant.findUnique({
      where: { id: mid },
      select: { nom: true, email: true, loyaltyType: true, deletedAt: true },
    });
    const last = events[events.length - 1];
    const lastMeta = (last.metadata as MetadataShape | null) ?? {};
    const dto = `loyaltyType=${lastMeta.loyaltyType ?? '?'} conversionRate=${lastMeta.conversionRate ?? '?'} stampsForReward=${lastMeta.stampsForReward ?? '?'}`;
    const status = merchant?.deletedAt ? '[DELETED] ' : '';
    console.log(
      `${mid}\t${status}${merchant?.nom ?? '(?)'} <${merchant?.email ?? '?'}>\t${events.length}\t${last.createdAt.toISOString()}\t${dto}`,
    );
  }

  // 5. For each affected merchant, surface the current loyalty state +
  //    suggest a remediation action.
  console.log(`\n── Remediation suggestions ──`);
  for (const [mid] of byMerchant) {
    const merchant = await prisma.merchant.findUnique({
      where: { id: mid },
      select: {
        loyaltyType: true,
        stampsForReward: true,
        pointsRules: true,
        accumulationLimit: true,
      },
    });
    if (!merchant) continue;

    const cardCount = await prisma.loyaltyCard.count({
      where: { merchantId: mid, deactivatedAt: null },
    });
    const sumPoints = await prisma.loyaltyCard.aggregate({
      where: { merchantId: mid, deactivatedAt: null },
      _sum: { points: true },
    });

    console.log(
      `\n${mid}\n` +
        `  current type:           ${merchant.loyaltyType}\n` +
        `  cards (active):         ${cardCount}\n` +
        `  total balance:          ${sumPoints._sum?.points ?? 0}\n` +
        `  stampsForReward:        ${merchant.stampsForReward}\n` +
        `  rewardThreshold:        ${(merchant.pointsRules as any)?.rewardThreshold ?? 'default(100)'}\n` +
        `  ⇒ Action: contact merchant to confirm balances. If wrong, either:\n` +
        `    (a) replay the audited switch with the FIXED code via a one-shot admin script, or\n` +
        `    (b) restore from a pre-incident DB backup for this merchant only.`,
    );
  }

  console.log(`\n${legacy.length} legacy conversion(s) flagged. Review and remediate.\n`);
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error('Detection script failed:', e);
  await prisma.$disconnect();
  process.exit(1);
});
