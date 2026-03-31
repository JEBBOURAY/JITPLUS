/*
  Warnings:

  - The values [APPROVE_UPGRADE_REQUEST,REJECT_UPGRADE_REQUEST] on the enum `AuditAction` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the `upgrade_requests` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[apple_id]` on the table `clients` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[apple_id]` on the table `merchants` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "AuditAction_new" AS ENUM ('ADMIN_LOGIN', 'ACTIVATE_PREMIUM', 'REVOKE_PREMIUM', 'BAN_MERCHANT', 'UNBAN_MERCHANT', 'DELETE_MERCHANT', 'DEACTIVATE_CLIENT', 'ACTIVATE_CLIENT', 'DELETE_CLIENT', 'ADMIN_SEND_NOTIFICATION', 'RESET_PASSWORD', 'UPDATE_PLAN_DURATION');
ALTER TABLE "audit_logs" ALTER COLUMN "action" TYPE "AuditAction_new" USING ("action"::text::"AuditAction_new");
ALTER TYPE "AuditAction" RENAME TO "AuditAction_old";
ALTER TYPE "AuditAction_new" RENAME TO "AuditAction";
DROP TYPE "AuditAction_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "upgrade_requests" DROP CONSTRAINT "upgrade_requests_merchant_id_fkey";

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "apple_id" VARCHAR(255);

-- AlterTable
ALTER TABLE "merchants" ADD COLUMN     "apple_id" VARCHAR(255);

-- DropTable
DROP TABLE "upgrade_requests";

-- DropEnum
DROP TYPE "UpgradeRequestStatus";

-- CreateIndex
CREATE UNIQUE INDEX "clients_apple_id_key" ON "clients"("apple_id");

-- CreateIndex
CREATE INDEX "clients_apple_id_idx" ON "clients"("apple_id");

-- CreateIndex
CREATE UNIQUE INDEX "merchants_apple_id_key" ON "merchants"("apple_id");
