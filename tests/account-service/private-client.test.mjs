import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import ts from "typescript";
import { readFileSync } from "node:fs";
const compile = (path, suffix = "") => ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8") + suffix, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
}).outputText;
const account = id => ({ status: "authenticated", user: { id, email: `${id}@example.test`, role: "customer" } });
const tick = () => new Promise(resolve => setImmediate(resolve));
function fixture(response = { viewerId: "a", ownerId: "a", addresses: [] }) {
  let auth = account("a");
  const listeners = new Set(), calls = [], pending = [];
  const authClient = { getAuthState: () => auth, subscribeAuth: listener => { listeners.add(listener); return () => listeners.delete(listener); } };
  const client = {};
  vm.runInNewContext(compile("../../src/lib/account/client.ts"), {
    exports: client, require: () => authClient, AbortSignal,
    fetch: (_url, options) => {
      calls.push(options);
      return response === null ? new Promise(resolve => pending.push(resolve)) : Promise.resolve(Response.json(response));
    },
  });
  return { client, authClient, calls, pending,
    auth(next) { auth = next; listeners.forEach(listener => listener()); } };
}
test("captured account precondition rejects a locally changed account before sending a stale form", async () => {
  const env = fixture(); env.auth(account("b"));
  await assert.rejects(env.client.accountRequest("/api/account/addresses", "a", { address: "A private input" }), /account changed/);
  assert.equal(env.calls.length, 0);
});
test("private responses validate viewer and customer ownership separately; staff can view another customer", async () => {
  const env = fixture();
  const bad = [
    ["/api/account/profile", { viewerId: "a", profile: { ownerId: "b" } }],
    ["/api/account/addresses", { viewerId: "b", ownerId: "b", addresses: [] }],
    ["/api/support", { viewerId: "a", ownerId: "a", requests: [{ ownerId: "b", subject: "Private B" }] }],
    ["/api/support/request", { viewerId: "a", request: { ownerId: "b" } }],
    ["/api/admin/support/request", { viewerId: "b", request: { ownerId: "a" } }],
  ];
  for (const [url, data] of bad) assert.throws(() => env.client.assertPrivateResponse(url, "a", data), /account changed/);
  assert.doesNotThrow(() => env.client.assertPrivateResponse("/api/admin/support/request", "a", { viewerId: "a", request: { ownerId: "b" } }));
});
test("private client emits the captured account header and requires explicit identity on private calls", async () => {
  const env = fixture();
  await env.client.accountRequest("/api/account/addresses", "a", { ownerId: "b" });
  assert.equal(env.calls[0].headers["X-Wishlyn-Account-ID"], "a");
  await assert.rejects(env.client.accountRequest("/api/account/addresses", null), /account changed/);
  assert.equal(env.calls.length, 1);
});
test("an A→B→A cycle cannot accept an older private response", async () => {
  const env = fixture(null);
  const request = env.client.accountRequest("/api/account/addresses", "a");
  env.auth(account("b")); env.auth(account("a"));
  env.pending[0](Response.json({ viewerId: "a", ownerId: "a", addresses: [{ address: "Older private input" }] }));
  await assert.rejects(request, /account changed/);
});
test("actual support component never renders a mismatched private response", async () => {
  const request = { id: "12345678-1234-4123-8123-123456789abc", ownerId: "b", orderId: "WISH-SYNTHETIC-B", kind: "help", subject: "B private request subject", status: "open", version: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  const env = fixture({ viewerId: "a", ownerId: "a", requests: [request], nextOffset: null });
  const states = [], effects = []; let index = 0;
  const react = { createElement: (type, props, ...children) => ({ type, props, children }),
    useState: initial => { const key = index++; if (!(key in states)) states[key] = initial; return [states[key], value => { states[key] = typeof value === "function" ? value(states[key]) : value; }]; },
    useEffect: effect => effects.push(effect), useSyncExternalStore: () => env.authClient.getAuthState() };
  const exported = {};
  vm.runInNewContext(compile("../../src/components/support/SupportWorkspace.tsx", "\nexport { SupportContent };"), {
    exports: exported, React: react, AbortController,
    require: name => name === "react" ? react : name === "next/navigation" ? { useRouter: () => ({ push: () => {} }) } : name === "@/lib/authClient" ? env.authClient : name === "@/lib/account/client" ? env.client : name.endsWith(".css") ? { default: {} } : { default: () => null },
  });
  exported.SupportContent({}); for (const effect of effects) effect(); await tick();
  index = 0;
  const tree = JSON.stringify(exported.SupportContent({}));
  assert.equal(tree.includes("B private request subject"), false);
  assert.ok(tree.includes("Your account changed"));
});
