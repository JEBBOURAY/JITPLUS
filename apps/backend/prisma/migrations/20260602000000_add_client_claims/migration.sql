-- Add anonymous-client marker on clients table
ALTER TABLE "clients"
  ADD COLUMN IF NOT EXISTS "is_anonymous" BOOLEAN NOT NULL DEFAULT false;

-- ClientClaim: magic-link tokens for Quick-Add / WhatsApp friction-zero onboarding
CREATE TABLE IF NOT EXISTS "client_claims" (
  "id" TEXT NOT NULL,
  "token_hash" VARCHAR(64) NOT NULL,
  "client_id" TEXT NOT NULL,
  "merchant_id" TEXT NOT NULL,
  "created_by_name" VARCHAR(255),
  "expires_at" TIMESTAMP(3) NOT NULL,
  "consumed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "client_claims_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "client_claims_token_hash_key" ON "client_claims"("token_hash");
CREATE INDEX IF NOT EXISTS "client_claims_client_id_idx" ON "client_claims"("client_id");
CREATE INDEX IF NOT EXISTS "client_claims_merchant_id_idx" ON "client_claims"("merchant_id");
CREATE INDEX IF NOT EXISTS "client_claims_expires_at_idx" ON "client_claims"("expires_at");

ALTER TABLE "client_claims"
  ADD CONSTRAINT "client_claims_client_id_fkey"
  FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "client_claims"
  ADD CONSTRAINT "client_claims_merchant_id_fkey"
  FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
