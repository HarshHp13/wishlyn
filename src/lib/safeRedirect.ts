/** Only return a verified same-origin path, query and hash to the client router. */
export function safeInternalRedirect(candidate: string | null, origin: string): string {
  const fallback = '/profile';
  if (!candidate || !candidate.startsWith('/') || /[\u0000-\u001f\u007f-\u009f\\]/u.test(candidate) || /%(?:0[0-9a-f]|1[0-9a-f]|7f|5c)/i.test(candidate)) return fallback;
  try {
    const base = new URL(origin);
    const resolved = new URL(candidate, base);
    if (resolved.origin !== base.origin) return fallback;
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch { return fallback; }
}
