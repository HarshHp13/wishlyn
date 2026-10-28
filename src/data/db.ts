import { isProductImageUrl } from '../lib/productImages';
import { cache } from 'react';
import type { DbProduct, DbVariant } from '../lib/neon';
import { cataloguePage, catalogueCategories, catalogueProduct, catalogueProductsByIds, catalogueVariants, catalogueVariantsByIds, catalogueRelated, catalogueHighlights } from '../lib/catalogue';
import type { CatalogueFilters } from '../lib/catalogue-filters';

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
  metalType: string;
  purity: string;
  price: number;
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
    basePrice: Number(row.base_price || 0),
    images: (row.images ?? []).filter(isProductImageUrl),
    rating: Number(row.rating || 0),
    reviewsCount: Number(row.reviews_count || 0),
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
    metalType: row.metal_type,
    purity: row.purity,
    price: Number(row.price),
    stock: Number(row.stock),
  };
}

// ──────────────────────────────────────────────
//  Public Database API (Neon PostgreSQL Only - No Mock Fallbacks)
// ──────────────────────────────────────────────

export const getCategories = cache(async (): Promise<Category[]> => catalogueCategories());
export const getProductById = cache(async (id: string): Promise<Product | undefined> => {
  const row = await catalogueProduct(id);
  return row ? mapProduct(row) : undefined;
});
export const getVariantsByProductId = cache(async (id: string): Promise<ProductVariant[]> => (await catalogueVariants(id)).map(mapVariant));
export async function getCataloguePage(filters: CatalogueFilters) {
  const result = await cataloguePage(filters);
  return { products: result.rows.map(mapProduct), total: result.total, page: result.page, pageSize: result.pageSize };
}
export const getCatalogueHighlights = cache(async () => (await catalogueHighlights()).map(mapProduct));
export async function getProductsByIds(ids: string[]): Promise<Product[]> { return (await catalogueProductsByIds(ids)).map(mapProduct); }
export async function getCartProducts(ids: string[]) {
  const variants = (await catalogueVariantsByIds(ids)).map(mapVariant);
  const products = await getProductsByIds([...new Set(variants.map(variant => variant.productId))]);
  return variants.flatMap(variant => {
    const product = products.find(item => item.id === variant.productId);
    return product ? [{ product, variant }] : [];
  });
}
export const getRelatedProduct = cache(async (id: string, categoryId: string) => {
  const row = await catalogueRelated(id, categoryId);
  return row ? mapProduct(row) : undefined;
});
