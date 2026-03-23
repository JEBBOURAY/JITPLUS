/*
  Warnings:

  - The `loyalty_type` column on the `transactions` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Changed the type of `target_type` on the `audit_logs` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "AuditTargetType" AS ENUM ('MERCHANT', 'CLIENT', 'ADMIN');

-- DropIndex
DROP INDEX "clients_deleted_at_idx";

-- DropIndex
DROP INDEX "notifications_channel_idx";

-- DropIndex
DROP INDEX "otps_expires_at_idx";

-- DropIndex
DROP INDEX "transactions_client_id_created_at_idx";

-- AlterTable
ALTER TABLE "audit_logs" DROP COLUMN "target_type",
ADD COLUMN     "target_type" "AuditTargetType" NOT NULL;

-- AlterTable
ALTER TABLE "clients" ALTER COLUMN "share_info_merchants" SET DEFAULT false;

-- AlterTable
ALTER TABLE "transactions" DROP COLUMN "loyalty_type",
ADD COLUMN     "loyalty_type" "LoyaltyType";

-- CreateIndex
CREATE INDEX "audit_logs_target_type_target_id_idx" ON "audit_logs"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "clients_deleted_at_created_at_idx" ON "clients"("deleted_at", "created_at");

-- CreateIndex
CREATE INDEX "clients_country_code_idx" ON "clients"("country_code");

-- CreateIndex
CREATE INDEX "notifications_channel_created_at_idx" ON "notifications"("channel", "created_at" DESC);

-- CreateIndex
CREATE INDEX "otps_expires_at_created_at_idx" ON "otps"("expires_at", "created_at" DESC);

-- CreateIndex
CREATE INDEX "transactions_client_id_status_created_at_idx" ON "transactions"("client_id", "status", "created_at");

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admins"("id") ON DELETE CASCADE ON UPDATE CASCADE;
