import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import type { AuthState } from '../../src/lib/authClient';

const alice = { id: 'account-a', email: 'a@example.test', role: 'customer' as const };
function fixture(fetchImpl: typeof fetch) {
  let auth: AuthState = { status: 'authenticated', user: alice };
  const listeners = new Set<() => void>();
  const context = { exports: {}, fetch: fetchImpl, AbortSignal, Error, JSON, require: () => ({ getAuthState: () => auth, subscribeAuth: (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener); } }) };
  const source = ts.transpileModule(readFileSync('src/lib/commerce/client.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(source, context);
  return { client: context.exports as typeof import('../../src/lib/commerce/client'), listeners, setAuth: (next: AuthState) => { auth = next; for (const listener of listeners) listener(); } };
}

test('a stalled order read still times out when navigation supplies an external signal', async t => {
  const timeout = AbortSignal.timeout.bind(AbortSignal);
  t.mock.method(AbortSignal, 'timeout', (budget: number) => { assert.equal(budget, 25_000); return timeout(20); });
  const f = fixture((_url, options) => new Promise((_resolve, reject) => {
    options!.signal!.addEventListener('abort', () => reject(options!.signal!.reason), { once: true });
  }));
  const keepAlive = setTimeout(() => {}, 1000);
  try { await assert.rejects(f.client.commerceRequest('/api/orders/fixture', alice.id, undefined, new AbortController().signal), { name: 'TimeoutError' }); }
  finally { clearTimeout(keepAlive); }
});

test('navigation cancellation promptly stops order reads before their deadline', async () => {
  const controller = new AbortController();
  const f = fixture((_url, options) => new Promise((_resolve, reject) => {
    options!.signal!.addEventListener('abort', () => reject(options!.signal!.reason), { once: true });
  }));
  const request = f.client.commerceRequest('/api/orders/fixture', alice.id, undefined, controller.signal);
  controller.abort();
  await assert.rejects(request, { name: 'AbortError' });
});

test('private reads and mutations transmit the captured account precondition', async () => {
  const calls: RequestInit[] = [];
  const f = fixture(async (_url, options) => { calls.push(options!); return Response.json({ viewerId: alice.id }); });
  await f.client.commerceRequest('/api/orders', alice.id);
  await f.client.commerceRequest('/api/checkout/quote', alice.id, { requestKey: 'fixture' });
  for (const call of calls) assert.equal(new Headers(call.headers).get('X-Wishlyn-Account-ID'), alice.id);
  assert.equal(calls[0].method, 'GET'); assert.equal(calls[1].method, 'POST');
});

test('a stale A action cannot be relabelled as B or dispatched through auth uncertainty', async () => {
  let calls = 0;
  const f = fixture(async () => { calls++; return Response.json({ viewerId: 'account-b' }); });
  for (const auth of [{ status: 'authenticated', user: { ...alice, id: 'account-b' } }, { status: 'loading', user: null }, { status: 'guest', user: null }, { status: 'error', user: null }] as AuthState[]) {
    f.setAuth(auth);
    await assert.rejects(f.client.commerceRequest('/api/orders/fixture', alice.id, { action: 'cancel' }), /account changed/i);
  }
  assert.equal(calls, 0);
});

test('successful private responses with missing or another viewer are rejected', async () => {
  for (const body of [{}, { viewerId: 'account-b', orders: [{ ownerId: 'account-b' }] }]) {
    const f = fixture(async () => Response.json(body));
    await assert.rejects(f.client.commerceRequest('/api/orders', alice.id), /response could not be verified/i);
  }
});

test('an account switch during a successful private read never publishes old data', async () => {
  let finish!: (response: Response) => void;
  const f = fixture(() => new Promise(resolve => { finish = resolve; }));
  const request = f.client.commerceRequest('/api/orders', alice.id);
  f.setAuth({ status: 'authenticated', user: { ...alice, id: 'account-b' } });
  finish(Response.json({ viewerId: alice.id, orders: [{ ownerId: alice.id }] }));
  await assert.rejects(request, /account changed/i);
});

test('admin viewer identity is distinct from the customer purchase owner', async () => {
  const f = fixture(async () => Response.json({ viewerId: 'admin-a', order: { ownerId: alice.id } }));
  f.setAuth({ status: 'authenticated', user: { ...alice, id: 'admin-a', role: 'admin' } });
  const data = await f.client.commerceRequest<{ order: { ownerId: string } }>('/api/admin/orders/fixture', 'admin-a');
  assert.equal(data.order.ownerId, alice.id);
  assert.throws(() => f.client.assertPurchaseOwner(data.order, 'account-b'), /purchase could not be verified/i);
});

test('A to B to A never revives a successful old private request', async () => {
  let finish!: (response: Response) => void;
  const f = fixture(() => new Promise(resolve => { finish = resolve; }));
  const request = f.client.commerceRequest('/api/orders', alice.id);
  f.setAuth({ status: 'authenticated', user: { ...alice, id: 'account-b' } });
  f.setAuth({ status: 'authenticated', user: alice });
  finish(Response.json({ viewerId: alice.id, orders: [] }));
  await assert.rejects(request, /account changed/i);
  assert.equal(f.listeners.size, 0);
});

test('same-account revalidation preserves a pending private response and removes its listener', async () => {
  let finish!: (response: Response) => void;
  const f = fixture(() => new Promise(resolve => { finish = resolve; }));
  const request = f.client.commerceRequest('/api/orders', alice.id);
  f.setAuth({ status: 'loading', user: null });
  f.setAuth({ status: 'authenticated', user: alice });
  finish(Response.json({ viewerId: alice.id, orders: [] }));
  await request;
  assert.equal(f.listeners.size, 0);
});
