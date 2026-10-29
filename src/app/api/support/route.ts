import { NextResponse } from "next/server";
import { apiError, readJson, requireObject } from "@/lib/api";
import { accountGuard } from "@/lib/account/request";
import { supportList, createSupport } from "@/lib/account/support";
export async function GET(request: Request) {
  try {
    const user = await accountGuard(request, "support-customer");
    const params = new URL(request.url).searchParams;
    return NextResponse.json(
      await supportList(user, false, Number(params.get("offset") || 0)),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request) {
  try {
    const user = await accountGuard(request, "support-customer");
    return NextResponse.json(
      {
        request: await createSupport(
          request,
          user,
          requireObject(await readJson(request)),
        ),
      },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
