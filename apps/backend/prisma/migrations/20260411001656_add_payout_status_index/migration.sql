-- CreateIndex
CREATE INDEX "payout_requests_status_created_at_idx" ON "payout_requests"("status", "created_at" DESC);
