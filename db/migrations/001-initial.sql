-- Schema only. No administrator accounts, product claims or sample orders are provisioned.
CREATE TABLE IF NOT EXISTS categories (id VARCHAR(64) PRIMARY KEY, name VARCHAR(255) NOT NULL, slug VARCHAR(255) NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS products (
  id VARCHAR(128) PRIMARY KEY, title VARCHAR(255) NOT NULL, description TEXT NOT NULL,
  category_id VARCHAR(64) NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  images TEXT[] NOT NULL DEFAULT '{}', rating NUMERIC(2,1) NOT NULL DEFAULT 0,
  reviews_count INTEGER NOT NULL DEFAULT 0, stone VARCHAR(255), dimensions VARCHAR(255),
  care_instructions TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS product_variants (
  id VARCHAR(128) PRIMARY KEY, product_id VARCHAR(128) NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  size VARCHAR(32), metal_type VARCHAR(64) NOT NULL, purity VARCHAR(64) NOT NULL,
  price NUMERIC(10,2) NOT NULL, stock INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS profiles (
  id VARCHAR(128) PRIMARY KEY, email VARCHAR(255) NOT NULL UNIQUE, password_hash TEXT NOT NULL,
  role VARCHAR(32) NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS orders (
  id VARCHAR(128) PRIMARY KEY, user_email VARCHAR(255), shipping_address JSONB, items JSONB NOT NULL,
  subtotal NUMERIC(10,2) NOT NULL, shipping_cost NUMERIC(10,2) NOT NULL DEFAULT 0,
  tax NUMERIC(10,2) NOT NULL DEFAULT 0, total NUMERIC(10,2) NOT NULL,
  status VARCHAR(64) NOT NULL DEFAULT 'pending', razorpay_order_id VARCHAR(128),
  razorpay_payment_id VARCHAR(128), razorpay_signature TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id BIGSERIAL PRIMARY KEY, email VARCHAR(255) NOT NULL UNIQUE, subscribed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_variants_product ON product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_orders_user_email ON orders(user_email);
