-- ════════════════════════════════════════════════════════════════════════════
-- Stamps-only loyalty program: the points system is removed.
--
-- 1. Every merchant still on POINTS is converted to an equivalent stamps
--    program, preserving each client's progress towards the first reward:
--      pps (points per stamp) = base / 10, base = cheapest reward cost
--                               (fallback: points_rules.rewardThreshold, then 100)
--      balances      = ROUND(points / pps)            (floor 0, capped by the converted limit)
--      reward costs  = ROUND(cout / pps)              (floor 1)
--      amount/stamp  = points_rate × pps              (same spend → same progress)
--      earning mode  = PER_AMOUNT, stamps_for_reward = 10
--      accumulation limit, lucky-wheel ticket cost: ROUND(x / pps) (floor 1)
--    A LOYALTY_PROGRAM_CHANGE history entry is added to every active card and a
--    full before/after snapshot is written to audit_logs (rollback forensics,
--    input of scripts/notify-stamps-conversion.ts).
-- 2. Historical transactions recorded in points (including those of merchants
--    that already switched to stamps earlier) are re-expressed in stamps so
--    that cancelling them keeps balances consistent.
-- 3. Schema: points → stamps renames, loyalty type / points settings dropped.
--
-- Runs as a single transaction: any failure leaves the database untouched.
-- Pre-flight report: scripts/stamps-migration-precheck.ts
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- Block concurrent writes from a still-running previous backend revision.
LOCK TABLE "merchants", "loyalty_cards", "transactions", "rewards", "lucky_wheel_campaigns" IN ACCESS EXCLUSIVE MODE;

-- ── 1. Conversion ratios ────────────────────────────────────────────────────
CREATE TEMP TABLE "_stamps_conv" (
  "merchant_id" TEXT PRIMARY KEY,
  "kind"        TEXT NOT NULL,      -- 'CONVERT' (currently POINTS) | 'HISTORY' (already STAMPS)
  "pps"         NUMERIC NOT NULL
);

INSERT INTO "_stamps_conv" ("merchant_id", "kind", "pps")
SELECT m."id", 'CONVERT',
       COALESCE(
         (SELECT MIN(r."cout") FROM "rewards" r WHERE r."merchant_id" = m."id" AND r."cout" > 0),
         CASE WHEN jsonb_typeof(m."points_rules"->'rewardThreshold') = 'number'
                   AND (m."points_rules"->>'rewardThreshold')::numeric > 0
              THEN (m."points_rules"->>'rewardThreshold')::numeric END,
         100
       )::numeric / 10
FROM "merchants" m
WHERE m."loyalty_type" = 'POINTS';

-- Merchants already on STAMPS that still hold points-denominated history:
-- reuse the ratio applied at their last POINTS → STAMPS switch when audited.
INSERT INTO "_stamps_conv" ("merchant_id", "kind", "pps")
SELECT m."id", 'HISTORY',
       COALESCE(
         (SELECT (a."metadata"->'conversion'->>'pointsPerStamp')::numeric
            FROM "audit_logs" a
           WHERE a."merchant_id" = m."id"
             AND a."action" = 'UPDATE_LOYALTY_SETTINGS'
             AND a."metadata"->'conversion'->>'oldType' = 'POINTS'
             AND a."metadata"->'conversion'->>'newType' = 'STAMPS'
             AND jsonb_typeof(a."metadata"->'conversion'->'pointsPerStamp') = 'number'
             AND (a."metadata"->'conversion'->>'pointsPerStamp')::numeric > 0
           ORDER BY a."created_at" DESC
           LIMIT 1),
         COALESCE(
           CASE WHEN jsonb_typeof(m."points_rules"->'rewardThreshold') = 'number'
                     AND (m."points_rules"->>'rewardThreshold')::numeric > 0
                THEN (m."points_rules"->>'rewardThreshold')::numeric END,
           100
         ) / GREATEST(m."stamps_for_reward", 1)
       )
FROM "merchants" m
WHERE m."loyalty_type" IS DISTINCT FROM 'POINTS'
  AND EXISTS (
    SELECT 1 FROM "transactions" t
     WHERE t."merchant_id" = m."id"
       AND t."loyalty_type" = 'POINTS'
       AND t."type" IN ('EARN_POINTS', 'REDEEM_REWARD', 'ADJUST_POINTS')
       AND t."points" <> 0
  );

-- ── 2. Audit snapshot (before) ──────────────────────────────────────────────
INSERT INTO "audit_logs" ("id", "actor_type", "admin_email", "merchant_id", "action",
                          "target_type", "target_id", "target_label", "metadata", "created_at")
SELECT gen_random_uuid()::text, 'ADMIN', 'system:stamps-only-migration', m."id", 'UPDATE_LOYALTY_SETTINGS',
       'MERCHANT', m."id", m."nom",
       jsonb_build_object(
         'migration', '20261007120000_stamps_only',
         'pointsPerStamp', c."pps",
         'before', jsonb_build_object(
           'loyaltyType', m."loyalty_type",
           'pointsRate', m."points_rate",
           'pointsRules', m."points_rules",
           'conversionRate', m."conversion_rate",
           'stampsForReward', m."stamps_for_reward",
           'stampEarningMode', m."stamp_earning_mode",
           'accumulationLimit', m."accumulation_limit",
           'rewards', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', r."id", 'cout', r."cout"))
                                  FROM "rewards" r WHERE r."merchant_id" = m."id"), '[]'::jsonb),
           'luckyWheelCampaigns', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', l."id", 'ticketCostPoints', l."ticket_cost_points"))
                                              FROM "lucky_wheel_campaigns" l WHERE l."merchant_id" = m."id"), '[]'::jsonb),
           'cards', (SELECT COUNT(*) FROM "loyalty_cards" lc WHERE lc."merchant_id" = m."id"),
           'totalBalance', (SELECT COALESCE(SUM(lc."points"), 0) FROM "loyalty_cards" lc WHERE lc."merchant_id" = m."id")
         )
       ),
       NOW()
FROM "merchants" m
JOIN "_stamps_conv" c ON c."merchant_id" = m."id" AND c."kind" = 'CONVERT';

-- ── 3. Convert POINTS merchants ─────────────────────────────────────────────
UPDATE "merchants" m
SET "points_rate"        = GREATEST(ROUND((COALESCE(NULLIF(m."points_rate", 0), 10) * c."pps")::numeric, 2), 0.01),
    "stamp_earning_mode" = 'PER_AMOUNT',
    "stamps_for_reward"  = 10,
    "accumulation_limit" = CASE WHEN m."accumulation_limit" IS NULL THEN NULL
                                ELSE GREATEST(ROUND(m."accumulation_limit"::numeric / c."pps")::int, 1) END,
    "updated_at"         = NOW()
FROM "_stamps_conv" c
WHERE c."merchant_id" = m."id" AND c."kind" = 'CONVERT';

UPDATE "loyalty_cards" lc
SET "points"     = LEAST(GREATEST(ROUND(lc."points"::numeric / c."pps")::int, 0),
                         COALESCE(m."accumulation_limit", 2147483647)),
    "updated_at" = NOW()
FROM "_stamps_conv" c
JOIN "merchants" m ON m."id" = c."merchant_id"
WHERE c."merchant_id" = lc."merchant_id" AND c."kind" = 'CONVERT';

UPDATE "rewards" r
SET "cout"       = GREATEST(ROUND(r."cout"::numeric / c."pps")::int, 1),
    "updated_at" = NOW()
FROM "_stamps_conv" c
WHERE c."merchant_id" = r."merchant_id" AND c."kind" = 'CONVERT';

UPDATE "lucky_wheel_campaigns" l
SET "ticket_cost_points" = GREATEST(ROUND(l."ticket_cost_points"::numeric / c."pps")::int, 1),
    "updated_at"         = NOW()
FROM "_stamps_conv" c
WHERE c."merchant_id" = l."merchant_id" AND c."kind" = 'CONVERT' AND l."ticket_cost_points" > 0;

-- ── 4. Re-express points-denominated history in stamps ──────────────────────
-- Rows created before transactions.loyalty_type existed are NULL: they belong
-- to the merchant's current program.
UPDATE "transactions" t
SET "points" = CASE t."type"
                 WHEN 'REDEEM_REWARD' THEN GREATEST(ROUND(t."points"::numeric / c."pps")::int, 1)
                 WHEN 'EARN_POINTS'   THEN GREATEST(ROUND(t."points"::numeric / c."pps")::int, 0)
                 ELSE ROUND(t."points"::numeric / c."pps")::int
               END
FROM "_stamps_conv" c
WHERE c."merchant_id" = t."merchant_id"
  AND t."type" IN ('EARN_POINTS', 'REDEEM_REWARD', 'ADJUST_POINTS')
  AND t."points" <> 0
  AND (t."loyalty_type" = 'POINTS' OR (t."loyalty_type" IS NULL AND c."kind" = 'CONVERT'));

-- ── 5. Client-visible history entry ─────────────────────────────────────────
INSERT INTO "transactions" ("id", "client_id", "merchant_id", "type", "note", "amount", "points", "status", "created_at")
SELECT gen_random_uuid()::text, lc."client_id", lc."merchant_id", 'LOYALTY_PROGRAM_CHANGE',
       'Programme de fidélité modifié : vos points ont été convertis en tampons', 0, 0, 'ACTIVE', NOW()
FROM "loyalty_cards" lc
JOIN "_stamps_conv" c ON c."merchant_id" = lc."merchant_id" AND c."kind" = 'CONVERT'
WHERE lc."deactivated_at" IS NULL;

-- ── 6. Audit snapshot (after) ───────────────────────────────────────────────
UPDATE "audit_logs" a
SET "metadata" = a."metadata" || jsonb_build_object(
      'after', jsonb_build_object(
        'amountPerStamp', m."points_rate",
        'stampsForReward', m."stamps_for_reward",
        'stampEarningMode', m."stamp_earning_mode",
        'accumulationLimit', m."accumulation_limit",
        'rewards', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', r."id", 'cout', r."cout"))
                               FROM "rewards" r WHERE r."merchant_id" = m."id"), '[]'::jsonb),
        'totalBalance', (SELECT COALESCE(SUM(lc."points"), 0) FROM "loyalty_cards" lc WHERE lc."merchant_id" = m."id")
      ))
FROM "merchants" m
WHERE a."merchant_id" = m."id"
  AND a."admin_email" = 'system:stamps-only-migration'
  AND a."metadata"->>'migration' = '20261007120000_stamps_only';

-- ── 7. Integrity checks ─────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "loyalty_cards" WHERE "points" < 0) THEN
    RAISE EXCEPTION 'stamps_only: negative balance after conversion';
  END IF;
  IF EXISTS (SELECT 1 FROM "rewards" WHERE "cout" < 1) THEN
    RAISE EXCEPTION 'stamps_only: reward cost below 1 after conversion';
  END IF;
  IF EXISTS (SELECT 1 FROM "merchants" WHERE "points_rate" <= 0) THEN
    RAISE EXCEPTION 'stamps_only: non-positive amount per stamp';
  END IF;
  IF (SELECT COUNT(*) FROM "audit_logs" WHERE "metadata"->>'migration' = '20261007120000_stamps_only')
     <> (SELECT COUNT(*) FROM "_stamps_conv" WHERE "kind" = 'CONVERT') THEN
    RAISE EXCEPTION 'stamps_only: audit snapshot count mismatch';
  END IF;
END $$;

DROP TABLE "_stamps_conv";

-- ── 8. Schema ───────────────────────────────────────────────────────────────
ALTER TYPE "TransactionType" RENAME VALUE 'EARN_POINTS' TO 'EARN_STAMPS';
ALTER TYPE "TransactionType" RENAME VALUE 'ADJUST_POINTS' TO 'ADJUST_STAMPS';

ALTER TABLE "merchants" RENAME COLUMN "points_rate" TO "amount_per_stamp";
ALTER TABLE "merchants" DROP COLUMN "loyalty_type",
                        DROP COLUMN "conversion_rate",
                        DROP COLUMN "points_rules";

ALTER TABLE "loyalty_cards" RENAME COLUMN "points" TO "stamps";
ALTER INDEX "loyalty_cards_merchant_id_points_idx" RENAME TO "loyalty_cards_merchant_id_stamps_idx";

ALTER TABLE "transactions" RENAME COLUMN "points" TO "stamps";
ALTER TABLE "transactions" DROP COLUMN "loyalty_type";

ALTER TABLE "lucky_wheel_campaigns" RENAME COLUMN "ticket_cost_points" TO "ticket_cost_stamps";

DROP TYPE "LoyaltyType";

COMMIT;
