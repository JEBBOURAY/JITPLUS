-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "email_verified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "telephone_verified" BOOLEAN NOT NULL DEFAULT false;
