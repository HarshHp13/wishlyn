"use client";
import { getAuthState, subscribeAuth } from "../authClient";
const accountChanged = () => new Error("Your account changed. Verify your account and retry this action.");
export function assertCurrentAccount(accountId: string | null): asserts accountId is string {
  const auth = getAuthState();
  if (!accountId || auth.status !== "authenticated" || auth.user?.id !== accountId)
    throw accountChanged();
}
export function assertPrivateResponse(url: string, accountId: string, value: unknown): void {
  const data = value as Record<string, unknown> | null;
  if (!data || data.viewerId !== accountId) throw accountChanged();
  if (url.startsWith("/api/account/profile") &&
      (data.profile as { ownerId?: unknown } | undefined)?.ownerId !== accountId)
    throw accountChanged();
  if ((url.startsWith("/api/account/addresses") || url.startsWith("/api/account/wishlist")) && data.ownerId !== accountId)
    throw accountChanged();
  if (url.startsWith("/api/support")) {
    if (data.request) {
      if ((data.request as { ownerId?: unknown }).ownerId !== accountId) throw accountChanged();
    } else if (data.ownerId !== accountId || !Array.isArray(data.requests) ||
      !data.requests.every(request => request?.ownerId === accountId)) throw accountChanged();
  }
}
export async function accountRequest<T>(
  url: string,
  accountId: string | null,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const publicRequest = url === "/api/account/recovery" || url === "/api/account/reset-password";
  if (!publicRequest) assertCurrentAccount(accountId);
  let invalidated = false;
  const unsubscribe = publicRequest ? () => {} : subscribeAuth(() => {
    const auth = getAuthState();
    if (auth.status === "guest" || (auth.status === "authenticated" && auth.user?.id !== accountId)) invalidated = true;
  });
  try {
    const response = await fetch(url, {
      method: body === undefined ? "GET" : "POST",
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(!publicRequest && accountId ? { "X-Wishlyn-Account-ID": accountId } : {}),
      },
      credentials: "same-origin",
      cache: "no-store",
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(15000)])
        : AbortSignal.timeout(15000),
    });
    const data = await response.json();
    if (!publicRequest) {
      if (invalidated) throw accountChanged();
      assertCurrentAccount(accountId);
      if (response.ok) assertPrivateResponse(url, accountId, data);
    }
    if (!response.ok)
      throw new Error(
        typeof data?.error === "string"
          ? data.error
          : "This request could not be completed. Please retry.",
      );
    return data as T;
  } finally {
    unsubscribe();
  }
}
