-- CreateEnum
CREATE TYPE "StampEarningMode" AS ENUM ('PER_VISIT', 'PER_AMOUNT');

-- AlterTable
ALTER TABLE "merchants" ADD COLUMN     "stamp_earning_mode" "StampEarningMode" NOT NULL DEFAULT 'PER_VISIT';
