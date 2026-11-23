-- Security audit 2026-11-21.
-- Cards created from a typed phone number keep the client's details masked until the client confirms.
ALTER TABLE "loyalty_cards" ADD COLUMN "consent_pending" BOOLEAN NOT NULL DEFAULT false;

-- Admin logout revokes tokens through the database, on every instance.
ALTER TABLE "admins" ADD COLUMN "tokens_valid_after" TIMESTAMP(3);
