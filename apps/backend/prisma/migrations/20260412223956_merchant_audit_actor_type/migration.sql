-- CreateEnum
CREATE TYPE "AuditActorType" AS ENUM ('ADMIN', 'MERCHANT');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'CREATE_REWARD';
ALTER TYPE "AuditAction" ADD VALUE 'DELETE_REWARD';
ALTER TYPE "AuditAction" ADD VALUE 'CREATE_TEAM_MEMBER';
ALTER TYPE "AuditAction" ADD VALUE 'DELETE_TEAM_MEMBER';
ALTER TYPE "AuditAction" ADD VALUE 'CREATE_STORE';
ALTER TYPE "AuditAction" ADD VALUE 'DELETE_STORE';
ALTER TYPE "AuditAction" ADD VALUE 'CANCEL_TRANSACTION';
ALTER TYPE "AuditAction" ADD VALUE 'UPDATE_LOYALTY_SETTINGS';
ALTER TYPE "AuditAction" ADD VALUE 'UPDATE_PAYOUT';

-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "actor_type" "AuditActorType" NOT NULL DEFAULT 'ADMIN',
ADD COLUMN     "merchant_id" TEXT,
ALTER COLUMN "admin_id" DROP NOT NULL,
ALTER COLUMN "admin_email" DROP NOT NULL;

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "refresh_token_expires_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "audit_logs_merchant_id_idx" ON "audit_logs"("merchant_id");

-- CreateIndex
CREATE INDEX "client_notification_statuses_notification_id_idx" ON "client_notification_statuses"("notification_id");

-- CreateIndex
CREATE INDEX "clients_notif_push_deleted_at_push_token_idx" ON "clients"("notif_push", "deleted_at", "push_token");

-- CreateIndex
CREATE INDEX "loyalty_cards_merchant_id_deactivated_at_client_id_idx" ON "loyalty_cards"("merchant_id", "deactivated_at", "client_id");

-- CreateIndex
CREATE INDEX "merchant_notification_reads_notification_id_idx" ON "merchant_notification_reads"("notification_id");

-- CreateIndex
CREATE INDEX "merchants_plan_is_active_created_at_idx" ON "merchants"("plan", "is_active", "created_at" DESC);

-- CreateIndex
CREATE INDEX "notifications_channel_audience_created_at_idx" ON "notifications"("channel", "audience", "created_at" DESC);

-- CreateIndex
CREATE INDEX "transactions_merchant_id_created_at_idx" ON "transactions"("merchant_id", "created_at" DESC);
