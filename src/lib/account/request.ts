import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { ApiError, assertSameOrigin } from "../api";
import {
  requireAdmin,
  requireSession,
  SESSION_COOKIE,
  type SessionUser,
} from "../session";
import { rateLimit } from "../rateLimit";

export async function accountGuard(
  request: Request,
  scope: string,
  admin = false,
): Promise<SessionUser> {
  assertSameOrigin(request);
  const user = await (admin ? requireAdmin(request) : requireSession(request));
  await rateLimit(request, {
    scope,
    limit: request.method === "GET" ? 120 : 40,
    windowSeconds: 900,
    identity: user.id,
  });
  return user;
}
/** Recheck authority under the profile lock so a concurrent password/role change wins. */
export async function lockAccount(
  request: Request,
  client: PoolClient,
  user: SessionUser,
): Promise<void> {
  const token = request.headers
    .get("cookie")
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
  if (!token || !/^[a-f0-9]{64}$/.test(token))
    throw new ApiError(401, "unauthenticated", "Please sign in again.");
  await client.query("SELECT id FROM profiles WHERE id=$1 FOR UPDATE", [
    user.id,
  ]);
  const result = await client.query(
    `SELECT p.role FROM profiles p JOIN auth_sessions s ON s.profile_id=p.id WHERE p.id=$1 AND p.disabled_at IS NULL AND s.token_hash=$2 AND s.session_version=p.session_version AND s.expires_at>now()`,
    [user.id, createHash("sha256").update(token).digest("hex")],
  );
  if (!result.rows[0])
    throw new ApiError(401, "unauthenticated", "Please sign in again.");
  if (user.role === "admin" && result.rows[0].role !== "admin")
    throw new ApiError(403, "forbidden", "Administrator access is required.");
}
