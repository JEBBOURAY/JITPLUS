-- CreateEnum
CREATE TYPE "WelcomeBonusTrigger" AS ENUM ('CARD_OR_SCAN', 'FIRST_SCAN');

-- AlterTable
ALTER TABLE "merchants"
  ADD COLUMN "welcome_bonus_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "welcome_bonus_stamps" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "welcome_bonus_trigger" "WelcomeBonusTrigger" NOT NULL DEFAULT 'CARD_OR_SCAN',
  ADD COLUMN "welcome_bonus_ends_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "loyalty_cards"
  ADD COLUMN "welcome_bonus_reserved_stamps" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "welcome_bonus_reserved_at" TIMESTAMP(3),
  ADD COLUMN "welcome_bonus_credited_at" TIMESTAMP(3);

-- Last line of defence: one welcome gift per client and merchant, whatever the code does.
CREATE UNIQUE INDEX "transactions_welcome_bonus_unique"
  ON "transactions" ("client_id", "merchant_id")
  WHERE "type" = 'WELCOME_BONUS';
