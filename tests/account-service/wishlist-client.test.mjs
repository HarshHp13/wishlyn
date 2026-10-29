import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import ts from "typescript";
import { readFileSync } from "node:fs";
import * as shoppingState from "../../src/lib/shopping-state.ts";
const source = ts.transpileModule(
  readFileSync(
    new URL("../../src/lib/account/wishlist-store.ts", import.meta.url),
    "utf8",
  ),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
const wait = () => new Promise((resolve) => setImmediate(resolve));
const compile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const account = (id) => ({
  status: "authenticated",
  user: { id, email: `${id}@fixture.invalid`, role: "customer" },
});
function fixture(initial = account("a"), storageDenied = false) {
  let auth = initial;
  const listeners = new Set(),
    pending = [];
  const exported = {};
  const browser = {
    getSnapshot: () => ({
      items: [],
      status: "ready",
      notice: "",
      accountId: auth.user?.id || null,
    }),
    subscribe: () => () => {},
    mutate: async () => {},
    ready: async () => browser.getSnapshot(),
    acknowledgeGuestTransfer: async () => {},
  };
  const authClient = {
    getAuthState: () => auth,
    subscribeAuth: fn => { listeners.add(fn); return () => listeners.delete(fn); },
    refreshAuthSession: async () => auth.user,
  };
  const client = {};
  const runtime = {
    window: { addEventListener: () => {} },
    AbortSignal, AbortController, queueMicrotask, setTimeout, clearTimeout,
    fetch: (_url, init) => new Promise(resolve => pending.push({ init, resolve })),
  };
  vm.runInNewContext(compile("../../src/lib/account/client.ts"), {
    ...runtime, exports: client, require: () => authClient,
  });
  vm.runInNewContext(source, {
    exports: exported,
    require: (name) =>
      name === "../authClient"
        ? authClient
        : name === "../shopping-store"
          ? { wishlistStore: browser }
          : name === "./client" ? client
          : shoppingState,
    ...runtime,
    localStorage: {
      getItem: () => {
        if (storageDenied) throw new Error("Storage blocked");
        return null;
      },
      setItem: () => {
        if (storageDenied) throw new Error("Storage blocked");
      },
    },
    AbortSignal,
    AbortController,
    fetch: (_url, init) =>
      new Promise((resolve) => pending.push({ init, resolve })),
    queueMicrotask,
    setTimeout,
    clearTimeout,
  });
  const store = exported.savedWishlistStore;
  store.subscribe(() => {});
  const respond = (index, id, items, browserImported = true) =>
    pending[index].resolve(
      Response.json({ viewerId: id, ownerId: id, items, version: 1, browserImported }),
    );
  return {
    store,
    pending,
    respond,
    auth(next) {
      auth = next;
      listeners.forEach((fn) => fn());
    },
  };
}
test("stale account A load cannot overwrite verified account B even when fetch ignores cancellation", async () => {
  const env = fixture();
  await wait();
  assert.equal(env.pending.length, 1);
  env.auth(account("b"));
  await wait();
  assert.equal(env.pending.length, 2);
  env.respond(1, "b", ["b-product"]);
  await wait();
  assert.deepEqual(Array.from(env.store.getSnapshot().items), ["b-product"]);
  env.respond(0, "a", ["private-a"]);
  await wait();
  assert.deepEqual(Array.from(env.store.getSnapshot().items), ["b-product"]);
  assert.equal(env.store.getSnapshot().accountId, "b");
});
test("uncertain auth hides server data and a delayed mutation does not return after an A→B→A cycle", async () => {
  const env = fixture();
  await wait();
  env.respond(0, "a", ["a-product"]);
  await wait();
  env.store.mutate("add", "new-product");
  await wait();
  assert.equal(env.pending.length, 2);
  env.auth({ status: "loading", user: null });
  assert.equal(env.store.getSnapshot().items.length, 0);
  env.auth(account("b"));
  env.auth(account("a"));
  await wait();
  env.respond(1, "a", ["a-product", "new-product"]);
  await wait();
  assert.equal(env.store.getSnapshot().items.length, 0);
  assert.equal(env.pending.length, 3);
  env.respond(2, "a", ["current-a"]);
  await wait();
  assert.deepEqual(Array.from(env.store.getSnapshot().items), ["current-a"]);
});
test("storage-denied browser still loads and saves authenticated wishlist through the server", async () => {
  const env = fixture(account("a"), true);
  await wait();
  env.respond(0, "a", [], false);
  await wait();
  assert.equal(env.pending.length, 2);
  assert.deepEqual(JSON.parse(env.pending[1].init.body), {
    action: "import",
    productIds: [],
  });
  env.respond(1, "a", []);
  await wait();
  env.store.mutate("add", "product");
  await wait();
  assert.equal(env.pending.length, 3);
  env.respond(2, "a", ["product"]);
  await wait();
  assert.deepEqual(Array.from(env.store.getSnapshot().items), ["product"]);
});
test("two accepted wishlist changes survive a same-owner verification refresh", async () => {
  const env = fixture();
  await wait(); env.respond(0, "a", []); await wait();
  env.store.mutate("add", "first-product");
  env.store.mutate("add", "second-product");
  await wait();
  assert.equal(env.pending[1].init.headers["X-Wishlyn-Account-ID"], "a");
  env.auth({ status: "loading", user: null });
  env.auth(account("a"));
  env.respond(1, "a", ["first-product"]); await wait();
  assert.equal(JSON.parse(env.pending[2].init.body).productId, "second-product");
  env.respond(2, "a", ["first-product", "second-product"]); await wait();
  env.respond(3, "a", ["first-product", "second-product"]); await wait();
  assert.deepEqual(Array.from(env.store.getSnapshot().items), ["first-product", "second-product"]);
  assert.equal(env.store.getSnapshot().status, "ready");
});
test("ambiguous refresh pauses pending changes and resolves toggles to retry-safe desired state", async () => {
  const env = fixture();
  await wait(); env.respond(0, "a", []); await wait();
  env.store.mutate("toggle", "first-product");
  env.store.mutate("toggle", "second-product");
  await wait();
  env.auth({ status: "loading", user: null });
  env.respond(1, "a", ["first-product"]); await wait();
  assert.equal(env.pending.length, 2);
  assert.equal(env.store.getSnapshot().items.length, 0);
  env.auth(account("a")); await wait();
  assert.deepEqual(JSON.parse(env.pending[2].init.body), { action: "add", productId: "first-product" });
  env.respond(2, "a", ["first-product"]); await wait();
  assert.deepEqual(JSON.parse(env.pending[3].init.body), { action: "add", productId: "second-product" });
  env.respond(3, "a", ["first-product", "second-product"]); await wait();
  env.respond(4, "a", ["first-product", "second-product"]); await wait();
  assert.deepEqual(Array.from(env.store.getSnapshot().items), ["first-product", "second-product"]);
});
test("queued A intent is discarded on a verified B switch and never dispatched with B authority", async () => {
  const env = fixture();
  await wait(); env.respond(0, "a", []); await wait();
  env.store.mutate("add", "first-product"); env.store.mutate("add", "second-product");
  await wait(); env.auth(account("b"));
  env.respond(1, "a", ["first-product"]); await wait();
  assert.equal(env.pending.length, 3);
  assert.equal(env.pending[2].init.method, "GET");
  assert.equal(env.pending[2].init.headers["X-Wishlyn-Account-ID"], "b");
  env.respond(2, "b", ["b-product"]); await wait();
  assert.deepEqual(Array.from(env.store.getSnapshot().items), ["b-product"]);
});
