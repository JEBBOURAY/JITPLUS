-- AlterTable
ALTER TABLE "stores" ADD COLUMN     "cover_url" TEXT,
ADD COLUMN     "description" VARCHAR(1000),
ADD COLUMN     "logo_url" TEXT,
ADD COLUMN     "social_links" JSONB;
