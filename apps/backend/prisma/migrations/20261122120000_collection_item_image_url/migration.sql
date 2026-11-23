-- Photo of a collection product. The column was added to 20261121140100_collections
-- after that migration had already run on some databases, which never got it.
-- IF NOT EXISTS: a no-op wherever the column is already there.
ALTER TABLE "collection_items" ADD COLUMN IF NOT EXISTS "image_url" VARCHAR(500);
