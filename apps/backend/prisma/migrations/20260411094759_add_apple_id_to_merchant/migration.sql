-- AlterTable
ALTER TABLE "merchants" ADD COLUMN "apple_id" VARCHAR(255);

-- CreateIndex
CREATE UNIQUE INDEX "merchants_apple_id_key" ON "merchants"("apple_id");

-- CreateIndex
CREATE INDEX "merchants_apple_id_idx" ON "merchants"("apple_id");
