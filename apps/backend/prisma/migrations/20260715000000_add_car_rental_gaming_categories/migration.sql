-- Add new MerchantCategory enum values (idempotent via IF NOT EXISTS)
ALTER TYPE "MerchantCategory" ADD VALUE IF NOT EXISTS 'LOCATION_VOITURE';
ALTER TYPE "MerchantCategory" ADD VALUE IF NOT EXISTS 'SALLE_JEU';
