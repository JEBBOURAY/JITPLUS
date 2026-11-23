-- Collection game: a merchant lists products to buy and the gift offered once
-- a client collected them all. Additive only (new tables).

-- CreateEnum
CREATE TYPE "CollectionStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ENDED');

-- CreateTable
CREATE TABLE "collections" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "gift_label" VARCHAR(80) NOT NULL,
    "status" "CollectionStatus" NOT NULL DEFAULT 'DRAFT',
    "one_per_visit" BOOLEAN NOT NULL DEFAULT false,
    "repeatable" BOOLEAN NOT NULL DEFAULT true,
    "coupon_validity_days" INTEGER NOT NULL DEFAULT 30,
    "gift_delay_hours" INTEGER NOT NULL DEFAULT 0,
    "ends_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection_items" (
    "id" TEXT NOT NULL,
    "collection_id" TEXT NOT NULL,
    "label" VARCHAR(60) NOT NULL,
    "image_url" VARCHAR(500),
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collection_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection_progress" (
    "id" TEXT NOT NULL,
    "collection_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "cycle" INTEGER NOT NULL DEFAULT 1,
    "completed_at" TIMESTAMP(3),
    "coupon_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collection_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection_checks" (
    "id" TEXT NOT NULL,
    "progress_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "team_member_id" TEXT,
    "performed_by_name" VARCHAR(255),
    "request_key" VARCHAR(64),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collection_checks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "collections_merchant_id_status_idx" ON "collections"("merchant_id", "status");

-- CreateIndex
CREATE INDEX "collection_items_collection_id_position_idx" ON "collection_items"("collection_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "collection_progress_coupon_id_key" ON "collection_progress"("coupon_id");

-- CreateIndex
CREATE INDEX "collection_progress_client_id_merchant_id_idx" ON "collection_progress"("client_id", "merchant_id");

-- CreateIndex
CREATE UNIQUE INDEX "collection_progress_collection_id_client_id_cycle_key" ON "collection_progress"("collection_id", "client_id", "cycle");

-- CreateIndex
CREATE INDEX "collection_checks_item_id_idx" ON "collection_checks"("item_id");

-- CreateIndex
CREATE INDEX "collection_checks_request_key_idx" ON "collection_checks"("request_key");

-- CreateIndex
CREATE UNIQUE INDEX "collection_checks_progress_id_item_id_key" ON "collection_checks"("progress_id", "item_id");

-- AddForeignKey
ALTER TABLE "collections" ADD CONSTRAINT "collections_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_items" ADD CONSTRAINT "collection_items_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_progress" ADD CONSTRAINT "collection_progress_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_progress" ADD CONSTRAINT "collection_progress_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_progress" ADD CONSTRAINT "collection_progress_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_checks" ADD CONSTRAINT "collection_checks_progress_id_fkey" FOREIGN KEY ("progress_id") REFERENCES "collection_progress"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_checks" ADD CONSTRAINT "collection_checks_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "collection_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- One ACTIVE collection per merchant (not expressible in schema.prisma)
CREATE UNIQUE INDEX "collections_one_active_per_merchant" ON "collections"("merchant_id") WHERE "status" = 'ACTIVE';
