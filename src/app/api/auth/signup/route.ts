import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { ApiError, apiError, assertSameOrigin, readJson, requireObject } from '@/lib/api';
import { normalizeEmail, validatePassword, hashPassword } from '@/lib/auth';
import { transaction } from '@/lib/database';
import { createSession, revokeSession, type SessionUser } from '@/lib/session';
import { rateLimit } from '@/lib/rateLimit';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = requireObject(await readJson(request, 4096));
    const email = normalizeEmail(body.email);
    const password = validatePassword(body.password, true);
    await rateLimit(request, { scope: 'signup-network', limit: 30, windowSeconds: 900 });
    await rateLimit(request, { scope: 'signup-email', limit: 5, windowSeconds: 900, identity: email });
    const passwordHash = await hashPassword(password);
    const user: SessionUser = { id: randomUUID(), email, role: 'customer' };
    const response = NextResponse.json({ success: true, user }, { status: 201 });
    await transaction(async client => {
      await client.query("INSERT INTO profiles(id,email,password_hash,role) VALUES($1,$2,$3,'customer')", [user.id, email, passwordHash]);
      await revokeSession(request, client);
      await createSession(user.id, response, client);
    });
    return response;
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === '23505') return apiError(new ApiError(409, 'account_exists', 'An account with this email already exists. Please sign in.'));
    return apiError(error);
  }
}
