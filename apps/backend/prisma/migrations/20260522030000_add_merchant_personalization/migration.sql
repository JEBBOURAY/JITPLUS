-- Add merchant personalization fields (tagline, badges, gallery, opening hours)
ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "tagline" VARCHAR(120);
ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "badges" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "gallery" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "opening_hours" JSONB;
