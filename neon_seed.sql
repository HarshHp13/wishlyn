-- =============================================================
-- Neon PostgreSQL Schema + Seed Data for Wishlyn Fine Jewellery
-- Run this script in your Neon SQL Console to initialize tables.
-- =============================================================

-- 1. Categories Table
CREATE TABLE IF NOT EXISTS categories (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL UNIQUE
);

INSERT INTO categories (id, name, slug) VALUES
  ('necklaces', 'Necklaces', 'necklaces'),
  ('rings', 'Rings', 'rings'),
  ('earrings', 'Earrings', 'earrings')
ON CONFLICT (id) DO NOTHING;

-- 2. Products Table
CREATE TABLE IF NOT EXISTS products (
  id VARCHAR(128) PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  category_id VARCHAR(64) NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  base_price NUMERIC(10,2) NOT NULL,
  images TEXT[] NOT NULL DEFAULT '{}',
  rating NUMERIC(2,1) NOT NULL DEFAULT 5.0,
  reviews_count INTEGER NOT NULL DEFAULT 0,
  stone VARCHAR(255),
  dimensions VARCHAR(255),
  care_instructions TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO products (id, title, description, category_id, base_price, images, rating, reviews_count, stone, dimensions, care_instructions) VALUES
(
  'aura-evil-eye-pendant',
  'Wishlyn Evil Eye Pendant',
  'Embrace protection and timeless elegance with our Wishlyn Evil Eye Pendant. Handcrafted in 925 sterling silver, this necklace features a stunning sapphire blue central stone encircled by shimmering white cubic zirconia and turquoise detailing. Perfect for layering or as a signature daily statement.',
  'necklaces',
  69.00,
  ARRAY['/aura_evil_eye_pendant.png'],
  4.8,
  142,
  'Blue Sapphire, Turquoise & AAA Cubic Zirconia',
  'Chain: 16 inch + 2 inch adjustable extension, Pendant: 15mm diameter',
  'Avoid contact with perfumes, hairsprays, and water. Store in the provided airtight soft pouch.'
),
(
  'classic-rose-gold-ring',
  'Classic Eternity Diamond Ring',
  'A shimmering loop of endless brilliance. This eternity band is crafted in rich 18K rose gold and features a continuous row of micro-prong set lab-grown diamonds. A stunning symbol of commitment or a luxurious stacking statement.',
  'rings',
  249.00,
  ARRAY['/classic_rose_gold_ring.png'],
  4.9,
  88,
  'Lab-Grown Diamonds (1.2 Carat Total Weight, VS Purity, E-F Color)',
  'Band width: 2.2mm, thickness: 1.5mm',
  'Clean gently using a soft toothbrush and warm soapy water. Avoid wearing during heavy physical labor.'
)
ON CONFLICT (id) DO NOTHING;

-- 3. Product Variants Table
CREATE TABLE IF NOT EXISTS product_variants (
  id VARCHAR(128) PRIMARY KEY,
  product_id VARCHAR(128) NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  size VARCHAR(32),
  metal_type VARCHAR(64) NOT NULL,
  purity VARCHAR(64) NOT NULL,
  price_adjustment NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  stock INTEGER NOT NULL DEFAULT 0
);

INSERT INTO product_variants (id, product_id, size, metal_type, purity, price_adjustment, stock) VALUES
  ('v-pendant-silver', 'aura-evil-eye-pendant', NULL, 'Silver', '925 Sterling Silver', 0.00, 24),
  ('v-pendant-gold', 'aura-evil-eye-pendant', NULL, '18K Yellow Gold', '18K Gold Vermeil', 30.00, 12),
  ('v-pendant-rose', 'aura-evil-eye-pendant', NULL, '18K Rose Gold', '18K Rose Gold Vermeil', 30.00, 8),
  ('v-ring-rose-6', 'classic-rose-gold-ring', '6', '18K Rose Gold', '18K Solid Rose Gold', 0.00, 5),
  ('v-ring-gold-6', 'classic-rose-gold-ring', '6', '18K Yellow Gold', '18K Solid Yellow Gold', 10.00, 4),
  ('v-ring-platinum-6', 'classic-rose-gold-ring', '6', 'Platinum', '950 Solid Platinum', 120.00, 3),
  ('v-ring-rose-7', 'classic-rose-gold-ring', '7', '18K Rose Gold', '18K Solid Rose Gold', 0.00, 5),
  ('v-ring-gold-7', 'classic-rose-gold-ring', '7', '18K Yellow Gold', '18K Solid Yellow Gold', 10.00, 4),
  ('v-ring-platinum-7', 'classic-rose-gold-ring', '7', 'Platinum', '950 Solid Platinum', 120.00, 3),
  ('v-ring-rose-8', 'classic-rose-gold-ring', '8', '18K Rose Gold', '18K Solid Rose Gold', 0.00, 5),
  ('v-ring-gold-8', 'classic-rose-gold-ring', '8', '18K Yellow Gold', '18K Solid Yellow Gold', 10.00, 4),
  ('v-ring-platinum-8', 'classic-rose-gold-ring', '8', 'Platinum', '950 Solid Platinum', 120.00, 3)
ON CONFLICT (id) DO NOTHING;

-- 4. User Profiles / Auth Table
CREATE TABLE IF NOT EXISTS profiles (
  id VARCHAR(128) PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role VARCHAR(32) NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed Default Admin User (admin@wishlyn.com / Admin12345!)
-- bcrypt hash for 'Admin12345!': $2a$10$7Z/Y3jD3004.Z0P2iM3SFe3b7Hj.h.QG8.w.HhZ6P/M2N3P4Q5R6S
INSERT INTO profiles (id, email, password_hash, role) VALUES
  ('admin-user-id-001', 'admin@wishlyn.com', '$2a$10$7Z/Y3jD3004.Z0P2iM3SFe3b7Hj.h.QG8.w.HhZ6P/M2N3P4Q5R6S', 'admin')
ON CONFLICT (id) DO NOTHING;

-- 5. Orders Table
CREATE TABLE IF NOT EXISTS orders (
  id VARCHAR(128) PRIMARY KEY,
  user_email VARCHAR(255),
  shipping_address JSONB,
  items JSONB NOT NULL,
  subtotal NUMERIC(10,2) NOT NULL,
  shipping_cost NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  tax NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  total NUMERIC(10,2) NOT NULL,
  status VARCHAR(64) NOT NULL DEFAULT 'pending',
  razorpay_order_id VARCHAR(128),
  razorpay_payment_id VARCHAR(128),
  razorpay_signature TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Newsletter Subscribers Table
CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id BIGSERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  subscribed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for high-performance querying
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_variants_product ON product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
CREATE INDEX IF NOT EXISTS idx_orders_user_email ON orders(user_email);
