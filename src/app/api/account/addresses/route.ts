import { NextResponse } from "next/server";
import { apiError, readJson, requireObject } from "@/lib/api";
import { accountGuard } from "@/lib/account/request";
import { addresses, saveAddress, deleteAddress } from "@/lib/account/service";
export async function GET(request: Request) {
  try {
    const user = await accountGuard(request, "account-addresses");
    return NextResponse.json(
      { ownerId: user.id, addresses: await addresses(user) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request) {
  try {
    const user = await accountGuard(request, "account-addresses");
    const body = requireObject(await readJson(request));
    if (body.action === "delete") await deleteAddress(request, user, body);
    else await saveAddress(request, user, body);
    return NextResponse.json(
      { ownerId: user.id, addresses: await addresses(user) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
