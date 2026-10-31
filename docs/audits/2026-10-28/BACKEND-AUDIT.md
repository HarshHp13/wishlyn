# Wishlyn backend audit

Date: 28 October 2026 (Asia/Kolkata). Workspace: `/home/infinityzer0/Playground/eCom`. Scope: the current working tree, including the existing redesign. Status: revised for R0 comments and accepted by the independent reviewer in round R3; see REVIEW-LOG.md. (Acceptance status updated by the coordinating auditor.)

## Assessment

The storefront compiles and its normal catalogue reads work, but the backend is not ready to safely process real orders. Its most serious problems are payment/cart trust, repeated fulfillment, success responses after failed persistence, and missing stock enforcement. Several less severe failures hide database outages or leave partially created catalogue records. The issue is observable business logic, not merely TypeScript or lint quality.

This audit changed no application code and created no live accounts, gateway orders, merchant orders, subscribers, uploads or catalogue records. It did not run seeds or migrations. Payment and mutation proofs executed the actual route source in a Node VM with an in-memory database, a fake gateway and a synthetic signing key. A separate **read-only** query inspected the database configured by local environment files; its identity as a production database was not established. No customer/order contents or secret values were collected.

The parent baseline reports `npm run build` passing, including TypeScript, and full `npm run lint` failing with 23 errors and 10 warnings. See [BASELINE.md](./BASELINE.md). Passing compilation does not validate the money or inventory flow, and lint findings are not treated as runtime failures. Prior fresh-session checks of all 25 product pages and the centered symbol-only logo remain valid; they are not listed as unresolved defects.

## Evidence and method

- [isolated-route-probes.mjs](./backend/isolated-route-probes.mjs) transpiles current TypeScript route source and restricts imports to mocks and local Node crypto. No environment files or network are used. [isolated-route-results.json](./backend/isolated-route-results.json) stores 23 cases. Run from the repository root with `node docs/audits/2026-10-28/backend/isolated-route-probes.mjs`.
- [schema-readonly.mjs](./backend/schema-readonly.mjs) records metadata and aggregate catalogue counts only. [schema-snapshot.json](./backend/schema-snapshot.json) contains columns, constraints, indexes and non-internal trigger inventory from the configured database. It records 25 products, 25 variants, no products without variants, no nonpositive prices and no negative stock at audit time. These healthy current rows do not protect future writes.
- Installed Next.js 16.2.9 guides reviewed: Route Handlers (`03-api-reference/03-file-conventions/route.md`), Fetching Data (`01-getting-started/06-fetching-data.md`) and Caching Without Cache Components (`02-guides/caching-without-cache-components.md`). Promise-based route parameters are already awaited correctly; no obsolete synchronous-params finding is raised.
- Source reasoning is labeled separately from isolated execution. The mock gateway proves which request the application would send; it does not prove remote acceptance, real capture or settlement. A synthetic valid signature proves the verification handler's control flow, not a live gateway compromise.

## Coverage

All 11 API route files and their 13 handlers were inspected.

| API | Inspected behavior | Findings / result |
| --- | --- | --- |
| `POST /api/create-order` | Active checkout creator; amount precedence, cart lookup, INR arithmetic, gateway request, provider errors | BE-001, BE-004, BE-006 |
| `POST /api/verify-payment` | Active checkout verifier; aliases, HMAC, order construction, stock and response | BE-001–BE-006 |
| `POST /api/razorpay/order` | Alternate exposed creator with similar but drifting validation | Same payment findings; not the route currently called by checkout |
| `POST /api/razorpay/verify` | Alternate exposed verifier | Same verification findings; separately exercised by mocks |
| `POST /api/auth/signup` | Validation, lookup/create race, role grant, hashing/signing | BE-012; security owns public admin escalation |
| `POST /api/auth/login` | Validation, database lookup, password comparison, session issue/errors | BE-009, BE-012; security owns throttling/session risks |
| `GET /api/auth/me` | Bearer extraction and JWT verification; no profile refresh | Security owns token trust/revocation findings |
| `GET /api/admin/product` | Admin check, database reads and DTO mapping | BE-009; security independently validates access-control root causes |
| `POST /api/admin/product` | Admin check, product/variant schema, writes and partial result | BE-007, BE-008 |
| `DELETE /api/admin/product` | Admin check, ID validation, sequential variant/product deletion | BE-007 |
| `POST /api/cloudinary/upload` | Admin check, file-size/type gates, signed/unsigned provider calls, fallback/errors | BE-013; security owns credential/MIME/budget concerns |
| `POST /api/newsletter` | Input validation, duplicate handling, subscriber persistence | BE-010 |
| `POST /api/wishlist-products` | 50-ID cap, string filtering, database mapping | BE-009; the explicit cap is a positive control |

Also reviewed: all `src/lib/neon.ts` helpers, `src/data/db.ts` mappings; root/product server-page reads; checkout/cart/profile/admin integration; `src/lib/auth.ts`, `authClient.ts`, `cloudinary.ts`, `productImages.ts`; Razorpay declaration; `neon_seed.sql`, `supabase/seed.sql`; every script in `scripts/`; `next.config.ts`, `vercel.json`, package scripts and README.

Database model coverage: categories/products foreign key, product-to-variant relation and cascade, numeric money and integer stock, profile email/role constraints, JSONB order contents and payment references, newsletter uniqueness. Parameterized SQL is used for runtime values. Relevant indexes exist for product categories, variant product IDs and order email lookups. No SQL-injection claim is made from those queries.

Security-specific issues are cross-referenced, not independently counted again: public admin signup (SEC-001), predictable configured JWT key (SEC-002), tracked provider credentials (SEC-003), stale/revocable session trust (SEC-007), storage/privacy (SEC-008/009), API budgets (SEC-010), dependencies (SEC-011), conditional maintenance TLS settings (SEC-012), and environment-copy deployment behavior (SEC-013). Review [SECURITY-AUDIT.md](./SECURITY-AUDIT.md).

## Findings index

P0 = critical broad compromise; P1 = high impact and should block real commerce; P2 = medium functional/reliability defect; P3 = lower-priority efficiency/maintenance concern. These are audit priorities, not external vulnerability scores.

| ID | Priority | Finding | Evidence mode |
| --- | --- | --- | --- |
| BE-001 | P1 | Gateway payment is not bound to a server-owned cart and amount | Source + isolated creator/verifier execution; overlaps SEC-004 |
| BE-002 | P1 | Order or stock persistence can fail while checkout receives confirmation | Source + isolated failure injection |
| BE-003 | P1 | One payment proof can drive repeated fulfillment attempts | Source + isolated replay + configured DB metadata; overlaps SEC-005 |
| BE-004 | P1 | Invalid/unavailable carts can be charged and stock is not reserved/enforced | Source + isolated invalid-cart cases; overlaps SEC-006 |
| BE-005 | P2 | Mixed gift-wrap lines for one variant corrupt stored totals | Source + isolated arithmetic result |
| BE-006 | P1 | Payment fulfillment depends on an unrecoverable browser callback | Static end-to-end flow; no real provider event tested |
| BE-007 | P2 | Catalogue mutations are not atomic and offer no usable partial-save recovery | Source + corrected isolated admin failure injection |
| BE-008 | P2 | Admin product creation accepts variants belonging to other products | Source + isolated relationship mismatch |
| BE-009 | P2 | Database failures are represented as empty catalogues, missing products or invalid credentials | Static error/data flow |
| BE-010 | P2 | Newsletter endpoint reports success after a failed insert | Source + isolated failed helper |
| BE-011 | P2 | Seed and migration entrypoints disagree with the current schema | Static SQL/script comparison + configured DB metadata |
| BE-012 | P2 | Email identity is inconsistently normalized and not uniquely enforced canonically | Static race/identity analysis + configured DB metadata |
| BE-013 | P2 | Missing upload configuration silently substitutes unrelated catalogue imagery | Static conditional failure path |
| BE-014 | P3 | Product rendering reads the whole catalogue to choose one related product | Static query/data flow; no present latency claim |

### BE-001 — Gateway payment is not bound to a server-owned cart and amount

**Priority:** P1. **Confidence:** high. **Cross-domain:** SEC-004; consolidate once.

**Evidence:** [checkout/page.tsx:154](/home/infinityzer0/Playground/eCom/src/app/checkout/page.tsx:154) sends the client total and items to `/api/create-order`; [create-order/route.ts:32](/home/infinityzer0/Playground/eCom/src/app/api/create-order/route.ts:32) gives any numeric `amount` precedence over the database-priced path. The alternate creator does the same at [razorpay/order/route.ts:26](/home/infinityzer0/Playground/eCom/src/app/api/razorpay/order/route.ts:26). [verify-payment/route.ts:50](/home/infinityzer0/Playground/eCom/src/app/api/verify-payment/route.ts:50) verifies only the HMAC of provider order/payment identifiers, then accepts freshly supplied `items`, `shipping` and merchant `orderId` at line 66. It does not retrieve the gateway amount/status/currency or a persisted merchant cart. The alternate verifier repeats the pattern at [razorpay/verify/route.ts:41](/home/infinityzer0/Playground/eCom/src/app/api/razorpay/verify/route.ts:41).

**Proof / trigger:** both creators returned 200 and passed **100 paise** to the fake gateway even with 50 units of a ₹100 fixture. Both verifiers accepted a synthetic valid provider signature and unrelated fulfillment payload. The malicious real-world prerequisite is a valid low-value payment proof for the merchant; no real payment or fulfillment was made during the audit. The active normal checkout also prices from persisted browser cart data, so catalogue price changes after adding an item can cause an innocent price mismatch.

**Impact:** underpayment can be treated as a confirmed expensive order; changed items/address can be associated with a genuine payment. Correct signature verification alone does not establish the order's commercial meaning.

**Remediation:** generate an authenticated or securely guest-bound server order, validate and freeze its cart/prices/currency/shipping/tax, persist the provider ID, and create the gateway order from that snapshot. Verification must load the trusted order and validate expected provider amount/currency/payment state. Remove or consistently route alternate payment endpoints through the same service.

**Acceptance:** client totals or post-creation cart/address changes cannot alter the trusted order; a valid cheap-payment proof cannot fulfill an expensive/different cart. A catalogue price change forces a fresh quote before payment rather than silent mismatch.

### BE-002 — Failed order/stock persistence still confirms checkout

**Priority:** P1. **Confidence:** high.

**Evidence:** [neon.ts:208](/home/infinityzer0/Playground/eCom/src/lib/neon.ts:208) and [neon.ts:241](/home/infinityzer0/Playground/eCom/src/lib/neon.ts:241) catch database errors and return `false`. The active verifier ignores both return values at [verify-payment/route.ts:98](/home/infinityzer0/Playground/eCom/src/app/api/verify-payment/route.ts:98), still calls stock updates at line 113, catches throws at line 116, and returns `verified: true` at line 121. The alternate verifier behaves identically at [razorpay/verify/route.ts:84](/home/infinityzer0/Playground/eCom/src/app/api/razorpay/verify/route.ts:84). [checkout/page.tsx:197](/home/infinityzer0/Playground/eCom/src/app/checkout/page.tsx:197) treats that response as confirmation, clears the cart and changes the view.

**Proof / trigger:** with both persistence helpers forced to return false, both real handlers returned 200/verified and attempted stock decrement. With fulfillment fields omitted, both returned verification success without attempting any order insert. Individual SQL calls are separate, without a transaction spanning insertion and all stock updates.

**Impact:** a customer can see “Order Confirmed” after a genuine payment although the merchant has no order record, or an order can exist without matching inventory changes. Stock can also change after an order insert failed. This reliability defect exists without an attacker and is distinct from BE-001/003.

**Remediation:** model verified payment and committed fulfillment as separate states. Atomically insert/update the merchant order and applicable inventory, handle every failure explicitly, and queue/retry recoverable fulfillment failures. Return confirmation only for a durably committed order; otherwise expose a paid/pending-reconciliation state with support reference.

**Acceptance:** failure injection at order insert and at each stock update produces either a complete atomic rollback or a durable recoverable pending state. No false confirmation or partial stock mutation is returned. Required fulfillment fields are validated before processing.

### BE-003 — Replayed payment proof attempts fulfillment repeatedly

**Priority:** P1. **Confidence:** high for application behavior and configured schema. **Cross-domain:** SEC-005.

**Evidence:** [verify-payment/route.ts:98](/home/infinityzer0/Playground/eCom/src/app/api/verify-payment/route.ts:98) blindly inserts the client `orderId` and decrements stock; neither verifier checks previous processing. [neon.ts:224](/home/infinityzer0/Playground/eCom/src/lib/neon.ts:224) uses a plain insert. The [schema snapshot](./backend/schema-snapshot.json) shows `orders` has primary-key uniqueness only on `id`, no unique gateway order/payment index, and no non-internal trigger imposing a replay guard. This snapshot is the locally configured database, not a claim about an independently inspected production deployment.

**Proof / trigger:** send the same synthetic valid provider proof twice with `merchant_A` and `merchant_B`. Both handlers returned 200 twice and invoked two order inserts and two stock mutations. The mock establishes repeated write attempts; no live duplicate orders were created or observed. With the same merchant ID, the primary key can reject insertion but BE-002 still allows stock decrement and success.

**Impact:** legitimate callback retries/network retries or deliberate replay can duplicate commercial fulfillment, consume stock repeatedly or leave accounting inconsistent. A unique merchant ID alone is not an idempotency strategy.

**Remediation:** key processing to a persisted provider/merchant order relationship and unique payment reference, perform one atomic state transition, and return the original result for retries. Add appropriate database uniqueness after reconciling existing records.

**Acceptance:** sequential and concurrent identical callbacks commit exactly one fulfillment and one stock decrement; changed client IDs cannot produce another order. Retry after a response is lost returns the existing merchant result.

### BE-004 — Invalid or unavailable carts can be processed

**Priority:** P1. **Confidence:** high. **Cross-domain:** SEC-006 for negative-quantity abuse; consolidate those aspects.

**Evidence:** [create-order/route.ts:47](/home/infinityzer0/Playground/eCom/src/app/api/create-order/route.ts:47) and [razorpay/order/route.ts:42](/home/infinityzer0/Playground/eCom/src/app/api/razorpay/order/route.ts:42) skip nonexistent variants and multiply prices by unvalidated quantities. Stock is selected but never checked. [verify-payment/route.ts:73](/home/infinityzer0/Playground/eCom/src/app/api/verify-payment/route.ts:73) permits missing variants to become zero-price lines and forwards the unvalidated quantity. [neon.ts:244](/home/infinityzer0/Playground/eCom/src/lib/neon.ts:244) uses `GREATEST(0, stock - quantity)` without `stock >= quantity`, row-count checks, reservation or a surrounding order transaction. The configured schema has integer stock but no nonnegative/price business checks.

**Proof / trigger:** both creator handlers accepted an unknown-only cart as a ₹250 shipping payment, a quantity of -1 as ₹147 payable, 1.5 units as ₹405 payable, and 99 units despite fixture stock 2. Both verifiers forwarded quantity -2 to the stock helper; the source arithmetic changes stock 2 to 4. These are isolated route results plus direct SQL-formula reasoning; no live inventory changed. Two valid concurrent buyers of the last unit can both pay because no reservation/check-and-decrement operation guards availability.

**Impact:** invalid orders, overselling, stock inflation and charges for nonexistent merchandise. Clamping stock to zero conceals overselling instead of rejecting it. Current 25 catalogue variants have valid prices and stock; that does not validate incoming orders.

**Remediation:** reject unknown IDs, zero/negative/fractional/excessive quantities, malformed line data and non-finite totals; aggregate stock demand across duplicate variant lines. Use atomic conditional reservations/decrements and a payment/reservation expiry policy. Add database integrity constraints as a backstop.

**Acceptance:** invalid carts receive a 4xx without a gateway request; missing catalogue items fail closed. Concurrent last-unit purchases cannot both become fulfillable. Cancellation/expiration releases reserved stock exactly once, and negative quantities never reach SQL.

### BE-005 — Mixed gift-wrap lines produce wrong stored totals

**Priority:** P2. **Confidence:** high. Separate from frontend FE-003's lost gift message.

**Evidence:** the cart intentionally distinguishes standard/gift lines at [CartContext.tsx:142](/home/infinityzer0/Playground/eCom/src/context/CartContext.tsx:142). Both verifiers calculate each line's gift surcharge using `items.find(i => i.variantId === item.variantId)` at [verify-payment/route.ts:90](/home/infinityzer0/Playground/eCom/src/app/api/verify-payment/route.ts:90) and [razorpay/verify/route.ts:76](/home/infinityzer0/Playground/eCom/src/app/api/razorpay/verify/route.ts:76). That always selects the first line for the variant, ignoring the current line's already-copied `giftWrap` value.

**Proof:** one standard ₹100 item followed by one gift-wrapped ₹100 item should yield subtotal ₹550 and total ₹817 under the current shipping/tax rule. Both isolated verifiers stored subtotal ₹200 and total ₹456. Reversing line order applies the surcharge to both lines instead. The creators iterate each incoming line correctly; this specific error is in verification accounting.

**Impact:** stored amounts differ from the checkout charge and gift packaging record, corrupting reporting, refund calculations and shipping-threshold decisions.

**Remediation:** calculate from the current immutable server order line, with a stable identity that includes the options; use one shared money calculation across quote, payment, fulfillment and display.

**Acceptance:** standard/gift duplicates in either order retain their individual options and produce the same expected total. Include quantities, a ₹3,000 threshold boundary and refunds in regression cases.

### BE-006 — Fulfillment depends on a browser callback with no recovery path

**Priority:** P1. **Confidence:** high for the repository flow; external operational recovery unverified.

**Evidence:** [create-order/route.ts:85](/home/infinityzer0/Playground/eCom/src/app/api/create-order/route.ts:85) returns a gateway order without persisting a pending merchant order. The merchant ID is generated only in the browser at [checkout/page.tsx:139](/home/infinityzer0/Playground/eCom/src/app/checkout/page.tsx:139), and only its in-memory success handler calls verification at line 180. Repository route/script inventory contains no payment webhook, reconciliation job, payment-status lookup endpoint or order recovery endpoint. `vercel.json` declares build/dev/install commands only. `orders.status` exists, but no durable state-machine transition or retrieval workflow is implemented.

**Trigger:** provider payment succeeds, then the browser closes, loses connectivity or fails before the verify callback reaches the application. There is no persisted server cart/address/provider-order mapping from which this application can reconstruct the intended order. This was traced statically; the audit did not make a payment or assert any unobserved provider capture/settlement behavior. Provider dashboards or external/manual procedures may exist, but they are not represented here.

**Impact:** paid orders can require manual recovery without a merchant fulfillment record. Even the successful confirmation is ephemeral; frontend FE-016 documents that refresh loses its order reference and profile lacks an order-history path. This is distinct from a callback that does arrive but experiences BE-002's persistence failure.

**Remediation:** persist a pending server order before creating the gateway order, record the relationship, implement verified idempotent provider-event handling plus periodic reconciliation/status recovery, and provide an ownership-checked durable confirmation/status page. Document manual reconciliation and refund responsibilities.

**Acceptance:** a test-mode payment with the browser closed before callback is reconciled into the correct order once. Duplicate/out-of-order events are safe; an interrupted customer can reopen an authorized order-status URL. External settlement assumptions are explicitly validated in provider test mode.

### BE-007 — Catalogue mutations can leave partial records

**Priority:** P2. **Confidence:** high.

**Evidence:** [admin/product/route.ts:108](/home/infinityzer0/Playground/eCom/src/app/api/admin/product/route.ts:108) saves the product before its variants. [neon.ts:175](/home/infinityzer0/Playground/eCom/src/lib/neon.ts:175) inserts variants one at a time with no transaction. Variant failure returns a 200 warning at route line 115. Admin then clears the form at [admin/page.tsx:319](/home/infinityzer0/Playground/eCom/src/app/admin/page.tsx:319), despite having no endpoint/UI to recreate variants on an existing product. Deletion separately removes variants and then the product at [neon.ts:194](/home/infinityzer0/Playground/eCom/src/lib/neon.ts:194), although the foreign key already supports cascade.

**Proof / trigger:** the corrected isolated admin probe supplies a synthetic bearer header, reaches the mocked authorized handler, saves one product, forces variant insertion false, and receives HTTP 200 with “Product created, but variants failed.” The initial unauthorized 401 probe did **not** demonstrate partial save and was replaced after reviewer R0-BE1. Separately, a failure between the delete queries leaves a product without variants; that delete path is static proof, not a live mutation.

**Impact:** newly listed products can be unpurchasable/₹0, some variants may be missing, and administrators are told to use a nonexistent repair operation. Retrying creation with the same ID can then fail on the product primary key.

**Remediation:** transactionally create product and all validated variants; use cascade deletion in one statement or a transaction. Either roll back failures and preserve the form, or provide an explicit draft/repair workflow and truthful result status.

**Acceptance:** failure on any variant insert or delete stage leaves the catalogue entirely unchanged, or an intentional visible draft with a supported retry. No live product without required variants is exposed by partial creation.

### BE-008 — Admin create payloads can target another product's variants

**Priority:** P2. **Confidence:** high. Requires admin authorization (whose separate public-role flaw is SEC-001).

**Evidence:** [admin/product/route.ts:70](/home/infinityzer0/Playground/eCom/src/app/api/admin/product/route.ts:70) validates each variant's field types but never requires `variant.product_id === product.id`, unique variant IDs, a nonempty variants list, integer stock, or source-compatible image URLs. [neon.ts:179](/home/infinityzer0/Playground/eCom/src/lib/neon.ts:179) updates price and stock for any colliding variant ID while preserving the old product linkage. It does not constrain the conflict update to the product being created.

**Proof:** an isolated authorized POST created `fixture-new` while forwarding a variant with `product_id: fixture-p`, returning 200. A collision with an existing variant would execute the source's price/stock upsert for that other variant; that specific database collision was not performed live. Optional/empty variants also pass the route even though the UI describes at least one as mandatory.

**Impact:** an admin integration error can change unrelated stock/prices and leave the new product empty. Invalid images, oversized optional values and fractional stock are deferred to database/rendering failures rather than clear validation, compounding BE-007.

**Remediation:** generate IDs/linkage on the server; validate a complete catalogue aggregate with bounded fields and allowed image origins, positive finite money and nonnegative integer stock. Reject cross-product ID collisions and enforce required variants before any write.

**Acceptance:** mismatched/colliding IDs, empty variants, invalid numeric values and invalid image URLs fail with 4xx and zero writes. Valid creation cannot mutate a pre-existing product's variant.

### BE-009 — Database outages masquerade as business results

**Priority:** P2. **Confidence:** high for error propagation; no live outage induced.

**Evidence:** catalogue/profile helpers catch query errors and return null at [neon.ts:77](/home/infinityzer0/Playground/eCom/src/lib/neon.ts:77), [neon.ts:95](/home/infinityzer0/Playground/eCom/src/lib/neon.ts:95), [neon.ts:111](/home/infinityzer0/Playground/eCom/src/lib/neon.ts:111) and [neon.ts:289](/home/infinityzer0/Playground/eCom/src/lib/neon.ts:289). [data/db.ts:91](/home/infinityzer0/Playground/eCom/src/data/db.ts:91) maps those errors to `[]` or undefined, [product/[id]/page.tsx:39](/home/infinityzer0/Playground/eCom/src/app/product/[id]/page.tsx:39) calls `notFound`, and [auth/login/route.ts:16](/home/infinityzer0/Playground/eCom/src/app/api/auth/login/route.ts:16) returns invalid credentials. Admin GET maps failed queries to empty arrays at [admin/product/route.ts:180](/home/infinityzer0/Playground/eCom/src/app/api/admin/product/route.ts:180); wishlist POST returns those empty results as success.

**Trigger / impact:** a timeout, unavailable database or missing table becomes “no jewellery,” “product not found,” “out of stock” or “wrong password” instead of a temporary service failure. Customers cannot choose an appropriate retry, monitoring sees apparently successful requests, and a previously indexed product can receive not-found content during an outage. Not-found content can be streamed with varying HTTP status; this audit does not assume every such response is HTTP 404.

**Remediation:** distinguish absence from failure in typed repository results or exceptions; let service failures propagate to a retryable 5xx/503 or deliberate cached/degraded state. Keep generic authentication errors for wrong credentials, but report infrastructure failures separately without leaking internals. Add correlated structured logs and availability checks.

**Acceptance:** injected database timeout produces a retryable service error, never an empty catalogue or invalid-password result; true missing IDs remain not-found. Frontend FE-007's empty-state handling should be revised alongside this contract.

### BE-010 — Newsletter insert failure still returns success

**Priority:** P2. **Confidence:** high.

**Evidence:** [newsletter/route.ts:12](/home/infinityzer0/Playground/eCom/src/app/api/newsletter/route.ts:12) ignores the boolean returned by `dbInsertSubscriber`; the helper catches failures at [neon.ts:269](/home/infinityzer0/Playground/eCom/src/lib/neon.ts:269). The route unconditionally returns `{success:true}` at line 16. This is separate from duplicate-email `ON CONFLICT DO NOTHING`, which can reasonably be successful.

**Proof / impact:** the actual route with a mock subscriber helper returning false responded 200/success. The frontend therefore welcomes the user to a list they were never added to. The current server import throws when DATABASE_URL is missing, so this finding does not rely on the unreachable “sql is null on a configured server” fallback.

**Remediation:** require successful persistence, return a retryable failure otherwise, and use canonical validated addresses. Preserve idempotent success for existing subscribers. Verify any external subscription handoff separately if introduced.

**Acceptance:** simulated insert failure shows a retryable error and keeps the form value; a duplicate valid subscriber still succeeds without adding another row. No real subscription was submitted for this audit.

### BE-011 — Bootstrap scripts disagree with the schema they create

**Priority:** P2. **Confidence:** high; static, not executed.

**Evidence:** [neon_seed.sql:21](/home/infinityzer0/Playground/eCom/neon_seed.sql:21) defines products without `base_price`, and line 63 defines variants with `price`, not `price_adjustment`. `npm run db:seed` executes that SQL then [scripts/seed.mjs:45](/home/infinityzer0/Playground/eCom/scripts/seed.mjs:45) updates the nonexistent legacy columns. [scripts/migrate.mjs:51](/home/infinityzer0/Playground/eCom/scripts/migrate.mjs:51) also unconditionally reads those old columns before dropping them; it cannot run against the current seed schema or be repeated after migration. The configured schema snapshot confirms those legacy columns are absent. README remains the create-next-app template and does not identify an expected source schema or migration order.

**Trigger / impact:** bootstrapping an empty database using the advertised seed command can commit the schema/seed batch, then fail its second batch with undefined-column errors. An operator attempting the migration against the current schema also fails. This obstructs reliable local setup, disaster recovery and repeatable environments; it is not a claim that production data was changed by this audit.

**Remediation:** remove obsolete follow-up writes, define versioned migrations with explicit source-version checks and a ledger, and test a documented empty-to-current bootstrap. Keep legacy import scripts clearly separate from current setup. Document environment requirements, database setup and backup/restore procedure.

**Acceptance:** a disposable empty database reaches the current schema via the documented command; rerunning seeds is safe. Migration either runs only from the supported old schema or cleanly reports already applied, without partial changes. Test rollback/recovery on disposable data only.

### BE-012 — Email identity normalization disagrees with uniqueness

**Priority:** P2. **Confidence:** high for schema/control flow; race not executed live.

**Evidence:** [auth/signup/route.ts:10](/home/infinityzer0/Playground/eCom/src/app/api/auth/signup/route.ts:10) checks only that email contains `@`, then performs a separate lookup and insert at lines 18 and 27 without trimming/canonicalization. [neon.ts:285](/home/infinityzer0/Playground/eCom/src/lib/neon.ts:285) looks up case-insensitively with `LOWER(email) ... LIMIT 1`, while both `neon_seed.sql:91` and the configured database enforce only case-sensitive `UNIQUE(email)`. There is no unique lower/normalized-email index.

**Trigger / impact:** concurrent registrations of `Person@example.invalid` and `person@example.invalid` can both pass the pre-check and insert distinct rows, after which login's lower-case lookup has ambiguous ownership. Whitespace-containing or malformed `@` values can also create identities inconsistent with UI normalization. Concurrent identical registration can return a generic 500 instead of a stable 409. No real duplicate accounts were created or observed.

**Remediation:** choose and consistently apply an email identity policy (at least trimming and the case-insensitive behavior the current login already assumes), migrate/resolve canonical collisions, and enforce it in a unique database key. Validate email structure and length. Handle unique-constraint conflicts atomically as duplicate identity responses.

**Acceptance:** sequential/concurrent case and whitespace variants cannot create distinct accounts; login resolves exactly one intended user. Malformed addresses fail before hashing/writes, and races return an intentional conflict rather than an internal error.

### BE-013 — Missing upload configuration returns a substitute photo as success

**Priority:** P2. **Confidence:** high for implemented conditional path; configuration-present uploads were not attempted.

**Evidence:** [cloudinary/upload/route.ts:67](/home/infinityzer0/Playground/eCom/src/app/api/cloudinary/upload/route.ts:67) returns HTTP 200, a hard-coded unrelated image URL and warning when the cloud name is absent/placeholder. [admin/page.tsx:241](/home/infinityzer0/Playground/eCom/src/app/admin/page.tsx:241) logs the warning only to the console, accepts the replacement URL, and continues product creation. The normal signed/unsigned upload branches also depend on provider configuration that was not validated through a real upload.

**Trigger / impact:** an admin selects a real product image in a misconfigured environment; the product is saved with a different photo instead of a visible upload failure. This is an operational fallback defect, not evidence that current uploaded products have the wrong images. Supplying no image intentionally and selecting an image that silently fails are different flows.

**Remediation:** fail closed on missing required media configuration before catalogue creation, return a clear actionable error, and retain selected files/form state. Use placeholders only when deliberately selected as an explicit draft workflow.

**Acceptance:** missing/invalid configuration never yields a successful uploaded-image URL; the UI presents the failure and performs no product write. Properly configured uploads continue to enforce size/type and return the actual provider URL.

### BE-014 — Related-product selection reads the entire catalogue

**Priority:** P3. **Confidence:** high for source; current performance regression not measured.

**Evidence:** [product/[id]/page.tsx:45](/home/infinityzer0/Playground/eCom/src/app/product/[id]/page.tsx:45) loads every product, including descriptions/images and a per-row minimum-variant-price subquery via [neon.ts:69](/home/infinityzer0/Playground/eCom/src/lib/neon.ts:69), then retains one related product. Metadata and page also independently call `getProductById` at lines 15 and 37 with no explicit React request memoization. Home likewise loads the whole catalogue for client filtering ([app/page.tsx:18](/home/infinityzer0/Playground/eCom/src/app/page.tsx:18)). Installed Next docs distinguish fetch memoization from direct database/ORM calls and recommend React `cache` for per-render deduplication.

**Impact:** work and payload grow with the entire catalogue even for a single product view or narrow search. The current database contains only 25 products; no present latency/SLA failure or exact duplicate network count is asserted.

**Remediation:** select related products with a targeted limited query, move pagination/filtering/sorting to appropriately indexed server queries as catalogue size grows, and apply per-request deduplication to shared product lookups. Do not cache stock/prices indefinitely or add an arbitrary cache without invalidation.

**Acceptance:** query instrumentation on a representative larger disposable catalogue shows bounded related-product rows and paginated browse payloads. Metadata/page reuse the intended lookup within a request; inventory/price freshness is preserved.

## Quality, operations and unresolved checks

- There is no repository automated suite for payment/account/catalogue invariants and no test script in package.json. The audit's isolated probes are evidence, not a complete regression suite. Prioritize tests for payment binding, idempotency, write-failure recovery, last-unit concurrency, gift totals and privilege grants.
- Four payment endpoints duplicate commercial logic while differing in aliases, output shapes, validation and error handling. Consolidation is part of BE-001–005 remediation; it is not counted as another independent customer defect.
- Provider fetches, database calls and gateway requests lack application-specific deadlines/retry policies in the inspected code. Platform/provider defaults may exist; a controlled latency/load test is required before asserting availability limits. Retries must not be added before idempotency.
- Only console logging is present; no application-owned payment correlation/reconciliation dashboard, health endpoint, alert routing or documented fulfillment runbook was found. External monitoring/backups/manual operations may exist and remain unverified.
- No production hosting, production provider keys/credentials, real captured payment, webhook delivery, refund, live email delivery, remote media upload, database restore, load/stress or real concurrent stock mutation was tested. Provider capture/settlement behavior and legal tax/shipping correctness require separate domain validation; this audit evaluates consistency of the implemented ₹250 / ₹3,000 / 3% rules, not tax advice.
- The documented seeded admin password does not match its stored seed hash according to the security auditor's isolated bcrypt check. Do not assume those documented credentials successfully log in. Secret values are intentionally not repeated here.
- Configured database metadata is a point-in-time observation. It is evidence for the environment used locally, not a blanket assertion about every deployment. The report never claims live duplicate fulfilled orders were observed.

## Reviewer responses — R0

| Comment | Disposition | Revision / rationale |
| --- | --- | --- |
| R0-BE1 | Accepted and corrected | The original admin probe stopped at 401. Added a synthetic Authorization header, kept token verification mocked, separated matching-ID partial failure from a relationship-mismatch case, and reran only admin probes. Results now show the intended handler paths. BE-007 explicitly records the correction. |
| R0-BE2 | Accepted | BE-001 identifies the active and alternate endpoints, joins client amount override to fulfillment rebinding, states that a valid low-value provider proof is required, and does not claim live capture/exploitation. |
| R0-BE3 | Accepted | BE-002 separately documents ignored boolean failures, stock after failed insert, caught throws and missing-field no-op success. Fraud is not required for this issue. |
| R0-BE4 | Accepted with additional evidence | Saved reproducible sanitized read-only schema/constraint/index/trigger inventory. BE-003 distinguishes repeated mocked write attempts, configured DB uniqueness absence and unverified production deployment; no live duplicate rows were created or observed. |
| R0-BE5 | Accepted | BE-005 isolates mixed gift-wrap accounting and records ₹200 vs ₹550 subtotal and ₹456 vs ₹817 total. FE-003's message identity loss remains a separate issue. |
| R0-BE6 | Accepted | Added complete API/helper/script/schema coverage and BE-006's callback-loss/reconciliation failure path. Provider capture/settlement is explicitly outside demonstrated evidence. FE-016 is linked for transient confirmation UI. |

Formal reviewer acceptance remains pending. No source fixes are implied by any audit response.
