import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import ts from "typescript";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
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
    window: { addEventListener: () => {} }, crypto: webcrypto, navigator: { locks: { request: async (_name, action) => action() } },
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

function sharedFixture(guestItems) {
  const data = new Map([[state.shoppingKey("cart", null), state.encodeShopping(guestItems)]]), tabs = [];
  let lock = Promise.resolve();
  function tab(name) {
    let auth = { status: "guest", user: null }, denied = false, failedWrite = () => false, failedRead = () => false;
    const listeners = new Set(), events = new Set(), exports = {};
    const dispatch = key => events.forEach(listener => listener({ key }));
    const storage = {
      getItem: key => { if (denied || failedRead(key)) throw new Error("Storage denied"); return data.get(key) ?? null; },
      setItem: (key, value) => { if (denied || failedWrite(key)) throw new Error("Storage quota"); data.set(key, value); tabs.filter(other => other.name !== name).forEach(other => other.dispatch(key)); },
      removeItem: key => { if (denied) throw new Error("Storage denied"); data.delete(key); tabs.filter(other => other.name !== name).forEach(other => other.dispatch(key)); },
    };
    vm.runInNewContext(source, {
      exports, crypto: webcrypto, require: name => name === "./shopping-state" ? state : { getAuthState: () => auth, refreshAuthSession: async () => auth.user,
        subscribeAuth: listener => { listeners.add(listener); return () => listeners.delete(listener); } },
      window: { addEventListener: (_type, listener) => events.add(listener) }, localStorage: storage,
      navigator: { locks: { request: (_name, action) => { const task = lock.then(action); lock = task.catch(() => {}); return task; } } },
    });
    const result = { name, dispatch, store: exports.cartStore, denyStorage() { denied = true; }, restoreStorage() { denied = false; failedWrite = () => false; failedRead = () => false; },
      failWrites(predicate) { failedWrite = predicate; }, failReads(predicate) { failedRead = predicate; }, auth(next) { auth = next; listeners.forEach(listener => listener()); } };
    tabs.push(result); result.store.subscribe(() => {}); return result;
  }
  return { data, tab };
}
async function settle() { for (let i = 0; i < 16; i++) await tick(); }
test("a shared gift cart consumed by A stays withheld from storage-denied delayed B and retry", async () => {
  const env = sharedFixture(state.addCartLine([], line(2))), fast = env.tab("fast"), slow = env.tab("slow"); await settle();
  slow.auth({ status: "loading", user: null }); fast.auth(account("a")); await settle();
  exact(fast.store.getSnapshot().items, 2);
  slow.denyStorage(); slow.auth(account("b")); await settle();
  assert.equal(slow.store.getSnapshot().accountId, "b");
  assert.equal(slow.store.getSnapshot().items.length, 0);
  assert.match(slow.store.getSnapshot().notice, /retained for verification/);
  assert.equal(slow.store.getEligibleGuestRecovery("b").length, 0);
  slow.restoreStorage(); await slow.store.retry(); await settle();
  assert.equal(slow.store.getSnapshot().items.length, 0);
  exact(state.decodeCart(env.data.get(state.shoppingKey("cart", "a"))).items, 2);
});
test("mixed shared and local gift lines transfer only local intent during storage denial", async () => {
  const env = sharedFixture(state.addCartLine([], line(2))), fast = env.tab("fast"), slow = env.tab("slow"); await settle();
  slow.denyStorage(); await slow.store.mutate(items => state.addCartLine(items, line(1, "Fresh local gift")));
  slow.auth({ status: "loading", user: null }); fast.auth(account("a")); await settle();
  slow.auth(account("b"));
  exact(slow.store.getEligibleGuestRecovery("b"), 1, "Fresh local gift");
  await settle();
  assert.equal(slow.store.getSnapshot().items.length, 1);
  exact(slow.store.getSnapshot().items, 1, "Fresh local gift");
  assert.equal(slow.store.getEligibleGuestRecovery("b").length, 0);
  slow.restoreStorage(); await slow.store.retry(); await settle();
  exact(slow.store.getSnapshot().items, 1, "Fresh local gift");
  slow.auth(account("a")); await settle();
  exact(slow.store.getSnapshot().items, 2);
  slow.auth(account("b")); await settle();
  exact(slow.store.getSnapshot().items, 1, "Fresh local gift");
});
test("a denied local addition to a shared line carries only its added quantity", async () => {
  const env = sharedFixture(state.addCartLine([], line(2))), fast = env.tab("fast"), slow = env.tab("slow"); await settle();
  slow.denyStorage(); await slow.store.mutate(items => state.addCartLine(items, line(1)));
  slow.auth({ status: "loading", user: null }); fast.auth(account("a")); await settle();
  slow.auth(account("b")); await settle();
  exact(slow.store.getSnapshot().items, 1);
  exact(state.decodeCart(env.data.get(state.shoppingKey("cart", "a"))).items, 2);
});
test("an account-write failure durably claims a shared cart before account memory can display it", async () => {
  const env = sharedFixture(state.addCartLine([], line(2))), fast = env.tab("fast"), slow = env.tab("slow"); await settle();
  slow.auth({ status: "loading", user: null });
  fast.failWrites(key => key === state.shoppingKey("cart", "a"));
  fast.auth(account("a")); await settle(); exact(fast.store.getSnapshot().items, 2);
  assert.equal(env.data.has(state.shoppingKey("cart", null)), true);
  assert.ok([...env.data].some(([key, owner]) => key.includes("-cart-guest-claim-") && owner === "a"));
  slow.auth(account("b")); await settle();
  assert.equal(slow.store.getSnapshot().items.length, 0);
  fast.auth({ status: "loading", user: null }); fast.auth(account("a")); await settle();
  exact(fast.store.getSnapshot().items, 2);
  fast.auth(account("b")); await settle(); assert.equal(fast.store.getSnapshot().items.length, 0);
  fast.auth(account("a")); await settle(); exact(fast.store.getSnapshot().items, 2);
});
test("a failed shared cart claim leaves that portion unassigned until storage returns", async () => {
  const env = sharedFixture(state.addCartLine([], line(2))), tab = env.tab("only"); await settle();
  tab.failWrites(key => key.includes("-claim-")); tab.auth(account("a")); await settle();
  assert.equal(tab.store.getSnapshot().items.length, 0);
  assert.equal(env.data.has(state.shoppingKey("cart", null)), true);
  assert.match(tab.store.getSnapshot().notice, /retained for verification/);
  tab.restoreStorage(); await tab.store.retry(); await settle();
  exact(tab.store.getSnapshot().items, 2);
  await tab.store.retry(); await settle(); exact(tab.store.getSnapshot().items, 2);
});
test("a failed later guest edit preserves old cart claims and cannot re-key A's shared gift into B", async () => {
  const env = sharedFixture(state.addCartLine([], line(2))), fast = env.tab("fast"), slow = env.tab("slow"); await settle();
  fast.failWrites(key => key === state.shoppingKey("cart", "a"));
  fast.auth(account("a")); await settle(); exact(fast.store.getSnapshot().items, 2);
  slow.failWrites(key => key === state.shoppingKey("cart", null));
  await slow.store.mutate(items => state.addCartLine(items, line(1, "Fresh local gift")));
  assert.equal(slow.store.getSnapshot().items.length, 1);
  exact(slow.store.getSnapshot().items, 1, "Fresh local gift");
  slow.auth(account("b")); await settle();
  assert.equal(slow.store.getSnapshot().items.length, 1);
  exact(slow.store.getSnapshot().items, 1, "Fresh local gift");
  exact(fast.store.getSnapshot().items, 2);
});

test("restored storage recovers an unread durable owner cart before retry or a later addition", async () => {
  const env = sharedFixture([]), tab = env.tab("only"); await settle();
  env.data.set(state.shoppingKey("cart", "b"), state.encodeShopping(state.addCartLine([], line(3, "Existing B gift"))));
  tab.denyStorage(); tab.auth(account("b")); await settle();
  assert.equal(tab.store.getSnapshot().items.length, 0);
  tab.restoreStorage(); await tab.store.retry(); await settle();
  exact(tab.store.getSnapshot().items, 3, "Existing B gift");
  tab.auth({ status: "loading", user: null }); tab.auth(account("b")); await settle();
  exact(tab.store.getSnapshot().items, 3, "Existing B gift");
  await tab.store.mutate(items => state.addCartLine(items, line(1, "New B addition")));
  const stored = state.decodeCart(env.data.get(state.shoppingKey("cart", "b"))).items;
  exact(stored, 3, "Existing B gift"); exact(stored, 1, "New B addition");
});
test("a mutation after storage restoration first reads the owner's unknown baseline without explicit retry", async () => {
  const env = sharedFixture([]), tab = env.tab("only"); await settle();
  env.data.set(state.shoppingKey("cart", "b"), state.encodeShopping(state.addCartLine([], line(3, "Existing B gift"))));
  tab.denyStorage(); tab.auth(account("b")); await settle(); tab.restoreStorage();
  await tab.store.mutate(items => state.addCartLine(items, line(1, "New B addition")));
  const stored = state.decodeCart(env.data.get(state.shoppingKey("cart", "b"))).items;
  exact(stored, 3, "Existing B gift"); exact(stored, 1, "New B addition");
});
test("unread owner storage reconciles accepted local additions and removals exactly once across B/A/B", async () => {
  const env = sharedFixture([]), tab = env.tab("only"); await settle();
  env.data.set(state.shoppingKey("cart", "b"), state.encodeShopping(state.addCartLine([], line(3, "Existing B gift"))));
  tab.denyStorage(); tab.auth(account("b")); await settle();
  await tab.store.mutate(items => state.addCartLine(items, line(1, "Removed local gift")));
  await tab.store.mutate(items => items.filter(item => item.giftMessage !== "Removed local gift"));
  await tab.store.mutate(items => state.addCartLine(items, line(2, "Kept local gift")));
  tab.auth(account("a")); await settle(); assert.equal(tab.store.getSnapshot().items.length, 0);
  tab.restoreStorage(); tab.auth(account("b")); await settle();
  const stored = state.decodeCart(env.data.get(state.shoppingKey("cart", "b"))).items;
  assert.equal(stored.length, 2);
  exact(stored, 3, "Existing B gift"); exact(stored, 2, "Kept local gift");
  await tab.store.retry(); await settle(); exact(tab.store.getSnapshot().items, 2, "Kept local gift");
});
test("unread same-line guest and owned additions merge with the durable quantity once, preserving quantity/removal intent", async () => {
  const env = sharedFixture([]), tab = env.tab("only"); await settle();
  env.data.set(state.shoppingKey("cart", "b"), state.encodeShopping(state.addCartLine([], line(3))));
  tab.denyStorage(); await tab.store.mutate(items => state.addCartLine(items, line(1)));
  tab.auth(account("b")); await settle();
  await tab.store.mutate(items => state.addCartLine(items, line(2)));
  tab.restoreStorage(); await tab.store.retry(); await settle();
  exact(tab.store.getSnapshot().items, 6);
  tab.denyStorage(); await tab.store.mutate(items => state.changeQuantity(items, items[0].id, 2));
  await tab.store.mutate(() => []);
  tab.restoreStorage(); await tab.store.retry(); await settle();
  assert.equal(tab.store.getSnapshot().items.length, 0);
  assert.equal(state.decodeCart(env.data.get(state.shoppingKey("cart", "b"))).items.length, 0);
});
test("a successful baseline read followed by quota failure never replays pending local additions twice", async () => {
  const env = sharedFixture([]), tab = env.tab("only"); await settle();
  env.data.set(state.shoppingKey("cart", "b"), state.encodeShopping(state.addCartLine([], line(3))));
  tab.denyStorage(); tab.auth(account("b")); await settle();
  await tab.store.mutate(items => state.addCartLine(items, line(1)));
  tab.restoreStorage(); tab.failWrites(key => key === state.shoppingKey("cart", "b"));
  await tab.store.retry(); await settle(); exact(tab.store.getSnapshot().items, 4);
  await tab.store.retry(); await settle(); exact(tab.store.getSnapshot().items, 4);
  tab.restoreStorage(); await tab.store.retry(); await settle();
  exact(state.decodeCart(env.data.get(state.shoppingKey("cart", "b"))).items, 4);
});
test("read denial with working writes cannot overwrite an unknown owner baseline", async () => {
  const env = sharedFixture([]), tab = env.tab("only"); await settle();
  const key = state.shoppingKey("cart", "b");
  env.data.set(key, state.encodeShopping(state.addCartLine([], line(3, "Existing B gift"))));
  tab.failReads(candidate => candidate === key); tab.auth(account("b")); await settle();
  await tab.store.mutate(items => state.addCartLine(items, line(1, "Local B gift")));
  exact(state.decodeCart(env.data.get(key)).items, 3, "Existing B gift");
  assert.equal(state.decodeCart(env.data.get(key)).items.length, 1);
  tab.restoreStorage(); await tab.store.retry(); await settle();
  const stored = state.decodeCart(env.data.get(key)).items;
  exact(stored, 3, "Existing B gift"); exact(stored, 1, "Local B gift");
});
test("removing a local line while its same-line owner baseline is unread remains a removal after recovery", async () => {
  const env = sharedFixture([]), tab = env.tab("only"); await settle();
  const key = state.shoppingKey("cart", "b");
  env.data.set(key, state.encodeShopping(state.addCartLine([], line(3))));
  tab.denyStorage(); tab.auth(account("b")); await settle();
  await tab.store.mutate(items => state.addCartLine(items, line(1)));
  await tab.store.mutate(items => items.filter(item => item.id !== state.lineId(variant.id, true, "Private gift")));
  tab.restoreStorage(); await tab.store.retry(); await settle();
  assert.equal(tab.store.getSnapshot().items.length, 0);
  assert.equal(state.decodeCart(env.data.get(key)).items.length, 0);
});
