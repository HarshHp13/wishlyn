import { neon } from '@neondatabase/serverless';

const databaseUrl = process.env.DATABASE_URL;


// Instantiate serverless Neon SQL query function (server-side environment only)
export const sql = (typeof window === 'undefined' && databaseUrl) ? neon(databaseUrl) : null;

export interface DbCategory {
  id: string;
  name: string;
  slug: string;
}

export interface DbProduct {
  id: string;
  title: string;
  description: string;
  category_id: string;
  base_price?: number | string;
  images: string[];
  rating?: number | string;
  reviews_count?: number;
  stone?: string | null;
  dimensions?: string | null;
  care_instructions?: string | null;
  created_at?: string;
}

export interface DbVariant {
  id: string;
  product_id: string;
  size: string | null;
  metal_type: string;
  purity: string;
  price: number | string;
  stock: number;
}

export interface DbProfile {
  id: string;
  email: string;
  password_hash: string;
  role: 'customer' | 'admin';
  created_at?: string;
}

// ──────────────────────────────────────────────
//  Catalog Helper Functions
// ──────────────────────────────────────────────

export async function dbGetCategories(): Promise<DbCategory[] | null> {
  if (!sql) return null;
  try {
    const rows = await sql`SELECT id, name, slug FROM categories ORDER BY id ASC`;
    return rows as DbCategory[];
  } catch (err) {
    console.error('[Neon DB Error] dbGetCategories:', err);
    return null;
  }
}

export async function dbGetProducts(): Promise<DbProduct[] | null> {
  if (!sql) return null;
  try {
    const rows = await sql`
      SELECT id, title, description, category_id, 
        (SELECT MIN(price) FROM product_variants WHERE product_id = products.id) AS base_price, 
        images, rating, reviews_count, stone, dimensions, care_instructions, created_at
      FROM products
      ORDER BY created_at DESC
    `;
    return rows as DbProduct[];
  } catch (err) {
    console.error('[Neon DB Error] dbGetProducts:', err);
    return null;
  }
}

export async function dbGetProductById(id: string): Promise<DbProduct | null> {
  if (!sql) return null;
  try {
    const rows = await sql`
      SELECT id, title, description, category_id, 
        (SELECT MIN(price) FROM product_variants WHERE product_id = products.id) AS base_price, 
        images, rating, reviews_count, stone, dimensions, care_instructions, created_at
      FROM products
      WHERE id = ${id}
      LIMIT 1
    `;
    return (rows[0] as DbProduct) || null;
  } catch (err) {
    console.error(`[Neon DB Error] dbGetProductById(${id}):`, err);
    return null;
  }
}

export async function dbGetVariantsByProductId(productId: string): Promise<DbVariant[] | null> {
  if (!sql) return null;
  try {
    const rows = await sql`
      SELECT id, product_id, size, metal_type, purity, price, stock
      FROM product_variants
      WHERE product_id = ${productId}
      ORDER BY id ASC
    `;
    return rows as DbVariant[];
  } catch (err) {
    console.error(`[Neon DB Error] dbGetVariantsByProductId(${productId}):`, err);
    return null;
  }
}

export async function dbGetVariantsByIds(variantIds: string[]): Promise<DbVariant[] | null> {
  if (!sql || variantIds.length === 0) return null;
  try {
    const rows = await sql`
      SELECT id, product_id, size, metal_type, purity, price, stock
      FROM product_variants
      WHERE id = ANY(${variantIds})
    `;
    return rows as DbVariant[];
  } catch (err) {
    console.error('[Neon DB Error] dbGetVariantsByIds:', err);
    return null;
  }
}

export async function dbGetProductsByIds(productIds: string[]): Promise<DbProduct[] | null> {
  if (!sql || productIds.length === 0) return null;
  try {
    const rows = await sql`
      SELECT id, title, description, category_id, 
        (SELECT MIN(price) FROM product_variants WHERE product_id = products.id) AS base_price, 
        images, rating, reviews_count, stone, dimensions, care_instructions
      FROM products
      WHERE id = ANY(${productIds})
    `;
    return rows as DbProduct[];
  } catch (err) {
    console.error('[Neon DB Error] dbGetProductsByIds:', err);
    return null;
  }
}

// ──────────────────────────────────────────────
//  Admin Catalog Mutations
// ──────────────────────────────────────────────

export async function dbInsertProduct(product: DbProduct): Promise<boolean> {
  if (!sql) return false;
  try {
    await sql`
      INSERT INTO products (
        id, title, description, category_id, images, rating, reviews_count, stone, dimensions, care_instructions
      ) VALUES (
        ${product.id}, ${product.title}, ${product.description}, ${product.category_id},
        ${product.images}, ${product.rating || 5.0}, ${product.reviews_count || 0},
        ${product.stone || null}, ${product.dimensions || null}, ${product.care_instructions || null}
      )
    `;
    return true;
  } catch (err) {
    console.error('[Neon DB Error] dbInsertProduct:', err);
    return false;
  }
}

export async function dbInsertVariants(variants: DbVariant[]): Promise<boolean> {
  if (!sql || variants.length === 0) return false;
  try {
    for (const v of variants) {
      await sql`
        INSERT INTO product_variants (id, product_id, size, metal_type, purity, price, stock)
        VALUES (${v.id}, ${v.product_id}, ${v.size || null}, ${v.metal_type}, ${v.purity}, ${v.price}, ${v.stock})
        ON CONFLICT (id) DO UPDATE SET
          stock = EXCLUDED.stock,
          price = EXCLUDED.price
      `;
    }
    return true;
  } catch (err) {
    console.error('[Neon DB Error] dbInsertVariants:', err);
    return false;
  }
}

export async function dbDeleteProduct(id: string): Promise<boolean> {
  if (!sql) return false;
  try {
    // Delete product variants first (cascade safeguard)
    await sql`DELETE FROM product_variants WHERE product_id = ${id}`;
    await sql`DELETE FROM products WHERE id = ${id}`;
    return true;
  } catch (err) {
    console.error(`[Neon DB Error] dbDeleteProduct(${id}):`, err);
    return false;
  }
}

// ──────────────────────────────────────────────
//  Orders & Inventory Mutations
// ──────────────────────────────────────────────

export async function dbInsertOrder(order: {
  id: string;
  user_email?: string | null;
  shipping_address: any;
  items: any;
  subtotal: number;
  shipping_cost: number;
  tax: number;
  total: number;
  status: string;
  razorpay_order_id?: string | null;
  razorpay_payment_id?: string | null;
  razorpay_signature?: string | null;
}): Promise<boolean> {
  if (!sql) return false;
  try {
    await sql`
      INSERT INTO orders (
        id, user_email, shipping_address, items, subtotal, shipping_cost, tax, total, status,
        razorpay_order_id, razorpay_payment_id, razorpay_signature
      ) VALUES (
        ${order.id}, ${order.user_email || null}, ${JSON.stringify(order.shipping_address)},
        ${JSON.stringify(order.items)}, ${order.subtotal}, ${order.shipping_cost}, ${order.tax}, ${order.total},
        ${order.status}, ${order.razorpay_order_id || null}, ${order.razorpay_payment_id || null}, ${order.razorpay_signature || null}
      )
    `;
    return true;
  } catch (err) {
    console.error('[Neon DB Error] dbInsertOrder:', err);
    return false;
  }
}

export async function dbDecrementVariantStock(variantId: string, quantity: number): Promise<boolean> {
  if (!sql) return false;
  try {
    await sql`
      UPDATE product_variants
      SET stock = GREATEST(0, stock - ${quantity})
      WHERE id = ${variantId}
    `;
    return true;
  } catch (err) {
    console.error(`[Neon DB Error] dbDecrementVariantStock(${variantId}):`, err);
    return false;
  }
}

// ──────────────────────────────────────────────
//  Newsletter Subscribers
// ──────────────────────────────────────────────

export async function dbInsertSubscriber(email: string): Promise<boolean> {
  if (!sql) return false;
  try {
    await sql`
      INSERT INTO newsletter_subscribers (email)
      VALUES (${email})
      ON CONFLICT (email) DO NOTHING
    `;
    return true;
  } catch (err) {
    console.error('[Neon DB Error] dbInsertSubscriber:', err);
    return false;
  }
}

// ──────────────────────────────────────────────
//  Users & Profiles (Auth)
// ──────────────────────────────────────────────

export async function dbGetProfileByEmail(email: string): Promise<DbProfile | null> {
  if (!sql) return null;
  try {
    const rows = await sql`
      SELECT id, email, password_hash, role, created_at
      FROM profiles
      WHERE LOWER(email) = LOWER(${email})
      LIMIT 1
    `;
    return (rows[0] as DbProfile) || null;
  } catch (err) {
    console.error(`[Neon DB Error] dbGetProfileByEmail(${email}):`, err);
    return null;
  }
}

export async function dbGetProfileById(id: string): Promise<DbProfile | null> {
  if (!sql) return null;
  try {
    const rows = await sql`
      SELECT id, email, password_hash, role, created_at
      FROM profiles
      WHERE id = ${id}
      LIMIT 1
    `;
    return (rows[0] as DbProfile) || null;
  } catch (err) {
    console.error(`[Neon DB Error] dbGetProfileById(${id}):`, err);
    return null;
  }
}

export async function dbCreateProfile(profile: {
  id: string;
  email: string;
  password_hash: string;
  role: 'customer' | 'admin';
}): Promise<DbProfile | null> {
  if (!sql) return null;
  try {
    const rows = await sql`
      INSERT INTO profiles (id, email, password_hash, role)
      VALUES (${profile.id}, ${profile.email}, ${profile.password_hash}, ${profile.role})
      RETURNING id, email, role, created_at
    `;
    return (rows[0] as DbProfile) || null;
  } catch (err) {
    console.error('[Neon DB Error] dbCreateProfile:', err);
    return null;
  }
}
