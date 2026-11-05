-- Index cleanup (audit 2026-11-04).
--
-- 1. Every index dropped below is redundant: either an exact copy of the
--    index a @unique field already creates, or the leading prefix of a
--    composite index that serves the same lookups. They only cost writes
--    (transactions, loyalty_cards and clients are the most written tables).
-- 2. transactions(merchant_id, idempotency_key) duplicates the partial unique
--    index transactions_merchant_id_idempotency_key_unique: idempotency
--    lookups always filter on a non-null key.
-- 3. clients(push_token) is added: token dedup on every app launch
--    (updatePushToken) and stale-token cleanup (push_token IN …) had no index
--    with push_token as leading column (PostgreSQL 16 cannot skip-scan).
--
-- IF [NOT] EXISTS keeps it safe on any environment.

-- DropIndex
DROP INDEX IF EXISTS "audit_logs_admin_id_idx";

-- DropIndex
DROP INDEX IF EXISTS "campaign_sent_trackers_client_id_idx";

-- DropIndex
DROP INDEX IF EXISTS "campaign_sent_trackers_merchant_id_idx";

-- DropIndex
DROP INDEX IF EXISTS "client_claims_client_id_idx";

-- DropIndex
DROP INDEX IF EXISTS "client_merchant_blocks_client_id_idx";

-- DropIndex
DROP INDEX IF EXISTS "clients_apple_id_idx";

-- DropIndex
DROP INDEX IF EXISTS "clients_email_idx";

-- DropIndex
DROP INDEX IF EXISTS "clients_google_id_idx";

-- DropIndex
DROP INDEX IF EXISTS "clients_notif_push_idx";

-- DropIndex
DROP INDEX IF EXISTS "clients_telephone_idx";

-- DropIndex
DROP INDEX IF EXISTS "device_sessions_merchant_id_idx";

-- DropIndex
DROP INDEX IF EXISTS "loyalty_cards_client_id_idx";

-- DropIndex
DROP INDEX IF EXISTS "loyalty_cards_merchant_id_idx";

-- DropIndex
DROP INDEX IF EXISTS "lucky_wheel_prizes_campaign_id_idx";

-- DropIndex
DROP INDEX IF EXISTS "merchants_apple_id_idx";

-- DropIndex
DROP INDEX IF EXISTS "merchants_is_active_idx";

-- DropIndex
DROP INDEX IF EXISTS "merchants_plan_idx";

-- DropIndex
DROP INDEX IF EXISTS "payout_requests_client_id_idx";

-- DropIndex
DROP INDEX IF EXISTS "payout_requests_status_idx";

-- DropIndex
DROP INDEX IF EXISTS "stores_merchant_id_idx";

-- DropIndex
DROP INDEX IF EXISTS "transactions_merchant_id_idempotency_key_idx";

-- CreateIndex
CREATE INDEX IF NOT EXISTS "clients_push_token_idx" ON "clients"("push_token");

