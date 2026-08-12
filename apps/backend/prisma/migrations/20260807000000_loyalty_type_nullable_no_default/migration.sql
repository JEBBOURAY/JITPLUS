-- Loyalty program is no longer assigned by default at registration.
-- Merchants must explicitly choose their program (Points or Stamps).
-- Existing merchants keep their current value; only the column default and
-- NOT NULL constraint are dropped so new accounts start with NULL.
ALTER TABLE "merchants" ALTER COLUMN "loyalty_type" DROP DEFAULT;
ALTER TABLE "merchants" ALTER COLUMN "loyalty_type" DROP NOT NULL;
