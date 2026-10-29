"use client";
export async function accountRequest<T>(
  url: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(url, {
    method: body === undefined ? "GET" : "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    credentials: "same-origin",
    cache: "no-store",
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(15000)])
      : AbortSignal.timeout(15000),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      typeof data?.error === "string"
        ? data.error
        : "This request could not be completed. Please retry.",
    );
  return data as T;
}
