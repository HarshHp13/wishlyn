import { getProductsByIds } from '@/data/db';
import { ApiError, apiError, assertSameOrigin, readJson, requireObject } from '@/lib/api';
import { rateLimit } from '@/lib/rateLimit';
import { validId } from '@/lib/shopping-state';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { productIds } = requireObject(await readJson(request, 12000));
    if (!Array.isArray(productIds) || productIds.length > 50 || !productIds.every(validId)) throw new ApiError(400, 'invalid_products', 'Choose up to 50 valid products.');
    await rateLimit(request, { scope: 'wishlist-products', limit: 120, windowSeconds: 60 });
    return Response.json({ products: await getProductsByIds([...new Set(productIds)]) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return apiError(error); }
}
