-- AlterTable
ALTER TABLE "clients" ADD COLUMN "apple_id" VARCHAR(255);

-- CreateIndex
CREATE UNIQUE INDEX "clients_apple_id_key" ON "clients"("apple_id");

-- CreateIndex
CREATE INDEX "clients_apple_id_idx" ON "clients"("apple_id");
