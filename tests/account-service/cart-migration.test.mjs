import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import ts from "typescript";
import { readFileSync } from "node:fs";
import * as state from "../../src/lib/shopping-state.ts";
const source = ts.transpileModule(readFileSync(new URL("../../src/lib/shopping-store.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const tick = () => new Promise(resolve => setImmediate(resolve));
const product = { id: "piece", title: "Synthetic piece", description: "", categoryId: "test", basePrice: 199, images: [], rating: 0, reviewsCount: 0, details: {} };
const variant = { id: "variant", productId: product.id, metalType: "Fixture", purity: "", price: 199, stock: 50 };
const line = (quantity, giftMessage = "Private gift") => ({ variantId: variant.id, product, variant, quantity, giftWrap: true, giftMessage });
const account = id => ({ status: "authenticated", user: { id, email: `${id}@example.test`, role: "customer" } });
function fixture({ denied = false, existing = [] } = {}) {
  let auth = { status: "guest", user: null }, failWrites = false;
  const listeners = new Set(), data = new Map(), exports = {};
  data.set(state.shoppingKey("cart", "a"), state.encodeShopping(existing));
  vm.runInNewContext(source, {
    exports, require: name => name === "./shopping-state" ? state : { getAuthState: () => auth, refreshAuthSession: async () => auth.user,
      subscribeAuth: listener => { listeners.add(listener); return () => listeners.delete(listener); } },
    window: { addEventListener: () => {} }, navigator: { locks: { request: async (_name, action) => action() } },
    localStorage: {
      getItem: key => { if (denied) throw new Error("Storage denied"); return data.get(key) ?? null; },
      setItem: (key, value) => { if (denied || failWrites) throw new Error("Storage quota"); data.set(key, value); },
      removeItem: key => { if (denied) throw new Error("Storage denied"); data.delete(key); },
    },
  });
  const store = exports.cartStore; store.subscribe(() => {});
  return { store, data, failWrites() { failWrites = true; }, auth(next) { auth = next; listeners.forEach(listener => listener()); } };
}
function exact(items, quantity, message = "Private gift") {
  const item = items.find(item => item.giftMessage === message);
  assert.ok(item);
  assert.equal(item.quantity, quantity);
  assert.equal(item.giftWrap, true);
  assert.equal(item.variantId, variant.id);
  assert.equal(item.product.id, product.id);
}
test("ordinary guest cart migration preserves exact quantity once in memory and storage", async () => {
  const env = fixture(); await tick();
  await env.store.mutate(items => state.addCartLine(items, line(2)));
  exact(env.store.getSnapshot().items, 2);
  env.auth(account("a")); await tick();
  exact(env.store.getSnapshot().items, 2);
  exact(state.decodeCart(env.data.get(state.shoppingKey("cart", "a"))).items, 2);
  assert.equal(env.data.has(state.shoppingKey("cart", null)), false);
  assert.equal(env.data.has(`${state.shoppingKey("cart", "a")}-guest-transfers`), false);
  env.auth({ status: "loading", user: null }); env.auth(account("a")); await tick();
  exact(env.store.getSnapshot().items, 2);
});
test("preexisting account cart adds each guest quantity once and preserves distinct gift lines", async () => {
  const existing = state.addCartLine([], line(3));
  const env = fixture({ existing }); await tick();
  await env.store.mutate(items => state.addCartLine(items, line(2)));
  await env.store.mutate(items => state.addCartLine(items, line(1, "Second gift")));
  env.auth(account("a")); await tick();
  const items = env.store.getSnapshot().items;
  assert.equal(items.length, 2);
  exact(items, 5); exact(items, 1, "Second gift");
  const persisted = state.decodeCart(env.data.get(state.shoppingKey("cart", "a"))).items;
  exact(persisted, 5); exact(persisted, 1, "Second gift");
});
test("quota-limited guest migration uses its latest memory copy and retains a read account cart", async () => {
  const existing = state.addCartLine([], line(3));
  const env = fixture({ existing }); await tick(); env.failWrites();
  await env.store.mutate(items => state.addCartLine(items, line(2)));
  await env.store.mutate(items => state.addCartLine(items, line(1, "Second gift")));
  env.auth(account("a")); await tick();
  assert.equal(env.store.getSnapshot().items.length, 2);
  exact(env.store.getSnapshot().items, 5); exact(env.store.getSnapshot().items, 1, "Second gift");
  assert.match(env.store.getSnapshot().notice, /storage is unavailable/);
});
test("storage-denied guest cart retains exact quantity and gift data on sign-in", async () => {
  const env = fixture({ denied: true }); await tick();
  await env.store.mutate(items => state.addCartLine(items, line(2)));
  env.auth(account("a")); await tick();
  assert.equal(env.store.getSnapshot().items.length, 1);
  exact(env.store.getSnapshot().items, 2);
  assert.equal(env.store.getSnapshot().accountId, "a");
});
