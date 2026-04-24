-- Merchant cron hardening
-- 1. Merchant opt-in/opt-out columns for marketing crons (RGPD)
-- 2. CampaignSentTracker: allow merchantId as alternative to clientId (dedup)

-- 1) Add notif preferences to merchants
ALTER TABLE "merchants"
  ADD COLUMN "notif_push"  BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "notif_email" BOOLEAN NOT NULL DEFAULT true;

-- 2) CampaignSentTracker: add merchantId, make clientId nullable
-- Drop old FK (will be re-added below as nullable)
ALTER TABLE "campaign_sent_trackers"
  DROP CONSTRAINT "campaign_sent_trackers_client_id_fkey";

ALTER TABLE "campaign_sent_trackers"
  ALTER COLUMN "client_id" DROP NOT NULL;

ALTER TABLE "campaign_sent_trackers"
  ADD COLUMN "merchant_id" TEXT;

-- Re-add client FK (now nullable)
ALTER TABLE "campaign_sent_trackers"
  ADD CONSTRAINT "campaign_sent_trackers_client_id_fkey"
  FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- New merchant FK
ALTER TABLE "campaign_sent_trackers"
  ADD CONSTRAINT "campaign_sent_trackers_merchant_id_fkey"
  FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- New unique + supporting indexes
CREATE UNIQUE INDEX "campaign_sent_trackers_merchant_id_campaign_id_channel_key"
  ON "campaign_sent_trackers" ("merchant_id", "campaign_id", "channel");

CREATE INDEX "campaign_sent_trackers_merchant_id_idx"
  ON "campaign_sent_trackers" ("merchant_id");

CREATE INDEX "campaign_sent_trackers_sent_at_idx"
  ON "campaign_sent_trackers" ("sent_at");
