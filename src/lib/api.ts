import { NextResponse } from 'next/server';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly headers: Record<string, string>;
  constructor(status: number, code: string, message: string, headers: Record<string, string> = {}) {
    super(message); this.name = 'ApiError'; this.status = status; this.code = code; this.headers = headers;
  }
}
export function apiError(error: unknown): NextResponse {
  if (error instanceof ApiError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers: { 'Cache-Control': 'no-store', ...error.headers } });
  // Driver/provider errors can contain queries, personal data or credentials.
  console.error('[API] Request could not be completed.');
  return NextResponse.json({ error: 'The service is temporarily unavailable. Please try again.', code: 'unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '5' } });
}
export function assertSameOrigin(request: Request): void {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;
  const configured = process.env.APP_ORIGIN;
  if (process.env.NODE_ENV === 'production' && !configured) throw new ApiError(503, 'configuration', 'The service is temporarily unavailable.');
  const expected = new URL(configured || request.url).origin;
  const site = request.headers.get('sec-fetch-site');
  if (request.headers.get('origin') !== expected || (site && !['same-origin', 'none'].includes(site))) throw new ApiError(403, 'origin', 'This request must come from the store. Please reload and try again.');
}
export async function readBody(request: Request, maxBytes: number): Promise<Uint8Array> {
  const length = request.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > maxBytes)) throw new ApiError(413, 'body_too_large', 'The request is too large.');
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  const deadline = Date.now() + 10000;
  try {
    while (true) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const next = await Promise.race([reader.read(), new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new ApiError(408, 'body_timeout', 'The request took too long.')), Math.max(1, deadline - Date.now()));
      })]).finally(() => clearTimeout(timer));
      if (next.done) break;
      total += next.value.byteLength;
      if (total > maxBytes) throw new ApiError(413, 'body_too_large', 'The request is too large.');
      chunks.push(next.value);
    }
  } catch (error) { await reader.cancel().catch(() => undefined); throw error; }
  finally { reader.releaseLock(); }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return body;
}
export async function readJson(request: Request, maxBytes = 16384): Promise<unknown> {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new ApiError(415, 'content_type', 'Send a JSON request.');
  const bytes = await readBody(request, maxBytes);
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new ApiError(400, 'invalid_json', 'The request contains invalid JSON.'); }
}
export function requireObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError(400, 'invalid_body', 'A request object is required.');
  return value as Record<string, unknown>;
}
