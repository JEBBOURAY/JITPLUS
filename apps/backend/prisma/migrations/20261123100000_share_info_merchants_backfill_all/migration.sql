-- Product decision (2026-11-23, owner): every existing client shares their
-- info with merchants, like new sign-ups since 20261122210000. The earlier
-- backfill was a no-op, so clients created while sign-up forced
-- share_info_merchants = false stayed masked in the Pro app.
--
-- Accepted trade-off: a stored false cannot be told apart from a client who
-- turned sharing off in the settings; those are flipped too. Clients can
-- still turn it off again from their profile.
-- Deleted accounts are left alone (their data is already scrubbed).
UPDATE "clients"
SET "share_info_merchants" = true
WHERE "share_info_merchants" = false
  AND "deleted_at" IS NULL;
