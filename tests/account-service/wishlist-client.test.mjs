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
  };
  vm.runInNewContext(source, {
    exports: exported,
    require: (name) =>
      name === "../authClient"
        ? {
            getAuthState: () => auth,
            subscribeAuth: (fn) => {
              listeners.add(fn);
              return () => listeners.delete(fn);
            },
            refreshAuthSession: async () => auth.user,
          }
        : name === "../shopping-store"
          ? { wishlistStore: browser }
          : shoppingState,
    window: { addEventListener: () => {} },
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
      Response.json({ ownerId: id, items, version: 1, browserImported }),
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
