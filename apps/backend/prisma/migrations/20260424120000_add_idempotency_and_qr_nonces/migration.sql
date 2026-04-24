-- Idempotency key on transactions (nullable; dedupes safe retries per merchant)
ALTER TABLE "transactions"
  ADD COLUMN "idempotency_key" VARCHAR(64);

-- Non-unique helper index used for lookups (Prisma @@index)
CREATE INDEX "transactions_merchant_id_idempotency_key_idx"
  ON "transactions" ("merchant_id", "idempotency_key");

-- Partial unique index: only enforce uniqueness when a key is supplied.
-- Guarantees that a second request with the same (merchant, key) fails at insert time.
CREATE UNIQUE INDEX "transactions_merchant_id_idempotency_key_unique"
  ON "transactions" ("merchant_id", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;

-- Single-use nonces for v2 QR tokens (replay protection).
CREATE TABLE "qr_nonces" (
  "nonce"      VARCHAR(64)  NOT NULL,
  "client_id"  TEXT         NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "qr_nonces_pkey" PRIMARY KEY ("nonce")
);

CREATE INDEX "qr_nonces_expires_at_idx" ON "qr_nonces" ("expires_at");
CREATE INDEX "qr_nonces_client_id_idx"  ON "qr_nonces" ("client_id");
