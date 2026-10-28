import { createHash, randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import type { PoolClient } from 'pg';
import { query } from './database';
import { ApiError } from './api';

export interface SessionUser { id: string; email: string; role: 'customer' | 'admin' }
export const SESSION_COOKIE = 'wishlyn-session';
export const SESSION_SECONDS = 7 * 24 * 60 * 60;
function tokenFrom(request: Request): string | null {
  const value = request.headers.get('cookie')?.split(';').map(v => v.trim()).find(v => v.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
  return value && /^[a-f0-9]{64}$/.test(value) ? value : null;
}
function tokenHash(token: string): string { return createHash('sha256').update(token).digest('hex'); }
function expireLegacyCookies(response: NextResponse): void {
  for (const name of ['wishlyn-token', 'wishlyn-user']) response.cookies.set(name, '', { maxAge: 0, path: '/', httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
}
export async function createSession(userId: string, response: NextResponse, client?: PoolClient): Promise<void> {
  const token = randomBytes(32).toString('hex');
  const runQuery = client ? client.query.bind(client) : query;
  const result = await runQuery(`
    INSERT INTO auth_sessions (token_hash, profile_id, session_version, expires_at)
    SELECT $1, id, session_version, now() + $3 * interval '1 second'
    FROM profiles WHERE id = $2 AND disabled_at IS NULL RETURNING token_hash
  `, [tokenHash(token), userId, SESSION_SECONDS]);
  if (result.rowCount !== 1) throw new ApiError(401, 'unauthenticated', 'Please sign in again.');
  response.cookies.set(SESSION_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: SESSION_SECONDS, path: '/' });
  expireLegacyCookies(response);
  response.headers.set('Cache-Control', 'no-store');
}
export async function getSession(request: Request): Promise<SessionUser | null> {
  const token = tokenFrom(request);
  if (!token) return null;
  const result = await query<SessionUser>(`
    SELECT p.id, p.email, p.role FROM auth_sessions s JOIN profiles p ON p.id = s.profile_id
    WHERE s.token_hash = $1 AND s.expires_at > now() AND p.disabled_at IS NULL AND s.session_version = p.session_version
  `, [tokenHash(token)]);
  return result.rows[0] ?? null;
}
export async function requireSession(request: Request): Promise<SessionUser> {
  const user = await getSession(request);
  if (!user) throw new ApiError(401, 'unauthenticated', 'Please sign in to continue.');
  return user;
}
export async function requireAdmin(request: Request): Promise<SessionUser> {
  const user = await requireSession(request);
  if (user.role !== 'admin') throw new ApiError(403, 'forbidden', 'Administrator access is required.');
  return user;
}
export async function revokeSession(request: Request, client?: PoolClient): Promise<void> {
  const token = tokenFrom(request);
  if (token) await (client ? client.query.bind(client) : query)('DELETE FROM auth_sessions WHERE token_hash = $1', [tokenHash(token)]);
}
export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 0, path: '/' });
  expireLegacyCookies(response);
  response.headers.set('Cache-Control', 'no-store');
}
