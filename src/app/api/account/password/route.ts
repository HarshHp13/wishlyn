import { NextResponse } from "next/server";
import { apiError, readJson, requireObject } from "@/lib/api";
import { accountGuard } from "@/lib/account/request";
import { rateLimit } from "@/lib/rateLimit";
import { changePassword } from "@/lib/account/service";
import { clearSessionCookie } from "@/lib/session";
export async function POST(request: Request) {
  try {
    const user = await accountGuard(request, "account-password");
    await rateLimit(request, {
      scope: "account-password-change",
      identity: user.id,
      limit: 8,
      windowSeconds: 900,
    });
    await changePassword(request, user, requireObject(await readJson(request)));
    const response = NextResponse.json({
      viewerId: user.id,
      message: "Password changed. Sign in again on all devices.",
    });
    clearSessionCookie(response);
    return response;
  } catch (error) {
    return apiError(error);
  }
}
