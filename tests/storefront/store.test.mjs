import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import ts from 'typescript';
import * as bagMatch from '../../src/lib/commerce/bag-match.ts';
import * as state from '../../src/lib/shopping-state.ts';

const source = ts.transpileModule(readFileSync(new URL('../../src/lib/shopping-store.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const product = { id: 'piece-1', title: 'Synthetic piece', description: '', categoryId: 'earrings', basePrice: 199, images: [], rating: 0, reviewsCount: 0, details: {} };
const variant = { id: 'variant-1', productId: product.id, metalType: 'Fixture', purity: '', price: 199, stock: 10 };
const line = { variantId: variant.id, product, variant, quantity: 1, giftWrap: true, giftMessage: 'Private gift' };
const wait = () => new Promise(resolve => setImmediate(resolve));

function environment() {
  const data = new Map(); const tabs = []; let locked = Promise.resolve();
  function tab(initial = { status: 'guest', user: null }) {
    let auth = initial;
    const authListeners = new Set(); const events = new Map();
    const dispatch = (name, event) => events.get(name)?.forEach(fn => fn(event));
    const exports = {};
    const storage = { getItem: key => data.get(key) ?? null, setItem(key, value) { data.set(key, value); for (const other of tabs) if (other.dispatch !== dispatch) other.dispatch('storage', { key }); }, removeItem(key) { data.delete(key); for (const other of tabs) if (other.dispatch !== dispatch) other.dispatch('storage', { key }); } };
    vm.runInNewContext(source, {
      exports, require: name => name === './shopping-state' ? state : name === './commerce/bag-match' ? bagMatch : {
        getAuthState: () => auth,
        subscribeAuth: fn => { authListeners.add(fn); return () => authListeners.delete(fn); },
        refreshAuthSession: async () => auth.user,
      },
      window: { addEventListener(name, fn) { if (!events.has(name)) events.set(name, new Set()); events.get(name).add(fn); } },
      localStorage: storage,
      crypto: webcrypto,
      navigator: { locks: { request(_name, fn) { const task = locked.then(fn); locked = task.catch(() => {}); return task; } } },
    });
    const result = { dispatch, storage, store: exports.cartStore, complete: exports.clearPurchasedCart, auth(next) { auth = next; authListeners.forEach(fn => fn()); } };
    tabs.push(result); result.store.subscribe(() => {}); return result;
  }
  return { data, tab };
}
const account = id => ({ status: 'authenticated', user: { id, email: `${id}@fixture.invalid`, role: 'customer' } });

test('verified guest migration occurs once; empty account does not resurrect universal records', async () => {
  const env = environment(); const a = env.tab(); await wait();
  await a.store.mutate(items => state.addCartLine(items, line));
  a.auth(account('a')); await wait();
  assert.equal(a.store.getSnapshot().items.length, 1);
  assert.equal(env.data.has(state.shoppingKey('cart', null)), false);
  await a.store.mutate(() => []);
  env.data.set('wishlyn-cart', state.encodeShopping(state.addCartLine([], line)));
  a.auth({ status: 'loading', user: null });
  assert.equal(a.store.getSnapshot().items.length, 0);
  a.auth(account('a')); await wait();
  assert.equal(a.store.getSnapshot().items.length, 0);
});
test('focus refresh hides private data without clearing it; logout then another account is isolated', async () => {
  const env = environment(); const a = env.tab(account('a')); await wait();
  await a.store.mutate(items => state.addCartLine(items, line));
  a.auth({ status: 'loading', user: null });
  assert.equal(a.store.getSnapshot().status, 'loading');
  assert.equal(a.store.getSnapshot().items.length, 0);
  assert.equal(state.decodeCart(env.data.get(state.shoppingKey('cart', 'a'))).items.length, 1);
  a.auth({ status: 'error', user: null }); await wait();
  assert.equal(a.store.getSnapshot().items.length, 0);
  a.auth(account('a')); await wait(); assert.equal(a.store.getSnapshot().items.length, 1);
  a.auth({ status: 'loading', user: null }); a.auth({ status: 'guest', user: null }); await wait();
  assert.equal(a.store.getSnapshot().items.length, 0);
  a.auth(account('b')); await wait(); assert.equal(a.store.getSnapshot().items.length, 0);
  a.auth(account('a')); await wait(); assert.equal(a.store.getSnapshot().items[0].giftMessage, 'Private gift');
});
test('concurrent tabs serialize mutations and converge; removal is not overwritten', async () => {
  const env = environment(); const a = env.tab(account('a')); const b = env.tab(account('a')); await wait();
  await Promise.all([a.store.mutate(items => state.addCartLine(items, line)), b.store.mutate(items => state.addCartLine(items, { ...line, giftMessage: 'Second' }))]);
  await wait();
  assert.equal(a.store.getSnapshot().items.length, 2); assert.equal(b.store.getSnapshot().items.length, 2);
  await a.store.mutate(items => items.filter(item => item.giftMessage !== 'Private gift')); await wait();
  assert.equal(b.store.getSnapshot().items.length, 1);
  assert.equal(b.store.getSnapshot().items[0].giftMessage, 'Second');
});
test('storage write failure preserves a usable in-memory bag across subsequent changes', async () => {
  const env = environment(); const a = env.tab(); await wait();
  a.storage.setItem = () => { throw new Error('Quota'); };
  await a.store.mutate(items => state.addCartLine(items, line));
  await a.store.mutate(items => state.addCartLine(items, { ...line, giftMessage: 'Second' }));
  assert.equal(a.store.getSnapshot().items.length, 2);
  assert.match(a.store.getSnapshot().notice, /storage is unavailable/);
});

test('blocked storage survives same-account verification without leaking across accounts', async () => {
  const env = environment(); const a = env.tab(account('a')); await wait();
  a.storage.setItem = () => { throw new Error('Quota'); };
  await a.store.mutate(items => state.addCartLine(items, line));
  a.auth({ status: 'loading', user: null });
  assert.equal(a.store.getSnapshot().items.length, 0);
  a.auth({ status: 'error', user: null });
  a.auth(account('a')); await wait();
  assert.equal(a.store.getSnapshot().items[0].giftMessage, 'Private gift');
  a.auth({ status: 'guest', user: null }); await wait();
  assert.equal(a.store.getSnapshot().items.length, 0);
  a.auth(account('b')); await wait();
  assert.equal(a.store.getSnapshot().items.length, 0);
  a.auth(account('a')); await wait();
  assert.equal(a.store.getSnapshot().items.length, 1);
});

test('visit-only guest picks are consumed once and merge with the same account memory', async () => {
  const env = environment(); const a = env.tab(); await wait();
  a.storage.setItem = () => { throw new Error('Quota'); };
  await a.store.mutate(items => state.addCartLine(items, line));
  a.auth(account('a')); await wait();
  assert.equal(a.store.getSnapshot().items[0].quantity, 1);
  a.auth({ status: 'guest', user: null }); await wait();
  assert.equal(a.store.getSnapshot().items.length, 0, 'consumed guest memory must not return after logout');
  await a.store.mutate(items => state.addCartLine(items, { ...line, giftMessage: 'New guest gift' }));
  a.auth(account('a')); await wait();
  assert.equal(a.store.getSnapshot().items.length, 2);
  assert.equal(a.store.getSnapshot().items.reduce((sum, item) => sum + item.quantity, 0), 2);
  a.auth({ status: 'guest', user: null }); await wait();
  a.auth(account('b')); await wait();
  assert.equal(a.store.getSnapshot().items.length, 0);
  a.auth(account('a')); await wait();
  assert.deepEqual(a.store.getSnapshot().items.map(item => item.giftMessage).sort(), ['New guest gift', 'Private gift']);
});

test('paid cleanup compares the latest bag inside the queued mutation and account lock', async () => {
  const env = environment(); const a = env.tab(account('a')); const b = env.tab(account('a')); await wait();
  await a.store.mutate(items => state.addCartLine(items, line));
  const purchase = { ownerId: 'a', items: [line] };
  const add = b.store.mutate(items => state.addCartLine(items, { ...line, giftMessage: 'New gift' }));
  await Promise.all([add, a.complete(purchase)]); await wait();
  assert.equal(a.store.getSnapshot().items.length, 2);
  await a.store.mutate(items => items.filter(item => item.giftMessage === 'Private gift'));
  await a.complete(purchase); await wait();
  assert.equal(b.store.getSnapshot().items.length, 0);
  await a.store.mutate(items => state.addCartLine(items, line));
  const pending = a.complete(purchase);
  a.auth(account('b')); await pending; await wait();
  a.auth(account('a')); await wait();
  assert.equal(a.store.getSnapshot().items.length, 1);
});


test('paid cleanup rechecks the unread durable bag when storage recovers', async () => {
  const env = environment();
  env.data.set(state.shoppingKey('cart', 'a'), state.encodeShopping(state.addCartLine([], line)));
  const a = env.tab(account('a'));
  a.storage.getItem = () => { throw new Error('Storage denied'); };
  await wait();
  await a.complete({ ownerId: 'a', items: [line] });
  assert.equal(state.decodeCart(env.data.get(state.shoppingKey('cart', 'a'))).items.length, 1, 'unread durable data must not be overwritten');
  a.storage.getItem = key => env.data.get(key) ?? null;
  a.auth({ status: 'loading', user: null }); a.auth(account('a')); await wait();
  assert.equal(a.store.getSnapshot().items.length, 0);
  assert.equal(state.decodeCart(env.data.get(state.shoppingKey('cart', 'a'))).items.length, 0);
});

test('unread recovery preserves an accepted edit ahead of paid cleanup', async () => {
  const env = environment();
  env.data.set(state.shoppingKey('cart', 'a'), state.encodeShopping(state.addCartLine([], line)));
  const a = env.tab(account('a'));
  a.storage.getItem = () => { throw new Error('Storage denied'); };
  await wait();
  await a.store.mutate(items => state.addCartLine(items, { ...line, giftMessage: 'New accepted gift' }));
  await a.complete({ ownerId: 'a', items: [line] });
  a.storage.getItem = key => env.data.get(key) ?? null;
  a.auth({ status: 'loading', user: null }); a.auth(account('a')); await wait();
  const recovered = a.store.getSnapshot().items;
  assert.deepEqual(recovered.map(item => item.giftMessage).sort(), ['New accepted gift', 'Private gift']);
  assert.equal(recovered.reduce((sum, item) => sum + item.quantity, 0), 2);
  assert.equal(state.decodeCart(env.data.get(state.shoppingKey('cart', 'a'))).items.length, 2);
});
