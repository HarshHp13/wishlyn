import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { query } from './database';
import { ApiError } from './api';

export interface RateLimitOptions { scope: string; limit: number; windowSeconds: number; identity?: string }
export function requestIdentity(request: Request): string {
  const header = process.env.TRUSTED_CLIENT_IP_HEADER;
  if (!header) return 'unattributed-network';
  if (!['x-vercel-forwarded-for', 'cf-connecting-ip', 'x-real-ip'].includes(header)) throw new ApiError(503, 'configuration', 'The service is temporarily unavailable.');
  // Configure only when ingress strips client-supplied copies of this header.
  const value = request.headers.get(header)?.trim();
  return value && isIP(value) ? value : 'unattributed-network';
}
export async function rateLimit(request: Request, options: RateLimitOptions): Promise<void> {
  const key = createHash('sha256').update(`${options.scope}\0${options.identity ?? requestIdentity(request)}`).digest('hex');
  const result = await query<{ count: number; retry_after: number }>(`
    INSERT INTO request_budgets (key, count, expires_at)
    VALUES ($1, 1, clock_timestamp() + $2 * interval '1 second')
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN request_budgets.expires_at <= clock_timestamp() THEN 1 ELSE LEAST(request_budgets.count + 1, 2147483646) END,
      expires_at = CASE WHEN request_budgets.expires_at <= clock_timestamp() THEN clock_timestamp() + $2 * interval '1 second' ELSE request_budgets.expires_at END
    RETURNING count, GREATEST(1, CEIL(EXTRACT(EPOCH FROM expires_at - clock_timestamp())))::integer AS retry_after
  `, [key, options.windowSeconds]);
  if (result.rows[0].count > options.limit) throw new ApiError(429, 'rate_limited', 'Too many requests. Please wait and try again.', { 'Retry-After': String(result.rows[0].retry_after) });
}
