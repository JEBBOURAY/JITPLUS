/**
 * Integration test: validate the loyalty conversion SQL against a REAL Postgres.
 *
 * Runs every UPDATE inside a transaction that is rolled back at the end so the
 * DB state is left untouched. Asserts the formula results match expectations.
 *
 * Usage:  npx ts-node test-loyalty-conversion.ts
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

interface Case {
  name: string;
  oldType: 'POINTS' | 'STAMPS';
  newType: 'POINTS' | 'STAMPS';
  pointsPerStamp: number;
  accumulationLimit: number | null;
  cards: { points: number }[];
  rewards: { cout: number }[];
  expectedCards: number[];
  expectedRewards: number[];
}

const CASES: Case[] = [
  {
    name: 'POINTS→STAMPS default ratio 10',
    oldType: 'POINTS',
    newType: 'STAMPS',
    pointsPerStamp: 10,
    accumulationLimit: null,
    cards: [{ points: 0 }, { points: 80 }, { points: 1000 }, { points: 5 }],
    rewards: [{ cout: 200 }, { cout: 100 }, { cout: 5 }],
    expectedCards: [0, 8, 100, 1], // ROUND(5/10) = 1 (Postgres half-away-from-zero on positive)
    expectedRewards: [20, 10, 1], // floor clamped to 1
  },
  {
    name: 'STAMPS→POINTS with accumulationLimit=500',
    oldType: 'STAMPS',
    newType: 'POINTS',
    pointsPerStamp: 10,
    accumulationLimit: 500,
    cards: [{ points: 60 }, { points: 10 }, { points: 0 }],
    rewards: [{ cout: 20 }, { cout: 1 }],
    expectedCards: [500, 100, 0], // 60×10=600 capped at 500
    expectedRewards: [200, 10],
  },
  {
    name: 'STAMPS→POINTS no cap',
    oldType: 'STAMPS',
    newType: 'POINTS',
    pointsPerStamp: 10,
    accumulationLimit: null,
    cards: [{ points: 50 }],
    rewards: [{ cout: 5 }],
    expectedCards: [500],
    expectedRewards: [50],
  },
  {
    name: 'Postgres ROUND on .5 boundary (POINTS→STAMPS, ratio 10)',
    oldType: 'POINTS',
    newType: 'STAMPS',
    pointsPerStamp: 10,
    accumulationLimit: null,
    // Note: 5 / 10 = 0.5. Postgres ROUND(numeric) is half-away-from-zero ⇒ 1.
    // 15 / 10 = 1.5 ⇒ 2. 25 / 10 = 2.5 ⇒ 3.
    cards: [{ points: 5 }, { points: 15 }, { points: 25 }],
    rewards: [],
    expectedCards: [1, 2, 3],
    expectedRewards: [],
  },
  {
    name: 'Custom ratio 20 (rewardThreshold=100, stampsForReward=5)',
    oldType: 'POINTS',
    newType: 'STAMPS',
    pointsPerStamp: 20,
    accumulationLimit: null,
    cards: [{ points: 100 }, { points: 50 }],
    rewards: [{ cout: 200 }],
    expectedCards: [5, 3], // 100/20=5, 50/20=2.5→3
    expectedRewards: [10],
  },
];

let passed = 0;
let failed = 0;
const failures: string[] = [];

async function runCase(c: Case): Promise<void> {
  console.log(`\n── ${c.name}`);
  const merchantId = randomUUID();

  await prisma.$transaction(async (tx) => {
    // Setup: create a throwaway merchant + cards + rewards
    const password = await bcrypt.hash('test', 4);
    await tx.merchant.create({
      data: {
        id: merchantId,
        nom: `__test_${merchantId.slice(0, 8)}`,
        email: `__test_${merchantId.slice(0, 8)}@example.com`,
        password,
        categorie: 'AUTRE',
        loyaltyType: c.oldType as any,
        stampsForReward: 10,
        conversionRate: 10,
        accumulationLimit: c.accumulationLimit,
      },
    });

    // Need a Client per card (FK constraint). Reuse one client for all cards.
    const cardIds: string[] = [];
    const clientIds: string[] = [];
    for (let i = 0; i < c.cards.length; i++) {
      const clientId = randomUUID();
      clientIds.push(clientId);
      await tx.client.create({
        data: {
          id: clientId,
          email: `__c_${clientId.slice(0, 8)}@example.com`,
          password,
          nom: 'Test',
          prenom: 'Client',
        },
      });
      const card = await tx.loyaltyCard.create({
        data: {
          id: randomUUID(),
          clientId,
          merchantId,
          points: c.cards[i].points,
        },
      });
      cardIds.push(card.id);
    }

    const rewardIds: string[] = [];
    for (const r of c.rewards) {
      const rid = randomUUID();
      await tx.reward.create({
        data: { id: rid, merchantId, titre: 'Test', cout: r.cout },
      });
      rewardIds.push(rid);
    }

    // Apply the EXACT SQL from recalculateBalancesTx
    if (c.oldType === 'POINTS' && c.newType === 'STAMPS') {
      await tx.$executeRaw`
        UPDATE loyalty_cards
        SET points = GREATEST(ROUND(points::numeric / ${c.pointsPerStamp})::int, 0),
            updated_at = NOW()
        WHERE merchant_id = ${merchantId}`;
      await tx.$executeRaw`
        UPDATE rewards
        SET cout = GREATEST(ROUND(cout::numeric / ${c.pointsPerStamp})::int, 1),
            updated_at = NOW()
        WHERE merchant_id = ${merchantId}`;
    } else if (c.oldType === 'STAMPS' && c.newType === 'POINTS') {
      if (c.accumulationLimit && c.accumulationLimit > 0) {
        await tx.$executeRaw`
          UPDATE loyalty_cards
          SET points = LEAST(GREATEST(ROUND(points::numeric * ${c.pointsPerStamp})::int, 0), ${c.accumulationLimit}),
              updated_at = NOW()
          WHERE merchant_id = ${merchantId}`;
      } else {
        await tx.$executeRaw`
          UPDATE loyalty_cards
          SET points = GREATEST(ROUND(points::numeric * ${c.pointsPerStamp})::int, 0),
              updated_at = NOW()
          WHERE merchant_id = ${merchantId}`;
      }
      await tx.$executeRaw`
        UPDATE rewards
        SET cout = GREATEST(ROUND(cout::numeric * ${c.pointsPerStamp})::int, 1),
            updated_at = NOW()
        WHERE merchant_id = ${merchantId}`;
    }

    // Read back & assert
    const finalCards = await tx.loyaltyCard.findMany({
      where: { merchantId },
      select: { id: true, points: true },
      orderBy: { id: 'asc' },
    });
    // We need to pair finalCards[i] back to c.cards[i]. We created them in order
    // and Postgres returns them in id order which we don't control. So sort by
    // creation: just look them up by cardIds array.
    const cardMap = new Map(finalCards.map((card) => [card.id, card.points]));
    const actualCards = cardIds.map((id) => cardMap.get(id)!);

    const finalRewards = await tx.reward.findMany({
      where: { merchantId },
      select: { id: true, cout: true },
    });
    const rewardMap = new Map(finalRewards.map((r) => [r.id, r.cout]));
    const actualRewards = rewardIds.map((id) => rewardMap.get(id)!);

    let ok = true;
    if (JSON.stringify(actualCards) !== JSON.stringify(c.expectedCards)) {
      ok = false;
      console.log(`   ❌ cards: expected ${JSON.stringify(c.expectedCards)}, got ${JSON.stringify(actualCards)}`);
    } else {
      console.log(`   ✓ cards: ${JSON.stringify(actualCards)}`);
    }
    if (JSON.stringify(actualRewards) !== JSON.stringify(c.expectedRewards)) {
      ok = false;
      console.log(`   ❌ rewards: expected ${JSON.stringify(c.expectedRewards)}, got ${JSON.stringify(actualRewards)}`);
    } else {
      console.log(`   ✓ rewards: ${JSON.stringify(actualRewards)}`);
    }
    if (ok) passed++;
    else {
      failed++;
      failures.push(c.name);
    }

    // ROLLBACK by throwing
    throw new Error('__ROLLBACK__');
  }).catch((e: Error) => {
    if (e.message !== '__ROLLBACK__') throw e;
  });
}

async function testRowLock(): Promise<void> {
  console.log('\n── Row lock: SELECT ... FOR UPDATE blocks concurrent writes');
  const merchantId = randomUUID();
  const password = await bcrypt.hash('test', 4);

  // Setup
  await prisma.merchant.create({
    data: {
      id: merchantId,
      nom: `__lock_${merchantId.slice(0, 8)}`,
      email: `__lock_${merchantId.slice(0, 8)}@example.com`,
      password,
      categorie: 'AUTRE',
    },
  });

  try {
    // Start tx1: lock the merchant row, then sleep 500ms
    const tx1 = prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM merchants WHERE id = ${merchantId} FOR UPDATE`;
      await new Promise((r) => setTimeout(r, 500));
      return 'tx1-done';
    }, { timeout: 10000 });

    // Wait a bit so tx1 has acquired the lock
    await new Promise((r) => setTimeout(r, 100));

    const tx2Start = Date.now();
    // Tx2: try to UPDATE the same merchant — must wait for tx1
    await prisma.merchant.update({
      where: { id: merchantId },
      data: { nom: 'tx2-update' },
    });
    const tx2Duration = Date.now() - tx2Start;

    await tx1;

    if (tx2Duration >= 350) {
      console.log(`   ✓ tx2 waited ${tx2Duration}ms (lock held by tx1)`);
      passed++;
    } else {
      console.log(`   ❌ tx2 finished in ${tx2Duration}ms, expected ≥350ms`);
      failed++;
      failures.push('row-lock');
    }
  } finally {
    // Cleanup
    await prisma.merchant.delete({ where: { id: merchantId } }).catch(() => {});
  }
}

async function testRewardScale(): Promise<void> {
  // Bug fix verification: stampsForReward change in STAMPS mode (no type switch)
  // must rescale rewards AND client balances proportionally — NOT overwrite.
  const cases = [
    {
      name: 'Reward+balance scale: stampsForReward 10→15 (preserves % progress)',
      oldRef: 10,
      newRef: 15,
      accumulationLimit: null as number | null,
      rewards: [5, 10, 20],
      cards: [0, 5, 10, 7],
      expectedRewards: [8, 15, 30], // 5*1.5=7.5→8, 10*1.5=15, 20*1.5=30
      expectedCards: [0, 8, 15, 11], // 5/10=50% → 7.5/15→8/15≈53%; 7/10=70% → 10.5/15→11/15≈73%
    },
    {
      name: 'Reward+balance scale: stampsForReward 10→5 (compress)',
      oldRef: 10,
      newRef: 5,
      accumulationLimit: null,
      rewards: [5, 10, 20, 1],
      cards: [10, 5, 1, 0],
      expectedRewards: [3, 5, 10, 1], // 5*0.5=2.5→3, 10*0.5=5, 20*0.5=10, 1*0.5=0.5→1
      expectedCards: [5, 3, 1, 0], // 10*0.5=5, 5*0.5=2.5→3, 1*0.5=0.5→1, 0*0.5=0
    },
    {
      name: 'Same value is no-op',
      oldRef: 10,
      newRef: 10,
      accumulationLimit: null,
      rewards: [5, 10, 20],
      cards: [3, 7, 11],
      expectedRewards: [5, 10, 20],
      expectedCards: [3, 7, 11],
    },
    {
      name: 'Balance scale up with accumulationLimit cap',
      oldRef: 10,
      newRef: 30,
      accumulationLimit: 50,
      rewards: [10],
      cards: [20, 5, 0], // 20*3=60 capped to 50; 5*3=15; 0
      expectedRewards: [30],
      expectedCards: [50, 15, 0],
    },
  ];

  for (const c of cases) {
    console.log(`\n── ${c.name}`);
    const merchantId = randomUUID();
    await prisma.$transaction(async (tx) => {
      const password = await bcrypt.hash('test', 4);
      await tx.merchant.create({
        data: {
          id: merchantId,
          nom: `__scale_${merchantId.slice(0, 8)}`,
          email: `__scale_${merchantId.slice(0, 8)}@example.com`,
          password,
          categorie: 'AUTRE',
          loyaltyType: 'STAMPS' as any,
          stampsForReward: c.oldRef,
          accumulationLimit: c.accumulationLimit,
        },
      });
      const rewardIds: string[] = [];
      for (const cout of c.rewards) {
        const rid = randomUUID();
        await tx.reward.create({
          data: { id: rid, merchantId, titre: 'Test', cout },
        });
        rewardIds.push(rid);
      }
      const cardIds: string[] = [];
      for (const points of c.cards) {
        const cid = randomUUID();
        await tx.client.create({
          data: {
            id: cid,
            email: `__sc_${cid.slice(0, 8)}@example.com`,
            password,
            nom: 'T',
            prenom: 'C',
          },
        });
        const card = await tx.loyaltyCard.create({
          data: { id: randomUUID(), clientId: cid, merchantId, points },
        });
        cardIds.push(card.id);
      }

      // Apply the EXACT SQL from scaleRewardCostsTx
      if (c.oldRef !== c.newRef) {
        await tx.$executeRaw`
          UPDATE rewards
          SET cout = GREATEST(ROUND(cout::numeric * ${c.newRef} / ${c.oldRef})::int, 1),
              updated_at = NOW()
          WHERE merchant_id = ${merchantId}`;
        if (c.accumulationLimit && c.accumulationLimit > 0) {
          await tx.$executeRaw`
            UPDATE loyalty_cards
            SET points = LEAST(GREATEST(ROUND(points::numeric * ${c.newRef} / ${c.oldRef})::int, 0), ${c.accumulationLimit}),
                updated_at = NOW()
            WHERE merchant_id = ${merchantId}`;
        } else {
          await tx.$executeRaw`
            UPDATE loyalty_cards
            SET points = GREATEST(ROUND(points::numeric * ${c.newRef} / ${c.oldRef})::int, 0),
                updated_at = NOW()
            WHERE merchant_id = ${merchantId}`;
        }
      }

      const afterRewards = await tx.reward.findMany({
        where: { merchantId },
        select: { id: true, cout: true },
      });
      const rm = new Map(afterRewards.map((r) => [r.id, r.cout]));
      const actualR = rewardIds.map((id) => rm.get(id)!);

      const afterCards = await tx.loyaltyCard.findMany({
        where: { merchantId },
        select: { id: true, points: true },
      });
      const cm = new Map(afterCards.map((card) => [card.id, card.points]));
      const actualC = cardIds.map((id) => cm.get(id)!);

      let ok = true;
      if (JSON.stringify(actualR) === JSON.stringify(c.expectedRewards)) {
        console.log(`   ✓ rewards: ${JSON.stringify(actualR)}`);
      } else {
        ok = false;
        console.log(`   ❌ rewards: expected ${JSON.stringify(c.expectedRewards)}, got ${JSON.stringify(actualR)}`);
      }
      if (JSON.stringify(actualC) === JSON.stringify(c.expectedCards)) {
        console.log(`   ✓ cards:   ${JSON.stringify(actualC)}`);
      } else {
        ok = false;
        console.log(`   ❌ cards:   expected ${JSON.stringify(c.expectedCards)}, got ${JSON.stringify(actualC)}`);
      }
      if (ok) passed++;
      else {
        failed++;
        failures.push(c.name);
      }

      throw new Error('__ROLLBACK__');
    }).catch((e: Error) => {
      if (e.message !== '__ROLLBACK__') throw e;
    });
  }
}

(async () => {
  try {
    for (const c of CASES) await runCase(c);
    await testRowLock();
    await testRewardScale();
  } catch (e) {
    console.error('\n💥 Unexpected error:', e);
    process.exit(2);
  } finally {
    await prisma.$disconnect();
  }

  console.log(`\n══════════════════════════════════════════`);
  console.log(`  ${passed} passed, ${failed} failed (${CASES.length + 1 + 4} total)`);
  if (failures.length) {
    console.log(`  Failures: ${failures.join(', ')}`);
    process.exit(1);
  }
  console.log(`══════════════════════════════════════════\n`);
})();
