-- Proof of consent for clients: date and version of the accepted terms.
-- Left NULL on existing accounts: their acceptance date was never recorded.
ALTER TABLE "clients" ADD COLUMN "terms_accepted_at" TIMESTAMP(3),
ADD COLUMN "terms_version" VARCHAR(20);
