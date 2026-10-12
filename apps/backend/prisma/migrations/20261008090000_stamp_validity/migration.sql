-- Optional stamp validity: a card's stamps are reset after N days without a
-- visit. Disabled (NULL) for every merchant until they opt in.

-- AlterTable
ALTER TABLE "merchants" ADD COLUMN     "stamp_validity_days" INTEGER,
ADD COLUMN     "stamp_validity_since" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "loyalty_cards" ADD COLUMN     "expiry_reminder_sent_at" TIMESTAMP(3),
ADD COLUMN     "last_visit_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill: last stamp earned or reward redeemed, else the card creation date.
UPDATE "loyalty_cards" lc
SET "last_visit_at" = COALESCE(
      (SELECT MAX(t."created_at") FROM "transactions" t
        WHERE t."client_id" = lc."client_id" AND t."merchant_id" = lc."merchant_id"
          AND t."status" = 'ACTIVE' AND t."type" IN ('EARN_STAMPS', 'REDEEM_REWARD')),
      lc."created_at");

-- CreateIndex
CREATE INDEX "loyalty_cards_merchant_id_last_visit_at_idx" ON "loyalty_cards"("merchant_id", "last_visit_at");
