-- JitPlus Pro notifications: per-category opt-outs, open tracking and the
-- index used by the marketing frequency cap.

-- AlterTable
ALTER TABLE "merchants" ADD COLUMN "notif_prefs" JSONB;

-- AlterTable
ALTER TABLE "merchant_inbox_notifications" ADD COLUMN "opened_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "merchant_inbox_notifications_merchant_id_category_created_at_idx" ON "merchant_inbox_notifications"("merchant_id", "category", "created_at");
