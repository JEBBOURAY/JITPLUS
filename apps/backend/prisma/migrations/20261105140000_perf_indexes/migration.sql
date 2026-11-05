-- Performance indexes (audit 2026-11-05).
--
-- 1. notifications(merchant_id, is_broadcast, created_at DESC): merchant
--    broadcast history and the broadcast branch of the client notification
--    feed. Per-scan personal notifications dominate each merchant's rows; the
--    (merchant_id, created_at) index had to read and discard all of them.
-- 2. client_notification_statuses(notification_id, is_read) replaces
--    (notification_id): broadcast read counts (notification_id IN … AND
--    is_read) become index-only; the prefix serves every former lookup.
-- 3. scratch_cards(reward_id), merchants(referred_by_client_id): foreign keys
--    with ON DELETE SET NULL had no index, so deleting a reward / client
--    scanned the whole child table.
--
-- Plain CREATE INDEX (brief write lock), as in the earlier index migrations:
-- Prisma applies a migration in one transaction, which CONCURRENTLY forbids.

-- DropIndex
DROP INDEX "client_notification_statuses_notification_id_idx";

-- CreateIndex
CREATE INDEX "client_notification_statuses_notification_id_is_read_idx" ON "client_notification_statuses"("notification_id", "is_read");

-- CreateIndex
CREATE INDEX "merchants_referred_by_client_id_idx" ON "merchants"("referred_by_client_id");

-- CreateIndex
CREATE INDEX "notifications_merchant_id_is_broadcast_created_at_idx" ON "notifications"("merchant_id", "is_broadcast", "created_at" DESC);

-- CreateIndex
CREATE INDEX "scratch_cards_reward_id_idx" ON "scratch_cards"("reward_id");
