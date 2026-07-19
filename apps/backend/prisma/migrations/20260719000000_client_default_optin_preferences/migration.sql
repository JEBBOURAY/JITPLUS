-- New clients opt in by default to info sharing and email notifications
-- (push was already default true). Existing clients are also migrated to opt-in
-- on all three preferences (explicit product decision), and any client can still
-- disable each preference from the app.
-- AlterTable
ALTER TABLE "clients" ALTER COLUMN "share_info_merchants" SET DEFAULT true,
ALTER COLUMN "notif_email" SET DEFAULT true;

-- Backfill existing clients to opt-in on the three preferences
UPDATE "clients"
SET "share_info_merchants" = true,
    "notif_push" = true,
    "notif_email" = true;
