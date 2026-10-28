import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { query, closeDatabase, transaction } from '../../src/lib/database';
import { ApiError, assertSameOrigin, readJson, apiError } from '../../src/lib/api';
import { getSession, requireAdmin, createSession } from '../../src/lib/session';
import { normalizeEmail, validatePassword } from '../../src/lib/auth';
import { rateLimit, requestIdentity } from '../../src/lib/rateLimit';
import { databaseConfig } from '../../src/lib/databaseConfig.mjs';
import { planEnvironment } from '../../scripts/add-vercel-envs.mjs';
import { migrate } from '../../scripts/migrate.mjs';
import { NextResponse } from 'next/server';
import pg from 'pg';

const baseTestUrl = process.env.TEST_DATABASE_URL;
const databaseName = `wishlyn_security_${randomUUID().replaceAll('-', '')}_test`;
let created = false;
const testUrl = baseTestUrl ? new URL(baseTestUrl) : undefined;
if (!testUrl) throw new Error('TEST_DATABASE_URL is required; tests never fall back to DATABASE_URL.');
const parsed = new URL(baseTestUrl!);
if (!['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname) || !/^\/wishlyn_[a-z0-9_]*test$/.test(parsed.pathname)) throw new Error('Use a disposable local wishlyn_*test database.');
testUrl.pathname = `/${databaseName}`;
process.env.DATABASE_URL = testUrl.toString();
Object.assign(process.env, { NODE_ENV: 'test' });
process.env.DB_ALLOW_LOCAL_PLAINTEXT = 'true';
process.env.APP_ORIGIN = 'http://localhost:3000';
delete process.env.TRUSTED_CLIENT_IP_HEADER;
const origin = 'http://localhost:3000';
function request(path: string, body: unknown = {}, cookie?: string): Request {
  return new Request(`${origin}${path}`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
}
function cookie(response: NextResponse): string { const value = response.cookies.get('wishlyn-session')?.value; assert.ok(value); return `wishlyn-session=${value}`; }
let signup: typeof import('../../src/app/api/auth/signup/route').POST;
let login: typeof import('../../src/app/api/auth/login/route').POST;
let logout: typeof import('../../src/app/api/auth/logout/route').POST;
before(async () => {
  const admin = new pg.Client(databaseConfig(baseTestUrl));
  await admin.connect();
  try { await admin.query(`CREATE DATABASE ${databaseName}`); created = true; } finally { await admin.end(); }
  await migrate(testUrl.toString(), true);
  signup = (await import('../../src/app/api/auth/signup/route')).POST;
  login = (await import('../../src/app/api/auth/login/route')).POST;
  logout = (await import('../../src/app/api/auth/logout/route')).POST;
});
after(async () => {
  await closeDatabase();
  if (created) { const admin = new pg.Client(databaseConfig(baseTestUrl)); await admin.connect(); try { await admin.query(`DROP DATABASE ${databaseName}`); } finally { await admin.end(); } }
});

test('schema-only bootstrap reruns without sample users/products and checksums are stable', async () => {
  assert.deepEqual(await migrate(testUrl.toString(), true), []);
  assert.equal((await query('SELECT count(*)::int n FROM products')).rows[0].n, 0);
  assert.equal((await query('SELECT count(*)::int n FROM profiles')).rows[0].n, 0);
});
test('public signup ignores privileged input and issues only an HttpOnly opaque session', async () => {
  const response = await signup(request('/api/auth/signup', { email: '  MyADMIN@example.test ', password: 'Private test passphrase', role: 'admin' }));
  assert.equal(response.status, 201);
  const json = await response.clone().json();
  assert.equal(json.user.role, 'customer'); assert.equal(json.user.email, 'myadmin@example.test'); assert.equal(json.token, undefined);
  const session = cookie(response);
  assert.match(response.headers.get('set-cookie')!, /HttpOnly/i); assert.match(response.headers.get('set-cookie')!, /SameSite=lax/i);
  assert.equal((await getSession(new Request(origin, { headers: { cookie: session } })))?.role, 'customer');
  await assert.rejects(() => requireAdmin(new Request(origin, { headers: { cookie: session } })), (error: unknown) => error instanceof ApiError && error.status === 403);
  const rows = await query('SELECT token_hash FROM auth_sessions');
  assert.ok(rows.rows.every(row => !session.includes(row.token_hash)));
});
test('case/whitespace variants racing signup create exactly one canonical identity', async () => {
  const responses = await Promise.all(['Race@example.test', ' race@EXAMPLE.test '].map(email => signup(request('/api/auth/signup', { email, password: 'Private test passphrase' }))));
  assert.deepEqual(responses.map(r => r.status).sort(), [201, 409]);
  assert.equal((await query("SELECT count(*)::int n FROM profiles WHERE email='race@example.test'")).rows[0].n, 1);
});
test('current role, password changes, disable and logout revoke issued sessions permanently', async () => {
  const response = await login(request('/api/auth/login', { email: 'myadmin@example.test', password: 'Private test passphrase' }));
  assert.equal(response.status, 200);
  const user = (await response.clone().json()).user;
  const signed = new Request(origin, { headers: { cookie: cookie(response) } });
  await query("UPDATE profiles SET role='admin' WHERE id=$1", [user.id]);
  assert.equal(await getSession(signed), null);
  const adminResponse = await login(request('/api/auth/login', { email: user.email, password: 'Private test passphrase' }));
  const adminRequest = new Request(origin, { headers: { cookie: cookie(adminResponse) } });
  assert.equal((await requireAdmin(adminRequest)).role, 'admin');
  await query("UPDATE profiles SET role='customer' WHERE id=$1", [user.id]);
  await query("UPDATE profiles SET role='admin' WHERE id=$1", [user.id]);
  assert.equal(await getSession(adminRequest), null);
  const next = await login(request('/api/auth/login', { email: user.email, password: 'Private test passphrase' }));
  const result = await logout(request('/api/auth/logout', {}, cookie(next)));
  assert.equal(result.status, 200);
  assert.equal(await getSession(new Request(origin, { headers: { cookie: cookie(next) } })), null);
  const other = NextResponse.json({}); await createSession(user.id, other);
  await query('UPDATE profiles SET disabled_at=now() WHERE id=$1', [user.id]);
  assert.equal(await getSession(new Request(origin, { headers: { cookie: cookie(other) } })), null);
  await query('UPDATE profiles SET disabled_at=null WHERE id=$1', [user.id]);
  assert.equal(await getSession(new Request(origin, { headers: { cookie: cookie(other) } })), null);
});
test('legacy bearer tokens, absent cookies and forged local claims do not authenticate', async () => {
  assert.equal(await getSession(new Request(origin, { headers: { Authorization: 'Bearer source-known-old-jwt', cookie: 'wishlyn-user={"role":"admin"}' } })), null);
  await assert.rejects(() => requireAdmin(new Request(origin)), (error: unknown) => error instanceof ApiError && error.status === 401);
});
test('cross-origin/missing-Origin mutations and unsupported content fail before work', async () => {
  for (const headers of [{ Origin: 'https://attacker.invalid' }, {}] as HeadersInit[]) assert.throws(() => assertSameOrigin(new Request(origin, { method: 'POST', headers })), ApiError);
  assertSameOrigin(request('/api/auth/logout'));
  assert.throws(() => assertSameOrigin(new Request(origin, { method: 'POST', headers: { Origin: origin, 'sec-fetch-site': 'same-site' } })), ApiError);
  await assert.rejects(() => readJson(new Request(origin, { method: 'POST', body: 'email=a' })), (error: unknown) => error instanceof ApiError && error.status === 415);
  const result = await signup(new Request(`${origin}/api/auth/signup`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: 'x'.repeat(5000) }));
  assert.equal(result.status, 413);
});
test('chunked payload budgets do not rely on Content-Length', async () => {
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(600)); controller.enqueue(new Uint8Array(600)); controller.close(); } });
  const req = new Request(origin, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: stream, duplex: 'half' } as RequestInit);
  await assert.rejects(() => readJson(req, 1024), (error: unknown) => error instanceof ApiError && error.status === 413);
});
test('password/email validation bounds hashing input without silent bcrypt truncation', () => {
  assert.equal(normalizeEmail(' User+tag@Example.test '), 'user+tag@example.test');
  for (const email of ['a..b@example.test', '.a@example.test', 'a@@example.test', 'a@-domain.test', 'x'.repeat(65)+'@example.test']) assert.throws(() => normalizeEmail(email), ApiError);
  assert.throws(() => validatePassword('🔐'.repeat(30), true), ApiError);
});
test('distributed rate limits are atomic across concurrent connections and expire', async () => {
  const scope = `race-${randomUUID()}`;
  const results = await Promise.allSettled(Array.from({ length: 20 }, () => rateLimit(new Request(origin), { scope, limit: 5, windowSeconds: 60, identity: 'shared-test-identity' })));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 5);
  for (const result of results) if (result.status === 'rejected') { assert.equal(result.reason.status, 429); assert.ok(Number(result.reason.headers['Retry-After']) > 0); }
  await query("UPDATE request_budgets SET expires_at=now()-interval '1 second'");
  await rateLimit(new Request(origin), { scope, limit: 5, windowSeconds: 60, identity: 'shared-test-identity' });
  assert.equal(requestIdentity(new Request(origin, { headers: { 'x-forwarded-for': 'attacker-controlled' } })), 'unattributed-network');
});
test('infrastructure failures are retryable service errors, not invalid login or secret output', async () => {
  const error = apiError(new Error('postgresql://should:not-appear@host/private'));
  assert.equal(error.status, 503); assert.doesNotMatch(await error.text(), /should|private/);
  await query('ALTER TABLE profiles RENAME TO profiles_fault_fixture');
  try { assert.equal((await login(request('/api/auth/login', { email: 'existing@example.test', password: 'test value' }))).status, 503); }
  finally { await query('ALTER TABLE profiles_fault_fixture RENAME TO profiles'); }
});
test('transaction failure rolls back profile and session together', async () => {
  const id = randomUUID();
  await assert.rejects(() => transaction(async client => {
    await client.query("INSERT INTO profiles(id,email,password_hash) VALUES($1,$2,'fixture')", [id, `${id}@example.test`]);
    await createSession(id, NextResponse.json({}), client);
    throw new Error('injected failure');
  }));
  assert.equal((await query('SELECT id FROM profiles WHERE id=$1', [id])).rowCount, 0);
  assert.equal((await query('SELECT profile_id FROM auth_sessions WHERE profile_id=$1', [id])).rowCount, 0);
});
test('production cookies are Secure and remote TLS never bypasses verification', async () => {
  const profile = (await query('SELECT id FROM profiles LIMIT 1')).rows[0];
  Object.assign(process.env, { NODE_ENV: 'production' });
  try {
    const response = NextResponse.json({}); await createSession(profile.id, response);
    assert.match(response.headers.get('set-cookie')!, /Secure/i);
    for (const suffix of ['', '?sslmode=require', '?sslmode=verify-full']) assert.deepEqual(databaseConfig(`postgresql://fixture:fixture@db.invalid/db${suffix}`, {}).ssl, { rejectUnauthorized: true });
    assert.throws(() => databaseConfig('postgresql://fixture:fixture@db.invalid/db?sslmode=no-verify', {}));
    assert.throws(() => databaseConfig('postgresql://fixture:fixture@localhost/db?sslmode=disable', { NODE_ENV: 'production', DB_ALLOW_LOCAL_PLAINTEXT: 'true' }));
  } finally { Object.assign(process.env, { NODE_ENV: 'test' }); }
});
test('deployment plans isolate one target, reject unsupported keys/shared secrets and redact at execution', () => {
  const values = { WISHLYN_ENVIRONMENT: 'preview', APP_ORIGIN: 'https://preview.example.test', DATABASE_URL: 'postgresql://preview.invalid/db', RAZORPAY_KEY_ID: 'rzp_test_fixture' };
  const planned = planEnvironment('preview', values);
  assert.ok(planned.every(value => value.target.length === 1 && value.target[0] === 'preview'));
  assert.throws(() => planEnvironment('production', values));
  assert.throws(() => planEnvironment('preview', { ...values, UNKNOWN_SECRET: 'not-allowed' }));
  assert.throws(() => planEnvironment('preview', values, [{ DATABASE_URL: values.DATABASE_URL }]));
});
test('separate application processes share one request budget', async () => {
  const scope = `process-${randomUUID()}`;
  const execute = () => new Promise<{ allowed: number; denied: number }>((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', 'tests/security/rate-process.ts', scope], { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = ''; let error = '';
    child.stdout.on('data', value => { output += value; }); child.stderr.on('data', value => { error += value; });
    child.on('error', reject); child.on('close', code => code === 0 ? resolve(JSON.parse(output)) : reject(new Error(error)));
  });
  const results = await Promise.all([execute(), execute()]);
  assert.equal(results.reduce((sum, row) => sum + row.allowed, 0), 5);
  assert.equal(results.reduce((sum, row) => sum + row.denied, 0), 15);
});
