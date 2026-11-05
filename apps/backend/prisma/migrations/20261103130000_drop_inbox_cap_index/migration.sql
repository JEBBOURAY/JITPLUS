-- 20261103120000_merchant_notif_prefs added an index on
-- (merchant_id, category, created_at) for the marketing frequency cap.
-- EXPLAIN ANALYZE on 400k rows shows PostgreSQL never picks it: the existing
-- (merchant_id, created_at) index already serves the cap query (~0.1 ms), so
-- the extra index would only slow down every inbox insert. Drop it.
-- PostgreSQL truncated its 64-char name to 63 ("..._created_at_id"); both
-- spellings are covered so this is idempotent everywhere.

-- DropIndex
DROP INDEX IF EXISTS "merchant_inbox_notifications_merchant_id_category_created_at_id";

-- DropIndex
DROP INDEX IF EXISTS "merchant_inbox_notifications_merchant_id_category_created_a_idx";
