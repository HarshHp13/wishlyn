import {
  dbGetCategories,
  dbGetProducts,
  dbGetProductById,
  dbGetVariantsByProductId,
  DbProduct,
  DbVariant,
  sql
} from '@/lib/neon';

// ──────────────────────────────────────────────
//  Type Definitions
// ──────────────────────────────────────────────

export interface Category {
  id: string;
  name: string;
  slug: string;
}

export interface ProductVariant {
  id: string;
  productId: string;
  size?: string;
  metalType: 'Silver' | '18K Yellow Gold' | '18K Rose Gold' | 'Platinum';
  purity: string;
  priceAdjustment: number;
  stock: number;
}

export interface Product {
  id: string;
  title: string;
  description: string;
  categoryId: string;
  basePrice: number;
  images: string[];
  rating: number;
  reviewsCount: number;
  details: {
    stone?: string;
    dimensions?: string;
    careInstructions?: string;
  };
}

// ──────────────────────────────────────────────
//  Neon DB → App Type Mappers
// ──────────────────────────────────────────────

function mapProduct(row: DbProduct): Product {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    categoryId: row.category_id,
    basePrice: Number(row.base_price),
    images: row.images ?? [],
    rating: Number(row.rating),
    reviewsCount: Number(row.reviews_count),
    details: {
      stone: row.stone ?? undefined,
      dimensions: row.dimensions ?? undefined,
      careInstructions: row.care_instructions ?? undefined,
    },
  };
}

function mapVariant(row: DbVariant): ProductVariant {
  return {
    id: row.id,
    productId: row.product_id,
    size: row.size ?? undefined,
    metalType: row.metal_type as ProductVariant['metalType'],
    purity: row.purity,
    priceAdjustment: Number(row.price_adjustment),
    stock: Number(row.stock),
  };
}

// ──────────────────────────────────────────────
//  Public Database API (Neon PostgreSQL)
// ──────────────────────────────────────────────

export async function getCategories(): Promise<Category[]> {
  const rows = await dbGetCategories();
  if (!rows) return [];
  return rows.map(r => ({ id: r.id, name: r.name, slug: r.slug }));
}

export async function getProducts(): Promise<Product[]> {
  const rows = await dbGetProducts();
  if (!rows) return [];
  return rows.map(mapProduct);
}

export async function getProductById(id: string): Promise<Product | undefined> {
  const row = await dbGetProductById(id);
  if (!row) return undefined;
  return mapProduct(row);
}

export async function getVariantsByProductId(productId: string): Promise<ProductVariant[]> {
  const rows = await dbGetVariantsByProductId(productId);
  if (!rows) return [];
  return rows.map(mapVariant);
}
