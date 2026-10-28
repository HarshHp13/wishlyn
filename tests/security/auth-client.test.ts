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


for (const succeeds of [true, false]) for (const oldResponseFirst of [true, false]) {
  test(`focus/storage refresh cannot race ${succeeds ? 'successful' : 'failed'} logout; old response ${oldResponseFirst ? 'first' : 'last'}`, async () => {
    let finishMe!: (response: Response) => void;
    let finishLogout!: (response: Response) => void;
    let meRequests = 0;
    const f = fixture(url => new Promise(resolve => {
      if (url === '/api/auth/logout') finishLogout = resolve;
      else { meRequests++; finishMe = resolve; }
    }));
    f.client.setAuthSession(user);
    const oldRefresh = f.client.refreshAuthSession(true);
    const logoutResult = f.client.clearAuthSession().then(() => true, () => false);
    await Promise.resolve();
    const deferredRefresh = f.client.refreshAuthSession(true).then(() => true, () => false);
    for (const listener of f.handlers.get('focus') ?? []) listener({});
    for (const listener of f.handlers.get('storage') ?? []) listener({ key: 'wishlyn-auth-invalidation' });
    assert.equal(meRequests, 1, 'background requests wait behind logout instead of superseding it');
    if (oldResponseFirst) { finishMe(Response.json({ user })); await oldRefresh; assert.equal(f.client.getAuthState().status, 'loading'); }
    finishLogout(Response.json({}, { status: succeeds ? 200 : 503 }));
    assert.equal(await logoutResult, succeeds);
    assert.equal(await deferredRefresh, succeeds);
    if (!oldResponseFirst) { finishMe(Response.json({ user })); await oldRefresh; }
    assert.equal(f.client.getAuthState().status, succeeds ? 'guest' : 'error');
    assert.equal(f.client.getAuthUser(), null);
    const confirmedGuest = f.events.some(event => (event.detail as { status?: string })?.status === 'guest');
    assert.equal(confirmedGuest, succeeds);
  });
}
for (const succeeds of [true, false]) test(`a newer explicit sign-in survives an older ${succeeds ? 'successful' : 'failed'} logout`, async () => {
  let finish!: (response: Response) => void;
  const f = fixture(() => new Promise(resolve => { finish = resolve; }));
  f.client.setAuthSession(user);
  const logoutResult = f.client.clearAuthSession().then(() => true, () => false);
  await Promise.resolve();
  const newer: AuthUser = { id: 'customer-b', email: 'b@example.test', role: 'customer' };
  f.client.setAuthSession(newer);
  const refresh = f.client.refreshAuthSession(true);
  finish(Response.json({}, { status: succeeds ? 200 : 503 }));
  assert.equal(await logoutResult, succeeds);
  assert.equal(f.client.getAuthState().status, 'authenticated');
  assert.equal(f.client.getAuthUser()?.id, newer.id);
  assert.equal((await refresh)?.id, newer.id);
});
