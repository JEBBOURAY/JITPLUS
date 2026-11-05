-- Merchant-selectable currency for loyalty amounts (default: Moroccan dirham).
ALTER TABLE "merchants" ADD COLUMN "currency" VARCHAR(3) NOT NULL DEFAULT 'MAD';

-- Existing merchants outside Morocco: derive the currency from their country.
UPDATE "merchants" SET "currency" = 'XAF' WHERE "country_code" IN ('GA', 'CM', 'CG', 'TD', 'CF', 'GQ');
UPDATE "merchants" SET "currency" = 'XOF' WHERE "country_code" IN ('SN', 'CI', 'ML', 'BF', 'BJ', 'TG', 'NE', 'GW');
UPDATE "merchants" SET "currency" = 'DZD' WHERE "country_code" = 'DZ';
UPDATE "merchants" SET "currency" = 'TND' WHERE "country_code" = 'TN';
UPDATE "merchants" SET "currency" = 'EGP' WHERE "country_code" = 'EG';
UPDATE "merchants" SET "currency" = 'MRU' WHERE "country_code" = 'MR';
UPDATE "merchants" SET "currency" = 'NGN' WHERE "country_code" = 'NG';
UPDATE "merchants" SET "currency" = 'GHS' WHERE "country_code" = 'GH';
UPDATE "merchants" SET "currency" = 'KES' WHERE "country_code" = 'KE';
UPDATE "merchants" SET "currency" = 'ZAR' WHERE "country_code" = 'ZA';
UPDATE "merchants" SET "currency" = 'GNF' WHERE "country_code" = 'GN';
UPDATE "merchants" SET "currency" = 'CDF' WHERE "country_code" = 'CD';
UPDATE "merchants" SET "currency" = 'RWF' WHERE "country_code" = 'RW';
UPDATE "merchants" SET "currency" = 'MGA' WHERE "country_code" = 'MG';
