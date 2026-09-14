import { NextRequest, NextResponse } from 'next/server';
import { getProductsByIds } from '@/data/db';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { productIds } = body;

    if (!Array.isArray(productIds) || productIds.length === 0) {
      return NextResponse.json({ products: [] });
    }

    // Cap at 50 items to prevent abuse
    const safeIds = productIds.slice(0, 50).filter(
      (id: unknown): id is string => typeof id === 'string' && id.length > 0
    );

    const products = await getProductsByIds(safeIds);

    return NextResponse.json({ products });
  } catch (err) {
    console.error('[API] /api/wishlist-products error:', err);
    return NextResponse.json(
      { error: 'Failed to fetch wishlist products' },
      { status: 500 }
    );
  }
}
