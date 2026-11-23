-- Welcome gift: remember "already received / no longer new here" per verified
-- identity (keyed HMAC of the email, phone, Google or Apple id), so deleting an
-- account and signing up again with the same identity does not grant it again.
-- Rows are written when an account is closed; they hold no readable personal
-- data and are not linked to the client row.

-- CreateTable
CREATE TABLE "welcome_bonus_claims" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "identity_hash" CHAR(64) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "welcome_bonus_claims_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "welcome_bonus_claims_merchant_id_identity_hash_key" ON "welcome_bonus_claims"("merchant_id", "identity_hash");

-- AddForeignKey
ALTER TABLE "welcome_bonus_claims" ADD CONSTRAINT "welcome_bonus_claims_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
