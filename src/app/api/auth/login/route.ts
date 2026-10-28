import { NextResponse } from 'next/server';
import { ApiError, apiError, assertSameOrigin, readJson, requireObject } from '@/lib/api';
import { normalizeEmail, validatePassword, comparePassword, hashPassword } from '@/lib/auth';
import { query, transaction } from '@/lib/database';
import { createSession, revokeSession, type SessionUser } from '@/lib/session';
import { rateLimit } from '@/lib/rateLimit';

// One process-local dummy hash keeps unknown-account comparisons expensive without storing a usable account secret.
let dummyHash: Promise<string> | undefined;
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = requireObject(await readJson(request, 4096));
    const email = normalizeEmail(body.email);
    const password = validatePassword(body.password);
    await rateLimit(request, { scope: 'login-network', limit: 100, windowSeconds: 900 });
    await rateLimit(request, { scope: 'login-email', limit: 10, windowSeconds: 900, identity: email });
    const found = await query<SessionUser & { password_hash: string; disabled_at: string | null; session_version: number }>('SELECT id,email,role,password_hash,disabled_at,session_version FROM profiles WHERE email = $1', [email]);
    const profile = found.rows[0];
    dummyHash ??= hashPassword('unusable-comparison-placeholder');
    const matches = await comparePassword(password, profile?.password_hash ?? await dummyHash);
    if (!profile || profile.disabled_at || !matches) throw new ApiError(401, 'invalid_credentials', 'Invalid email or password.');
    const user: SessionUser = { id: profile.id, email: profile.email, role: profile.role };
    const response = NextResponse.json({ success: true, user });
    await transaction(async client => {
      // Lock and recheck after hashing: a concurrent password/role change must not authenticate the old credential.
      const fresh = await client.query('SELECT session_version, disabled_at FROM profiles WHERE id = $1 FOR SHARE', [profile.id]);
      if (!fresh.rows[0] || fresh.rows[0].disabled_at || fresh.rows[0].session_version !== profile.session_version) throw new ApiError(401, 'invalid_credentials', 'Invalid email or password.');
      await revokeSession(request, client);
      await createSession(user.id, response, client);
    });
    return response;
  } catch (error) { return apiError(error); }
}
