import { NextResponse } from "next/server";
import { apiError, readJson, requireObject } from "@/lib/api";
import { accountGuard } from "@/lib/account/request";
import { wishlist, mutateWishlist } from "@/lib/account/service";
export async function GET(request: Request) {
  try {
    const user = await accountGuard(request, "account-wishlist");
    return NextResponse.json(await wishlist(user), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request) {
  try {
    const user = await accountGuard(request, "account-wishlist");
    return NextResponse.json(
      await mutateWishlist(
        request,
        user,
        requireObject(await readJson(request)),
      ),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
