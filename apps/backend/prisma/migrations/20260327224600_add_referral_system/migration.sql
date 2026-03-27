-- CreateEnum
CREATE TYPE "ClientReferralStatus" AS ENUM ('PENDING', 'VALIDATED');

-- AlterTable: merchants
ALTER TABLE "merchants" ADD COLUMN "referral_bonus_credited" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "merchants" ADD COLUMN "referred_by_client_id" TEXT;

-- AlterTable: clients
ALTER TABLE "clients" ADD COLUMN "referral_code" TEXT;
ALTER TABLE "clients" ADD COLUMN "referral_balance" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "client_referrals" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "status" "ClientReferralStatus" NOT NULL DEFAULT 'PENDING',
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "validated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_referrals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "clients_referral_code_key" ON "clients"("referral_code");

-- CreateIndex
CREATE UNIQUE INDEX "client_referrals_merchant_id_key" ON "client_referrals"("merchant_id");

-- CreateIndex
CREATE INDEX "client_referrals_client_id_idx" ON "client_referrals"("client_id");

-- CreateIndex
CREATE INDEX "client_referrals_status_idx" ON "client_referrals"("status");

-- AddForeignKey
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_referred_by_client_id_fkey" FOREIGN KEY ("referred_by_client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_referrals" ADD CONSTRAINT "client_referrals_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_referrals" ADD CONSTRAINT "client_referrals_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
