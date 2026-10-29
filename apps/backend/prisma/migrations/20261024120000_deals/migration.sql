-- Bons plans: public promotions published by merchants (deals, the stores they
-- apply to, client reports) and the clients' deal-alert preferences.
-- Written in the style of prisma migrate diff.

-- CreateEnum
CREATE TYPE "DealType" AS ENUM ('BUY_X_GET_Y', 'PERCENT_OFF', 'PRICE_DROP', 'FREE_ITEM', 'OTHER');

-- CreateEnum
CREATE TYPE "DealScope" AS ENUM ('LOCAL', 'ONLINE');

-- CreateEnum
CREATE TYPE "DealStatus" AS ENUM ('ACTIVE', 'ENDED', 'REMOVED', 'DELETED');

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'CREATE_DEAL';
ALTER TYPE "AuditAction" ADD VALUE 'REMOVE_DEAL';
ALTER TYPE "AuditAction" ADD VALUE 'RESTORE_DEAL';

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "deal_alert_categories" "MerchantCategory"[] DEFAULT ARRAY[]::"MerchantCategory"[],
ADD COLUMN     "deal_alert_city_key" VARCHAR(40),
ADD COLUMN     "deal_alerts_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "deal_online_alerts" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "deals" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "scope" "DealScope" NOT NULL DEFAULT 'LOCAL',
    "type" "DealType" NOT NULL,
    "title" VARCHAR(60) NOT NULL,
    "description" VARCHAR(300),
    "conditions" VARCHAR(200),
    "image_url" VARCHAR(500),
    "link_url" VARCHAR(500),
    "original_price" DECIMAL(10,2),
    "deal_price" DECIMAL(10,2),
    "percent_off" INTEGER,
    "buy_qty" INTEGER,
    "free_qty" INTEGER,
    "all_stores" BOOLEAN NOT NULL DEFAULT true,
    "city_keys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "status" "DealStatus" NOT NULL DEFAULT 'ACTIVE',
    "ended_reason" VARCHAR(200),
    "alert_sent_at" TIMESTAMP(3),
    "is_popular" BOOLEAN NOT NULL DEFAULT false,
    "report_count" INTEGER NOT NULL DEFAULT 0,
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "link_click_count" INTEGER NOT NULL DEFAULT 0,
    "directions_count" INTEGER NOT NULL DEFAULT 0,
    "share_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deal_stores" (
    "deal_id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,

    CONSTRAINT "deal_stores_pkey" PRIMARY KEY ("deal_id","store_id")
);

-- CreateTable
CREATE TABLE "deal_reports" (
    "id" TEXT NOT NULL,
    "deal_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "reason" VARCHAR(40) NOT NULL,
    "comment" VARCHAR(300),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deal_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "clients_deal_alerts_enabled_deal_alert_city_key_idx" ON "clients"("deal_alerts_enabled", "deal_alert_city_key");

-- CreateIndex
CREATE INDEX "deals_status_ends_at_idx" ON "deals"("status", "ends_at");

-- CreateIndex
CREATE INDEX "deals_scope_status_ends_at_idx" ON "deals"("scope", "status", "ends_at");

-- CreateIndex
CREATE INDEX "deals_status_starts_at_idx" ON "deals"("status", "starts_at");

-- CreateIndex
CREATE INDEX "deals_merchant_id_status_idx" ON "deals"("merchant_id", "status");

-- CreateIndex
CREATE INDEX "deals_city_keys_idx" ON "deals" USING GIN ("city_keys");

-- CreateIndex
CREATE INDEX "deal_stores_store_id_idx" ON "deal_stores"("store_id");

-- CreateIndex
CREATE INDEX "deal_reports_client_id_idx" ON "deal_reports"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "deal_reports_deal_id_client_id_key" ON "deal_reports"("deal_id", "client_id");

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_stores" ADD CONSTRAINT "deal_stores_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_stores" ADD CONSTRAINT "deal_stores_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_reports" ADD CONSTRAINT "deal_reports_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_reports" ADD CONSTRAINT "deal_reports_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
