import { NextResponse } from "next/server";
import { apiError, readJson, requireObject } from "@/lib/api";
import { accountGuard } from "@/lib/account/request";
import { supportDetail, replySupport } from "@/lib/account/support";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const user = await accountGuard(request, "support-customer");
    return NextResponse.json(
      { viewerId: user.id, request: await supportDetail(user, false, (await context.params).id) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request, context: Context) {
  try {
    const user = await accountGuard(request, "support-customer");
    return NextResponse.json(
      {
        viewerId: user.id,
        request: await replySupport(
          request,
          user,
          false,
          (await context.params).id,
          requireObject(await readJson(request)),
        ),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
