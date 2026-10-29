-- Daily deal digest: the subscribers of a city are read in id order, batch by
-- batch. With id as the last key the batches are plain index range scans
-- instead of sorting every subscriber of the city at each batch.

-- DropIndex
DROP INDEX "clients_deal_alerts_enabled_deal_alert_city_key_idx";

-- CreateIndex
CREATE INDEX "clients_deal_alerts_enabled_deal_alert_city_key_id_idx" ON "clients"("deal_alerts_enabled", "deal_alert_city_key", "id");
