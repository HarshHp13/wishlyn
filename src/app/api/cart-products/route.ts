import { getCartProducts } from '@/data/db';
import { ApiError, apiError, assertSameOrigin, readJson, requireObject } from '@/lib/api';
import { rateLimit } from '@/lib/rateLimit';
import { validId } from '@/lib/shopping-state';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { variantIds } = requireObject(await readJson(request, 12000));
    if (!Array.isArray(variantIds) || variantIds.length > 50 || !variantIds.every(validId)) throw new ApiError(400, 'invalid_variants', 'Choose up to 50 valid product options.');
    await rateLimit(request, { scope: 'cart-products', limit: 120, windowSeconds: 60 });
    return Response.json({ items: await getCartProducts([...new Set(variantIds)]) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return apiError(error); }
}
