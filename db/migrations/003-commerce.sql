-- New verified orders stay separate from legacy orders, whose ownership/payment integrity is unproven.
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS reserved_stock INTEGER NOT NULL DEFAULT 0;
ALTER TABLE product_variants ADD CONSTRAINT variants_stock_nonnegative CHECK (stock >= 0);
ALTER TABLE product_variants ADD CONSTRAINT variants_reservation_valid CHECK (reserved_stock >= 0 AND reserved_stock <= stock);
ALTER TABLE product_variants ADD CONSTRAINT variants_price_positive CHECK (price > 0 AND price <> 'NaN'::numeric);

CREATE TABLE commerce_orders (
  id VARCHAR(37) PRIMARY KEY,
  owner_id VARCHAR(128) NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  email VARCHAR(255) NOT NULL,
  request_key VARCHAR(100) NOT NULL,
  request_hash CHAR(64) NOT NULL,
  items JSONB NOT NULL CHECK (jsonb_typeof(items) = 'array' AND jsonb_array_length(items) BETWEEN 1 AND 40),
  shipping JSONB NOT NULL CHECK (jsonb_typeof(shipping) = 'object'),
  currency CHAR(3) NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
  subtotal_paise BIGINT NOT NULL CHECK (subtotal_paise > 0 AND subtotal_paise <= 100000000),
  shipping_paise INTEGER NOT NULL CHECK (shipping_paise >= 0),
  tax_paise INTEGER NOT NULL CHECK (tax_paise >= 0),
  total_paise BIGINT NOT NULL CHECK (total_paise = subtotal_paise + shipping_paise + tax_paise),
  status TEXT NOT NULL DEFAULT 'pending_payment' CHECK (status IN ('pending_payment', 'paid', 'cancelled', 'expired', 'review_required')),
  reservation_state TEXT NOT NULL DEFAULT 'active' CHECK (reservation_state IN ('active', 'consumed', 'released')),
  payment_setup_state TEXT NOT NULL DEFAULT 'idle' CHECK (payment_setup_state IN ('idle','creating','bound','uncertain')),
  provider_order_id VARCHAR(128) UNIQUE,
  provider_payment_id VARCHAR(128) UNIQUE,
  fulfillment_status TEXT NOT NULL DEFAULT 'unfulfilled' CHECK (fulfillment_status IN ('unfulfilled', 'processing', 'shipped', 'delivered')),
  tracking_carrier VARCHAR(80),
  tracking_number VARCHAR(120),
  tracking_url VARCHAR(500),
  last_reconciled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '15 minutes',
  UNIQUE(owner_id, request_key),
  CHECK (status <> 'paid' OR (provider_order_id IS NOT NULL AND provider_payment_id IS NOT NULL AND reservation_state = 'consumed'))
);
CREATE INDEX commerce_orders_owner_date ON commerce_orders(owner_id, created_at DESC, id);
CREATE INDEX commerce_orders_expiry ON commerce_orders(expires_at) WHERE reservation_state = 'active';
CREATE INDEX commerce_orders_operations ON commerce_orders(status, fulfillment_status, created_at DESC);

CREATE TABLE commerce_reservations (
  order_id VARCHAR(37) NOT NULL REFERENCES commerce_orders(id) ON DELETE RESTRICT,
  variant_id VARCHAR(128) NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 250),
  PRIMARY KEY(order_id, variant_id)
);
CREATE TABLE commerce_order_events (
  id BIGSERIAL PRIMARY KEY,
  order_id VARCHAR(37) NOT NULL REFERENCES commerce_orders(id) ON DELETE RESTRICT,
  type VARCHAR(60) NOT NULL,
  message VARCHAR(1000) NOT NULL,
  actor_id VARCHAR(128),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX commerce_order_events_order ON commerce_order_events(order_id, id);

CREATE FUNCTION protect_commerce_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.owner_id,NEW.email,NEW.request_key,NEW.request_hash,NEW.items,NEW.shipping,NEW.currency,NEW.subtotal_paise,NEW.shipping_paise,NEW.tax_paise,NEW.total_paise,NEW.expires_at)
    IS DISTINCT FROM ROW(OLD.owner_id,OLD.email,OLD.request_key,OLD.request_hash,OLD.items,OLD.shipping,OLD.currency,OLD.subtotal_paise,OLD.shipping_paise,OLD.tax_paise,OLD.total_paise,OLD.expires_at)
    OR (OLD.provider_order_id IS NOT NULL AND NEW.provider_order_id IS DISTINCT FROM OLD.provider_order_id)
    OR (OLD.provider_payment_id IS NOT NULL AND NEW.provider_payment_id IS DISTINCT FROM OLD.provider_payment_id) THEN
    RAISE EXCEPTION 'Commerce purchase snapshots and provider identities are immutable';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER commerce_snapshot_immutable BEFORE UPDATE ON commerce_orders FOR EACH ROW EXECUTE FUNCTION protect_commerce_snapshot();
