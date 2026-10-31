CREATE TABLE account_details (
  owner_id VARCHAR(128) PRIMARY KEY REFERENCES profiles(id) ON DELETE RESTRICT,
  first_name VARCHAR(80) NOT NULL DEFAULT '', last_name VARCHAR(80) NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE account_addresses (
  id UUID PRIMARY KEY, owner_id VARCHAR(128) NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  label VARCHAR(60) NOT NULL, address JSONB NOT NULL CHECK (jsonb_typeof(address) = 'object'),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0), created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX account_addresses_owner ON account_addresses(owner_id, created_at, id);
CREATE TABLE account_wishlists (
  owner_id VARCHAR(128) PRIMARY KEY REFERENCES profiles(id) ON DELETE RESTRICT,
  items JSONB NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(items) = 'array' AND jsonb_array_length(items) <= 50),
  browser_imported BOOLEAN NOT NULL DEFAULT false, version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE account_wishlist_transfers (
  owner_id VARCHAR(128) NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  request_key UUID NOT NULL, product_ids JSONB NOT NULL CHECK (jsonb_typeof(product_ids) = 'array' AND jsonb_array_length(product_ids) <= 50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(request_key)
);
CREATE TABLE account_recovery_tokens (
  token_hash CHAR(64) PRIMARY KEY, owner_id VARCHAR(128) NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  session_version INTEGER NOT NULL, expires_at TIMESTAMPTZ NOT NULL, consumed_at TIMESTAMPTZ,
  delivery_state TEXT NOT NULL CHECK (delivery_state IN ('pending','sent','failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX account_recovery_owner ON account_recovery_tokens(owner_id, created_at DESC);
CREATE INDEX account_recovery_expiry ON account_recovery_tokens(expires_at);
CREATE TABLE support_requests (
  id UUID PRIMARY KEY, owner_id VARCHAR(128) NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  order_id VARCHAR(37) NOT NULL REFERENCES commerce_orders(id) ON DELETE RESTRICT,
  kind TEXT NOT NULL CHECK (kind IN ('help','return','cancellation')), subject VARCHAR(160) NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved')),
  request_key UUID NOT NULL, version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(owner_id, request_key)
);
CREATE INDEX support_requests_owner ON support_requests(owner_id, created_at DESC, id);
CREATE INDEX support_requests_queue ON support_requests(status, updated_at, id);
CREATE TABLE support_request_events (
  id BIGSERIAL PRIMARY KEY, request_id UUID NOT NULL REFERENCES support_requests(id) ON DELETE RESTRICT,
  actor_id VARCHAR(128) NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  actor_role TEXT NOT NULL CHECK (actor_role IN ('customer','admin')), message VARCHAR(3000) NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open','in_progress','resolved')), created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX support_request_events_request ON support_request_events(request_id, id);
