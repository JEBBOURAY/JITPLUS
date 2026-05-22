-- Add secondary_categories column (array of MerchantCategory enum) with empty default
ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "secondary_categories" "MerchantCategory"[] NOT NULL DEFAULT ARRAY[]::"MerchantCategory"[];
