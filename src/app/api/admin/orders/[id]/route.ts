import { adminOrderGET, adminOrderPOST } from '@/lib/commerce/http';
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) { return adminOrderGET(request, (await context.params).id); }
export async function POST(request: Request, context: Context) { return adminOrderPOST(request, (await context.params).id); }
