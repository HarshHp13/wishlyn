# W2 — Trusted purchases, inventory and durable order operations

Implemented on `codex/audit-commerce`, targeting `codex/audit-remediation`. Initial integration was tested against W1 checkpoint `28c015ec7472d271ef4c020fa38c73e7cb084fb8`; final rebase and two independent exact-SHA reviews are required before merge. No approval is implied by this document.

## Result and audit mapping

The checkout now creates a durable, authenticated purchase with server prices before requesting payment. Customers can return to `/orders` and `/orders/[id]`; staff can use `/admin/orders` and `/admin/orders/[id]` for payment exceptions and sequential fulfillment/tracking updates.

| Finding | Implementation / verification |
| --- | --- |
| F03 | Server reads current variant prices, validates exact line options and saves immutable address/items/INR amounts; callbacks cannot replace these facts. Both legacy payment endpoint pairs use the same handlers. |
| F04 | Reservation and payment transitions commit atomically. A failing final event/inventory write rolls back; no verified response is returned on failed persistence. The durable pending order remains recoverable. |
| F05 | Unique provider IDs and an order-row lock give callbacks/webhooks/reconciliation one fulfillment transition. Concurrent replay tests produce one paid event and one stock effect. |
| F06 | Bounded nonempty carts, positive safe-integer quantities, aggregate variant demand, sorted row locks and database constraints prevent negative stock and concurrent overselling. |
| F07 | Permanent ownership-checked order records, signed webhook processing, provider reconciliation and protected scheduled recovery retain interrupted purchases. Legacy unverified orders are not automatically assigned to customers. |
| F08 | A shared SDK loader has a 10-second timeout, explicit failure and replacement/retry of failed script elements. Browser and unit tests cover failure before Pay and successful retry. |
| F14 | Different gift messages remain distinct line snapshots; server fees are calculated per line and quantity. Customer and merchant records show the exact gift instructions. W3 owns shared bag-state repairs. |
| F15 | Shared client/server validation accepts the supported Indian address/phone/PIN format, restricts country, associates errors and focuses the first invalid field. Format validation does not establish courier serviceability. |
| F29 | W1's versioned runner applies migration 003 on fresh/unversioned current schemas, rejects invalid legacy stock/price values transactionally, preserves legacy orders and accepts checksum-verified reruns. |
| Product gaps | Durable customer order history/printable record, admin queue/exception visibility, tracking updates, transparent reviewed totals and acknowledged quote changes. A printed record is explicitly not a statutory tax invoice. |

The current logo and storefront design are preserved. W3 owns broader header/footer/catalogue messaging, private shopping-state synchronization and discovery; W4 owns merchant catalogue editing; W5 owns profile/address management and operated support policies/requests.

## Contracts

### Requests and routes

| Route | Behavior |
| --- | --- |
| `POST /api/checkout/quote` | Cookie-authenticated, same-origin, rate-limited. Accepts `{items, shipping, requestKey}`; returns `{order}`. `requestKey` is a generated 16–100-character idempotency reference. |
| `POST /api/create-order` and `/api/razorpay/order` | Accept only the durable `orderId` as authority; provider amount/currency/receipt come from the saved order. |
| `POST /api/verify-payment` and `/api/razorpay/verify` | Require the owned `orderId` and Razorpay proof. Verify signature, provider order, amount, currency and captured state before the shared transactional transition. |
| `POST /api/razorpay/webhook` | Verify HMAC over a bounded raw body with `RAZORPAY_WEBHOOK_SECRET`; supported capture/order-paid/refund events trigger a fresh provider lookup and the same payment transition. |
| `GET /api/orders`, `GET /api/orders/[id]` | Ownership-checked, no-store, paginated history/detail with gift and shipping snapshots. |
| `POST /api/orders/[id]` | `reconcile` checks existing provider facts; `cancel` releases an unpaid reservation once. Paid cancellation is a support process, not an automatic refund. |
| `GET /api/admin/orders`, `GET /api/admin/orders/[id]` | Current administrator authority required; status filters, paginated queue and detailed events. |
| `POST /api/admin/orders/[id]` | Protected reconciliation and sequential `unfulfilled → processing → shipped → delivered` updates. Dispatch requires carrier and tracking number; HTTPS tracking link is optional. |
| `POST /api/internal/commerce-reconcile` | Constant-time Bearer check using `COMMERCE_CRON_SECRET`; expires up to 100 reservations and reconciles up to 20 recent provider-backed/uncertain orders per run. Returns counts, not customer data. |

Each input line is `{variantId, quantity, giftWrap, giftMessage?}`. Identical normalized configurations may merge; different messages remain separate. Shipping is `{firstName,lastName,phone,address,city,state,zipCode,country:'India'}`. Account email/ownership are taken from the authenticated server session, not shipping input.

### State and inventory

- `commerce_orders` contains immutable purchase facts, unique provider identities and explicit payment/reservation/fulfillment states. A database trigger protects saved commercial details and already-bound provider IDs.
- `product_variants.stock` remains total on-hand stock. `reserved_stock` represents active holds; public availability is `stock - reserved_stock`.
- Quoting reserves aggregate demand for 15 minutes in one transaction. All paths lock variant IDs in sorted order. At most three active reservations per account are allowed.
- Verified payment consumes the reservation and subtracts stock exactly once. Cancel/expiry release the reservation without subtracting physical stock.
- A captured payment after expiry/cancellation, refunded payment or extra capture goes to `review_required`. It never silently re-reserves sold stock or claims a refund is complete.
- `commerce_reservations` retain variant references. W4 must archive referenced variants/products, preserve this history and reject on-hand adjustments below reserved quantities.
- The merchant timeline records state changes and staff actor IDs. Inventory mutation and corresponding order events share the transaction.

### Ambiguous provider creation

A committed `creating` state is written **before** calling Razorpay. A timeout/crash or failed binding leaves `creating`/`uncertain`; automatic retries cannot create another provider order for that purchase.

Reconciliation uses the provider's supported receipt query, checks exact receipt/amount/currency and binds one matching provider order. Zero matches remain uncertain because a delayed response may still exist. Multiple/mismatched matches require manual review. No new payment is attempted as a substitute for checking the previous reference.

A lost browser response after committed binding simply returns the existing provider order on retry. Database locks are not held during the provider network request. Provider requests have a 10-second deadline; client requests have a 25-second deadline.

## Commercial rules and enablement

`src/lib/commerce-rules.ts` centralizes current rules: ₹350 gift wrapping per wrapped piece; ₹250 shipping below ₹3,000 subtotal; included shipping at or above ₹3,000; 3% tax rounded to the nearest rupee. Calculations/storefront payloads use integer paise. These preserve the existing formula and are **not tax/legal approval**.

Default deployment settings are fail-closed:

1. Apply approved migrations to the correct isolated environment after backup/preflight.
2. Set `COMMERCE_CHECKOUT_ENABLED=true` only when new quotes/reservations may be created.
3. Configure the environment's `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, correct application origin and the provider's automatic capture policy.
4. Verify the webhook endpoint in provider test mode, including closed-browser capture, duplicate/out-of-order delivery and post-expiry payment.
5. Obtain merchant approval for supported geography, charges/tax and service policies; then set `COMMERCE_POLICY_APPROVED=true`.
6. Set `COMMERCE_PAYMENTS_ENABLED=true` only after those checks. Existing order viewing/reconciliation remains available while new checkout/payment creation is disabled.
7. Configure a scheduler to POST to `/api/internal/commerce-reconcile` every 1–5 minutes with the separate `COMMERCE_CRON_SECRET` Bearer credential (minimum 32 random characters). Do not log it. Monitor non-2xx responses and review-queue age.

Preview deployments must remain disabled by default and must not share production credentials or database. This implementation does not rotate provider secrets, configure a real scheduler, migrate a live database, capture a real payment or deploy the integration branch.

## Validation evidence

- [Raw commerce tests](w2/tests.log): **28 passed, zero failures/skips**. Tests use isolated real PostgreSQL and actual route/service/session code; provider calls are mocked. No configured/live business database is used.
- [Production build](w2/build.log): Next.js 16.4.3 build passed with all new route generation. It used the disposable local database URL, never live credentials.
- `npm run typecheck`: passed. Targeted ESLint on all W2 source/tests: passed; one hook-dependency warning found during development was corrected before final verification.
- [Browser result](w2/browser-result.json): synthetic auth/order responses, all application mutations and provider SDK traffic intercepted. Invalid-field focus, acknowledgment gating, SDK failure/retry, persistent order reference and gift instructions passed. One provider-order request followed two SDK load attempts. 390px checkout and 320px admin detail had no horizontal page overflow.
- [Checkout](w2/checkout-mobile.png) and [admin order](w2/order-admin-mobile.png) screenshots use synthetic customer/product data. Development overlays and full-page screenshot positioning are not treated as production defects.

The first browser smoke run waited for navigation after a client-side quote transition and timed out despite reaching the correct URL. The harness was corrected to use `noWaitAfter` for those clicks; the full rerun passed. This is documented as a harness adjustment, not a product-page failure.

### Reproduce the guarded browser checks

Start a separate local development server on port 3102 with only the disposable database URL; never replace the existing user server. Open a named disposable browser, then run the saved script:

```sh
playwright-cli -s=wishlyn-commerce open about:blank
playwright-cli -s=wishlyn-commerce --raw run-code --filename=docs/implementation/w2/browser-smoke.js
playwright-cli -s=wishlyn-commerce close
```

The script intercepts every API request with synthetic responses, blocks unrecognized API/mutation/remote requests, and writes screenshots only to `/tmp/wishlyn-w2-*.png`. The browser script initially seeds the pre-W3 account cart format; adapt that fixture to the final W3 storage envelope during integrated validation.

### Reproduce the isolated database checks

Use a dedicated disposable container. Tests refuse a non-loopback host or any database name other than `wishlyn_test_commerce`; the suite deliberately recreates that database's `public` schema. Never point this variable at business data.

```sh
docker run --detach --rm --name wishlyn-commerce-test --publish 127.0.0.1::5432 \
  --env POSTGRES_PASSWORD=commerce-test-only --env POSTGRES_DB=wishlyn_test_commerce postgres:17-alpine
docker port wishlyn-commerce-test 5432/tcp
# Substitute the assigned loopback port. This password is synthetic and only for the disposable container.
COMMERCE_TEST_DATABASE_URL='postgresql://postgres:commerce-test-only@127.0.0.1:PORT/wishlyn_test_commerce' \
  npm exec tsx -- --test tests/commerce/*.test.ts
docker stop wishlyn-commerce-test
```

Without `COMMERCE_TEST_DATABASE_URL`, database tests skip explicitly; validation/HMAC/SDK tests can still run. A default test run with skipped database tests is not evidence of transaction/concurrency acceptance.

Cases include concurrent last-unit orders, duplicate quote requests, provider creation serialization, ambiguous provider success, duplicate callback/webhook/reconcile, amount/currency/capture mismatch, rollback after intermediate reservation and final paid-event failure, cancellation/expiry followed by late capture, cross-account access, refunded/extra captures, sequential tracking controls, default-off/CSRF/role/size route guards, fresh migration/rerun, and rollback from invalid legacy price data. SDK tests bound failure/timeouts and replace failed script elements.

## Release limits and operations

- Provider acceptance/capture/refund behavior remains a **sandbox and deployment gate**. Local mocks establish application contracts, not successful money movement or webhook delivery.
- Legacy `orders` are retained unchanged and are not shown as verified customer purchases. A merchant must reconcile their payment proof and ownership before an explicit import. No email-only backfill guesses identity.
- The scheduled automatic reconciliation window is the most recent 30 days. Older references remain available to explicit authorized per-order reconciliation. Monitor queue size and scheduler cadence; batches are intentionally bounded.
- A missing webhook/scheduler, prolonged provider outage or `review_required` order needs operated merchant follow-up. Do not promise dispatch or refund completion based only on the page state. Refund execution, statutory invoicing, carrier booking and outbound notifications are not simulated.
- The support destination is integrated by W5. W3 must expose available stock using the new reservation column and maintain account-safe bag state. The final integration review covers these cross-package dependencies.
- Receipt/product snapshots survive catalogue changes. Do not drop the commerce tables or decrement stock manually to recover a failed callback. Use reconciliation; preserve references and event history. After live orders exist, prefer forward repair and disabling new checkout over a destructive schema rollback.
- This package leaves the umbrella PR and `main` unmerged. Both independent reviewers must approve the final integrated W2 commit after any requested fixes.
