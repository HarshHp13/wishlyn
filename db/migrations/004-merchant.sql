-- Preserve legacy publication state; the service explicitly creates new drafts.
ALTER TABLE products ADD COLUMN status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published','archived'));
ALTER TABLE products ADD COLUMN revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0);
ALTER TABLE products ADD COLUMN facts_confirmed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE products ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE products ADD COLUMN creation_key TEXT UNIQUE;
ALTER TABLE products ADD COLUMN creation_hash CHAR(64);
ALTER TABLE product_variants ADD COLUMN active BOOLEAN NOT NULL DEFAULT true;
CREATE TABLE merchant_stock_events (
  id BIGSERIAL PRIMARY KEY,
  product_id VARCHAR(128) NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  variant_id VARCHAR(128) NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  actor_id VARCHAR(128) NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  adjustment INTEGER NOT NULL CHECK (adjustment <> 0),
  stock_before INTEGER NOT NULL CHECK (stock_before >= 0),
  stock_after INTEGER NOT NULL CHECK (stock_after >= 0),
  reason VARCHAR(500) NOT NULL CHECK (length(btrim(reason)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (stock_after = stock_before + adjustment)
);
CREATE INDEX merchant_stock_events_product ON merchant_stock_events(product_id, id DESC);
CREATE INDEX products_merchant_status ON products(status, updated_at DESC, id);
