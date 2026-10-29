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

function sharedFixture(guestItems, { asyncEvents = false } = {}) {
  const data = new Map([[state.shoppingKey("cart", null), state.encodeShopping(guestItems)]]), tabs = [];
  let lock = Promise.resolve(), metadataWrites = 0, delivered = 0, overflow = false;
  const changed = (name, key) => tabs.filter(other => other.name !== name).forEach(other => {
    if (!asyncEvents) return other.dispatch(key);
    setImmediate(() => { if (++delivered > 250) { overflow = true; return; } other.dispatch(key); });
  });
  function tab(name) {
    let auth = { status: "guest", user: null }, denied = false, failedWrite = () => false, failedRead = () => false;
    const listeners = new Set(), events = new Set(), exports = {};
    const dispatch = key => events.forEach(listener => listener({ key }));
    const storage = {
      getItem: key => { if (denied || failedRead(key)) throw new Error("Storage denied"); return data.get(key) ?? null; },
      setItem: (key, value) => { if (denied || failedWrite(key)) throw new Error("Storage quota"); data.set(key, value); if (key.endsWith("-selections")) metadataWrites++; changed(name, key); },
      removeItem: key => { if (denied) throw new Error("Storage denied"); if (data.delete(key)) changed(name, key); },
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
  return { data, tab, metadataWrites: () => metadataWrites, eventOverflow: () => overflow };
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

for (const delayedOwner of ["a", "b"]) test(`a delayed ${delayedOwner} logout under storage denial starts a fresh guest bag and retains only new guest actions`, async () => {
  const env = sharedFixture(state.addCartLine([], line(2, "Shared gift owned by A"))), fast = env.tab("fast"), slow = env.tab("slow"); await settle();
  slow.auth({ status: "loading", user: null }); fast.auth(account("a")); await settle();
  slow.denyStorage(); slow.auth(account(delayedOwner)); await settle();
  assert.equal(slow.store.getSnapshot().items.length, 0);
  slow.auth({ status: "guest", user: null }); await settle();
  assert.equal(slow.store.getSnapshot().accountId, null);
  assert.equal(slow.store.getSnapshot().items.length, 0);
  await slow.store.mutate(items => state.addCartLine(items, line(1, "Fresh post-logout gift")));
  assert.equal(slow.store.getSnapshot().items.length, 1); exact(slow.store.getSnapshot().items, 1, "Fresh post-logout gift");
  slow.restoreStorage(); await slow.store.retry(); await settle();
  assert.equal(slow.store.getSnapshot().items.length, 1); exact(slow.store.getSnapshot().items, 1, "Fresh post-logout gift");
  slow.auth(account("b")); await settle();
  assert.equal(slow.store.getSnapshot().items.length, 1); exact(slow.store.getSnapshot().items, 1, "Fresh post-logout gift");
  exact(state.decodeCart(env.data.get(state.shoppingKey("cart", "a"))).items, 2, "Shared gift owned by A");
});
for (const explicitRetry of [true, false]) test(`restored guest storage filters old claimed raw gifts before ${explicitRetry ? "explicit retry" : "a fresh mutation"}`, async () => {
  const env = sharedFixture(state.addCartLine([], line(2, "Claimed raw gift"))), fast = env.tab("fast"), slow = env.tab("slow"); await settle();
  slow.auth({ status: "loading", user: null }); fast.failWrites(key => key === state.shoppingKey("cart", "a"));
  fast.auth(account("a")); await settle(); exact(fast.store.getSnapshot().items, 2, "Claimed raw gift");
  assert.equal(state.decodeCart(env.data.get(state.shoppingKey("cart", null))).items.length, 1);
  slow.denyStorage(); slow.auth(account("b")); await settle(); slow.auth({ status: "guest", user: null }); await settle();
  assert.equal(slow.store.getSnapshot().items.length, 0); slow.restoreStorage();
  if (explicitRetry) { await slow.store.retry(); await settle(); assert.equal(slow.store.getSnapshot().items.length, 0); }
  await slow.store.mutate(items => state.addCartLine(items, line(1, "Only fresh guest gift")));
  assert.equal(slow.store.getSnapshot().items.length, 1); exact(slow.store.getSnapshot().items, 1, "Only fresh guest gift");
  slow.auth(account("b")); await settle();
  assert.equal(slow.store.getSnapshot().items.length, 1); exact(slow.store.getSnapshot().items, 1, "Only fresh guest gift");
  exact(fast.store.getSnapshot().items, 2, "Claimed raw gift");
});
test("guest fallback excludes readable raw items when their claim records cannot be verified", async () => {
  const env = sharedFixture(state.addCartLine([], line(2, "Claimed gift"))), tab = env.tab("only"); await settle();
  const key = state.shoppingKey("cart", null), id = JSON.parse(env.data.get(`${key}-selections`))[0].id;
  env.data.set(`${key}-claim-${id}`, "a"); tab.failReads(candidate => candidate.includes("-claim-"));
  tab.auth({ status: "loading", user: null }); tab.auth({ status: "guest", user: null }); await settle();
  assert.equal(tab.store.getSnapshot().items.length, 0);
  tab.restoreStorage(); await tab.store.retry(); await settle(); assert.equal(tab.store.getSnapshot().items.length, 0);
});
test("a guest tab losing storage during another tab's claim never renders the old shared gift", async () => {
  const env = sharedFixture(state.addCartLine([], line(2, "Shared gift"))), fast = env.tab("fast"), slow = env.tab("slow"); await settle();
  slow.denyStorage(); fast.auth(account("a")); await settle();
  assert.equal(slow.store.getSnapshot().accountId, null); assert.equal(slow.store.getSnapshot().items.length, 0);
  await slow.store.mutate(items => state.addCartLine(items, line(1, "Fresh guest gift")));
  slow.restoreStorage(); await slow.store.retry(); await settle();
  assert.equal(slow.store.getSnapshot().items.length, 1); exact(slow.store.getSnapshot().items, 1, "Fresh guest gift");
});
test("local intent bound before a queued account migration stays with that owner after immediate logout", async () => {
  const env = sharedFixture([]), tab = env.tab("only"); await settle(); tab.denyStorage();
  await tab.store.mutate(items => state.addCartLine(items, line(2, "Fresh A intent")));
  tab.auth(account("a")); tab.auth({ status: "guest", user: null }); await settle();
  assert.equal(tab.store.getSnapshot().items.length, 0);
  await tab.store.mutate(items => state.addCartLine(items, line(1, "New guest B intent")));
  tab.auth(account("b")); await settle(); assert.equal(tab.store.getSnapshot().items.length, 1); exact(tab.store.getSnapshot().items, 1, "New guest B intent");
  tab.auth(account("a")); await settle(); assert.equal(tab.store.getSnapshot().items.length, 1); exact(tab.store.getSnapshot().items, 2, "Fresh A intent");
});
test("guest edits replay on verified unclaimed storage without restoring a canceled line or doubling a fresh gift", async () => {
  const env = sharedFixture(state.addCartLine([], line(2, "Canceled guest gift"))), tab = env.tab("only"); await settle();
  tab.failWrites(key => key === state.shoppingKey("cart", null));
  await tab.store.mutate(items => items.filter(item => item.giftMessage !== "Canceled guest gift"));
  await tab.store.mutate(items => state.addCartLine(items, line(1, "Fresh guest gift")));
  tab.restoreStorage(); await tab.store.retry(); await settle();
  assert.equal(tab.store.getSnapshot().items.length, 1); exact(tab.store.getSnapshot().items, 1, "Fresh guest gift");
  await tab.store.retry(); await settle(); exact(tab.store.getSnapshot().items, 1, "Fresh guest gift");
});

test("an identical fresh gift after denied logout survives guest quota recovery with its exact quantity", async () => {
  const env = sharedFixture(state.addCartLine([], line(2, "Same gift"))), fast = env.tab("fast"), slow = env.tab("slow"); await settle();
  slow.auth({ status: "loading", user: null }); fast.failWrites(key => key === state.shoppingKey("cart", "a")); fast.auth(account("a")); await settle();
  slow.denyStorage(); slow.auth(account("b")); await settle(); slow.auth({ status: "guest", user: null }); await settle();
  await slow.store.mutate(items => state.addCartLine(items, line(2, "Same gift")));
  slow.restoreStorage(); slow.failWrites(key => key === state.shoppingKey("cart", null));
  await slow.store.retry(); await settle(); exact(slow.store.getSnapshot().items, 2, "Same gift");
  await slow.store.retry(); await settle(); exact(slow.store.getSnapshot().items, 2, "Same gift");
  slow.restoreStorage(); await slow.store.retry(); await settle(); exact(slow.store.getSnapshot().items, 2, "Same gift");
  slow.auth(account("b")); await settle(); exact(slow.store.getSnapshot().items, 2, "Same gift");
  exact(fast.store.getSnapshot().items, 2, "Same gift");
});

for (const cachedOwner of [false, true]) test(`failed cart cancellation cannot migrate its old raw gift to ${cachedOwner ? "a cached" : "a new"} account`, async () => {
  const env = sharedFixture([]), tab = env.tab("only"); await settle();
  if (cachedOwner) {
    tab.auth(account("a")); await settle(); tab.denyStorage();
    await tab.store.mutate(items => state.addCartLine(items, line(1, "Existing A gift")));
    tab.auth({ status: "guest", user: null }); await settle(); tab.restoreStorage(); await tab.store.retry(); await settle();
  }
  await tab.store.mutate(items => state.addCartLine(items, line(2, "Canceled raw gift")));
  const canceled = JSON.parse(env.data.get(`${state.shoppingKey("cart", null)}-selections`))[0].id;
  tab.failWrites(() => true); await tab.store.mutate(items => items.filter(item => item.giftMessage !== "Canceled raw gift"));
  assert.equal(tab.store.getSnapshot().items.length, 0);
  tab.restoreStorage(); tab.auth(account("a")); await settle();
  assert.equal(tab.store.getSnapshot().items.some(item => item.giftMessage === "Canceled raw gift"), false);
  assert.equal(env.data.get(`${state.shoppingKey("cart", null)}-claim-${canceled}`), "cancelled");
  if (cachedOwner) exact(tab.store.getSnapshot().items, 1, "Existing A gift");
});

test("legacy raw gift identity stays spent during a failed identical fresh payload replacement", async () => {
  const env = sharedFixture(state.addCartLine([], line(2, "Legacy identical gift"))), fast = env.tab("fast"), slow = env.tab("slow"); await settle();
  const key = state.shoppingKey("cart", null); env.data.set(key, state.encodeShopping(state.decodeCart(env.data.get(key)).items));
  slow.auth({ status: "loading", user: null }); fast.failWrites(candidate => candidate === state.shoppingKey("cart", "a")); fast.auth(account("a")); await settle();
  slow.denyStorage(); slow.auth(account("b")); await settle(); slow.auth({ status: "guest", user: null }); await settle();
  await slow.store.mutate(items => state.addCartLine(items, line(2, "Legacy identical gift")));
  slow.restoreStorage(); slow.failWrites(candidate => candidate === key);
  await slow.store.retry(); await settle(); exact(slow.store.getSnapshot().items, 2, "Legacy identical gift");
  await slow.store.retry(); await settle(); exact(slow.store.getSnapshot().items, 2, "Legacy identical gift");
  slow.restoreStorage(); slow.auth(account("b")); await settle(); exact(slow.store.getSnapshot().items, 2, "Legacy identical gift");
});

test("a fresh identical cart payload keeps its ID through failed old-metadata cleanup and a second tab", async () => {
  const env = sharedFixture(state.addCartLine([], line(2, "Identical gift"))), tab = env.tab("only"); await settle();
  const key = state.shoppingKey("cart", null), old = JSON.parse(env.data.get(`${key}-selections`))[0].id;
  tab.failWrites(candidate => candidate === key); await tab.store.mutate(() => []);
  await tab.store.mutate(items => state.addCartLine(items, line(2, "Identical gift")));
  tab.restoreStorage(); tab.failWrites(candidate => candidate === `${key}-selections`);
  await tab.store.retry(); await settle();
  const fresh = JSON.parse(env.data.get(key)).guestSelectionIds[0]; assert.notEqual(fresh, old);
  assert.equal(JSON.parse(env.data.get(`${key}-selections`)).some(record => record.id === old), true);
  tab.restoreStorage(); const other = env.tab("other"); await settle(); exact(other.store.getSnapshot().items, 2, "Identical gift");
  other.auth(account("a")); await settle(); exact(other.store.getSnapshot().items, 2, "Identical gift");
});

for (const cachedOwner of [false, true]) test(`full Storage denial retains explicit guest removal before direct ${cachedOwner ? "cached" : "new"} account migration`, async () => {
  const env = sharedFixture([]), tab = env.tab("only"); await settle();
  if (cachedOwner) {
    tab.auth(account("a")); await settle(); tab.denyStorage();
    await tab.store.mutate(items => state.addCartLine(items, line(1, "Existing A gift")));
    tab.auth({ status: "guest", user: null }); await settle(); tab.restoreStorage(); await tab.store.retry(); await settle();
  }
  await tab.store.mutate(items => state.addCartLine(items, line(2, "Removed under total denial")));
  const key = state.shoppingKey("cart", null), old = JSON.parse(env.data.get(key)).guestSelectionIds[0];
  tab.denyStorage(); await tab.store.mutate(items => items.filter(item => item.giftMessage !== "Removed under total denial"));
  assert.equal(tab.store.getSnapshot().items.length, 0);
  tab.restoreStorage(); tab.auth(account("a")); await settle();
  assert.equal(tab.store.getSnapshot().items.some(item => item.giftMessage === "Removed under total denial"), false);
  assert.equal(env.data.get(`${key}-claim-${old}`), "cancelled");
  if (cachedOwner) exact(tab.store.getSnapshot().items, 1, "Existing A gift");
});

test("full Storage denial removal followed by deliberate same-gift re-selection transfers only its fresh quantity", async () => {
  const env = sharedFixture(state.addCartLine([], line(2, "Re-selected gift"))), tab = env.tab("only"); await settle();
  const key = state.shoppingKey("cart", null), old = JSON.parse(env.data.get(key)).guestSelectionIds[0];
  tab.denyStorage(); await tab.store.mutate(() => []);
  await tab.store.mutate(items => state.addCartLine(items, line(1, "Re-selected gift")));
  exact(tab.store.getSnapshot().items, 1, "Re-selected gift");
  tab.restoreStorage(); tab.auth(account("a")); await settle();
  exact(tab.store.getSnapshot().items, 1, "Re-selected gift");
  assert.equal(env.data.get(`${key}-claim-${old}`), "cancelled");
});

for (const verifyWhileDenied of [false, true]) test(`a guest quantity reduction under full Storage denial survives ${verifyWhileDenied ? "owner denial and retry" : "direct sign-in"}`, async () => {
  const env = sharedFixture(state.addCartLine([], line(3, "Reduced guest gift"))), tab = env.tab("only"); await settle();
  tab.denyStorage(); await tab.store.mutate(items => items.map(item => ({ ...item, quantity: 1 })));
  assert.equal(tab.store.getSnapshot().items.length, 0);
  if (verifyWhileDenied) { tab.auth(account("a")); await settle(); assert.equal(tab.store.getSnapshot().items.length, 0); }
  tab.restoreStorage();
  if (verifyWhileDenied) await tab.store.retry(); else tab.auth(account("a"));
  await settle(); exact(tab.store.getSnapshot().items, 1, "Reduced guest gift");
  await tab.store.retry(); await settle(); exact(tab.store.getSnapshot().items, 1, "Reduced guest gift");
});

for (const retryGuest of [false, true]) for (const target of ["a", "b"]) test(`a same-gift local delta retains fresh identity after A claims shared quantity, ${retryGuest ? "guest retry then" : "direct"} ${target} sign-in`, async () => {
  const env = sharedFixture(state.addCartLine([], line(1, "Shared and fresh gift"))), fast = env.tab("fast"), slow = env.tab("slow"); await settle();
  const key = state.shoppingKey("cart", null), shared = JSON.parse(env.data.get(key)).guestSelectionIds[0];
  fast.auth({ status: "loading", user: null }); slow.failWrites(candidate => candidate === key);
  await slow.store.mutate(items => state.addCartLine(items, line(1, "Shared and fresh gift")));
  exact(slow.store.getSnapshot().items, 2, "Shared and fresh gift");
  const fresh = JSON.parse(env.data.get(`${key}-selections`)).find(record => record.id !== shared).id;
  fast.auth(account("a")); await settle(); exact(slow.store.getSnapshot().items, 1, "Shared and fresh gift");
  slow.restoreStorage();
  if (retryGuest) {
    await slow.store.retry(); await settle(); exact(slow.store.getSnapshot().items, 1, "Shared and fresh gift");
    assert.deepEqual(JSON.parse(env.data.get(key)).guestSelectionIds, [fresh]);
    assert.equal(env.data.has(`${key}-claim-${fresh}`), false);
    await slow.store.retry(); await settle(); assert.deepEqual(JSON.parse(env.data.get(key)).guestSelectionIds, [fresh]);
  }
  slow.auth(account(target)); await settle(); exact(slow.store.getSnapshot().items, target === "a" ? 2 : 1, "Shared and fresh gift");
  exact(state.decodeCart(env.data.get(state.shoppingKey("cart", "a"))).items, target === "a" ? 2 : 1, "Shared and fresh gift");
  assert.equal(env.data.get(`${key}-claim-${shared}`), "a");
});

test("asynchronous guest tabs converge after one payload failure while preserving the other tab's pending metadata", async () => {
  const env = sharedFixture(state.addCartLine([], line(1, "Shared gift")), { asyncEvents: true }), fast = env.tab("fast"), slow = env.tab("slow"); await settle();
  const key = state.shoppingKey("cart", null); slow.failWrites(candidate => candidate === key);
  await slow.store.mutate(items => state.addCartLine(items, line(1, "Fresh distinct gift")));
  await settle(); await settle(); const count = env.metadataWrites();
  await settle(); await settle(); assert.equal(env.metadataWrites(), count); assert.equal(env.eventOverflow(), false);
  assert.equal(fast.store.getSnapshot().items.length, 1); assert.equal(slow.store.getSnapshot().items.length, 2);
  slow.restoreStorage(); await slow.store.retry(); await settle(); await settle();
  assert.equal(fast.store.getSnapshot().items.length, 2); assert.equal(slow.store.getSnapshot().items.length, 2);
  const recovered = env.metadataWrites(); await settle(); assert.equal(env.metadataWrites(), recovered);
  assert.equal(env.eventOverflow(), false);
});

test("two asynchronous guest tabs with failed payloads keep stable canonical pending records until each recovers", async () => {
  const env = sharedFixture(state.addCartLine([], line(1, "Shared gift")), { asyncEvents: true }), first = env.tab("first"), second = env.tab("second"); await settle();
  const key = state.shoppingKey("cart", null); first.failWrites(candidate => candidate === key); second.failWrites(candidate => candidate === key);
  await first.store.mutate(items => state.addCartLine(items, line(1, "First local gift")));
  await second.store.mutate(items => state.addCartLine(items, line(1, "Second local gift")));
  await settle(); await settle(); const count = env.metadataWrites(); await settle(); await settle();
  assert.equal(env.metadataWrites(), count); assert.equal(env.eventOverflow(), false);
  first.restoreStorage(); await first.store.retry(); await settle(); await settle();
  const partial = env.metadataWrites(); await settle(); assert.equal(env.metadataWrites(), partial);
  second.restoreStorage(); await second.store.retry(); await settle(); await settle();
  for (const tab of [first, second]) { assert.equal(tab.store.getSnapshot().items.length, 3); exact(tab.store.getSnapshot().items, 1, "First local gift"); exact(tab.store.getSnapshot().items, 1, "Second local gift"); }
  const recovered = env.metadataWrites(); await settle(); assert.equal(env.metadataWrites(), recovered); assert.equal(env.eventOverflow(), false);
});

for (const action of ["remove", "reduce"]) test(`an archived owner guest ${action} cannot change a later fresh same-gift payload`, async () => {
  const env = sharedFixture(state.addCartLine([], line(3, "Later fresh gift"))), tab = env.tab("only"); await settle();
  tab.denyStorage(); await tab.store.mutate(items => action === "remove" ? [] : items.map(item => ({ ...item, quantity: 1 })));
  tab.auth(account("a")); await settle(); tab.auth({ status: "guest", user: null }); await settle();
  tab.restoreStorage(); await tab.store.retry(); await settle();
  await tab.store.mutate(() => []);
  await tab.store.mutate(items => state.addCartLine(items, line(2, "Later fresh gift")));
  const fresh = JSON.parse(env.data.get(state.shoppingKey("cart", null))).guestSelectionIds[0];
  tab.auth(account("a")); await settle(); exact(tab.store.getSnapshot().items, 2, "Later fresh gift");
  assert.equal(env.data.get(`${state.shoppingKey("cart", null)}-claim-${fresh}`), "a");
});

test("a denied old cart cancellation leaves a different tab's later fresh same-gift UUID intact on guest retry", async () => {
  const env = sharedFixture(state.addCartLine([], line(3, "Later fresh gift"))), first = env.tab("first"), slow = env.tab("slow"); await settle();
  const key = state.shoppingKey("cart", null), old = JSON.parse(env.data.get(key)).guestSelectionIds[0];
  slow.denyStorage(); await slow.store.mutate(() => []);
  await first.store.mutate(() => []); await first.store.mutate(items => state.addCartLine(items, line(2, "Later fresh gift")));
  const fresh = JSON.parse(env.data.get(key)).guestSelectionIds[0]; assert.notEqual(fresh, old);
  slow.restoreStorage(); await slow.store.retry(); await settle(); exact(slow.store.getSnapshot().items, 2, "Later fresh gift");
  assert.deepEqual(JSON.parse(env.data.get(key)).guestSelectionIds, [fresh]);
  slow.auth(account("a")); await settle(); exact(slow.store.getSnapshot().items, 2, "Later fresh gift");
});
