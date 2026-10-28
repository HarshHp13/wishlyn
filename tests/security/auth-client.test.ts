import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import type { AuthUser, AuthState } from '../../src/lib/authClient';
interface Client {
  getAuthUser(): AuthUser | null;
  getAuthState(): AuthState;
  refreshAuthSession(force?: boolean): Promise<AuthUser | null>;
  setAuthSession(user: AuthUser): void;
  clearAuthSession(): Promise<void>;
}
function fixture(fetchImpl: typeof fetch) {
  const events: { type: string; detail?: unknown }[] = [];
  const handlers = new Map<string, ((event: unknown) => void)[]>();
  const store = new Map([['wishlyn-token', 'old-secret'], ['wishlyn-user', JSON.stringify({ id: 'forged', role: 'admin', email: 'forged@example.test' })]]);
  const context = { exports: {}, fetch: fetchImpl, AbortSignal, Error, Date, Math, CustomEvent, document: { cookie: '' }, localStorage: { getItem: (k: string) => store.get(k), setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) }, window: { addEventListener: (type: string, fn: (event: unknown) => void) => handlers.set(type, [...handlers.get(type) ?? [], fn]), dispatchEvent: (event: { type: string; detail?: unknown }) => { events.push(event); for (const fn of handlers.get(event.type) ?? []) fn(event); } } };
  const compiled = ts.transpileModule(readFileSync('src/lib/authClient.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(compiled, context);
  return { client: context.exports as Client, events, store, handlers };
}
const user: AuthUser = { id: 'customer-a', email: 'a@example.test', role: 'customer' };
test('cached browser claims never authenticate and session notifications carry no credential', async () => {
  const f = fixture(async () => Response.json({ user }));
  assert.equal(f.client.getAuthUser(), null);
  await f.client.refreshAuthSession();
  assert.equal(f.client.getAuthUser()?.id, user.id);
  assert.equal(f.store.has('wishlyn-token'), false); assert.equal(f.store.has('wishlyn-user'), false);
  assert.doesNotMatch(JSON.stringify(f.events), /old-secret|token/);
});
test('stale anonymous responses cannot overwrite a newer successful sign-in', async () => {
  let complete!: (response: Response) => void;
  const f = fixture(() => new Promise(resolve => { complete = resolve; }));
  const pending = f.client.refreshAuthSession();
  f.client.setAuthSession(user);
  complete(Response.json({ error: 'not signed in' }, { status: 401 }));
  assert.equal((await pending)?.id, user.id);
  assert.equal(f.client.getAuthUser()?.id, user.id);
});
test('pending/error refresh is distinguishable from confirmed logout', async () => {
  const f = fixture(async () => Response.json({}, { status: 503 }));
  f.client.setAuthSession(user);
  const refresh = f.client.refreshAuthSession(true);
  assert.equal(f.client.getAuthState().status, 'loading');
  await assert.rejects(refresh);
  assert.equal(f.client.getAuthState().status, 'error');
  assert.equal(f.client.getAuthUser(), null);
  assert.ok(!f.events.some(event => (event.detail as { status?: string })?.status === 'guest'));
});
test('failed logout never claims server revocation succeeded', async () => {
  const f = fixture(async () => Response.json({}, { status: 503 }));
  f.client.setAuthSession(user);
  await assert.rejects(() => f.client.clearAuthSession());
  assert.equal(f.client.getAuthState().status, 'error');
  assert.ok(!f.events.some(event => (event.detail as { status?: string })?.status === 'guest'));
});
