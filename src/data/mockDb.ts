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
//  Hardcoded Fallback Data
// ──────────────────────────────────────────────

const CATEGORIES_FALLBACK: Category[] = [
  { id: 'necklaces', name: 'Necklaces', slug: 'necklaces' },
  { id: 'rings', name: 'Rings', slug: 'rings' },
  { id: 'earrings', name: 'Earrings', slug: 'earrings' }
];

const PRODUCTS_FALLBACK: Product[] = [
  {
    id: 'aura-evil-eye-pendant',
    title: 'Wishlyn Evil Eye Pendant',
    description: 'Embrace protection and timeless elegance with our Wishlyn Evil Eye Pendant. Handcrafted in 925 sterling silver, this necklace features a stunning sapphire blue central stone encircled by shimmering white cubic zirconia and turquoise detailing. Perfect for layering or as a signature daily statement.',
    categoryId: 'necklaces',
    basePrice: 5727,
    images: ['/aura_evil_eye_pendant.png'],
    rating: 4.8,
    reviewsCount: 142,
    details: {
      stone: 'Blue Sapphire, Turquoise & AAA Cubic Zirconia',
      dimensions: 'Chain: 16 inch + 2 inch adjustable extension, Pendant: 15mm diameter',
      careInstructions: 'Avoid contact with perfumes, hairsprays, and water. Store in the provided airtight soft pouch.'
    }
  },
  {
    id: 'classic-rose-gold-ring',
    title: 'Classic Eternity Diamond Ring',
    description: 'A shimmering loop of endless brilliance. This eternity band is crafted in rich 18K rose gold and features a continuous row of micro-prong set lab-grown diamonds. A stunning symbol of commitment or a luxurious stacking statement.',
    categoryId: 'rings',
    basePrice: 20667,
    images: ['/classic_rose_gold_ring.png'],
    rating: 4.9,
    reviewsCount: 88,
    details: {
      stone: 'Lab-Grown Diamonds (1.2 Carat Total Weight, VS Purity, E-F Color)',
      dimensions: 'Band width: 2.2mm, thickness: 1.5mm',
      careInstructions: 'Clean gently using a soft toothbrush and warm soapy water. Avoid wearing during heavy physical labor.'
    }
  }
];

const VARIANTS_FALLBACK: ProductVariant[] = [
  { id: 'v-pendant-silver', productId: 'aura-evil-eye-pendant', metalType: 'Silver', purity: '925 Sterling Silver', priceAdjustment: 0, stock: 24 },
  { id: 'v-pendant-gold', productId: 'aura-evil-eye-pendant', metalType: '18K Yellow Gold', purity: '18K Gold Vermeil', priceAdjustment: 2490, stock: 12 },
  { id: 'v-pendant-rose', productId: 'aura-evil-eye-pendant', metalType: '18K Rose Gold', purity: '18K Rose Gold Vermeil', priceAdjustment: 2490, stock: 8 },
  ...(['6', '7', '8'] as const).flatMap(size => [
    { id: `v-ring-rose-${size}`, productId: 'classic-rose-gold-ring', size, metalType: '18K Rose Gold' as const, purity: '18K Solid Rose Gold', priceAdjustment: 0, stock: 5 },
    { id: `v-ring-gold-${size}`, productId: 'classic-rose-gold-ring', size, metalType: '18K Yellow Gold' as const, purity: '18K Solid Yellow Gold', priceAdjustment: 830, stock: 4 },
    { id: `v-ring-platinum-${size}`, productId: 'classic-rose-gold-ring', size, metalType: 'Platinum' as const, purity: '950 Solid Platinum', priceAdjustment: 9960, stock: 3 }
  ])
];

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
//  Public API (async — fetch from Neon DB if available)
// ──────────────────────────────────────────────

export async function getCategories(): Promise<Category[]> {
  if (!sql) return CATEGORIES_FALLBACK;
  const rows = await dbGetCategories();
  if (!rows || rows.length === 0) return CATEGORIES_FALLBACK;
  return rows.map(r => ({ id: r.id, name: r.name, slug: r.slug }));
}

export async function getProducts(): Promise<Product[]> {
  if (!sql) return PRODUCTS_FALLBACK;
  const rows = await dbGetProducts();
  if (!rows || rows.length === 0) return PRODUCTS_FALLBACK;
  return rows.map(mapProduct);
}

export async function getProductById(id: string): Promise<Product | undefined> {
  if (!sql) return PRODUCTS_FALLBACK.find(p => p.id === id);
  const row = await dbGetProductById(id);
  if (!row) return PRODUCTS_FALLBACK.find(p => p.id === id);
  return mapProduct(row);
}

export async function getVariantsByProductId(productId: string): Promise<ProductVariant[]> {
  if (!sql) return VARIANTS_FALLBACK.filter(v => v.productId === productId);
  const rows = await dbGetVariantsByProductId(productId);
  if (!rows || rows.length === 0) return VARIANTS_FALLBACK.filter(v => v.productId === productId);
  return rows.map(mapVariant);
}

// ──────────────────────────────────────────────
//  Synchronous fallback exports (for compatibility)
// ──────────────────────────────────────────────

export const CATEGORIES = CATEGORIES_FALLBACK;
export const PRODUCTS = PRODUCTS_FALLBACK;
export const VARIANTS = VARIANTS_FALLBACK;
