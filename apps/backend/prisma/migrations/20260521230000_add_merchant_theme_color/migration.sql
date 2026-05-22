-- Add theme_color column to merchants (hex color #RRGGBB)
ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "theme_color" VARCHAR(7);
