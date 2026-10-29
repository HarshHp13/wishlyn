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
function fixture(guestItems = ["guest-product"]) {
  const data = new Map(), tabs = [], server = new Map(), done = new Set(), calls = [];
  data.set(state.shoppingKey("wishlist", null), state.encodeShopping(guestItems));
  let lock = Promise.resolve();
  function tab(name) {
    let auth = { status: "guest", user: null };
    const listeners = new Set(), events = new Map(), browser = {}, client = {}, saved = {};
    const dispatch = key => events.get("storage")?.forEach(listener => listener({ key }));
    const storage = {
      getItem: key => data.get(key) ?? null,
      setItem: (key, value) => { data.set(key, value); for (const other of tabs) if (other.name !== name) other.dispatch(key); },
      removeItem: key => { data.delete(key); for (const other of tabs) if (other.name !== name) other.dispatch(key); },
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
      auth(next) { auth = next; listeners.forEach(listener => listener()); } };
    tabs.push(result); result.store.subscribe(() => {}); return result;
  }
  return { tab, calls, server };
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
