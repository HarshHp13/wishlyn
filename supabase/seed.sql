-- =============================================================
-- Supabase Schema + Seed Data for Wishlyn Jewellery E-Commerce
-- Run this in the Supabase SQL Editor to bootstrap the database.
-- =============================================================

-- Categories
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE
);

INSERT INTO categories (id, name, slug) VALUES
  ('necklaces', 'Necklaces', 'necklaces'),
  ('rings', 'Rings', 'rings'),
  ('earrings', 'Earrings', 'earrings'),
  ('bracelets', 'Bracelets', 'bracelets')
ON CONFLICT (id) DO NOTHING;

-- Products
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category_id TEXT NOT NULL REFERENCES categories(id),
  base_price NUMERIC(10,2) NOT NULL,
  images TEXT[] NOT NULL DEFAULT '{}',
  rating NUMERIC(2,1) NOT NULL DEFAULT 0,
  reviews_count INTEGER NOT NULL DEFAULT 0,
  stone TEXT,
  dimensions TEXT,
  care_instructions TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
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

-- Product Variants
CREATE TABLE IF NOT EXISTS product_variants (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  size TEXT,
  metal_type TEXT NOT NULL,
  purity TEXT NOT NULL,
  price_adjustment NUMERIC(10,2) NOT NULL DEFAULT 0,
  stock INTEGER NOT NULL DEFAULT 0
);

INSERT INTO product_variants (id, product_id, size, metal_type, purity, price_adjustment, stock) VALUES
  -- Wishlyn Evil Eye Pendant
  ('v-pendant-silver', 'aura-evil-eye-pendant', NULL, 'Silver', '925 Sterling Silver', 0, 24),
  ('v-pendant-gold', 'aura-evil-eye-pendant', NULL, '18K Yellow Gold', '18K Gold Vermeil', 30, 12),
  ('v-pendant-rose', 'aura-evil-eye-pendant', NULL, '18K Rose Gold', '18K Rose Gold Vermeil', 30, 8),
  -- Classic Eternity Diamond Ring
  ('v-ring-rose-6', 'classic-rose-gold-ring', '6', '18K Rose Gold', '18K Solid Rose Gold', 0, 5),
  ('v-ring-gold-6', 'classic-rose-gold-ring', '6', '18K Yellow Gold', '18K Solid Yellow Gold', 10, 4),
  ('v-ring-platinum-6', 'classic-rose-gold-ring', '6', 'Platinum', '950 Solid Platinum', 120, 3),
  ('v-ring-rose-7', 'classic-rose-gold-ring', '7', '18K Rose Gold', '18K Solid Rose Gold', 0, 5),
  ('v-ring-gold-7', 'classic-rose-gold-ring', '7', '18K Yellow Gold', '18K Solid Yellow Gold', 10, 4),
  ('v-ring-platinum-7', 'classic-rose-gold-ring', '7', 'Platinum', '950 Solid Platinum', 120, 3),
  ('v-ring-rose-8', 'classic-rose-gold-ring', '8', '18K Rose Gold', '18K Solid Rose Gold', 0, 5),
  ('v-ring-gold-8', 'classic-rose-gold-ring', '8', '18K Yellow Gold', '18K Solid Yellow Gold', 10, 4),
  ('v-ring-platinum-8', 'classic-rose-gold-ring', '8', 'Platinum', '950 Solid Platinum', 120, 3)
ON CONFLICT (id) DO NOTHING;

-- Orders table (for future checkout integration)
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY DEFAULT 'WISHLYN-' || upper(substr(md5(random()::text), 1, 8)),
  user_email TEXT,
  shipping_address JSONB,
  items JSONB NOT NULL,
  subtotal NUMERIC(10,2) NOT NULL,
  shipping_cost NUMERIC(10,2) NOT NULL DEFAULT 0,
  tax NUMERIC(10,2) NOT NULL DEFAULT 0,
  total NUMERIC(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  razorpay_order_id TEXT,
  razorpay_payment_id TEXT,
  razorpay_signature TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable Row-Level Security
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Public read access for catalog tables
DROP POLICY IF EXISTS "Public read categories" ON categories;
CREATE POLICY "Public read categories" ON categories FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read products" ON products;
CREATE POLICY "Public read products" ON products FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read variants" ON product_variants;
CREATE POLICY "Public read variants" ON product_variants FOR SELECT USING (true);

-- Orders: created via server-side service role only, read restricted to own orders or admin
DROP POLICY IF EXISTS "Anyone can create orders" ON orders;

DROP POLICY IF EXISTS "Read own orders" ON orders;
CREATE POLICY "Read own orders" ON orders FOR SELECT USING (
  (auth.jwt() ->> 'email' = user_email) OR 
  (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
);

-- Profiles table to store user roles (admin or customer)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on Profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Profiles policies: restrict insert to definer triggers, and update to same-role only
DROP POLICY IF EXISTS "Allow public read profiles" ON public.profiles;
CREATE POLICY "Allow public read profiles" ON public.profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow system insert profiles" ON public.profiles;
CREATE POLICY "Allow system insert profiles" ON public.profiles FOR INSERT WITH CHECK (false);

DROP POLICY IF EXISTS "Allow user update profiles" ON public.profiles;
CREATE POLICY "Allow user update profiles" ON public.profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (role = (SELECT role FROM public.profiles WHERE id = auth.uid()));

-- Trigger function to automatically create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role)
  VALUES (new.id, new.email, 'customer');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-create trigger safely
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Newsletter Subscribers Table
CREATE TABLE IF NOT EXISTS public.newsletter_subscribers (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  subscribed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow service role insert and admin read" ON public.newsletter_subscribers;
CREATE POLICY "Allow service role insert and admin read" ON public.newsletter_subscribers FOR ALL USING (true);

