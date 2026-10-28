import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/session';
import { ApiError, apiError, assertSameOrigin, readJson, requireObject } from '@/lib/api';
import { rateLimit } from '@/lib/rateLimit';
import { dbInsertProduct, dbInsertVariants, dbDeleteProduct, dbGetProducts, dbGetCategories, sql } from '@/lib/neon';

async function checkAdmin(request: Request): Promise<void> {
  assertSameOrigin(request);
  const user = await requireAdmin(request);
  await rateLimit(request, { scope: `admin-product-${request.method}`, limit: request.method === 'GET' ? 120 : 30, windowSeconds: 900, identity: user.id });
}

// M-8: Type definitions and validators for input schema validation
interface ProductInput {
  id: string;
  title: string;
  description: string;
  category_id: string;
  images: string[];
  stone?: string | null;
  dimensions?: string | null;
  care_instructions?: string | null;
}

interface VariantInput {
  id: string;
  product_id: string;
  metal_type: string;
  purity: string;
  price: number;
  stock: number;
}

function validateProductInput(value: unknown): value is ProductInput {
  if (!value || typeof value !== "object") return false;
  const p = value as Record<string, unknown>;
  return (
    p &&
    typeof p.id === 'string' && p.id.trim().length > 0 &&
    typeof p.title === 'string' && p.title.trim().length > 0 &&
    typeof p.description === 'string' &&
    typeof p.category_id === 'string' && p.category_id.trim().length > 0 &&
    Array.isArray(p.images) && p.images.every((img: unknown) => typeof img === 'string')
  );
}

function validateVariantInput(value: unknown): value is VariantInput {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    v &&
    typeof v.id === 'string' && v.id.trim().length > 0 &&
    typeof v.product_id === 'string' && v.product_id.trim().length > 0 &&
    typeof v.metal_type === 'string' && v.metal_type.trim().length > 0 &&
    typeof v.purity === 'string' && v.purity.trim().length > 0 &&
    typeof v.price === 'number' && v.price >= 0 &&
    typeof v.stock === 'number' && v.stock >= 0
  );
}

export async function POST(request: Request) {
  try {
    // Verify admin privileges
    await checkAdmin(request);

    const body = requireObject(await readJson(request, 131072));
    const { product, variants } = body;

    // M-8: Validate request payloads before executing queries
    if (!validateProductInput(product)) {
      return NextResponse.json(
        { error: 'Invalid product details schema' },
        { status: 400 }
      );
    }

    if (variants && (!Array.isArray(variants) || !variants.every(validateVariantInput))) {
      return NextResponse.json(
        { error: 'Invalid variants schema' },
        { status: 400 }
      );
    }

    // Insert product using Neon database helper or dev fallback
    if (sql) {
      const insertedProduct = await dbInsertProduct(product);
      if (!insertedProduct) {
        return NextResponse.json({ error: 'Failed to create product record in Neon DB' }, { status: 400 });
      }

      if (Array.isArray(variants) && variants.length > 0) {
        const insertedVariants = await dbInsertVariants(variants);
        if (!insertedVariants) {
          return NextResponse.json({
            warning: 'Product created, but variants failed. Please recreate variants.',
            product,
          });
        }
      }
    }

    return NextResponse.json({ success: true, product });
  } catch (error: unknown) {
    return apiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    // Verify admin privileges
    await checkAdmin(request);

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Missing product ID parameter' },
        { status: 400 }
      );
    }

    if (sql) {
      const deleted = await dbDeleteProduct(id);
      if (!deleted) {
        return NextResponse.json({ error: 'Failed to delete product from Neon DB' }, { status: 400 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return apiError(error);
  }
}

export async function GET(request: Request) {
  try {
    // Verify admin privileges
    await checkAdmin(request);

    const [products, categories] = await Promise.all([
      dbGetProducts(),
      dbGetCategories()
    ]);

    if (!products || !categories) throw new ApiError(503, 'catalogue_unavailable', 'The catalogue could not be loaded. Please retry.');

    const mappedProducts = products ? products.map(p => ({
      id: p.id,
      title: p.title,
      description: p.description,
      categoryId: p.category_id,
      basePrice: Number(p.base_price || 0),
      images: p.images ?? [],
      rating: Number(p.rating || 5.0),
      reviewsCount: Number(p.reviews_count || 0),
      details: {
        stone: p.stone ?? undefined,
        dimensions: p.dimensions ?? undefined,
        careInstructions: p.care_instructions ?? undefined,
      }
    })) : [];

    const mappedCategories = categories ? categories.map(c => ({
      id: c.id,
      name: c.name,
      slug: c.slug
    })) : [];

    return NextResponse.json({ products: mappedProducts, categories: mappedCategories });
  } catch (error: unknown) {
    return apiError(error);
  }
}
