import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import ts from "typescript";
import { webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import * as shoppingState from "../../src/lib/shopping-state.ts";
const compile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const tick = () => new Promise(resolve => setImmediate(resolve));
async function settle() { for (let i = 0; i < 8; i++) await tick(); }
const account = id => ({ status: "authenticated", user: { id, email: `${id}@example.test`, role: "customer" } });
function fixture({ imported = true, delayed = false, failTransfer = false, failAck = false, storageDenied = false } = {}) {
  let auth = { status: "guest", user: null }, locked = 0, transferFailure = failTransfer, ackFailure = false;
  const listeners = new Set(), calls = [], storage = new Map(), server = new Map(), completed = new Set();
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  storage.set(shoppingState.shoppingKey("wishlist", null), shoppingState.encodeShopping(["guest-product"]));
  storage.set(shoppingState.shoppingKey("wishlist", "a"), shoppingState.encodeShopping(["old-removed"]));
  const authClient = { getAuthState: () => auth, refreshAuthSession: async () => auth.user,
    subscribeAuth: listener => { listeners.add(listener); return () => listeners.delete(listener); } };
  const runtime = {
    window: { addEventListener: () => {} }, navigator: { locks: { request: async (_name, action) => {
      locked++; if (delayed && locked === 2) await gate; return action();
    } } },
    localStorage: {
      getItem: key => { if (storageDenied) throw new Error("Storage blocked"); return storage.get(key) ?? null; },
      setItem: (key, value) => {
        if (storageDenied || (ackFailure && key.endsWith("-guest-transfers"))) { ackFailure = false; throw new Error("Storage blocked"); }
        storage.set(key, value);
      },
      removeItem: key => { if (storageDenied) throw new Error("Storage blocked"); storage.delete(key); },
    }, crypto: webcrypto, Error, AbortSignal, AbortController, setTimeout, clearTimeout,
    fetch: async (_url, options) => {
      const id = options.headers["X-Wishlyn-Account-ID"];
      assert.equal(id, auth.user?.id);
      const body = options.body ? JSON.parse(options.body) : null;
      calls.push({ accountId: id, body });
      let data = server.get(id) || { viewerId: id, ownerId: id, items: [], version: 1, browserImported: id === "a" ? imported : true };
      if (body?.action === "transfer" && transferFailure) { transferFailure = false; return Response.json({ error: "Synthetic transfer failure" }, { status: 503 }); }
      if (body?.action === "import" && !data.browserImported) data = { ...data, items: [...new Set([...data.items, ...body.productIds])], browserImported: true };
      if (body?.action === "transfer" && !completed.has(`${id}:${body.transferId}`)) {
        completed.add(`${id}:${body.transferId}`);
        data = { ...data, items: [...new Set([...data.items, ...body.productIds])] };
        if (failAck) ackFailure = true;
      }
      if (body?.action === "add") data = { ...data, items: [...new Set([...data.items, body.productId])] };
      if (body?.action === "remove") data = { ...data, items: data.items.filter(item => item !== body.productId) };
      server.set(id, data);
      return Response.json(data);
    },
  };
  const browser = {}, client = {}, saved = {};
  vm.runInNewContext(compile("../../src/lib/shopping-store.ts"), { ...runtime, exports: browser, require: name => name === "./authClient" ? authClient : shoppingState });
  vm.runInNewContext(compile("../../src/lib/account/client.ts"), { ...runtime, exports: client, require: () => authClient });
  vm.runInNewContext(compile("../../src/lib/account/wishlist-store.ts"), { ...runtime, exports: saved,
    require: name => name === "../authClient" ? authClient : name === "../shopping-store" ? browser : name === "./client" ? client : shoppingState });
  const store = saved.savedWishlistStore;
  store.subscribe(() => {});
  return { store, browser: browser.wishlistStore, calls, storage, server, release,
    auth(next) { auth = next; listeners.forEach(listener => listener()); },
    transfers(id) { return JSON.parse(storage.get(`${shoppingState.shoppingKey("wishlist", id)}-guest-transfers`) || "[]"); } };
}
test("explicit guest picks transfer to an already-imported account without resurrecting its old browser list", async () => {
  const env = fixture(); await settle();
  assert.deepEqual(Array.from(env.store.getSnapshot().items), ["guest-product"]);
  env.auth(account("a")); await settle();
  assert.deepEqual(Array.from(env.store.getSnapshot().items), ["guest-product"]);
  assert.equal(env.calls.some(call => call.body?.action === "import"), false);
  assert.deepEqual(env.calls.find(call => call.body?.action === "transfer").body.productIds, ["guest-product"]);
  assert.deepEqual(env.transfers("a"), []);
});
test("first import waits for the actual browser migration Web Lock", async () => {
  const env = fixture({ imported: false, delayed: true }); await settle();
  env.auth(account("a")); await settle();
  assert.equal(env.calls.length, 0);
  assert.equal(env.store.getSnapshot().status, "loading");
  env.release(); await settle();
  assert.ok(env.store.getSnapshot().items.includes("guest-product"));
  const imported = env.calls.find(call => call.body?.action === "import");
  assert.ok(imported.body.productIds.includes("guest-product"));
  assert.equal(env.server.get("a").browserImported, true);
});
test("a failed guest transfer retains its account-bound key and retries successfully", async () => {
  const env = fixture({ failTransfer: true }); await settle();
  env.auth(account("a")); await settle();
  assert.equal(env.store.getSnapshot().status, "error");
  assert.match(env.store.getSnapshot().notice, /transfer failure/);
  const token = env.transfers("a")[0].id;
  await env.store.retry(); await settle();
  const transfers = env.calls.filter(call => call.body?.action === "transfer");
  assert.equal(transfers.length, 2);
  assert.ok(transfers.every(call => call.accountId === "a" && call.body.transferId === token));
  assert.deepEqual(Array.from(env.store.getSnapshot().items), ["guest-product"]);
  assert.deepEqual(env.transfers("a"), []);
});
test("an A guest transfer waiting on migration never moves to B and can resume for A", async () => {
  const env = fixture({ delayed: true }); await settle();
  env.auth(account("a")); await settle();
  env.auth(account("b")); env.release(); await settle();
  assert.deepEqual(Array.from(env.store.getSnapshot().items), []);
  assert.equal(env.calls.some(call => call.accountId === "b" && call.body?.action === "transfer"), false);
  env.auth(account("a")); await settle();
  assert.deepEqual(Array.from(env.store.getSnapshot().items), ["guest-product"]);
});
test("a replay after failed browser acknowledgement cannot resurrect a later server removal", async () => {
  const env = fixture({ failAck: true }); await settle();
  env.auth(account("a")); await settle();
  assert.equal(env.transfers("a").length, 1);
  env.store.mutate("remove", "guest-product"); await settle();
  env.auth({ status: "loading", user: null }); env.auth(account("a")); await settle();
  await env.store.retry(); await settle();
  assert.deepEqual(Array.from(env.store.getSnapshot().items), []);
  assert.equal(env.calls.filter(call => call.body?.action === "transfer").length, 2);
});
test("storage-denied guest picks survive sign-in in memory and save through the private API", async () => {
  const env = fixture({ storageDenied: true }); await settle();
  env.store.mutate("add", "guest-product"); await settle();
  env.auth(account("a")); await settle();
  assert.deepEqual(Array.from(env.store.getSnapshot().items), ["guest-product"]);
  assert.ok(env.calls.some(call => call.body?.action === "transfer"));
});
