-- Add merchant welcome guide visibility flag
ALTER TABLE "merchants"
ADD COLUMN IF NOT EXISTS "welcome_guide_visible" BOOLEAN NOT NULL DEFAULT false;