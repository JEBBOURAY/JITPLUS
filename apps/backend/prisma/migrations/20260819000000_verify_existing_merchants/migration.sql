-- Email verification is disabled: back-fill legacy accounts created before the
-- change so no existing merchant is treated as unverified. Idempotent.
UPDATE "merchants"
SET "email_verified" = true
WHERE "email_verified" = false;
