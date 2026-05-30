-- CreateIndex
CREATE INDEX "client_claims_client_id_consumed_at_idx" ON "client_claims"("client_id", "consumed_at");
