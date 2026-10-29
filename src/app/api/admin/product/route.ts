import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/session';
import { apiError, assertSameOrigin, readJson, requireObject } from '@/lib/api';
import { rateLimit } from '@/lib/rateLimit';
import { getMerchantProduct, listMerchantProducts, saveMerchantProduct } from '@/lib/merchant/service';
import { merchantId } from '@/lib/merchant/validation';

async function authorize(request: Request) {
  assertSameOrigin(request);
  const user = await requireAdmin(request);
  await rateLimit(request, { scope: `admin-product-${request.method}`, limit: request.method === 'GET' ? 120 : 30, windowSeconds: 900, identity: user.id });
  return user;
}
const response = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
export async function GET(request: Request) {
  try {
    await authorize(request);
    const params = new URL(request.url).searchParams;
    if (params.has('id')) return response({ product: await getMerchantProduct(merchantId(params.get('id'))) });
    return response(await listMerchantProducts({ search: params.get('search') || '', status: params.get('status') || '', lowStock: params.get('lowStock') === 'true', offset: Number(params.get('offset') || 0) }));
  } catch (error) { return apiError(error); }
}
export async function POST(request: Request) {
  try {
    const user = await authorize(request);
    return response({ product: await saveMerchantProduct(user.id, await readJson(request, 131072)) }, 201);
  } catch (error) { return apiError(error); }
}
export async function PUT(request: Request) {
  try {
    const user = await authorize(request);
    const body = requireObject(await readJson(request, 131072));
    return response({ product: await saveMerchantProduct(user.id, body, merchantId(body.id)) });
  } catch (error) { return apiError(error); }
}
