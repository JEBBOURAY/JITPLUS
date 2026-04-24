-- CreateTable
CREATE TABLE "client_merchant_blocks" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_merchant_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "client_merchant_blocks_client_id_idx" ON "client_merchant_blocks"("client_id");

-- CreateIndex
CREATE INDEX "client_merchant_blocks_merchant_id_idx" ON "client_merchant_blocks"("merchant_id");

-- CreateIndex
CREATE UNIQUE INDEX "client_merchant_blocks_client_id_merchant_id_key" ON "client_merchant_blocks"("client_id", "merchant_id");

-- AddForeignKey
ALTER TABLE "client_merchant_blocks" ADD CONSTRAINT "client_merchant_blocks_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_merchant_blocks" ADD CONSTRAINT "client_merchant_blocks_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
