import { NextResponse } from "next/server";
import { apiError, assertSameOrigin, readJson, requireObject } from "@/lib/api";
import { rateLimit } from "@/lib/rateLimit";
import { resetPassword } from "@/lib/account/recovery";
import { clearSessionCookie } from "@/lib/session";
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await rateLimit(request, {
      scope: "account-reset-network",
      limit: 10,
      windowSeconds: 900,
    });
    const body = requireObject(await readJson(request));
    await resetPassword(body.token, body.newPassword);
    const response = NextResponse.json({
      message: "Password reset. Sign in with your new password.",
    });
    clearSessionCookie(response);
    return response;
  } catch (error) {
    return apiError(error);
  }
}
