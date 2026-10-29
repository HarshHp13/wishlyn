import { NextResponse } from "next/server";
import { apiError, assertSameOrigin, readJson, requireObject } from "@/lib/api";
import { normalizeEmail } from "@/lib/auth";
import { rateLimit } from "@/lib/rateLimit";
import { recoveryConfiguration, requestRecovery } from "@/lib/account/recovery";
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    recoveryConfiguration();
    await rateLimit(request, {
      scope: "account-recovery-network",
      limit: 20,
      windowSeconds: 900,
    });
    const body = requireObject(await readJson(request));
    const email = normalizeEmail(body.email);
    await rateLimit(request, {
      scope: "account-recovery-email",
      identity: email,
      limit: 3,
      windowSeconds: 900,
    });
    await requestRecovery(email);
    return NextResponse.json(
      {
        message:
          "Check your email for a reset link. If none arrives, try again later or check store help.",
      },
      { status: 202, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
