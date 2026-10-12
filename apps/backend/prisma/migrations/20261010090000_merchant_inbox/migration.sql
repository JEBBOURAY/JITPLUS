-- Personal inbox for merchants: automatic pushes (security, plan, activity,
-- tips…) are stored so they also show in the Pro app's Notifications screen.
-- Additive only: no existing table or row is modified.

-- CreateTable
CREATE TABLE "merchant_inbox_notifications" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "category" VARCHAR(20) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "body" VARCHAR(2000) NOT NULL,
    "action" VARCHAR(40),
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "merchant_inbox_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "merchant_inbox_notifications_merchant_id_created_at_idx" ON "merchant_inbox_notifications"("merchant_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "merchant_inbox_notifications_merchant_id_read_at_idx" ON "merchant_inbox_notifications"("merchant_id", "read_at");

-- CreateIndex
CREATE INDEX "merchant_inbox_notifications_created_at_idx" ON "merchant_inbox_notifications"("created_at");

-- AddForeignKey
ALTER TABLE "merchant_inbox_notifications" ADD CONSTRAINT "merchant_inbox_notifications_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
