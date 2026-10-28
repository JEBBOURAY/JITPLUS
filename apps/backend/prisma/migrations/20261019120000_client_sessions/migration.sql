-- Multi-device client sessions: one refresh token per device instead of a
-- single token on the client row (a login on a second device used to log the
-- first one out). Existing tokens are copied over so nobody is logged out.

-- CreateTable
CREATE TABLE "client_sessions" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "refresh_token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "last_used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "client_sessions_refresh_token_hash_key" ON "client_sessions"("refresh_token_hash");

-- CreateIndex
CREATE INDEX "client_sessions_client_id_last_used_at_idx" ON "client_sessions"("client_id", "last_used_at" DESC);

-- AddForeignKey
ALTER TABLE "client_sessions" ADD CONSTRAINT "client_sessions_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migrate the legacy single-device refresh tokens (new 365-day lifetime)
INSERT INTO "client_sessions" ("id", "client_id", "refresh_token_hash", "expires_at")
SELECT gen_random_uuid()::text, "id", "refresh_token_hash", NOW() + INTERVAL '365 days'
FROM "clients"
WHERE "refresh_token_hash" IS NOT NULL AND "deleted_at" IS NULL;

UPDATE "clients" SET "refresh_token_hash" = NULL, "refresh_token_expires_at" = NULL
WHERE "refresh_token_hash" IS NOT NULL;
