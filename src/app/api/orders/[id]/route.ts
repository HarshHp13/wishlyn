import { customerOrderGET, customerOrderPOST } from '@/lib/commerce/http';
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) { return customerOrderGET(request, (await context.params).id); }
export async function POST(request: Request, context: Context) { return customerOrderPOST(request, (await context.params).id); }
