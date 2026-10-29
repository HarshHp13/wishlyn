import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import ts from "typescript";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import * as state from "../../src/lib/shopping-state.ts";
const compile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const tick = () => new Promise(resolve => setImmediate(resolve));
async function settle() { for (let i = 0; i < 16; i++) await tick(); }
const account = id => ({ status: "authenticated", user: { id, email: `${id}@example.test`, role: "customer" } });
function fixture(guestItems = ["guest-product"], { asyncEvents = false } = {}) {
  const data = new Map(), tabs = [], server = new Map(), done = new Set(), calls = [];
  data.set(state.shoppingKey("wishlist", null), state.encodeShopping(guestItems));
  let lock = Promise.resolve(), failTransfer = false, metadataWrites = 0, delivered = 0, overflow = false;
  const changed = (name, key) => tabs.filter(other => other.name !== name).forEach(other => {
    if (!asyncEvents) return other.dispatch(key);
    setImmediate(() => { if (++delivered > 250) { overflow = true; return; } other.dispatch(key); });
  });
  function tab(name) {
    let auth = { status: "guest", user: null }, denied = false, failedRead = () => false, failedWrite = () => false;
    const listeners = new Set(), events = new Map(), browser = {}, client = {}, saved = {};
    const dispatch = key => events.get("storage")?.forEach(listener => listener({ key }));
    const storage = {
      getItem: key => { if (denied || failedRead(key)) throw new Error("Storage denied"); return data.get(key) ?? null; },
      setItem: (key, value) => { if (denied || failedWrite(key)) throw new Error("Storage denied"); data.set(key, value); if (key.endsWith("-selections")) metadataWrites++; changed(name, key); },
      removeItem: key => { if (denied) throw new Error("Storage denied"); if (data.delete(key)) changed(name, key); },
    };
    const authClient = { getAuthState: () => auth, refreshAuthSession: async () => auth.user,
      subscribeAuth: listener => { listeners.add(listener); return () => listeners.delete(listener); } };
    const runtime = {
      window: { addEventListener: (name, listener) => { if (!events.has(name)) events.set(name, new Set()); events.get(name).add(listener); } },
      navigator: { locks: { request: (_key, action) => { const task = lock.then(action); lock = task.catch(() => {}); return task; } } },
      localStorage: storage, crypto: webcrypto, Error, AbortSignal, AbortController,
      fetch: async (_url, options) => {
        const owner = options.headers["X-Wishlyn-Account-ID"];
        assert.equal(owner, auth.user?.id);
        const body = options.body ? JSON.parse(options.body) : null;
        calls.push({ tab: name, owner, body });
        if (body?.action === "transfer" && failTransfer) { failTransfer = false; return Response.json({ error: "Synthetic transfer failure" }, { status: 503 }); }
        let items = server.get(owner) || [];
        if (body?.action === "transfer") for (const record of body.transfers) {
          const key = `${owner}:${record.id}`;
          if (!done.has(key)) { done.add(key); items = [...new Set([...items, ...record.productIds])]; }
        }
        if (body?.action === "remove") items = items.filter(item => item !== body.productId);
        if (body?.action === "add") items = [...new Set([...items, body.productId])];
        server.set(owner, items);
        return Response.json({ viewerId: owner, ownerId: owner, items, version: 1, browserImported: true });
      },
    };
    vm.runInNewContext(compile("../../src/lib/shopping-store.ts"), { ...runtime, exports: browser, require: name => name === "./authClient" ? authClient : state });
    vm.runInNewContext(compile("../../src/lib/account/client.ts"), { ...runtime, exports: client, require: () => authClient });
    vm.runInNewContext(compile("../../src/lib/account/wishlist-store.ts"), { ...runtime, exports: saved, require: name => name === "../authClient" ? authClient : name === "../shopping-store" ? browser : name === "./client" ? client : state });
    const result = { name, dispatch, store: saved.savedWishlistStore, browser: browser.wishlistStore,
      denyStorage() { denied = true; }, restoreStorage() { denied = false; failedRead = () => false; failedWrite = () => false; },
      failReads(predicate) { failedRead = predicate; }, failWrites(predicate) { failedWrite = predicate; },
      auth(next) { auth = next; listeners.forEach(listener => listener()); } };
    tabs.push(result); result.store.subscribe(() => {}); return result;
  }
  return { tab, calls, server, data, metadataWrites: () => metadataWrites, eventOverflow: () => overflow, failNextTransfer() { failTransfer = true; } };
}
test("a delayed tab reuses the shared guest key and cannot resurrect a fast tab's removal", async () => {
  const env = fixture(), fast = env.tab("fast"), slow = env.tab("slow"); await settle();
  slow.auth({ status: "loading", user: null });
  fast.auth(account("a")); await settle();
  assert.deepEqual(env.server.get("a"), ["guest-product"]);
  fast.store.mutate("remove", "guest-product"); await settle();
  assert.deepEqual(env.server.get("a"), []);
  slow.auth(account("a")); await settle();
  assert.deepEqual(env.server.get("a"), []);
  assert.deepEqual(Array.from(slow.store.getSnapshot().items), []);
  const transfers = env.calls.filter(call => call.body?.action === "transfer");
  assert.equal(transfers.length, 2);
  assert.equal(transfers[0].body.transfers[0].id, transfers[1].body.transfers[0].id);
});
test("canceling an unclaimed guest pick while another tab verifies never submits its cached UUID", async () => {
  const env = fixture(), fast = env.tab("fast"), slow = env.tab("slow"); await settle();
  const canceled = slow.browser.getSnapshot().guestTransfers[0].id;
  slow.auth({ status: "loading", user: null });
  fast.store.mutate("remove", "guest-product"); await settle();
  fast.store.mutate("add", "second-product"); await settle();
  fast.auth(account("a")); await settle(); slow.auth(account("a")); await settle();
  assert.deepEqual(env.server.get("a"), ["second-product"]);
  assert.equal(env.calls.some(call => call.body?.transfers?.some(record => record.id === canceled)), false);
  assert.equal(slow.store.getSnapshot().status, "ready");
});
test("guest cancellation followed by deliberate re-selection spends only the fresh UUID", async () => {
  const env = fixture(), fast = env.tab("fast"), slow = env.tab("slow"); await settle();
  const canceled = slow.browser.getSnapshot().guestTransfers[0].id;
  slow.auth({ status: "loading", user: null });
  fast.store.mutate("remove", "guest-product"); await settle();
  fast.store.mutate("add", "guest-product"); await settle();
  const fresh = fast.browser.getSnapshot().guestTransfers[0].id;
  assert.notEqual(fresh, canceled);
  fast.auth(account("a")); await settle(); slow.auth(account("a")); await settle();
  assert.deepEqual(env.server.get("a"), ["guest-product"]);
  const transfers = env.calls.filter(call => call.body?.action === "transfer");
  assert.equal(transfers.length, 1); assert.equal(transfers[0].body.transfers[0].id, fresh);
});
test("storage denial cannot assign A's cached shared selection to delayed B, including retry", async () => {
  const env = fixture(), fast = env.tab("fast"), slow = env.tab("slow"); await settle();
  slow.auth({ status: "loading", user: null }); fast.auth(account("a")); await settle();
  fast.store.mutate("remove", "guest-product"); await settle();
  slow.denyStorage(); slow.auth(account("b")); await settle();
  assert.deepEqual(env.server.get("b"), []);
  assert.deepEqual(Array.from(slow.browser.getSnapshot().items), []);
  assert.match(slow.store.getSnapshot().notice, /retained for verification/);
  assert.equal(env.calls.some(call => call.owner === "b" && call.body?.action === "transfer"), false);
  slow.restoreStorage(); await slow.store.retry(); await settle();
  assert.deepEqual(env.server.get("b"), []);
  assert.equal(slow.store.getSnapshot().status, "ready");
  assert.equal(slow.store.getSnapshot().notice, "");
});
test("same-A storage-denied delayed selection stays withheld and safely replays after storage returns", async () => {
  const env = fixture(), fast = env.tab("fast"), slow = env.tab("slow"); await settle();
  slow.auth({ status: "loading", user: null }); fast.auth(account("a")); await settle();
  fast.store.mutate("remove", "guest-product"); await settle();
  slow.denyStorage(); slow.auth(account("a")); await settle();
  assert.deepEqual(env.server.get("a"), []);
  assert.equal(env.calls.filter(call => call.body?.action === "transfer").length, 1);
  slow.restoreStorage(); await slow.store.retry(); await settle();
  assert.deepEqual(env.server.get("a"), []);
  const transfers = env.calls.filter(call => call.body?.action === "transfer");
  assert.equal(transfers.length, 2);
  assert.equal(transfers[0].body.transfers[0].id, transfers[1].body.transfers[0].id);
});
test("mixed denied shared/local guest picks transfer only the fresh local action to B", async () => {
  const env = fixture(), fast = env.tab("fast"), slow = env.tab("slow"); await settle();
  slow.denyStorage(); slow.store.mutate("add", "fresh-local"); await settle();
  slow.auth({ status: "loading", user: null }); fast.auth(account("a")); await settle();
  fast.store.mutate("remove", "guest-product"); await settle();
  slow.auth(account("b")); await settle();
  assert.deepEqual(env.server.get("b"), ["fresh-local"]);
  const sent = env.calls.filter(call => call.owner === "b" && call.body?.action === "transfer");
  assert.equal(sent.length, 1); assert.deepEqual(sent[0].body.transfers[0].productIds, ["fresh-local"]);
  slow.restoreStorage(); await slow.store.retry(); await settle();
  assert.deepEqual(env.server.get("b"), ["fresh-local"]);
  assert.equal(env.calls.filter(call => call.owner === "b" && call.body?.action === "transfer").length, 1);
});
test("a failed fresh-local transfer remains bound to its account across storage recovery", async () => {
  const env = fixture(), fast = env.tab("fast"), slow = env.tab("slow"); await settle();
  slow.denyStorage(); slow.store.mutate("add", "fresh-local"); await settle();
  slow.auth({ status: "loading", user: null }); fast.auth(account("a")); await settle();
  env.failNextTransfer(); slow.auth(account("b")); await settle();
  assert.equal(slow.store.getSnapshot().status, "error");
  slow.restoreStorage(); await slow.store.retry(); await settle();
  assert.deepEqual(env.server.get("b"), ["fresh-local"]);
  const transfers = env.calls.filter(call => call.owner === "b" && call.body?.action === "transfer");
  assert.equal(transfers.length, 2);
  assert.equal(transfers[0].body.transfers[0].id, transfers[1].body.transfers[0].id);
});
test("adding another guest pick preserves existing selection keys across a delayed tab", async () => {
  const env = fixture(), fast = env.tab("fast"), slow = env.tab("slow"); await settle();
  slow.auth({ status: "loading", user: null });
  fast.store.mutate("add", "second-product"); await settle();
  fast.auth(account("a")); await settle();
  assert.deepEqual(env.server.get("a"), ["guest-product", "second-product"]);
  fast.store.mutate("remove", "guest-product"); await settle();
  slow.auth(account("a")); await settle();
  assert.deepEqual(env.server.get("a"), ["second-product"]);
  const first = env.calls.find(call => call.tab === "fast" && call.body?.action === "transfer").body.transfers;
  const delayed = env.calls.find(call => call.tab === "slow" && call.body?.action === "transfer").body.transfers;
  assert.equal(delayed[0].id, first.find(record => record.productIds[0] === "guest-product").id);
});
test("a shared guest selection already claimed by A never transfers to a delayed B account", async () => {
  const env = fixture(), fast = env.tab("fast"), slow = env.tab("slow"); await settle();
  slow.auth({ status: "loading", user: null }); fast.auth(account("a")); await settle();
  slow.auth(account("b")); await settle();
  assert.deepEqual(env.server.get("b"), []);
  assert.equal(env.calls.some(call => call.owner === "b" && call.body?.action === "transfer"), false);
});
test("a deliberate guest re-selection after removal receives a new key and can save again", async () => {
  const env = fixture(), fast = env.tab("fast"); await settle();
  fast.auth(account("a")); await settle(); fast.store.mutate("remove", "guest-product"); await settle();
  fast.auth({ status: "guest", user: null }); await settle();
  fast.store.mutate("add", "guest-product"); await settle();
  fast.auth(account("a")); await settle();
  assert.deepEqual(env.server.get("a"), ["guest-product"]);
  const transfers = env.calls.filter(call => call.body?.action === "transfer");
  assert.equal(transfers.length, 2);
  assert.notEqual(transfers[0].body.transfers[0].id, transfers[1].body.transfers[0].id);
});
test("fifty explicit guest selections use one bounded transfer request", async () => {
  const items = Array.from({ length: 50 }, (_, index) => `guest-${index}`);
  const env = fixture(items), tab = env.tab("only"); await settle();
  tab.auth(account("a")); await settle();
  assert.equal(env.server.get("a").length, 50);
  const transfers = env.calls.filter(call => call.body?.action === "transfer");
  assert.equal(transfers.length, 1);
  assert.equal(transfers[0].body.transfers.length, 50);
  assert.equal(tab.store.getSnapshot().status, "ready");
});

for (const delayedOwner of ["a", "b"]) test(`a denied ${delayedOwner} to guest transition never revives A's saved selection and permits fresh guest picks`, async () => {
  const env = fixture(), fast = env.tab("fast"), slow = env.tab("slow"); await settle();
  slow.auth({ status: "loading", user: null }); fast.auth(account("a")); await settle();
  fast.store.mutate("remove", "guest-product"); await settle();
  slow.denyStorage(); slow.auth(account(delayedOwner)); await settle(); assert.deepEqual(Array.from(slow.store.getSnapshot().items), []);
  slow.auth({ status: "guest", user: null }); await settle();
  assert.equal(slow.store.getSnapshot().accountId, null); assert.deepEqual(Array.from(slow.store.getSnapshot().items), []);
  slow.store.mutate("add", "fresh-after-logout"); await settle();
  assert.deepEqual(Array.from(slow.store.getSnapshot().items), ["fresh-after-logout"]);
  slow.restoreStorage(); await slow.store.retry(); await settle();
  assert.deepEqual(Array.from(slow.store.getSnapshot().items), ["fresh-after-logout"]);
  slow.auth(account("b")); await settle(); assert.deepEqual(env.server.get("b"), ["fresh-after-logout"]);
  assert.deepEqual(env.server.get("a"), []);
  assert.equal(env.calls.filter(call => call.owner === "b" && call.body?.action === "transfer").some(call => call.body.transfers.some(record => record.productIds.includes("guest-product"))), false);
});
test("guest restoration and fresh selection exclude an old claimed wishlist payload left after a quota failure", async () => {
  const env = fixture(), fast = env.tab("fast"), slow = env.tab("slow"); await settle();
  slow.auth({ status: "loading", user: null }); fast.failWrites(key => key === state.shoppingKey("wishlist", "a"));
  fast.auth(account("a")); await settle(); fast.store.mutate("remove", "guest-product"); await settle();
  assert.deepEqual(state.decodeWishlist(env.data.get(state.shoppingKey("wishlist", null))).items, ["guest-product"]);
  slow.denyStorage(); slow.auth(account("b")); await settle(); slow.auth({ status: "guest", user: null }); await settle();
  assert.deepEqual(Array.from(slow.store.getSnapshot().items), []);
  slow.restoreStorage(); await slow.store.retry(); await settle(); assert.deepEqual(Array.from(slow.store.getSnapshot().items), []);
  slow.store.mutate("add", "only-fresh-guest"); await settle(); slow.auth(account("b")); await settle();
  assert.deepEqual(env.server.get("b"), ["only-fresh-guest"]); assert.deepEqual(env.server.get("a"), []);
});
test("guest wishlist fallback never publishes readable claimed picks when claim verification fails", async () => {
  const env = fixture(), tab = env.tab("only"); await settle();
  const key = state.shoppingKey("wishlist", null), id = JSON.parse(env.data.get(`${key}-selections`))[0].id;
  env.data.set(`${key}-claim-${id}`, "a"); tab.failReads(candidate => candidate.includes("-claim-"));
  tab.auth({ status: "loading", user: null }); tab.auth({ status: "guest", user: null }); await settle();
  assert.deepEqual(Array.from(tab.store.getSnapshot().items), []);
  tab.restoreStorage(); await tab.store.retry(); await settle(); assert.deepEqual(Array.from(tab.store.getSnapshot().items), []);
});
test("fresh wishlist intent already bound to queued A stays hidden on immediate logout and resumes for A", async () => {
  const env = fixture([]), tab = env.tab("only"); await settle(); tab.denyStorage();
  tab.store.mutate("add", "fresh-a-intent"); await settle();
  tab.auth(account("a")); tab.auth({ status: "guest", user: null }); await settle();
  assert.deepEqual(Array.from(tab.store.getSnapshot().items), []);
  tab.store.mutate("add", "new-guest-b-intent"); await settle(); tab.auth(account("b")); await settle();
  assert.deepEqual(env.server.get("b"), ["new-guest-b-intent"]);
  tab.auth(account("a")); await settle(); assert.deepEqual(env.server.get("a"), ["fresh-a-intent"]);
});
test("guest retry preserves a pending cancellation while saving a fresh selection once", async () => {
  const env = fixture(), tab = env.tab("only"); await settle(); tab.failWrites(key => key === state.shoppingKey("wishlist", null));
  tab.store.mutate("remove", "guest-product"); await settle(); tab.store.mutate("add", "fresh-guest"); await settle();
  tab.restoreStorage(); await tab.store.retry(); await settle();
  assert.deepEqual(Array.from(tab.store.getSnapshot().items), ["fresh-guest"]);
  tab.auth(account("a")); await settle(); assert.deepEqual(env.server.get("a"), ["fresh-guest"]);
});

test("fresh re-selection of a consumed product keeps a new UUID through denied logout and failed guest writes", async () => {
  const env = fixture(), fast = env.tab("fast"), slow = env.tab("slow"); await settle();
  const spent = slow.browser.getSnapshot().guestTransfers[0].id;
  slow.auth({ status: "loading", user: null }); fast.failWrites(key => key === state.shoppingKey("wishlist", "a"));
  fast.auth(account("a")); await settle(); fast.store.mutate("remove", "guest-product"); await settle();
  slow.denyStorage(); slow.auth(account("b")); await settle(); slow.auth({ status: "guest", user: null }); await settle();
  slow.store.mutate("add", "guest-product"); await settle();
  const fresh = slow.browser.getSnapshot().guestTransfers[0].id; assert.notEqual(fresh, spent);
  slow.restoreStorage(); slow.failWrites(key => key === state.shoppingKey("wishlist", null));
  await slow.store.retry(); await settle(); assert.deepEqual(Array.from(slow.store.getSnapshot().items), ["guest-product"]);
  await slow.store.retry(); await settle(); assert.equal(slow.browser.getSnapshot().guestTransfers[0].id, fresh);
  slow.restoreStorage(); await slow.store.retry(); await settle();
  slow.auth(account("b")); await settle(); assert.deepEqual(env.server.get("b"), ["guest-product"]);
  const transfers = env.calls.filter(call => call.owner === "b" && call.body?.action === "transfer");
  assert.equal(transfers.length, 1); assert.equal(transfers[0].body.transfers[0].id, fresh);
  assert.deepEqual(env.server.get("a"), []);
});

test("failed guest cancellation persists its tombstone before direct account verification", async () => {
  const env = fixture(), tab = env.tab("only"); await settle();
  const canceled = tab.browser.getSnapshot().guestTransfers[0].id;
  tab.failWrites(() => true); tab.store.mutate("remove", "guest-product"); await settle();
  assert.deepEqual(Array.from(tab.store.getSnapshot().items), []);
  tab.restoreStorage(); tab.auth(account("a")); await settle();
  assert.deepEqual(env.server.get("a"), []);
  assert.equal(env.calls.some(call => call.body?.transfers?.some(record => record.id === canceled)), false);
  assert.equal(env.data.get(`${state.shoppingKey("wishlist", null)}-claim-${canceled}`), "cancelled");
});

test("explicit re-selection after failed cancellation gets a fresh UUID and transfers only the fresh pick", async () => {
  const env = fixture(), tab = env.tab("only"); await settle();
  const canceled = tab.browser.getSnapshot().guestTransfers[0].id;
  tab.failWrites(() => true); tab.store.mutate("remove", "guest-product"); await settle();
  tab.store.mutate("add", "guest-product"); await settle();
  const fresh = tab.browser.getSnapshot().guestTransfers[0].id; assert.notEqual(fresh, canceled);
  tab.restoreStorage(); tab.auth(account("a")); await settle();
  assert.deepEqual(env.server.get("a"), ["guest-product"]);
  const transfers = env.calls.filter(call => call.body?.action === "transfer");
  assert.equal(transfers.length, 1); assert.equal(transfers[0].body.transfers[0].id, fresh);
});

test("a fresh identical wishlist payload retains its own ID when old metadata cleanup fails", async () => {
  const env = fixture(), tab = env.tab("only"); await settle();
  const key = state.shoppingKey("wishlist", null), old = tab.browser.getSnapshot().guestTransfers[0].id;
  tab.failWrites(candidate => candidate === key); tab.store.mutate("remove", "guest-product"); await settle();
  tab.store.mutate("add", "guest-product"); await settle();
  const fresh = tab.browser.getSnapshot().guestTransfers[0].id; assert.notEqual(fresh, old);
  tab.restoreStorage(); tab.failWrites(candidate => candidate === `${key}-selections`);
  await tab.store.retry(); await settle();
  assert.deepEqual(JSON.parse(env.data.get(key)).guestSelectionIds, [fresh]);
  assert.equal(JSON.parse(env.data.get(`${key}-selections`)).some(record => record.id === old), true);
  tab.restoreStorage(); const other = env.tab("other"); await settle();
  assert.equal(other.browser.getSnapshot().guestTransfers[0].id, fresh);
  other.auth(account("a")); await settle(); assert.deepEqual(env.server.get("a"), ["guest-product"]);
  assert.equal(env.calls.some(call => call.body?.transfers?.some(record => record.id === old)), false);
});

for (const cachedOwner of [false, true]) test(`visible guest removal under full Storage denial is retained before direct ${cachedOwner ? "cached" : "new"} wishlist account verification`, async () => {
  const env = fixture([]), tab = env.tab("only"); await settle();
  if (cachedOwner) {
    tab.auth(account("a")); await settle(); tab.store.mutate("add", "existing-a"); await settle();
    tab.auth({ status: "guest", user: null }); await settle();
  }
  tab.store.mutate("add", "guest-product"); await settle();
  const key = state.shoppingKey("wishlist", null), old = tab.browser.getSnapshot().guestTransfers[0].id;
  tab.denyStorage(); tab.store.mutate("remove", "guest-product"); await settle();
  assert.equal(tab.store.getSnapshot().items.length, 0);
  tab.restoreStorage(); tab.auth(account("a")); await settle();
  assert.deepEqual(env.server.get("a"), cachedOwner ? ["existing-a"] : []);
  assert.equal(env.calls.some(call => call.body?.transfers?.some(record => record.id === old)), false);
  assert.equal(env.data.get(`${key}-claim-${old}`), "cancelled");
});

test("full Storage denial removal then same-product re-selection uses only the fresh UUID on direct sign-in", async () => {
  const env = fixture(), tab = env.tab("only"); await settle();
  const key = state.shoppingKey("wishlist", null), old = tab.browser.getSnapshot().guestTransfers[0].id;
  tab.denyStorage(); tab.store.mutate("remove", "guest-product"); await settle();
  tab.store.mutate("add", "guest-product"); await settle();
  const fresh = tab.browser.getSnapshot().guestTransfers[0].id; assert.notEqual(fresh, old);
  tab.restoreStorage(); tab.auth(account("a")); await settle(); assert.deepEqual(env.server.get("a"), ["guest-product"]);
  const transfers = env.calls.filter(call => call.body?.action === "transfer");
  assert.equal(transfers.length, 1); assert.equal(transfers[0].body.transfers[0].id, fresh);
  assert.equal(env.data.get(`${key}-claim-${old}`), "cancelled");
});

test("an unresolved denied guest cancellation stays bound to A through owner denial and B/A retry", async () => {
  const env = fixture(), tab = env.tab("only"); await settle();
  const old = tab.browser.getSnapshot().guestTransfers[0].id;
  tab.denyStorage(); tab.store.mutate("remove", "guest-product"); await settle();
  tab.auth(account("a")); await settle(); assert.deepEqual(env.server.get("a"), []);
  tab.auth(account("b")); await settle(); assert.deepEqual(env.server.get("b"), []);
  tab.restoreStorage(); tab.auth(account("a")); await settle();
  assert.deepEqual(env.server.get("a"), []);
  assert.equal(env.calls.some(call => call.body?.transfers?.some(record => record.id === old)), false);
});

test("asynchronous guest wishlist tabs converge with pending replacement metadata under selective payload failure", async () => {
  const env = fixture(["guest-product"], { asyncEvents: true }), fast = env.tab("fast"), slow = env.tab("slow"); await settle();
  const key = state.shoppingKey("wishlist", null); slow.failWrites(candidate => candidate === key);
  slow.store.mutate("add", "fresh-product"); await settle(); await settle();
  const count = env.metadataWrites(); await settle(); await settle();
  assert.equal(env.metadataWrites(), count); assert.equal(env.eventOverflow(), false);
  assert.deepEqual(Array.from(fast.store.getSnapshot().items), ["guest-product"]);
  assert.deepEqual(Array.from(slow.store.getSnapshot().items), ["guest-product", "fresh-product"]);
  slow.restoreStorage(); await slow.store.retry(); await settle(); await settle();
  assert.deepEqual(Array.from(fast.store.getSnapshot().items), ["guest-product", "fresh-product"]);
  const recovered = env.metadataWrites(); await settle(); assert.equal(env.metadataWrites(), recovered);
  assert.equal(env.eventOverflow(), false);
});

test("two guest wishlist tabs retain both local picks without metadata ping-pong while both payloads fail", async () => {
  const env = fixture(["guest-product"], { asyncEvents: true }), first = env.tab("first"), second = env.tab("second"); await settle();
  const key = state.shoppingKey("wishlist", null); first.failWrites(candidate => candidate === key); second.failWrites(candidate => candidate === key);
  first.store.mutate("add", "first-local"); await settle(); second.store.mutate("add", "second-local"); await settle();
  const count = env.metadataWrites(); await settle(); await settle(); assert.equal(env.metadataWrites(), count); assert.equal(env.eventOverflow(), false);
  first.restoreStorage(); await first.store.retry(); await settle(); await settle();
  const partial = env.metadataWrites(); await settle(); assert.equal(env.metadataWrites(), partial);
  second.restoreStorage(); await second.store.retry(); await settle(); await settle();
  for (const tab of [first, second]) assert.deepEqual(Array.from(tab.store.getSnapshot().items).sort(), ["first-local", "guest-product", "second-local"]);
  const recovered = env.metadataWrites(); await settle(); assert.equal(env.metadataWrites(), recovered); assert.equal(env.eventOverflow(), false);
});

test("an archived owner cancellation cannot cancel a later deliberate guest re-selection with a fresh UUID", async () => {
  const env = fixture(), tab = env.tab("only"); await settle();
  const old = tab.browser.getSnapshot().guestTransfers[0].id;
  tab.denyStorage(); tab.store.mutate("remove", "guest-product"); await settle();
  tab.auth(account("a")); await settle(); tab.auth({ status: "guest", user: null }); await settle();
  tab.restoreStorage(); tab.store.mutate("add", "guest-product"); await settle();
  const fresh = tab.browser.getSnapshot().guestTransfers[0].id; assert.notEqual(fresh, old);
  tab.auth(account("a")); await settle(); assert.deepEqual(env.server.get("a"), ["guest-product"]);
  const transfers = env.calls.filter(call => call.body?.action === "transfer");
  assert.equal(transfers.length, 1); assert.equal(transfers[0].body.transfers[0].id, fresh);
});

test("a denied old guest cancellation cannot erase another tab's later fresh selection on guest retry", async () => {
  const env = fixture(), first = env.tab("first"), slow = env.tab("slow"); await settle();
  const old = slow.browser.getSnapshot().guestTransfers[0].id;
  slow.denyStorage(); slow.store.mutate("remove", "guest-product"); await settle();
  first.store.mutate("remove", "guest-product"); await settle(); first.store.mutate("add", "guest-product"); await settle();
  const fresh = first.browser.getSnapshot().guestTransfers[0].id; assert.notEqual(fresh, old);
  slow.restoreStorage(); await slow.store.retry(); await settle();
  assert.deepEqual(Array.from(slow.store.getSnapshot().items), ["guest-product"]);
  assert.equal(slow.browser.getSnapshot().guestTransfers[0].id, fresh);
  slow.auth(account("a")); await settle(); assert.deepEqual(env.server.get("a"), ["guest-product"]);
  assert.equal(env.calls.some(call => call.body?.transfers?.some(record => record.id === old)), false);
});
