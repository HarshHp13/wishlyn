import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { accountGuard } from "@/lib/account/request";
import { supportList } from "@/lib/account/support";
export async function GET(request: Request) {
  try {
    const user = await accountGuard(request, "support-admin", true);
    const params = new URL(request.url).searchParams;
    return NextResponse.json(
      await supportList(
        user,
        true,
        Number(params.get("offset") || 0),
        params.get("status") || undefined,
      ),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
