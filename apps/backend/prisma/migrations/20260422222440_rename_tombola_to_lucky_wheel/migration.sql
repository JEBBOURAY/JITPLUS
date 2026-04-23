-- CreateEnum
CREATE TYPE "LuckyWheelCampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ENDED');

-- CreateEnum
CREATE TYPE "DrawResult" AS ENUM ('WON', 'LOST');

-- CreateEnum
CREATE TYPE "PrizeFulfilmentStatus" AS ENUM ('PENDING', 'CLAIMED', 'EXPIRED');

-- AlterEnum
ALTER TYPE "TransactionType" ADD VALUE 'LUCKY_WHEEL_WIN';

-- AlterTable
ALTER TABLE "clients" ALTER COLUMN "notif_email" SET DEFAULT false,
ALTER COLUMN "notif_whatsapp" SET DEFAULT false;

-- CreateTable
CREATE TABLE "lucky_wheel_campaigns" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" VARCHAR(2000),
    "status" "LuckyWheelCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "global_win_rate" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "ticket_cost_points" INTEGER NOT NULL DEFAULT 0,
    "ticket_every_n_visits" INTEGER,
    "min_spend_amount" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lucky_wheel_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lucky_wheel_prizes" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "label" VARCHAR(255) NOT NULL,
    "description" VARCHAR(1000),
    "weight" INTEGER NOT NULL DEFAULT 1,
    "total_stock" INTEGER NOT NULL,
    "remaining" INTEGER NOT NULL,
    "claim_window_hours" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lucky_wheel_prizes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lucky_wheel_tickets" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lucky_wheel_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lucky_wheel_draws" (
    "id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "prize_id" TEXT,
    "result" "DrawResult" NOT NULL,
    "fulfilment" "PrizeFulfilmentStatus",
    "claim_before" TIMESTAMP(3),
    "fulfilled_at" TIMESTAMP(3),
    "fulfilled_by" TEXT,
    "server_seed" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lucky_wheel_draws_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lucky_wheel_campaigns_merchant_id_status_idx" ON "lucky_wheel_campaigns"("merchant_id", "status");

-- CreateIndex
CREATE INDEX "lucky_wheel_campaigns_status_starts_at_ends_at_idx" ON "lucky_wheel_campaigns"("status", "starts_at", "ends_at");

-- CreateIndex
CREATE INDEX "lucky_wheel_prizes_campaign_id_idx" ON "lucky_wheel_prizes"("campaign_id");

-- CreateIndex
CREATE INDEX "lucky_wheel_prizes_campaign_id_remaining_idx" ON "lucky_wheel_prizes"("campaign_id", "remaining");

-- CreateIndex
CREATE INDEX "lucky_wheel_tickets_client_id_campaign_id_idx" ON "lucky_wheel_tickets"("client_id", "campaign_id");

-- CreateIndex
CREATE INDEX "lucky_wheel_tickets_campaign_id_used_idx" ON "lucky_wheel_tickets"("campaign_id", "used");

-- CreateIndex
CREATE UNIQUE INDEX "lucky_wheel_tickets_transaction_id_campaign_id_key" ON "lucky_wheel_tickets"("transaction_id", "campaign_id");

-- CreateIndex
CREATE UNIQUE INDEX "lucky_wheel_draws_ticket_id_key" ON "lucky_wheel_draws"("ticket_id");

-- CreateIndex
CREATE INDEX "lucky_wheel_draws_prize_id_idx" ON "lucky_wheel_draws"("prize_id");

-- CreateIndex
CREATE INDEX "lucky_wheel_draws_fulfilment_idx" ON "lucky_wheel_draws"("fulfilment");

-- CreateIndex
CREATE INDEX "lucky_wheel_draws_result_created_at_idx" ON "lucky_wheel_draws"("result", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "lucky_wheel_campaigns" ADD CONSTRAINT "lucky_wheel_campaigns_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lucky_wheel_prizes" ADD CONSTRAINT "lucky_wheel_prizes_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "lucky_wheel_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lucky_wheel_tickets" ADD CONSTRAINT "lucky_wheel_tickets_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "lucky_wheel_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lucky_wheel_tickets" ADD CONSTRAINT "lucky_wheel_tickets_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lucky_wheel_tickets" ADD CONSTRAINT "lucky_wheel_tickets_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lucky_wheel_draws" ADD CONSTRAINT "lucky_wheel_draws_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "lucky_wheel_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lucky_wheel_draws" ADD CONSTRAINT "lucky_wheel_draws_prize_id_fkey" FOREIGN KEY ("prize_id") REFERENCES "lucky_wheel_prizes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
