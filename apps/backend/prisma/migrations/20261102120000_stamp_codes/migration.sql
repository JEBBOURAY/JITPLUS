-- QR e-commerce: single-use codes a merchant slips into parcels. Scanning one
-- credits stamps through a regular EARN_STAMPS transaction (stamp_code_id set).
-- Written in the style of prisma migrate diff.

-- CreateEnum
CREATE TYPE "StampCodeStatus" AS ENUM ('ACTIVE', 'REDEEMED', 'REVOKED');

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'CREATE_STAMP_CODES';
ALTER TYPE "AuditAction" ADD VALUE 'REVOKE_STAMP_CODES';

-- CreateTable
CREATE TABLE "stamp_codes" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "label" VARCHAR(80) NOT NULL,
    "stamps" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "StampCodeStatus" NOT NULL DEFAULT 'ACTIVE',
    "redeemed_at" TIMESTAMP(3),
    "redeemed_by_client_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stamp_codes_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "stamp_code_id" TEXT;

-- CreateIndex
CREATE INDEX "stamp_codes_merchant_id_created_at_idx" ON "stamp_codes"("merchant_id", "created_at");

-- CreateIndex
CREATE INDEX "stamp_codes_batch_id_status_idx" ON "stamp_codes"("batch_id", "status");

-- CreateIndex
CREATE INDEX "stamp_codes_redeemed_by_client_id_idx" ON "stamp_codes"("redeemed_by_client_id");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_stamp_code_id_key" ON "transactions"("stamp_code_id");

-- AddForeignKey
ALTER TABLE "stamp_codes" ADD CONSTRAINT "stamp_codes_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stamp_codes" ADD CONSTRAINT "stamp_codes_redeemed_by_client_id_fkey" FOREIGN KEY ("redeemed_by_client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_stamp_code_id_fkey" FOREIGN KEY ("stamp_code_id") REFERENCES "stamp_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
