ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "card_background_url" TEXT;
ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "card_background_color" VARCHAR(7);
ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "card_text_color" VARCHAR(5);
