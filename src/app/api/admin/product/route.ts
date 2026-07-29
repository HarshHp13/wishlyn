import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { dbInsertProduct, dbInsertVariants, dbDeleteProduct, sql } from '@/lib/neon';

// Helper to authenticate user and check for admin role
async function checkAdmin(
  request: Request
): Promise<{ authorized: boolean; errorResponse?: NextResponse }> {
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.split(' ')[1];

  if (!token) {
    return {
      authorized: false,
      errorResponse: NextResponse.json(
        { error: 'Authentication token required' },
        { status: 401 }
      ),
    };
  }

  // Verify access token using JWT verify helper
  const payload = verifyToken(token);
  
  if (!payload || payload.role !== 'admin') {
    return {
      authorized: false,
      errorResponse: NextResponse.json(
        { error: 'Forbidden: Admin authorization required' },
        { status: 403 }
      ),
    };
  }

  return { authorized: true };
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

function validateProductInput(p: any): p is ProductInput {
  return (
    p &&
    typeof p.id === 'string' && p.id.trim().length > 0 &&
    typeof p.title === 'string' && p.title.trim().length > 0 &&
    typeof p.description === 'string' &&
    typeof p.category_id === 'string' && p.category_id.trim().length > 0 &&
    Array.isArray(p.images) && p.images.every((img: any) => typeof img === 'string')
  );
}

function validateVariantInput(v: any): v is VariantInput {
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
    const { authorized, errorResponse } = await checkAdmin(request);
    if (!authorized) return errorResponse;

    const body = await request.json();
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

      if (variants && variants.length > 0) {
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
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Admin API Route Error]:', message);
    return NextResponse.json(
      { error: 'An internal server error occurred during product creation' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    // Verify admin privileges
    const { authorized, errorResponse } = await checkAdmin(request);
    if (!authorized) return errorResponse;

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
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Admin API Route Error]:', message);
    return NextResponse.json(
      { error: 'An internal server error occurred during product deletion' },
      { status: 500 }
    );
  }
}
