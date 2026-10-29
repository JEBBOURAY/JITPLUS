-- Performance indexes.
-- Client search uses ILIKE '%term%' on four columns, which B-tree indexes cannot
-- serve; trigram GIN indexes can. Requires the pg_trgm extension (available on
-- Cloud SQL for PostgreSQL).

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateIndex
CREATE INDEX "clients_prenom_trgm_idx" ON "clients" USING GIN ("prenom" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "clients_nom_trgm_idx" ON "clients" USING GIN ("nom" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "clients_email_trgm_idx" ON "clients" USING GIN ("email" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "clients_telephone_trgm_idx" ON "clients" USING GIN ("telephone" gin_trgm_ops);

-- Lucky-wheel "every N visits" count filters on (client, merchant, type, date).
-- It also covers every query of the (client_id, merchant_id) index it replaces.
-- DropIndex
DROP INDEX IF EXISTS "transactions_client_id_merchant_id_idx";

-- CreateIndex
CREATE INDEX "transactions_client_id_merchant_id_type_created_at_idx" ON "transactions"("client_id", "merchant_id", "type", "created_at");

-- CreateIndex
CREATE INDEX "scratch_cards_merchant_id_status_idx" ON "scratch_cards"("merchant_id", "status");

-- CreateIndex
CREATE INDEX "coupons_merchant_id_source_status_idx" ON "coupons"("merchant_id", "source", "status");
