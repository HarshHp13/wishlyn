import test, { before, after, beforeEach, describe } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import pg from "pg";
import { NextResponse } from "next/server";
import { migrate } from "../../scripts/migrate.mjs";
import { databaseConfig } from "../../src/lib/databaseConfig.mjs";
import { query, closeDatabase } from "../../src/lib/database";
import {
  createSession,
  getSession,
  type SessionUser,
} from "../../src/lib/session";
import { hashPassword, comparePassword } from "../../src/lib/auth";
import { createPurchase } from "../../src/lib/commerce/service";
import { requestRecovery, resetPassword } from "../../src/lib/account/recovery";
import { supportDetail, replySupport } from "../../src/lib/account/support";
import {
  GET as profileGET,
  POST as profilePOST,
} from "../../src/app/api/account/profile/route";
import {
  GET as addressesGET,
  POST as addressesPOST,
} from "../../src/app/api/account/addresses/route";
import {
  GET as wishlistGET,
  POST as wishlistPOST,
} from "../../src/app/api/account/wishlist/route";
import { POST as passwordPOST } from "../../src/app/api/account/password/route";
import { POST as recoveryPOST } from "../../src/app/api/account/recovery/route";
import {
  POST as supportPOST,
  GET as supportGET,
} from "../../src/app/api/support/route";
import {
  GET as supportDetailGET,
  POST as supportDetailPOST,
} from "../../src/app/api/support/[id]/route";
import {
  GET as adminSupportGET,
  POST as adminSupportPOST,
} from "../../src/app/api/admin/support/[id]/route";
import { GET as adminSupportListGET } from "../../src/app/api/admin/support/route";
const configured = process.env.ACCOUNT_SERVICE_TEST_DATABASE_URL;
const base = configured ? new URL(configured) : null;
if (
  base &&
  (!["localhost", "127.0.0.1", "[::1]"].includes(base.hostname) ||
    !/^\/wishlyn_[a-z0-9_]*account_service_test$/.test(base.pathname))
)
  throw new Error(
    "Use an explicit disposable loopback wishlyn_*account_service_test database.",
  );
const name = `wishlyn_${randomUUID().replaceAll("-", "")}_account_service_test`,
  url = base ? new URL(base) : null;
if (url) {
  url.pathname = `/${name}`;
  process.env.DATABASE_URL = url.toString();
  process.env.DB_ALLOW_LOCAL_PLAINTEXT = "true";
  Object.assign(process.env, { NODE_ENV: "test" });
  process.env.APP_ORIGIN = "http://localhost:3055";
}
const origin = "http://localhost:3055",
  pass = "Fixture account password";
const a = {
    id: "fixture-a",
    email: "a@example.test",
    role: "customer" as const,
  },
  b = { id: "fixture-b", email: "b@example.test", role: "customer" as const },
  admin = {
    id: "fixture-admin",
    email: "admin@example.test",
    role: "admin" as const,
  };
const address = {
  label: "Home",
  firstName: "Asha",
  lastName: "Fixture",
  phone: "9876543210",
  address: "123 Synthetic Test Lane",
  city: "Mumbai",
  state: "Maharashtra",
  zipCode: "400001",
  country: "India",
};
let cookies: Record<string, string> = {},
  created = false;
function req(
  path: string,
  body?: unknown,
  user: SessionUser = a,
  originHeader = origin,
  intendedAccount: string | null = user.id,
) {
  return new Request(origin + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      cookie: cookies[user.id],
      ...(intendedAccount ? { "X-Wishlyn-Account-ID": intendedAccount } : {}),
      ...(body === undefined
        ? {}
        : { origin: originHeader, "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const context = (id: string) => ({ params: Promise.resolve({ id }) });
async function order() {
  return createPurchase(a, {
    requestKey: randomUUID(),
    shipping: address,
    items: [
      { variantId: "variant", quantity: 1, giftWrap: false, giftMessage: "" },
    ],
  });
}
describe(
  "account/service PostgreSQL ownership and recovery",
  { skip: !configured },
  () => {
    before(async () => {
      const c = new pg.Client(databaseConfig(configured));
      await c.connect();
      try {
        await c.query(`CREATE DATABASE ${name}`);
        created = true;
      } finally {
        await c.end();
      }
      await migrate(url!.toString(), true);
    });
    after(async () => {
      await closeDatabase();
      if (created) {
        const c = new pg.Client(databaseConfig(configured));
        await c.connect();
        try {
          await c.query(`DROP DATABASE ${name}`);
        } finally {
          await c.end();
        }
      }
    });
    beforeEach(async () => {
      await query("TRUNCATE profiles,categories CASCADE");
      await query("TRUNCATE request_budgets");
      const hash = await hashPassword(pass);
      for (const user of [a, b, admin])
        await query(
          "INSERT INTO profiles(id,email,password_hash,role) VALUES($1,$2,$3,$4)",
          [user.id, user.email, hash, user.role],
        );
      await query(
        "INSERT INTO categories(id,name,slug) VALUES('test','Test','test')",
      );
      await query(
        "INSERT INTO products(id,title,description,category_id,images) VALUES('product','Fixture piece','Test only','test',ARRAY['/editorial/gold-leaf.webp'])",
      );
      await query(
        "INSERT INTO product_variants(id,product_id,metal_type,purity,price,stock) VALUES('variant','product','Fixture','Plated',199,10)",
      );
      cookies = {};
      for (const user of [a, b, admin]) {
        const r = NextResponse.json({});
        await createSession(user.id, r);
        cookies[user.id] =
          `wishlyn-session=${r.cookies.get("wishlyn-session")!.value}`;
      }
      delete process.env.ACCOUNT_RECOVERY_ENABLED;
    });
    test("current migrations rerun and account profile persists without revoking its session", async () => {
      assert.deepEqual(await migrate(url!.toString(), true), []);
      const saved = await profilePOST(
        req("/api/account/profile", {
          firstName: "Asha",
          lastName: "Fixture",
          version: 1,
          ownerId: b.id,
        }),
      );
      assert.equal(saved.status, 200);
      assert.equal((await saved.json()).profile.ownerId, a.id);
      assert.equal((await getSession(req("/api/auth/me")))?.id, a.id);
      assert.equal(
        (await (await profileGET(req("/api/account/profile"))).json()).profile
          .firstName,
        "Asha",
      );
      assert.equal(
        (
          await (
            await profileGET(req("/api/account/profile", undefined, b))
          ).json()
        ).profile.firstName,
        "",
      );
    });
    test("intended-account preconditions reject stale cookie reads and every new owned write before persistence", async () => {
      const purchase = await order();
      const payload = { orderId: purchase.id, kind: "help", subject: "Synthetic subject", message: "A synthetic request for this purchase.", requestKey: randomUUID() };
      const created = (await (await supportPOST(req("/api/support", payload))).json()).request;
      const stale = (path: string, body?: unknown) => req(path, body, b, origin, a.id);
      for (const [handler, path] of [[profileGET, "/api/account/profile"], [addressesGET, "/api/account/addresses"], [wishlistGET, "/api/account/wishlist"], [supportGET, "/api/support"]] as const) {
        const response = await handler(stale(path));
        assert.equal(response.status, 409);
        assert.equal((await response.json()).code, "account_changed");
        assert.equal((await handler(req(path, undefined, a, origin, null))).status, 409);
      }
      assert.equal((await profilePOST(stale("/api/account/profile", { ownerId: a.id, firstName: "A edited", lastName: "Fixture", version: 1 }))).status, 409);
      assert.equal((await addressesPOST(stale("/api/account/addresses", address))).status, 409);
      assert.equal((await wishlistPOST(stale("/api/account/wishlist", { action: "add", productId: "product" }))).status, 409);
      assert.equal((await passwordPOST(stale("/api/account/password", { currentPassword: pass, newPassword: "Synthetic changed password" }))).status, 409);
      assert.equal((await supportPOST(stale("/api/support", { ...payload, requestKey: randomUUID() }))).status, 409);
      assert.equal((await supportDetailGET(stale("/api/support/" + created.id), context(created.id))).status, 409);
      assert.equal((await supportDetailPOST(stale("/api/support/" + created.id, { version: 1, message: "Stale synthetic reply" }), context(created.id))).status, 409);
      assert.equal((await adminSupportListGET(req("/api/admin/support", undefined, admin, origin, a.id))).status, 409);
      assert.equal((await adminSupportPOST(req("/api/admin/support/" + created.id, { version: 1, message: "Stale admin reply", status: "resolved" }, admin, origin, a.id), context(created.id))).status, 409);
      assert.equal((await query("SELECT * FROM account_details")).rowCount, 0);
      assert.equal((await query("SELECT * FROM account_addresses")).rowCount, 0);
      assert.equal((await query("SELECT * FROM account_wishlists")).rowCount, 0);
      assert.equal((await query("SELECT * FROM support_requests")).rowCount, 1);
      assert.equal((await query("SELECT * FROM support_request_events")).rowCount, 1);
      assert.equal((await getSession(req("/api/auth/me", undefined, b)))?.id, b.id);
      assert.equal(await comparePassword(pass, (await query("SELECT password_hash FROM profiles WHERE id=$1", [b.id])).rows[0].password_hash), true);
      const viewed = await (await adminSupportGET(req("/api/admin/support/" + created.id, undefined, admin), context(created.id))).json();
      assert.equal(viewed.viewerId, admin.id);
      assert.equal(viewed.request.ownerId, a.id);
      const lower = req("/api/account/profile");
      const headers = new Headers(lower.headers);
      headers.delete("X-Wishlyn-Account-ID"); headers.set("x-wishlyn-account-id", a.id);
      assert.equal((await profileGET(new Request(lower, { headers }))).status, 200);
    });
    test("explicit guest transfer is idempotent independently of legacy import and never resurrects a later removal", async () => {
      await wishlistPOST(req("/api/account/wishlist", { action: "import", productIds: [] }));
      const transfer = { action: "transfer", transferId: randomUUID(), productIds: ["product"] };
      const results = await Promise.all([wishlistPOST(req("/api/account/wishlist", transfer)), wishlistPOST(req("/api/account/wishlist", transfer))]);
      assert.ok(results.every(response => response.status === 200));
      assert.equal((await query("SELECT * FROM account_wishlist_transfers")).rowCount, 1);
      await wishlistPOST(req("/api/account/wishlist", { action: "remove", productId: "product" }));
      const replay = await wishlistPOST(req("/api/account/wishlist", transfer));
      assert.deepEqual((await replay.json()).items, []);
      assert.equal((await wishlistPOST(req("/api/account/wishlist", { ...transfer, productIds: [] }))).status, 409);
      const bList = await (await wishlistGET(req("/api/account/wishlist", undefined, b))).json();
      assert.deepEqual(bList.items, []);
      assert.equal(bList.browserImported, false);
    });
    test("stale concurrent profile edits preserve exactly one revision", async () => {
      const rs = await Promise.all([
        profilePOST(
          req("/api/account/profile", {
            firstName: "One",
            lastName: "Fixture",
            version: 1,
          }),
        ),
        profilePOST(
          req("/api/account/profile", {
            firstName: "Two",
            lastName: "Fixture",
            version: 1,
          }),
        ),
      ]);
      assert.deepEqual(rs.map((r) => r.status).sort(), [200, 409]);
      assert.equal(
        (
          await query("SELECT version FROM account_details WHERE owner_id=$1", [
            a.id,
          ])
        ).rows[0].version,
        2,
      );
    });
    test("address create/read/edit/delete is owned and optimistic versions prevent stale overwrite", async () => {
      assert.equal(
        (
          await addressesPOST(
            req("/api/account/addresses", { ...address, ownerId: b.id }),
          )
        ).status,
        200,
      );
      const stored = (
        await (await addressesGET(req("/api/account/addresses"))).json()
      ).addresses[0];
      assert.equal(
        (
          await (
            await addressesGET(req("/api/account/addresses", undefined, b))
          ).json()
        ).addresses.length,
        0,
      );
      assert.equal(
        (
          await addressesPOST(
            req("/api/account/addresses", { ...stored, label: "Stolen" }, b),
          )
        ).status,
        409,
      );
      const rs = await Promise.all(
        ["One", "Two"].map((label) =>
          addressesPOST(req("/api/account/addresses", { ...stored, label })),
        ),
      );
      assert.deepEqual(rs.map((r) => r.status).sort(), [200, 409]);
      assert.equal(
        (
          await addressesPOST(
            req("/api/account/addresses", {
              action: "delete",
              id: stored.id,
              version: 1,
            }),
          )
        ).status,
        409,
      );
      assert.equal(
        (
          await addressesPOST(
            req("/api/account/addresses", {
              action: "delete",
              id: stored.id,
              version: 2,
            }),
          )
        ).status,
        200,
      );
    });
    test("invalid addresses and cross-origin or anonymous writes do not persist", async () => {
      assert.equal(
        (
          await addressesPOST(
            req("/api/account/addresses", { ...address, country: "USA" }),
          )
        ).status,
        400,
      );
      assert.equal(
        (
          await addressesPOST(
            req("/api/account/addresses", address, a, "https://other.example"),
          )
        ).status,
        403,
      );
      const anonymous = new Request(origin + "/api/account/addresses", {
        method: "POST",
        headers: { origin, "Content-Type": "application/json" },
        body: JSON.stringify(address),
      });
      assert.equal((await addressesPOST(anonymous)).status, 401);
      assert.equal(
        (await query("SELECT * FROM account_addresses")).rowCount,
        0,
      );
    });
    test("wishlist import is once-only, atomic concurrent operations converge and another account stays isolated", async () => {
      const first = await wishlistPOST(
        req("/api/account/wishlist", {
          action: "import",
          productIds: ["product"],
          ownerId: b.id,
        }),
      );
      assert.equal(first.status, 200);
      assert.deepEqual((await first.json()).items, ["product"]);
      await wishlistPOST(
        req("/api/account/wishlist", {
          action: "remove",
          productId: "product",
        }),
      );
      await wishlistPOST(
        req("/api/account/wishlist", {
          action: "import",
          productIds: ["product"],
        }),
      );
      assert.deepEqual(
        (await (await wishlistGET(req("/api/account/wishlist"))).json()).items,
        [],
      );
      const rs = await Promise.all([
        wishlistPOST(
          req("/api/account/wishlist", { action: "add", productId: "product" }),
        ),
        wishlistPOST(
          req("/api/account/wishlist", { action: "add", productId: "product" }),
        ),
      ]);
      assert.ok(rs.every((r) => r.status === 200));
      assert.deepEqual(
        (await (await wishlistGET(req("/api/account/wishlist"))).json()).items,
        ["product"],
      );
      assert.deepEqual(
        (
          await (
            await wishlistGET(req("/api/account/wishlist", undefined, b))
          ).json()
        ).items,
        [],
      );
    });
    test("password change requires current credential, rejects UTF-8 truncation and revokes all sessions", async () => {
      assert.equal(
        (
          await passwordPOST(
            req("/api/account/password", {
              currentPassword: "wrong",
              newPassword: "Changed password",
            }),
          )
        ).status,
        400,
      );
      assert.equal(
        (
          await passwordPOST(
            req("/api/account/password", {
              currentPassword: pass,
              newPassword: "😀".repeat(20),
            }),
          )
        ).status,
        400,
      );
      const response = await passwordPOST(
        req("/api/account/password", {
          currentPassword: pass,
          newPassword: "Changed password",
        }),
      );
      assert.equal(response.status, 200);
      assert.match(response.headers.get("set-cookie")!, /Max-Age=0/);
      assert.equal(await getSession(req("/api/auth/me")), null);
      assert.equal(
        (await query("SELECT * FROM auth_sessions WHERE profile_id=$1", [a.id]))
          .rowCount,
        0,
      );
      assert.equal(
        await comparePassword(
          "Changed password",
          (
            await query("SELECT password_hash FROM profiles WHERE id=$1", [
              a.id,
            ])
          ).rows[0].password_hash,
        ),
        true,
      );
    });
    test("password transaction rollback leaves old password and sessions usable", async () => {
      await query(
        "CREATE FUNCTION w5_fail_password() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic token cleanup failure'; END $$",
      );
      await query(
        "CREATE TRIGGER w5_fail_password BEFORE DELETE ON auth_sessions FOR EACH ROW EXECUTE FUNCTION w5_fail_password()",
      );
      try {
        assert.equal(
          (
            await passwordPOST(
              req("/api/account/password", {
                currentPassword: pass,
                newPassword: "Changed password",
              }),
            )
          ).status,
          503,
        );
        assert.equal(
          await comparePassword(
            pass,
            (
              await query("SELECT password_hash FROM profiles WHERE id=$1", [
                a.id,
              ])
            ).rows[0].password_hash,
          ),
          true,
        );
        assert.equal((await getSession(req("/api/auth/me")))?.id, a.id);
      } finally {
        await query(
          "DROP TRIGGER w5_fail_password ON auth_sessions; DROP FUNCTION w5_fail_password()",
        );
      }
    });
    test("disabled recovery reports unavailable and never returns a token", async () => {
      const response = await recoveryPOST(
        req("/api/account/recovery", { email: a.email }),
      );
      assert.equal(response.status, 503);
      const json = await response.json();
      assert.equal(json.token, undefined);
      assert.equal(
        (await query("SELECT * FROM account_recovery_tokens")).rowCount,
        0,
      );
    });
    test("configured recovery hashes tokens, makes them single-use and invalidates old sessions", async () => {
      process.env.ACCOUNT_RECOVERY_ENABLED = "true";
      process.env.APP_ORIGIN = "https://store.example.test";
      process.env.RECOVERY_EMAIL_FROM = "store@example.test";
      process.env.RECOVERY_EMAIL_API_KEY = "fixture-only-key";
      const original = globalThis.fetch;
      let delivered = "";
      globalThis.fetch = (async (_url, init) => {
        const payload = JSON.parse(String(init?.body));
        delivered = payload.text;
        return Response.json({ id: "fixture-mail" });
      }) as typeof fetch;
      try {
        await requestRecovery(a.email);
        const token = delivered.match(/#token=([a-f0-9]{64})/)![1];
        const rows = await query(
          "SELECT token_hash,delivery_state FROM account_recovery_tokens",
        );
        assert.equal(
          rows.rows[0].token_hash,
          createHash("sha256").update(token).digest("hex"),
        );
        assert.equal(rows.rows[0].delivery_state, "sent");
        const rs = await Promise.allSettled([
          resetPassword(token, "Reset credential one"),
          resetPassword(token, "Reset credential two"),
        ]);
        assert.equal(rs.filter((r) => r.status === "fulfilled").length, 1);
        assert.equal(await getSession(req("/api/auth/me")), null);
        await assert.rejects(resetPassword(token, "Reset credential three"));
      } finally {
        globalThis.fetch = original;
        process.env.APP_ORIGIN = origin;
      }
    });
    test("failed delivery invalidates token and unknown account has same acceptance response", async () => {
      process.env.ACCOUNT_RECOVERY_ENABLED = "true";
      process.env.APP_ORIGIN = "https://store.example.test";
      process.env.RECOVERY_EMAIL_FROM = "store@example.test";
      process.env.RECOVERY_EMAIL_API_KEY = "fixture-only-key";
      const original = globalThis.fetch;
      let delivered = "";
      globalThis.fetch = (async (_url, init) => {
        delivered = JSON.parse(String(init?.body)).text;
        return Response.json({ error: "fixture rejection" }, { status: 500 });
      }) as typeof fetch;
      try {
        await requestRecovery(a.email);
        const token = delivered.match(/#token=([a-f0-9]{64})/)![1];
        await assert.rejects(resetPassword(token, "Reset credential"));
        const row = (
          await query(
            "SELECT consumed_at,delivery_state FROM account_recovery_tokens",
          )
        ).rows[0];
        assert.equal(row.delivery_state, "failed");
        assert.ok(row.consumed_at);
        await requestRecovery("unknown@example.test");
        assert.equal(
          (await query("SELECT * FROM account_recovery_tokens")).rowCount,
          1,
        );
      } finally {
        globalThis.fetch = original;
        process.env.APP_ORIGIN = origin;
      }
    });
    test("expired and password-version-mismatched recovery tokens are rejected", async () => {
      const token = "a".repeat(64),
        hash = createHash("sha256").update(token).digest("hex");
      await query(
        "INSERT INTO account_recovery_tokens(token_hash,owner_id,session_version,expires_at,delivery_state) VALUES($1,$2,1,now()-interval '1 minute','sent')",
        [hash, a.id],
      );
      await assert.rejects(resetPassword(token, "Reset credential"));
      await query(
        "UPDATE account_recovery_tokens SET expires_at=now()+interval '1 minute' WHERE token_hash=$1",
        [hash],
      );
      await query("UPDATE profiles SET password_hash=$2 WHERE id=$1", [
        a.id,
        await hashPassword("Elsewhere changed"),
      ]);
      await assert.rejects(resetPassword(token, "Reset credential"));
    });
    test("support requests bind owned durable orders, retry once, and never alter payment/fulfillment", async () => {
      const purchase = await order(),
        payload = {
          orderId: purchase.id,
          kind: "return",
          subject: "Review return request",
          message: "Please review this synthetic request.",
          requestKey: randomUUID(),
        };
      const rs = await Promise.all([
        supportPOST(req("/api/support", payload)),
        supportPOST(req("/api/support", payload)),
      ]);
      assert.ok(rs.every((r) => r.status === 201));
      const created = (await rs[0].json()).request;
      assert.equal((await query("SELECT * FROM support_requests")).rowCount, 1);
      assert.equal(
        (await query("SELECT * FROM support_request_events")).rowCount,
        1,
      );
      assert.equal(
        (
          await supportPOST(
            req("/api/support", { ...payload, requestKey: randomUUID() }, b),
          )
        ).status,
        404,
      );
      assert.equal(
        (
          await supportDetailGET(
            req("/api/support/" + created.id, undefined, b),
            context(created.id),
          )
        ).status,
        404,
      );
      assert.equal(
        (await (await supportGET(req("/api/support", undefined, b))).json())
          .requests.length,
        0,
      );
      assert.equal(
        (
          await query(
            "SELECT status,fulfillment_status FROM commerce_orders WHERE id=$1",
            [purchase.id],
          )
        ).rows[0].status,
        "pending_payment",
      );
    });
    test("staff replies have history, customer replies reopen resolved requests and stale updates fail", async () => {
      const purchase = await order();
      const created = (
        await (
          await supportPOST(
            req("/api/support", {
              orderId: purchase.id,
              kind: "help",
              subject: "Delivery question",
              message: "Please confirm details for this order.",
              requestKey: randomUUID(),
            }),
          )
        ).json()
      ).request;
      assert.equal(
        (
          await adminSupportGET(
            req("/api/admin/support/" + created.id, undefined, a),
            context(created.id),
          )
        ).status,
        403,
      );
      const replied = await adminSupportPOST(
        req(
          "/api/admin/support/" + created.id,
          {
            message: "This synthetic request is reviewed.",
            version: 1,
            status: "resolved",
          },
          admin,
        ),
        context(created.id),
      );
      assert.equal(replied.status, 200);
      assert.equal((await replied.json()).request.events.length, 2);
      assert.equal(
        (
          await supportDetailPOST(
            req("/api/support/" + created.id, {
              message: "I have a follow-up question.",
              version: 1,
            }),
            context(created.id),
          )
        ).status,
        409,
      );
      const reopened = await supportDetailPOST(
        req("/api/support/" + created.id, {
          message: "I have a follow-up question.",
          version: 2,
        }),
        context(created.id),
      );
      assert.equal(reopened.status, 200);
      assert.equal((await reopened.json()).request.status, "open");
      assert.equal(
        (
          await supportDetailPOST(
            req("/api/support/" + created.id, {
              message: "Try to change state.",
              version: 3,
              status: "resolved",
            }),
            context(created.id),
          )
        ).status,
        403,
      );
    });
    test("concurrent replies and detail reads preserve a coherent version, status and event history", async () => {
      const purchase = await order();
      let state = (
        await (
          await supportPOST(
            req("/api/support", {
              orderId: purchase.id,
              kind: "help",
              subject: "Concurrent conversation",
              message: "Synthetic coherence test request.",
              requestKey: randomUUID(),
            }),
          )
        ).json()
      ).request;
      const id = state.id;
      await Promise.all([
        (async () => {
          for (let index = 0; index < 20; index++)
            state = await replySupport(
              req("/api/admin/support/" + id, {}, admin),
              admin,
              true,
              id,
              {
                version: state.version,
                message: "Synthetic reply " + index,
                status: index % 2 ? "resolved" : "in_progress",
              },
            );
        })(),
        (async () => {
          for (let index = 0; index < 40; index++) {
            const detail = await supportDetail(a, false, id);
            assert.equal(detail.events!.length, detail.version);
            assert.equal(detail.events!.at(-1)!.status, detail.status);
          }
        })(),
      ]);
      assert.equal(state.version, 21);
    });
    test("support event failure rolls back request creation and permits same-key retry", async () => {
      const purchase = await order(),
        payload = {
          orderId: purchase.id,
          kind: "help",
          subject: "Rollback test",
          message: "This request should roll back.",
          requestKey: randomUUID(),
        };
      await query(
        "CREATE FUNCTION w5_fail_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic support failure'; END $$",
      );
      await query(
        "CREATE TRIGGER w5_fail_event BEFORE INSERT ON support_request_events FOR EACH ROW EXECUTE FUNCTION w5_fail_event()",
      );
      try {
        assert.equal(
          (await supportPOST(req("/api/support", payload))).status,
          503,
        );
        assert.equal(
          (await query("SELECT * FROM support_requests")).rowCount,
          0,
        );
      } finally {
        await query(
          "DROP TRIGGER w5_fail_event ON support_request_events; DROP FUNCTION w5_fail_event()",
        );
      }
      assert.equal(
        (await supportPOST(req("/api/support", payload))).status,
        201,
      );
    });
  },
);
