/*
  Warnings:

  - You are about to alter the column `email` on the `admins` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - You are about to alter the column `password` on the `admins` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - You are about to alter the column `nom` on the `admins` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - You are about to alter the column `prenom` on the `clients` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - You are about to alter the column `nom` on the `clients` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - You are about to alter the column `email` on the `clients` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - You are about to alter the column `password` on the `clients` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - You are about to alter the column `telephone` on the `clients` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(20)`.
  - You are about to alter the column `google_id` on the `clients` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - You are about to alter the column `country_code` on the `clients` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(5)`.
  - You are about to alter the column `push_token` on the `clients` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(512)`.
  - You are about to alter the column `nom` on the `merchants` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - You are about to alter the column `email` on the `merchants` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - You are about to alter the column `password` on the `merchants` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - You are about to alter the column `google_id` on the `merchants` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - You are about to alter the column `push_token` on the `merchants` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(512)`.
  - You are about to alter the column `description` on the `merchants` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(1000)`.
  - You are about to alter the column `ville` on the `merchants` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(100)`.
  - You are about to alter the column `quartier` on the `merchants` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(100)`.
  - You are about to alter the column `adresse` on the `merchants` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(500)`.
  - You are about to alter the column `country_code` on the `merchants` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(5)`.
  - You are about to alter the column `phone_number` on the `merchants` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(20)`.
  - You are about to alter the column `title` on the `notifications` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - You are about to alter the column `body` on the `notifications` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(2000)`.
  - You are about to alter the column `titre` on the `rewards` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - You are about to alter the column `description` on the `rewards` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(1000)`.
  - You are about to alter the column `nom` on the `stores` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - You are about to alter the column `ville` on the `stores` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(100)`.
  - You are about to alter the column `quartier` on the `stores` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(100)`.
  - You are about to alter the column `adresse` on the `stores` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(500)`.
  - You are about to alter the column `telephone` on the `stores` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(20)`.
  - You are about to alter the column `nom` on the `team_members` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - You are about to alter the column `email` on the `team_members` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - You are about to alter the column `password` on the `team_members` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.

*/
-- CreateEnum
CREATE TYPE "GiftStatus" AS ENUM ('PENDING', 'FULFILLED');

-- DropForeignKey
ALTER TABLE "loyalty_cards" DROP CONSTRAINT "loyalty_cards_client_id_fkey";

-- DropForeignKey
ALTER TABLE "loyalty_cards" DROP CONSTRAINT "loyalty_cards_merchant_id_fkey";

-- DropForeignKey
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_client_id_fkey";

-- DropForeignKey
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_merchant_id_fkey";

-- AlterTable
ALTER TABLE "admins" ALTER COLUMN "email" SET DATA TYPE VARCHAR(255),
ALTER COLUMN "password" SET DATA TYPE VARCHAR(255),
ALTER COLUMN "nom" SET DATA TYPE VARCHAR(255);

-- AlterTable
ALTER TABLE "clients" ALTER COLUMN "prenom" SET DATA TYPE VARCHAR(255),
ALTER COLUMN "nom" SET DATA TYPE VARCHAR(255),
ALTER COLUMN "email" SET DATA TYPE VARCHAR(255),
ALTER COLUMN "password" SET DATA TYPE VARCHAR(255),
ALTER COLUMN "telephone" SET DATA TYPE VARCHAR(20),
ALTER COLUMN "google_id" SET DATA TYPE VARCHAR(255),
ALTER COLUMN "country_code" SET DATA TYPE VARCHAR(5),
ALTER COLUMN "push_token" SET DATA TYPE VARCHAR(512);

-- AlterTable
ALTER TABLE "merchants" ALTER COLUMN "nom" SET DATA TYPE VARCHAR(255),
ALTER COLUMN "email" SET DATA TYPE VARCHAR(255),
ALTER COLUMN "password" SET DATA TYPE VARCHAR(255),
ALTER COLUMN "google_id" SET DATA TYPE VARCHAR(255),
ALTER COLUMN "push_token" SET DATA TYPE VARCHAR(512),
ALTER COLUMN "description" SET DATA TYPE VARCHAR(1000),
ALTER COLUMN "ville" SET DATA TYPE VARCHAR(100),
ALTER COLUMN "quartier" SET DATA TYPE VARCHAR(100),
ALTER COLUMN "adresse" SET DATA TYPE VARCHAR(500),
ALTER COLUMN "country_code" SET DATA TYPE VARCHAR(5),
ALTER COLUMN "phone_number" SET DATA TYPE VARCHAR(20);

-- AlterTable
ALTER TABLE "notifications" ALTER COLUMN "title" SET DATA TYPE VARCHAR(255),
ALTER COLUMN "body" SET DATA TYPE VARCHAR(2000);

-- AlterTable
ALTER TABLE "rewards" ALTER COLUMN "titre" SET DATA TYPE VARCHAR(255),
ALTER COLUMN "description" SET DATA TYPE VARCHAR(1000);

-- AlterTable
ALTER TABLE "stores" ALTER COLUMN "nom" SET DATA TYPE VARCHAR(255),
ALTER COLUMN "ville" SET DATA TYPE VARCHAR(100),
ALTER COLUMN "quartier" SET DATA TYPE VARCHAR(100),
ALTER COLUMN "adresse" SET DATA TYPE VARCHAR(500),
ALTER COLUMN "telephone" SET DATA TYPE VARCHAR(20);

-- AlterTable
ALTER TABLE "team_members" ALTER COLUMN "nom" SET DATA TYPE VARCHAR(255),
ALTER COLUMN "email" SET DATA TYPE VARCHAR(255),
ALTER COLUMN "password" SET DATA TYPE VARCHAR(255);

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "fulfilled_at" TIMESTAMP(3),
ADD COLUMN     "gift_status" "GiftStatus";

-- CreateIndex
CREATE INDEX "merchants_plan_idx" ON "merchants"("plan");

-- CreateIndex
CREATE INDEX "merchants_is_active_plan_idx" ON "merchants"("is_active", "plan");

-- CreateIndex
CREATE INDEX "stores_merchant_id_is_active_idx" ON "stores"("merchant_id", "is_active");

-- CreateIndex
CREATE INDEX "stores_is_active_latitude_longitude_idx" ON "stores"("is_active", "latitude", "longitude");

-- CreateIndex
CREATE INDEX "transactions_type_idx" ON "transactions"("type");

-- CreateIndex
CREATE INDEX "transactions_status_created_at_idx" ON "transactions"("status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "transactions_merchant_id_gift_status_created_at_idx" ON "transactions"("merchant_id", "gift_status", "created_at");

-- AddForeignKey
ALTER TABLE "loyalty_cards" ADD CONSTRAINT "loyalty_cards_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_cards" ADD CONSTRAINT "loyalty_cards_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
