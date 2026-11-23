-- Lets a client replay its refresh token for a few seconds when the answer was lost.
ALTER TABLE "client_sessions"
  ADD COLUMN "previous_refresh_token_hash" TEXT,
  ADD COLUMN "rotated_at" TIMESTAMP(3);

CREATE UNIQUE INDEX "client_sessions_previous_refresh_token_hash_key"
  ON "client_sessions"("previous_refresh_token_hash");
