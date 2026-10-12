-- Scratch-card campaigns, rewards, cards and generic coupons.
-- Generated with prisma migrate diff, plus a partial unique index at the end.

-- CreateEnum
CREATE TYPE "ScratchCampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'ENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ScratchCardStatus" AS ENUM ('PENDING', 'SCRATCHED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ScratchAudienceType" AS ENUM ('ALL_CLIENTS', 'ACTIVE_SINCE', 'INACTIVE_SINCE', 'MIN_STAMPS', 'NEW_SINCE');

-- CreateEnum
CREATE TYPE "CouponRewardType" AS ENUM ('PERCENT_DISCOUNT', 'FIXED_DISCOUNT', 'FREE_PRODUCT', 'BONUS_STAMPS');

-- CreateEnum
CREATE TYPE "CouponStatus" AS ENUM ('ACTIVE', 'REDEEMED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CouponSource" AS ENUM ('SCRATCH_CARD', 'LUCKY_WHEEL', 'MANUAL');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'CREATE_SCRATCH_CAMPAIGN';
ALTER TYPE "AuditAction" ADD VALUE 'CANCEL_SCRATCH_CAMPAIGN';
ALTER TYPE "AuditAction" ADD VALUE 'REDEEM_COUPON';

-- AlterEnum
ALTER TYPE "TransactionType" ADD VALUE 'COUPON_REDEEM';

-- CreateTable
CREATE TABLE "scratch_campaigns" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "message" VARCHAR(200),
    "design_id" VARCHAR(32) NOT NULL DEFAULT 'violet',
    "status" "ScratchCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "audience_type" "ScratchAudienceType" NOT NULL DEFAULT 'ALL_CLIENTS',
    "audience_value" INTEGER,
    "send_at" TIMESTAMP(3),
    "sending_locked_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "card_expires_at" TIMESTAMP(3) NOT NULL,
    "coupon_expires_at" TIMESTAMP(3) NOT NULL,
    "recipient_count" INTEGER NOT NULL DEFAULT 0,
    "push_success_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scratch_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scratch_rewards" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "type" "CouponRewardType" NOT NULL,
    "label" VARCHAR(80) NOT NULL,
    "value" DOUBLE PRECISION,
    "max_discount" DOUBLE PRECISION,
    "reward_id" TEXT,
    "weight" INTEGER NOT NULL,
    "total_stock" INTEGER,
    "remaining" INTEGER,
    "min_purchase_amount" DOUBLE PRECISION,
    "min_delay_hours" INTEGER NOT NULL DEFAULT 0,
    "allowed_weekdays" INTEGER,
    "allowed_from_min" INTEGER,
    "allowed_to_min" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scratch_rewards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scratch_cards" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "reward_id" TEXT,
    "status" "ScratchCardStatus" NOT NULL DEFAULT 'PENDING',
    "push_sent_at" TIMESTAMP(3),
    "opened_at" TIMESTAMP(3),
    "scratched_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "reminder_sent_at" TIMESTAMP(3),
    "claimed_from_ghost_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scratch_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupons" (
    "id" TEXT NOT NULL,
    "source" "CouponSource" NOT NULL DEFAULT 'SCRATCH_CARD',
    "scratch_card_id" TEXT,
    "client_id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "code" CHAR(6) NOT NULL,
    "type" "CouponRewardType" NOT NULL,
    "label" VARCHAR(80) NOT NULL,
    "value" DOUBLE PRECISION,
    "max_discount" DOUBLE PRECISION,
    "conditions" JSONB NOT NULL,
    "status" "CouponStatus" NOT NULL DEFAULT 'ACTIVE',
    "valid_from" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "reminder_sent_at" TIMESTAMP(3),
    "redeemed_at" TIMESTAMP(3),
    "redeemed_by" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "purchase_amount" DOUBLE PRECISION,
    "discount_amount" DOUBLE PRECISION,
    "redeem_transaction_id" TEXT,
    "earn_transaction_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "scratch_campaigns_merchant_id_status_idx" ON "scratch_campaigns"("merchant_id", "status");

-- CreateIndex
CREATE INDEX "scratch_campaigns_status_send_at_idx" ON "scratch_campaigns"("status", "send_at");

-- CreateIndex
CREATE INDEX "scratch_rewards_campaign_id_idx" ON "scratch_rewards"("campaign_id");

-- CreateIndex
CREATE INDEX "scratch_cards_client_id_status_idx" ON "scratch_cards"("client_id", "status");

-- CreateIndex
CREATE INDEX "scratch_cards_campaign_id_status_idx" ON "scratch_cards"("campaign_id", "status");

-- CreateIndex
CREATE INDEX "scratch_cards_status_expires_at_idx" ON "scratch_cards"("status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "scratch_cards_campaign_id_client_id_key" ON "scratch_cards"("campaign_id", "client_id");

-- CreateIndex
CREATE UNIQUE INDEX "coupons_scratch_card_id_key" ON "coupons"("scratch_card_id");

-- CreateIndex
CREATE UNIQUE INDEX "coupons_redeem_transaction_id_key" ON "coupons"("redeem_transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "coupons_earn_transaction_id_key" ON "coupons"("earn_transaction_id");

-- CreateIndex
CREATE INDEX "coupons_client_id_status_idx" ON "coupons"("client_id", "status");

-- CreateIndex
CREATE INDEX "coupons_merchant_id_status_idx" ON "coupons"("merchant_id", "status");

-- CreateIndex
CREATE INDEX "coupons_merchant_id_code_idx" ON "coupons"("merchant_id", "code");

-- CreateIndex
CREATE INDEX "coupons_status_expires_at_idx" ON "coupons"("status", "expires_at");

-- AddForeignKey
ALTER TABLE "scratch_campaigns" ADD CONSTRAINT "scratch_campaigns_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scratch_rewards" ADD CONSTRAINT "scratch_rewards_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "scratch_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scratch_rewards" ADD CONSTRAINT "scratch_rewards_reward_id_fkey" FOREIGN KEY ("reward_id") REFERENCES "rewards"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scratch_cards" ADD CONSTRAINT "scratch_cards_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "scratch_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scratch_cards" ADD CONSTRAINT "scratch_cards_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scratch_cards" ADD CONSTRAINT "scratch_cards_reward_id_fkey" FOREIGN KEY ("reward_id") REFERENCES "scratch_rewards"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_scratch_card_id_fkey" FOREIGN KEY ("scratch_card_id") REFERENCES "scratch_cards"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A 6-digit code is unique among the ACTIVE coupons of a merchant only, so codes
-- can be recycled once a coupon is redeemed, expired or cancelled.
CREATE UNIQUE INDEX "coupons_merchant_id_code_active_key"
  ON "coupons" ("merchant_id", "code")
  WHERE "status" = 'ACTIVE';
