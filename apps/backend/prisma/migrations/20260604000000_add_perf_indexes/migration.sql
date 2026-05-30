-- Performance indexes (zero-downtime: use CONCURRENTLY in production).
-- CREATE INDEX CONCURRENTLY cannot run inside a transaction, so each
-- statement is independent. Prisma 5.x runs each statement separately
-- but wraps them in a single transaction; if you hit the
-- "CREATE INDEX CONCURRENTLY cannot run inside a transaction block"
-- error during `prisma migrate deploy`, drop the CONCURRENTLY keyword
-- (a brief write lock on each table is acceptable here — each table
-- has < ~100k rows in production at the time of writing).

-- Activity feed per team member ("who scanned what")
CREATE INDEX IF NOT EXISTS "transactions_team_member_id_created_at_idx"
    ON "transactions"("team_member_id", "created_at" DESC);

-- Active sessions list per merchant, ordered by last activity
CREATE INDEX IF NOT EXISTS "device_sessions_merchant_id_last_active_at_idx"
    ON "device_sessions"("merchant_id", "last_active_at" DESC);

-- Client-side wallet view: list active cards for a client
CREATE INDEX IF NOT EXISTS "loyalty_cards_client_id_deactivated_at_idx"
    ON "loyalty_cards"("client_id", "deactivated_at");

-- Referral analytics: count / list merchants referred by another merchant
CREATE INDEX IF NOT EXISTS "merchants_referred_by_id_idx"
    ON "merchants"("referred_by_id");

-- Merchant-lifecycle cron: scan PREMIUM merchants nearing expiry
CREATE INDEX IF NOT EXISTS "merchants_plan_plan_expires_at_idx"
    ON "merchants"("plan", "plan_expires_at");

-- Trial reminder cron: scan merchants on trial by start date
CREATE INDEX IF NOT EXISTS "merchants_trial_started_at_idx"
    ON "merchants"("trial_started_at");

-- Client payout history filtered by status (most recent first)
CREATE INDEX IF NOT EXISTS "payout_requests_client_id_status_created_at_idx"
    ON "payout_requests"("client_id", "status", "created_at" DESC);
