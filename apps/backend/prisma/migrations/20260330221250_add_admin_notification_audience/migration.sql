/*
  Warnings:

  - You are about to drop the column `apple_id` on the `clients` table. All the data in the column will be lost.
  - You are about to drop the column `apple_id` on the `merchants` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "clients_apple_id_idx";

-- DropIndex
DROP INDEX "clients_apple_id_key";

-- DropIndex
DROP INDEX "merchants_apple_id_key";

-- AlterTable
ALTER TABLE "clients" DROP COLUMN "apple_id";

-- AlterTable
ALTER TABLE "merchants" DROP COLUMN "apple_id";

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "audience" VARCHAR(30),
ALTER COLUMN "merchant_id" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "notifications_audience_created_at_idx" ON "notifications"("audience", "created_at" DESC);
