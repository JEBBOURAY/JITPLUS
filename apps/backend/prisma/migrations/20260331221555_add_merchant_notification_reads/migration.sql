-- CreateTable
CREATE TABLE "merchant_notification_reads" (
    "merchant_id" TEXT NOT NULL,
    "notification_id" TEXT NOT NULL,
    "read_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "merchant_notification_reads_pkey" PRIMARY KEY ("merchant_id","notification_id")
);

-- AddForeignKey
ALTER TABLE "merchant_notification_reads" ADD CONSTRAINT "merchant_notification_reads_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_notification_reads" ADD CONSTRAINT "merchant_notification_reads_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
