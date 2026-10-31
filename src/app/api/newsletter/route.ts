import { ApiError, apiError, assertSameOrigin, readJson, requireObject } from '@/lib/api';
import { query } from '@/lib/database';
import { rateLimit } from '@/lib/rateLimit';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = requireObject(await readJson(request, 2048));
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError(400, 'invalid_email', 'Enter a valid email address.');
    await rateLimit(request, { scope: 'newsletter-network', limit: 10, windowSeconds: 900 });
    await rateLimit(request, { scope: 'newsletter-email', limit: 3, windowSeconds: 86400, identity: email });
    // A database failure propagates to 503; only a committed insert or real duplicate succeeds.
    await query('INSERT INTO newsletter_subscribers (email) VALUES ($1) ON CONFLICT (email) DO NOTHING', [email]);
    return Response.json({ success: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return apiError(error); }
}
