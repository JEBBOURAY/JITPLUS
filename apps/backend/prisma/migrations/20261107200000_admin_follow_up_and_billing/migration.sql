-- Admin back-office: merchant follow-up (CRM) and PREMIUM billing (paid vs offered,
-- payments received). Existing admin-activated PREMIUM rows keep premium_grant NULL
-- ("not recorded") until an admin labels them.

-- CreateEnum
CREATE TYPE "PremiumGrant" AS ENUM ('PAID', 'OFFERED');

-- CreateEnum
CREATE TYPE "FollowUpStatus" AS ENUM ('TO_CONTACT', 'CONTACTED', 'INTERESTED', 'ONBOARDING', 'CONVERTED', 'LOST');

-- CreateEnum
CREATE TYPE "FollowUpKind" AS ENUM ('NOTE', 'CALL', 'WHATSAPP', 'EMAIL', 'VISIT');

-- CreateEnum
CREATE TYPE "SubscriptionPaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'CHEQUE', 'CARD', 'OTHER');

-- AlterEnum


ALTER TYPE "AuditAction" ADD VALUE 'RECORD_SUBSCRIPTION_PAYMENT';
ALTER TYPE "AuditAction" ADD VALUE 'VOID_SUBSCRIPTION_PAYMENT';
ALTER TYPE "AuditAction" ADD VALUE 'UPDATE_PREMIUM_GRANT';

-- AlterTable
ALTER TABLE "merchants" ADD COLUMN     "premium_grant" "PremiumGrant",
ADD COLUMN     "premium_grant_note" VARCHAR(300);

-- CreateTable
CREATE TABLE "merchant_follow_ups" (
    "merchant_id" TEXT NOT NULL,
    "status" "FollowUpStatus" NOT NULL DEFAULT 'TO_CONTACT',
    "next_action_at" TIMESTAMP(3),
    "next_action" VARCHAR(200),
    "owner" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "merchant_follow_ups_pkey" PRIMARY KEY ("merchant_id")
);

-- CreateTable
CREATE TABLE "merchant_follow_up_notes" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "kind" "FollowUpKind" NOT NULL DEFAULT 'NOTE',
    "body" VARCHAR(2000) NOT NULL,
    "admin_id" TEXT,
    "admin_email" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "merchant_follow_up_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchant_subscription_payments" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'MAD',
    "method" "SubscriptionPaymentMethod" NOT NULL,
    "paid_at" TIMESTAMP(3) NOT NULL,
    "period_start" TIMESTAMP(3),
    "period_end" TIMESTAMP(3),
    "reference" VARCHAR(120),
    "note" VARCHAR(500),
    "admin_id" TEXT,
    "admin_email" VARCHAR(255),
    "voided_at" TIMESTAMP(3),
    "void_reason" VARCHAR(300),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "merchant_subscription_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "merchant_follow_ups_status_next_action_at_idx" ON "merchant_follow_ups"("status", "next_action_at");

-- CreateIndex
CREATE INDEX "merchant_follow_ups_next_action_at_idx" ON "merchant_follow_ups"("next_action_at");

-- CreateIndex
CREATE INDEX "merchant_follow_up_notes_merchant_id_created_at_idx" ON "merchant_follow_up_notes"("merchant_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "merchant_follow_up_notes_created_at_idx" ON "merchant_follow_up_notes"("created_at" DESC);

-- CreateIndex
CREATE INDEX "merchant_subscription_payments_merchant_id_paid_at_idx" ON "merchant_subscription_payments"("merchant_id", "paid_at" DESC);

-- CreateIndex
CREATE INDEX "merchant_subscription_payments_paid_at_idx" ON "merchant_subscription_payments"("paid_at" DESC);

-- AddForeignKey
ALTER TABLE "merchant_follow_ups" ADD CONSTRAINT "merchant_follow_ups_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_follow_up_notes" ADD CONSTRAINT "merchant_follow_up_notes_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_subscription_payments" ADD CONSTRAINT "merchant_subscription_payments_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

