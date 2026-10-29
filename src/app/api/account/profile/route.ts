import { NextResponse } from "next/server";
import { apiError, readJson, requireObject } from "@/lib/api";
import { accountGuard } from "@/lib/account/request";
import { getProfile, saveProfile } from "@/lib/account/service";
export async function GET(request: Request) {
  try {
    const user = await accountGuard(request, "account-profile");
    return NextResponse.json(
      { profile: await getProfile(user) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request) {
  try {
    const user = await accountGuard(request, "account-profile");
    return NextResponse.json(
      {
        profile: await saveProfile(
          request,
          user,
          requireObject(await readJson(request)),
        ),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
