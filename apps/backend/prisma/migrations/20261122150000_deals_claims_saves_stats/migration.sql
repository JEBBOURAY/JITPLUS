-- Bons plans: price display (unit, "à partir de"), calls and "J'en profite"
-- counters, saved deals, per-day figures, shared view de-duplication and the
-- history of offer edits. Additive only: the previous API keeps working.

-- AlterTable
ALTER TABLE "deals" ADD COLUMN     "price_from" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "price_unit" VARCHAR(10),
ADD COLUMN     "card_alert_sent_at" TIMESTAMP(3),
ADD COLUMN     "call_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "claim_count" INTEGER NOT NULL DEFAULT 0;

-- Deals already published must not be announced to cardholders after the fact.
UPDATE "deals" SET "card_alert_sent_at" = "created_at";

-- CreateTable
CREATE TABLE "deal_claims" (
    "deal_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deal_claims_pkey" PRIMARY KEY ("deal_id","client_id")
);

-- CreateTable
CREATE TABLE "deal_saves" (
    "client_id" TEXT NOT NULL,
    "deal_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reminded_at" TIMESTAMP(3),

    CONSTRAINT "deal_saves_pkey" PRIMARY KEY ("client_id","deal_id")
);

-- CreateTable
CREATE TABLE "deal_daily_stats" (
    "deal_id" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "actions" INTEGER NOT NULL DEFAULT 0,
    "claims" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "deal_daily_stats_pkey" PRIMARY KEY ("deal_id","day")
);

-- CreateTable
CREATE TABLE "deal_event_marks" (
    "deal_id" TEXT NOT NULL,
    "viewer_key" VARCHAR(64) NOT NULL,
    "kind" VARCHAR(12) NOT NULL,
    "day" DATE NOT NULL,

    CONSTRAINT "deal_event_marks_pkey" PRIMARY KEY ("deal_id","viewer_key","kind","day")
);

-- CreateTable
CREATE TABLE "deal_offer_changes" (
    "id" TEXT NOT NULL,
    "deal_id" TEXT NOT NULL,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deal_offer_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "deal_claims_client_id_idx" ON "deal_claims"("client_id");

-- CreateIndex
CREATE INDEX "deal_saves_deal_id_reminded_at_idx" ON "deal_saves"("deal_id", "reminded_at");

-- CreateIndex
CREATE INDEX "deal_event_marks_day_idx" ON "deal_event_marks"("day");

-- CreateIndex
CREATE INDEX "deal_offer_changes_deal_id_created_at_idx" ON "deal_offer_changes"("deal_id", "created_at");

-- AddForeignKey
ALTER TABLE "deal_claims" ADD CONSTRAINT "deal_claims_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_claims" ADD CONSTRAINT "deal_claims_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_saves" ADD CONSTRAINT "deal_saves_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_saves" ADD CONSTRAINT "deal_saves_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_daily_stats" ADD CONSTRAINT "deal_daily_stats_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_event_marks" ADD CONSTRAINT "deal_event_marks_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_offer_changes" ADD CONSTRAINT "deal_offer_changes_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
