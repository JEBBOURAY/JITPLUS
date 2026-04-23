-- CreateTable
CREATE TABLE "campaign_sent_trackers" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'EMAIL',
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_sent_trackers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "campaign_sent_trackers_client_id_idx" ON "campaign_sent_trackers"("client_id");

-- CreateIndex
CREATE INDEX "campaign_sent_trackers_campaign_id_idx" ON "campaign_sent_trackers"("campaign_id");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_sent_trackers_client_id_campaign_id_channel_key" ON "campaign_sent_trackers"("client_id", "campaign_id", "channel");

-- AddForeignKey
ALTER TABLE "campaign_sent_trackers" ADD CONSTRAINT "campaign_sent_trackers_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
