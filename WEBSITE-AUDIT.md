# Wishlyn website audit

**28 October 2026 · Current working tree · Audit only**

Workspace: /home/infinityzer0/Playground/eCom. This report covers the existing application, including its uncommitted redesign and recent symbol-only logo correction. It recommends changes; **no application source or live business data was changed by this audit**.

## Executive assessment

**The site is not ready to process real customer orders safely.** Normal catalogue browsing works and the production build passes, but public signup grants administrator authority, source-known secrets match local configuration, and payment verification does not establish a trusted, durable, one-time purchase. A successful browser demonstration and valid payment signature do not compensate for these order/inventory failures.

The immediate release priorities are:

1. **Close the public administrator grant and rotate exposed matching secrets** (F01–F02).
2. **Make the server own purchase amount, contents, inventory, idempotency and recovery** (F03–F07). Today a cheap valid payment can be paired with a different cart; callbacks can repeat stock effects or report confirmation after failed persistence.
3. **Recover checkout initialization and update vulnerable runtime dependencies** (F08–F09). The dependency finding is a verified version/advisory match; no remote-code-execution or other dependency exploit was demonstrated.

The longer backlog concerns account separation, session containment, honest service errors, gift instructions/accounting, input validation, accessible controls, merchant maintenance and operational tooling. These should be sequenced after immediate containment and the payment redesign, while straightforward checkout/accessibility fixes can be developed independently.

### Counts and what they mean

| Record group | Count | Priority distribution |
| --- | ---: | --- |
| Consolidated current implementation findings, F01–F31 | **31** | **1 P0, 8 P1, 21 P2, 1 P3** |
| Conditional operational/catalogue risks, C01–C04 | **4** | 4 P2, with explicit prerequisites |
| Capability/quality recommendations, R01–R04 | **4** | 1 P2, 3 P3 |
| Original domain report entries mapped below | **49** | 22 frontend, 14 backend, 13 security; not added together as unique defects |

“Current implementation” includes source-confirmed weaknesses and failures demonstrated with controlled fault injection. It does **not** mean all 31 occurred in ordinary browsing, all are exploitable remotely, or production configuration was verified. The eight conditional/recommendation records are separate from the 31. Full npm audit's 11 affected package entries and production audit's 7 entries are scanner roll-ups within **one** finding (F09), not additional application findings.

P0 means immediate broad privilege compromise. P1 means material money, authority, inventory or checkout/recovery risk requiring release-blocking attention. P2 means meaningful functional, privacy, accessibility or operational weakness. P3 means lower-priority completeness/efficiency. Priorities are engineering judgments, not CVSS scores; confidence describes evidence, not unknown deployment conditions.

## Scope, method and limits

### Coverage

| Area | Work completed | Material limits |
| --- | --- | --- |
| Public frontend | Homepage/header/footer, catalogue filters/sort, representative product detail and galleries, gifts/postal lookup, cart/wishlist, missing-product route, CSS/metadata/motion source | Chromium local development browser; no physical-device/cross-browser certification |
| Accounts and checkout | Login/register/profile source; guest redirects; synthetic local account/cart/address state; payment-step and SDK failure; confirmation/recovery trace | No real signup, login guessing, payment, purchase or customer-record inspection |
| Merchant interface | Full source; mocked authorized admin form, failed catalogue read, labels and 320/390/768/1440px checks | No real admin credential, create/edit/delete or upload |
| Backend | **All 11 API files and 13 handlers**, all database helpers/mappers and active/alternate payment paths | Actual external gateway acceptance/capture/settlement not exercised |
| Security | Signup/authorization/session paths; secret handling; request/input controls; uploads; SQL/text sinks; headers; dependencies and relevant advisory prerequisites | No exploit load, malicious binary image, live proof replay, remote credential testing or production WAF assessment |
| Data and operations | Both SQL seed artifacts, every script, local configured-database columns/constraints/indexes/triggers and catalogue aggregates; build/lint/deployment config | No mutations, migrations, seed execution, backup restoration, production provider/hosting/dashboard inspection |

The 13 inspected API handlers comprise four payment POSTs; signup/login/me; admin GET/POST/DELETE; upload POST; newsletter POST; and wishlist-products POST. The API-by-API matrix is preserved in the [backend report](/home/infinityzer0/Playground/eCom/docs/audits/2026-10-28/BACKEND-AUDIT.md). All frontend pages/shared components/contexts and all runtime/deployment helpers were read by the responsible domain auditor; review focused on root causes and important cross-layer contracts.

Installed **Next.js 16.2.9** documentation was consulted before evaluating framework behavior. Route Handlers are uncached by default; they need endpoint authorization regardless of proxy/middleware. Promise route parameters are already awaited. The installed error-boundary reset API remains supported. No obsolete-framework-assumption finding was added.

### Reproducible evidence

| Check / artifact | Result and interpretation |
| --- | --- |
| [Production build](/home/infinityzer0/Playground/eCom/docs/audits/2026-10-28/build.log) | PASS, including TypeScript and prerender generation. This verifies compilation, not payment/account invariants. |
| [Full application lint](/home/infinityzer0/Playground/eCom/docs/audits/2026-10-28/lint.log) | FAIL: **23 errors and 10 warnings** in the baseline. Includes explicit-any, hook diagnostics, unused values and admin image warnings. These are not 33 independent runtime defects. |
| [Backend harness](/home/infinityzer0/Playground/eCom/docs/audits/2026-10-28/backend/isolated-route-probes.mjs) / [23 results](/home/infinityzer0/Playground/eCom/docs/audits/2026-10-28/backend/isolated-route-results.json) | Current route bodies transpiled into isolated mocks; fake provider, synthetic signing key and no environment/network/database access. Corrected admin probes reach their intended 200 paths. |
| [Auth harness](/home/infinityzer0/Playground/eCom/docs/audits/2026-10-28/security/isolated-auth-checks.cjs) / [Auth results](/home/infinityzer0/Playground/eCom/docs/audits/2026-10-28/security/isolated-auth-results.json) | Real signup/admin/token/client helpers with in-memory dependencies. Administrator grant/known-key acceptance confirmed; missing/customer controls denied. Zero network calls and zero real DB writes. |
| [Read-only schema procedure](/home/infinityzer0/Playground/eCom/docs/audits/2026-10-28/backend/schema-readonly.mjs) / [Schema snapshot](/home/infinityzer0/Playground/eCom/docs/audits/2026-10-28/backend/schema-snapshot.json) | Local environment's configured database only; production identity unestablished. No customer/order contents. 25 products/25 variants, no variantless products, nonpositive prices or negative stock at observation time. |
| [Browser setup and cleanup](/home/infinityzer0/Playground/eCom/docs/audits/2026-10-28/frontend/REPRODUCTION.md) / [Guarded recovered procedure](/home/infinityzer0/Playground/eCom/docs/audits/2026-10-28/frontend/safe-reproduce.js) | Original browser JSON/screenshots retained. R2 wrapper adds fail-closed mutation/API guards and cleanup; syntax-checked, **not rerun as a new browser result**. Uses a dedicated synthetic session. |
| [Screen checks](/home/infinityzer0/Playground/eCom/docs/audits/2026-10-28/frontend/screen-audit.json), [Interactions](/home/infinityzer0/Playground/eCom/docs/audits/2026-10-28/frontend/interaction-audit.json), [Checkout](/home/infinityzer0/Playground/eCom/docs/audits/2026-10-28/frontend/checkout-audit.json), [Admin/filters](/home/infinityzer0/Playground/eCom/docs/audits/2026-10-28/frontend/admin-filter-audit.json), [320px overflow](/home/infinityzer0/Playground/eCom/docs/audits/2026-10-28/frontend/admin-overflow.json), [State resilience](/home/infinityzer0/Playground/eCom/docs/audits/2026-10-28/frontend/state-audit.json) | Local Chromium observations and deliberate browser response/storage fixtures. Individual findings state where injection/synthetic state was required. |
| [Contrast calculator](/home/infinityzer0/Playground/eCom/docs/audits/2026-10-28/frontend/color-contrast.mjs) / [Color evidence](/home/infinityzer0/Playground/eCom/docs/audits/2026-10-28/frontend/color-contrast.json) | Exact current CSS pairs and concrete consumers; independent reviewer reran the offline calculation. Not a whole-site automated accessibility certification. |
| [Full dependency audit](/home/infinityzer0/Playground/eCom/docs/audits/2026-10-28/security/npm-audit.json) / [Production dependency audit](/home/infinityzer0/Playground/eCom/docs/audits/2026-10-28/security/npm-audit-production.json) / [Applicability inventory](/home/infinityzer0/Playground/eCom/docs/audits/2026-10-28/security/dependency-summary.json) | 11/7 affected package entries respectively; advisory severity does not establish reachable deployment exploitation. |
| [Redacted configuration check](/home/infinityzer0/Playground/eCom/docs/audits/2026-10-28/security/redacted-config-check.json) / [TLS option check](/home/infinityzer0/Playground/eCom/docs/audits/2026-10-28/security/tls-option-results.json) | Secret equality/presence booleans and offline parsed TLS options only; no values, provider authentication or TLS handshake. |
| Audit-only JavaScript hygiene | Parent reran both isolated harnesses after lint-only fixture cleanup; expected results unchanged. All six audit evidence JS files pass targeted lint. No new application-lint issue is counted. |

Safe reruns for the offline route/auth/color checks are documented in the linked procedures. Browser reproductions require the disposable guarded session; payment/admin/newsletter/upload mutations must remain intercepted. The read-only schema procedure accesses the configured database and is explicitly different from an offline test. Proposed acceptance checks below describe future validation after fixes, not actions performed by this audit.

Prior verification immediately before this audit covered **all 25 product pages** in fresh sessions with correct headings and no runtime error, plus gallery/add/remove/related-product shopping flow. The user confirmed the former stale-session product error disappeared. Header logo centering was measured from 320 to 1440px without overlap or page overflow. The current frontend audit also found normal public routes working. Neither earlier defect is reported as unresolved; deliberately malformed cart data in F20 is a separate case. See [baseline](/home/infinityzer0/Playground/eCom/docs/audits/2026-10-28/BASELINE.md).

### Independent review

Three domain auditors produced reports, and a fourth auditor challenged evidence, fixtures, severity, duplicates and remediation. The frontend and backend authors incorporated their review corrections. Two platform resource-routing failures prevented the security author's revision turn; the coordinator applied only the five requested R1 corrections, and the fourth auditor independently accepted those changes and evidence. This is recorded as a coordinator handoff, not a completed security-author revision.

All factual review comments are closed; deployment and test-coverage limits remain. The detailed comments, author dispositions, rejected 401 admin fixture and replacement evidence are in [REVIEW-LOG.md](/home/infinityzer0/Playground/eCom/docs/audits/2026-10-28/REVIEW-LOG.md). Domain reports: [frontend](/home/infinityzer0/Playground/eCom/docs/audits/2026-10-28/FRONTEND-AUDIT.md), [backend](/home/infinityzer0/Playground/eCom/docs/audits/2026-10-28/BACKEND-AUDIT.md), [security](/home/infinityzer0/Playground/eCom/docs/audits/2026-10-28/SECURITY-AUDIT.md).

## Prioritized current findings

| ID | Priority | Finding | Domain entries |
| --- | --- | --- | --- |
| [F01](#f01) | P0 | Public signup grants administrator authority | SEC-001 |
| [F02](#f02) | P1 | Tracked signing and media secrets match local configuration | SEC-002, SEC-003 |
| [F03](#f03) | P1 | The payment amount and purchase contents have no server-owned binding | BE-001, SEC-004, FE-008 |
| [F04](#f04) | P1 | Failed persistence still produces an order confirmation | BE-002 |
| [F05](#f05) | P1 | A payment proof can trigger fulfillment more than once | BE-003, SEC-005 |
| [F06](#f06) | P1 | Server cart validation and inventory enforcement are missing | BE-004, SEC-006 |
| [F07](#f07) | P1 | Payment and order recovery depend on transient browser state | BE-006, FE-016 |
| [F08](#f08) | P1 | A previously failed payment SDK load traps checkout in Processing | FE-001 |
| [F09](#f09) | P1 | Installed dependencies match published security advisories | SEC-011 |
| [F10](#f10) | P2 | Account carts and shipping details leak across a shared browser | FE-002, SEC-009 |
| [F11](#f11) | P2 | Logout and privilege removal cannot revoke issued tokens | SEC-007 |
| [F12](#f12) | P2 | Bearer credentials are exposed to scripts and insecure cookie transport | SEC-008 |
| [F13](#f13) | P2 | Sensitive public APIs lack application abuse and payload budgets | SEC-010 |
| [F14](#f14) | P2 | Gift line options are not consistently preserved or priced | FE-003, BE-005 |
| [F15](#f15) | P2 | Invalid delivery contact details reach the payment step | FE-004 |
| [F16](#f16) | P2 | Postal lookup failures invent delivery and COD promises | FE-005 |
| [F17](#f17) | P2 | Obsolete asynchronous responses can overwrite current selections | FE-006 |
| [F18](#f18) | P2 | Data-service failures masquerade as empty, missing or invalid data | BE-009, FE-007 |
| [F19](#f19) | P2 | Shopping data stays stale across tabs | FE-009 |
| [F20](#f20) | P2 | Malformed persisted cart data can crash every page | FE-010 |
| [F21](#f21) | P2 | Forms and purchase controls omit accessible names, selection and feedback | FE-011, FE-012 |
| [F22](#f22) | P2 | Price text and focus indicators fail applicable contrast targets | FE-013 |
| [F23](#f23) | P2 | The admin creator overflows a 320px viewport | FE-014 |
| [F24](#f24) | P2 | Filter state diverges from the URL and resets on category navigation | FE-015 |
| [F25](#f25) | P2 | Payment help and return promises have no usable support destination | FE-017 |
| [F26](#f26) | P2 | Catalogue creation and deletion can leave partial products | BE-007 |
| [F27](#f27) | P2 | Admin create requests can modify unrelated variant identities | BE-008 |
| [F28](#f28) | P2 | Newsletter persistence failure is reported as subscription success | BE-010 |
| [F29](#f29) | P2 | Documented database bootstrap targets obsolete columns | BE-011 |
| [F30](#f30) | P2 | Email lookup and database uniqueness use different identity rules | BE-012 |
| [F31](#f31) | P3 | Jewellery Care opens an empty content panel | FE-021 |

## Confirmed findings and acceptance checks

<a id="f01"></a>
### F01 — Public signup grants administrator authority

**Priority: P0. High confidence · source + isolated real-handler execution.** Domain entries: SEC-001.

**Evidence:** [src/app/api/auth/signup/route.ts:25](/home/infinityzer0/Playground/eCom/src/app/api/auth/signup/route.ts:25) assigns the privileged role using a substring in the supplied email; [src/app/api/auth/signup/route.ts:38](/home/infinityzer0/Playground/eCom/src/app/api/auth/signup/route.ts:38) signs that role. The role is sufficient at [src/app/api/admin/product/route.ts:23](/home/infinityzer0/Playground/eCom/src/app/api/admin/product/route.ts:23) and [src/app/api/cloudinary/upload/route.ts:20](/home/infinityzer0/Playground/eCom/src/app/api/cloudinary/upload/route.ts:20).

**Prerequisite / proof:** The offline auth harness registers a synthetic address containing the privileged substring against a mocked database. The actual signup handler returns an administrator token, and the actual admin GET handler accepts it (200); missing-token and customer controls return 401 and 403. No real account or admin mutation was created. See [security/isolated-auth-results.json](/home/infinityzer0/Playground/eCom/docs/audits/2026-10-28/security/isolated-auth-results.json).

**Impact:** Anyone able to reach public signup can acquire authority to create/delete catalogue products and access the upload endpoint when the application is deployed with this code. Email ownership or a separate administrator-approval step is not required.

**Remediation:** Always assign customer to public signup. Provision/promote administrators through an authenticated, audited process. Review existing administrator accounts and revoke unauthorized sessions; correcting the substring alone does not remove previously issued authority.

**Acceptance check:** Substring and mixed-case signup fixtures always receive customer and are denied on every admin/upload operation. A separately provisioned administrator retains intended access. Previously unauthorized accounts and sessions are removed or revoked.

<a id="f02"></a>
### F02 — Tracked signing and media secrets match local configuration

**Priority: P1. High confidence · source + redacted configuration comparison + offline token verification.** Domain entries: SEC-002, SEC-003.

**Evidence:** [src/lib/auth.ts:4](/home/infinityzer0/Playground/eCom/src/lib/auth.ts:4) contains a JWT fallback literal; [scripts/upload-to-cloudinary.mjs:24](/home/infinityzer0/Playground/eCom/scripts/upload-to-cloudinary.mjs:24) contains Cloudinary fallback credentials. [security/redacted-config-check.json](/home/infinityzer0/Playground/eCom/docs/audits/2026-10-28/security/redacted-config-check.json) records only equality/presence booleans: the locally configured JWT and media secret match tracked values.

**Prerequisite / proof:** An isolated instance of the real token verifier accepts a synthetic nonexistent administrator signed using the source-known fallback. No forged token was sent to the running site and no Cloudinary credential-validation request was made. [security/isolated-auth-results.json](/home/infinityzer0/Playground/eCom/docs/audits/2026-10-28/security/isolated-auth-results.json) contains no token or secret.

**Impact:** Deployments using the known JWT key accept forged identities/roles. Repository/history readers also possess a locally configured media-provider secret, whose external authority depends on whether it remains enabled. Production configuration, remote credential validity and actual compromise are unverified.

**Remediation:** Remove fallback literals and fail closed when configuration is absent. Rotate/revoke both matching secrets through their owners, invalidate old JWT sessions, isolate environments, and scan history/deployment artifacts. Removing current source text cannot revoke already copied secrets.

**Acceptance check:** Old/default-key tokens fail verification; missing configuration stops startup/scripts. Provider rotation is verified through an authorized provider workflow, secret scanning prevents recurrence, and source/bundles/logs contain no credentials. Verify each secret independently.

<a id="f03"></a>
### F03 — The payment amount and purchase contents have no server-owned binding

**Priority: P1. High confidence · source + isolated payment handlers; stale-cart behavior source-confirmed.** Domain entries: BE-001, SEC-004, FE-008.

**Evidence:** [src/app/checkout/page.tsx:154](/home/infinityzer0/Playground/eCom/src/app/checkout/page.tsx:154) sends a browser-derived amount. [src/app/api/create-order/route.ts:32](/home/infinityzer0/Playground/eCom/src/app/api/create-order/route.ts:32) and [src/app/api/razorpay/order/route.ts:26](/home/infinityzer0/Playground/eCom/src/app/api/razorpay/order/route.ts:26) prefer it over server pricing. [src/app/api/verify-payment/route.ts:50](/home/infinityzer0/Playground/eCom/src/app/api/verify-payment/route.ts:50) and [src/app/api/razorpay/verify/route.ts:41](/home/infinityzer0/Playground/eCom/src/app/api/razorpay/verify/route.ts:41) authenticate provider IDs, then accept new client items, shipping and merchant IDs. [src/context/CartContext.tsx:45](/home/infinityzer0/Playground/eCom/src/context/CartContext.tsx:45) persists full price/stock snapshots; [src/context/CartContext.tsx:146](/home/infinityzer0/Playground/eCom/src/context/CartContext.tsx:146) does not refresh them when an existing line is re-added.

**Prerequisite / proof:** Both creator mocks send 100 paise even alongside fifty ₹100 fixture units. Both verifiers accept a synthetic valid provider proof and separately supplied fulfillment payload. An attacker needs a valid low-value proof for this merchant; no provider payment/capture was performed. A stale browser price can also be passed through unchanged in ordinary use. See [backend/isolated-route-results.json](/home/infinityzer0/Playground/eCom/docs/audits/2026-10-28/backend/isolated-route-results.json).

**Impact:** A genuine cheap payment can be associated with an expensive or changed cart and marked confirmed. Innocent customers can see/pay obsolete catalogue snapshots. The valid signature proves the provider identifier pair, not the cart's commercial meaning.

**Remediation:** Create an immutable, validated server order/quote with owner, item options, current prices, amount and currency; bind its provider order ID before payment. Verification must load this record and verify expected amount/currency/payment state. Refresh the visible cart and explain price/availability changes. Consolidate both exposed endpoint pairs.

**Acceptance check:** Changing amount/items/address/merchant ID after creation cannot alter the trusted purchase; a cheap valid proof cannot fulfill a larger cart. A controlled catalogue price/stock change refreshes the bag and requires acknowledgement before payment.

<a id="f04"></a>
### F04 — Failed persistence still produces an order confirmation

**Priority: P1. High confidence · source + isolated failure injection.** Domain entries: BE-002.

**Evidence:** [src/lib/neon.ts:208](/home/infinityzer0/Playground/eCom/src/lib/neon.ts:208) and [src/lib/neon.ts:241](/home/infinityzer0/Playground/eCom/src/lib/neon.ts:241) return false on persistence failures. [src/app/api/verify-payment/route.ts:98](/home/infinityzer0/Playground/eCom/src/app/api/verify-payment/route.ts:98) ignores those results, calls stock changes and returns verified; [src/app/api/razorpay/verify/route.ts:84](/home/infinityzer0/Playground/eCom/src/app/api/razorpay/verify/route.ts:84) repeats this. [src/app/checkout/page.tsx:197](/home/infinityzer0/Playground/eCom/src/app/checkout/page.tsx:197) clears the cart and displays confirmation.

**Prerequisite / proof:** Forcing both mocked write helpers to return false still yields HTTP 200/verified from both handlers and an attempted stock decrement. Omitting fulfillment fields yields verification success with no order insert. Separate SQL calls have no encompassing transaction; caught throws also fall through to success. [backend/isolated-route-results.json](/home/infinityzer0/Playground/eCom/docs/audits/2026-10-28/backend/isolated-route-results.json).

**Impact:** A paid customer can be told the order is confirmed while its record is missing, or an order can exist with inconsistent stock. Inventory can change after insertion failed. This occurs under infrastructure failure without an attacker.

**Remediation:** Separate verified payment from committed fulfillment. Atomically commit the order and inventory, inspect every result, and preserve a durable pending/reconciliation state when fulfillment fails. Only a durably committed order may produce final confirmation.

**Acceptance check:** Inject failure at order insertion and every inventory step: either the transaction rolls back entirely or an explicit durable recoverable state remains. No false confirmation, orphan decrement or erased customer recovery reference is permitted.

<a id="f05"></a>
### F05 — A payment proof can trigger fulfillment more than once

**Priority: P1. High confidence · source + isolated replay + scoped database metadata.** Domain entries: BE-003, SEC-005.

**Evidence:** [src/app/api/verify-payment/route.ts:98](/home/infinityzer0/Playground/eCom/src/app/api/verify-payment/route.ts:98) and [src/app/api/razorpay/verify/route.ts:84](/home/infinityzer0/Playground/eCom/src/app/api/razorpay/verify/route.ts:84) insert client-chosen order IDs without a processed-payment check. [src/lib/neon.ts:224](/home/infinityzer0/Playground/eCom/src/lib/neon.ts:224) uses a plain insert. [backend/schema-snapshot.json](/home/infinityzer0/Playground/eCom/docs/audits/2026-10-28/backend/schema-snapshot.json) shows only merchant-ID uniqueness, no gateway-identity unique index and no relevant noninternal replay trigger in the locally configured database.

**Prerequisite / proof:** Two requests with the same synthetic provider proof and different merchant IDs yield two successful responses, two mocked insert attempts and two stock calls. Repeating the same merchant ID can instead fail insertion while F04 still allows stock calls. No live duplicate order was created or observed; the inspected database was not independently identified as production.

**Impact:** Accidental callback retries and deliberate replay can duplicate fulfillment, repeatedly consume inventory and distort accounting. Unique client-generated order IDs do not make payment processing idempotent.

**Remediation:** Persist the provider-to-merchant mapping, enforce unique provider transaction identity and use one atomic state transition. Browser callbacks and verified webhooks must share this idempotency boundary and return the original result on retry.

**Acceptance check:** Sequential and concurrent duplicate callbacks, changed client IDs and retry after a lost response produce exactly one committed order and inventory effect. Failed/conflicting insertion performs no stock mutation.

<a id="f06"></a>
### F06 — Server cart validation and inventory enforcement are missing

**Priority: P1. High confidence · source + isolated invalid-cart cases + database metadata.** Domain entries: BE-004, SEC-006.

**Evidence:** [src/app/api/create-order/route.ts:47](/home/infinityzer0/Playground/eCom/src/app/api/create-order/route.ts:47) and [src/app/api/razorpay/order/route.ts:42](/home/infinityzer0/Playground/eCom/src/app/api/razorpay/order/route.ts:42) skip unknown variants and multiply unvalidated quantities. [src/app/api/verify-payment/route.ts:73](/home/infinityzer0/Playground/eCom/src/app/api/verify-payment/route.ts:73) admits missing variants/zero-price metadata. [src/lib/neon.ts:244](/home/infinityzer0/Playground/eCom/src/lib/neon.ts:244) clamps stock after subtraction without a sufficient-stock predicate, reservation or affected-row check.

**Prerequisite / proof:** Both creator mocks accept an unknown-only cart as ₹250 shipping, quantity -1 as ₹147, 1.5 units as ₹405, and 99 units with stock 2. Both verifiers forward -2 to stock mutation; the source expression turns stock 2 into 4. The configured schema has no nonnegative price/stock check. Its current 25 variants have valid values; these probes did not change them.

**Impact:** Invalid carts can reach payment; nonexistent items can become confirmed records; negative quantities increase stock; concurrent buyers can pay for the same last unit. Clamping stock hides overselling. Verification abuse requires valid provider proof, which F05 permits replaying.

**Remediation:** Validate bounded nonempty carts, known IDs, finite money and positive safe-integer quantities; combine duplicate-variant demand. Reject every invalid line. Reserve/decrement inventory atomically with availability conditions and define expiration/cancellation release rules; add database integrity checks.

**Acceptance check:** Invalid carts fail before gateway calls or writes. Concurrent last-unit purchases cannot both become fulfillable; cancellation releases reservations once. Negative/fractional/duplicate-aggregate excess quantities never reach SQL.

<a id="f07"></a>
### F07 — Payment and order recovery depend on transient browser state

**Priority: P1. High confidence · static end-to-end flow; provider recovery outside repository unverified.** Domain entries: BE-006, FE-016.

**Evidence:** [src/app/api/create-order/route.ts:85](/home/infinityzer0/Playground/eCom/src/app/api/create-order/route.ts:85) creates only a gateway order; the merchant ID is generated in browser memory at [src/app/checkout/page.tsx:139](/home/infinityzer0/Playground/eCom/src/app/checkout/page.tsx:139). The browser callback at [src/app/checkout/page.tsx:180](/home/infinityzer0/Playground/eCom/src/app/checkout/page.tsx:180) is the only implemented route to fulfillment. [src/app/checkout/page.tsx:203](/home/infinityzer0/Playground/eCom/src/app/checkout/page.tsx:203) stores confirmation in component state; [src/app/profile/page.tsx:90](/home/infinityzer0/Playground/eCom/src/app/profile/page.tsx:90) has no order retrieval. The complete route/script inventory contains no webhook/reconciliation/status-recovery endpoint.

**Prerequisite / proof:** Trace a successful provider payment followed by browser closure/network loss before application verification: no durable server cart/address/provider mapping exists to reconstruct the purchase. Even after a successful callback, reloading /checkout loses the displayed order reference after the cart was cleared. These are source traces, not real payments; provider dashboards/manual procedures may exist externally.

**Impact:** Paid purchases can need manual investigation without a fulfillment record, and customers cannot reopen their confirmation or in-app receipt. This differs from F04, where the callback arrives but persistence fails.

**Remediation:** Persist the pending purchase before provider creation, process verified events idempotently, add reconciliation and an ownership-checked durable order-status/detail URL, and document manual recovery/refund responsibility.

**Acceptance check:** In provider test mode, closing the browser before callback still yields exactly one correct recoverable order. Duplicate/out-of-order events are safe; reload/reopen preserves status and reference, and another account cannot retrieve it.

<a id="f08"></a>
### F08 — A previously failed payment SDK load traps checkout in Processing

**Priority: P1. High confidence · injected browser failure + source.** Domain entries: FE-001.

**Evidence:** [src/app/checkout/page.tsx:303](/home/infinityzer0/Playground/eCom/src/app/checkout/page.tsx:303) preloads the SDK. [src/app/checkout/page.tsx:28](/home/infinityzer0/Playground/eCom/src/app/checkout/page.tsx:28) finds an existing failed script and attaches new load/error listeners; [src/app/checkout/page.tsx:142](/home/infinityzer0/Playground/eCom/src/app/checkout/page.tsx:142) awaits their promise. No failure-state memory or timeout resolves a previously fired error.

**Prerequisite / proof:** In a disposable browser, abort the SDK before entering shipping, then proceed and click Pay after its error event. At 1.8 seconds Processing/Back remain disabled, no visible error appears, the script element remains and Razorpay is undefined. Source establishes an unbounded missed-event wait; the duration alone does not. No order API call reached the server. [frontend/checkout-audit.json](/home/infinityzer0/Playground/eCom/docs/audits/2026-10-28/frontend/checkout-audit.json) and [frontend/checkout-sdk-failure.png](/home/infinityzer0/Playground/eCom/docs/audits/2026-10-28/frontend/checkout-sdk-failure.png).

**Impact:** A transient connectivity or content-blocker failure becomes a checkout dead end. This does not establish that normal payment initialization always fails.

**Remediation:** Use one shared loader with explicit pending/success/failure state, bounded timeout and replacement/retry of failed script elements. Surface an announced recoverable error and restore navigation.

**Acceptance check:** Fail initial loading, then restore connectivity: Pay reports an error within a defined bound and a retry successfully reloads the SDK without a page refresh. Back remains usable after initialization failure.

<a id="f09"></a>
### F09 — Installed dependencies match published security advisories

**Priority: P1. High confidence in versions/advisory match · scanner and public advisory metadata; exploit paths untested.** Domain entries: SEC-011.

**Evidence:** [package.json:22](/home/infinityzer0/Playground/eCom/package.json:22) pins Next 16.2.9; the installed tree includes sharp 0.34.5. [security/npm-audit.json](/home/infinityzer0/Playground/eCom/docs/audits/2026-10-28/security/npm-audit.json) reports 11 affected package entries (1 critical, 9 high, 1 moderate); [security/npm-audit-production.json](/home/infinityzer0/Playground/eCom/docs/audits/2026-10-28/security/npm-audit-production.json) reports 7 production entries. These package roll-ups are counted as this one maintenance finding, not 11 website exploits.

**Prerequisite / proof:** The scanner recommends Next 16.4.3 at audit time. [security/image-advisories.json](/home/infinityzer0/Playground/eCom/docs/audits/2026-10-28/security/image-advisories.json) documents AVIF/native image [GHSA-2xp9-vwfh-vxw4](https://github.com/advisories/GHSA-2xp9-vwfh-vxw4), SVG/glibc/older-sharp [GHSA-2464-fhr4-w9xw](https://github.com/advisories/GHSA-2464-fhr4-w9xw), and allow-listed-host/DNS SSRF [GHSA-cjq9-62q9-8jv4](https://github.com/advisories/GHSA-cjq9-62q9-8jv4) prerequisites. Image optimization is used, but attacker control of optimized bytes/DNS and production OS were not established.

**Impact:** Known vulnerable framework/native components remain in the runtime. Actual exploitability depends on advisory-specific inputs and platform. Windows, next/og, use-cache, custom-server, rewrites/proxy and Server Action prerequisites were not established in the reviewed application. Toolchain advisories are not automatically public request vulnerabilities.

**Remediation:** Update supported Next and eslint-config-next together, refresh affected transitive dependencies and verify sharp/native versions. Review installed upgrade guidance, full/production dependency scans and reachable attack surfaces; avoid a blind force upgrade. See the detailed applicability matrix in the security report.

**Acceptance check:** Affected version matches are removed or have a reviewed documented mitigation/applicability decision. Build and image/auth/payment regressions pass, and both full and production dependency scans are retained.

<a id="f10"></a>
### F10 — Account carts and shipping details leak across a shared browser

**Priority: P2. High confidence · synthetic browser account-switch reproduction + source.** Domain entries: FE-002, SEC-009.

**Evidence:** [src/context/CartContext.tsx:93](/home/infinityzer0/Playground/eCom/src/context/CartContext.tsx:93) imports the global legacy cart into empty account/guest carts; [src/context/CartContext.tsx:119](/home/infinityzer0/Playground/eCom/src/context/CartContext.tsx:119) rewrites that fallback for every account. [src/app/checkout/page.tsx:86](/home/infinityzer0/Playground/eCom/src/app/checkout/page.tsx:86) reads one global saved-address key and [src/app/checkout/page.tsx:118](/home/infinityzer0/Playground/eCom/src/app/checkout/page.tsx:118) persists to it. [src/lib/authClient.ts:67](/home/infinityzer0/Playground/eCom/src/lib/authClient.ts:67) does not clear/partition this data on logout.

**Prerequisite / proof:** Synthetic B receives A's cart/gift message. A separate B checkout auto-fills A's synthetic name/address/phone while preserving B's email. [frontend/interaction-audit.json](/home/infinityzer0/Playground/eCom/docs/audits/2026-10-28/frontend/interaction-audit.json) and [frontend/checkout-audit.json](/home/infinityzer0/Playground/eCom/docs/audits/2026-10-28/frontend/checkout-audit.json) contain only fixture data. The prerequisite is another account/person using the same browser profile; remote or cross-device disclosure was not demonstrated.

**Impact:** Purchase intentions, gift text and identifying delivery details appear to the next account, and plausible mixed-account shipping fields can send a purchase to the wrong recipient.

**Remediation:** Scope persistence to a verified account, define one-time guest migration and explicit logout/cleanup rules, and remove previous-account data as a universal fallback. Prefer server-owned addresses with authorization.

**Acceptance check:** A → logout → B never exposes A's cart/message/address. Empty carts remain empty; guest migration occurs once under a documented rule; returning to A restores only A's intended data.

<a id="f11"></a>
### F11 — Logout and privilege removal cannot revoke issued tokens

**Priority: P2. High confidence · source + offline logout/token verification.** Domain entries: SEC-007.

**Evidence:** [src/lib/auth.ts:5](/home/infinityzer0/Playground/eCom/src/lib/auth.ts:5) gives JWTs seven days; [src/lib/auth.ts:26](/home/infinityzer0/Playground/eCom/src/lib/auth.ts:26) checks signature/expiry and claims without live account state. [src/app/api/auth/me/route.ts:13](/home/infinityzer0/Playground/eCom/src/app/api/auth/me/route.ts:13) returns embedded identity. [src/lib/authClient.ts:67](/home/infinityzer0/Playground/eCom/src/lib/authClient.ts:67) only removes local browser copies.

**Prerequisite / proof:** The isolated real logout helper clears token storage, but the same previously copied token still passes the real verifier. No session version, revocation record or current-role lookup exists on protected paths. A demoted/deleted account therefore cannot be detected through those checks.

**Impact:** A previously obtained administrator token can retain authority until expiry after logout or external account/role changes. Token theft is a prerequisite for this containment scenario and was not observed.

**Remediation:** Introduce revocable server sessions or checked token/session versions, verify current authority for privileged operations, and revoke on logout/account disable/role change. Choose a deliberate short-lived access/refresh design.

**Acceptance check:** A previously valid token is rejected after revocation/logout and administrator demotion/deletion from another client. Other active sessions follow an explicit tested policy.

<a id="f12"></a>
### F12 — Bearer credentials are exposed to scripts and insecure cookie transport

**Priority: P2. High confidence in storage attributes · source + isolated helper; no XSS established.** Domain entries: SEC-008.

**Evidence:** [src/lib/authClient.ts:18](/home/infinityzer0/Playground/eCom/src/lib/authClient.ts:18) duplicates the token in localStorage and JavaScript-written cookies, without Secure/HttpOnly. [src/lib/authClient.ts:27](/home/infinityzer0/Playground/eCom/src/lib/authClient.ts:27) includes it in a custom event. Cookie lifetime is 30 days, versus seven-day token validity.

**Prerequisite / proof:** The offline client-helper fixture records neither Secure nor HttpOnly attributes. Same-origin code can read the stored token by design. No injected script, malicious provider script, HTTP interception or production transport failure was demonstrated.

**Impact:** Any successful same-origin/third-party-script compromise can obtain bearer authority. The cookie may travel over plain HTTP where the deployment permits it. This weakness compounds F11 but does not itself prove an XSS exploit.

**Remediation:** Use a server-set HttpOnly, Secure, suitably SameSite session cookie with aligned expiry; remove duplicate script-readable credentials/events. When changing authorization from headers to cookies, introduce appropriate CSRF controls together.

**Acceptance check:** Authenticating tokens are absent from localStorage/document.cookie/events; server cookie attributes/lifetime are correct; legitimate flows work and cross-site state-changing requests fail.

<a id="f13"></a>
### F13 — Sensitive public APIs lack application abuse and payload budgets

**Priority: P2. High confidence in repository omission · source; edge controls and load behavior unverified.** Domain entries: SEC-010.

**Evidence:** [src/app/api/auth/login/route.ts:10](/home/infinityzer0/Playground/eCom/src/app/api/auth/login/route.ts:10) reaches identity lookup/bcrypt; [src/app/api/auth/signup/route.ts:14](/home/infinityzer0/Playground/eCom/src/app/api/auth/signup/route.ts:14) enforces only a minimum password length before hashing. [src/app/api/create-order/route.ts:85](/home/infinityzer0/Playground/eCom/src/app/api/create-order/route.ts:85) reaches a provider; [src/app/api/newsletter/route.ts:8](/home/infinityzer0/Playground/eCom/src/app/api/newsletter/route.ts:8) writes public input. No application rate limiter/progressive challenge or bounded request-body budget appears in these paths.

**Prerequisite / proof:** Static endpoint inspection found no distributed attempt/request budget. Bodies are parsed before custom limits. The wishlist 50-ID cap and upload 5MB post-parse file check are local controls, not limits for every public endpoint. Login skips bcrypt for missing accounts and signup explicitly reveals duplicates. No brute force/load attack was executed.

**Impact:** Repeated requests can consume authentication CPU, database or provider capacity unless deployment-edge controls intervene. Hosting/WAF rate limits were not inspected; no production outage is asserted.

**Remediation:** Add endpoint-specific distributed rate limits, bounded inputs/request sizes and progressive bot controls before expensive work. Document actual edge enforcement and intentional account-existence response behavior.

**Acceptance check:** Isolated multi-instance tests exercise budgets, 429/Retry-After, recovery and oversized-body rejection before hashing/provider work, while legitimate shared-network customers remain usable.

<a id="f14"></a>
### F14 — Gift line options are not consistently preserved or priced

**Priority: P2. High confidence · browser reproduction + isolated accounting.** Domain entries: FE-003, BE-005.

**Evidence:** [src/context/CartContext.tsx:144](/home/infinityzer0/Playground/eCom/src/context/CartContext.tsx:144) keys lines by variant/gift flag and [src/context/CartContext.tsx:146](/home/infinityzer0/Playground/eCom/src/context/CartContext.tsx:146) merges quantities without preserving a second message. [src/components/CartDrawer.tsx:139](/home/infinityzer0/Playground/eCom/src/components/CartDrawer.tsx:139) omits the text from review. Both verifiers use the first matching variant's gift flag at [src/app/api/verify-payment/route.ts:90](/home/infinityzer0/Playground/eCom/src/app/api/verify-payment/route.ts:90) and [src/app/api/razorpay/verify/route.ts:76](/home/infinityzer0/Playground/eCom/src/app/api/razorpay/verify/route.ts:76).

**Prerequisite / proof:** Adding the same wrapped SKU with two synthetic messages yields quantity two with only the first message. Separately, a ₹100 standard line followed by the same SKU wrapped should store subtotal ₹550/total ₹817; both verifier mocks store ₹200/₹456. Reversing order charges wrapping for both. These are two option-identity failures requiring distinct regression checks.

**Impact:** Intended personalization is silently lost, and stored purchase totals can differ from what checkout charged, affecting fulfillment, reporting and refunds.

**Remediation:** Preserve immutable line identity including personalization/options, display gift instructions before payment, and calculate surcharges from each current server order line rather than a variant-only lookup.

**Acceptance check:** Different messages remain separate through persistence/checkout/order payload; identical messages merge only by policy. Mixed wrapped/unwrapped duplicates in either order produce identical correct totals, including quantities and shipping-threshold boundaries.

<a id="f15"></a>
### F15 — Invalid delivery contact details reach the payment step

**Priority: P2. High confidence · browser reproduction + source.** Domain entries: FE-004.

**Evidence:** [src/app/checkout/page.tsx:115](/home/infinityzer0/Playground/eCom/src/app/checkout/page.tsx:115) advances after form submission; phone/postal controls at [src/app/checkout/page.tsx:380](/home/infinityzer0/Playground/eCom/src/app/checkout/page.tsx:380) rely on required/nonempty input without meaningful country-format validation.

**Prerequisite / proof:** A synthetic Indian address with phone 111 and postal code xyz advances to Payment Details. [frontend/checkout-audit.json](/home/infinityzer0/Playground/eCom/docs/audits/2026-10-28/frontend/checkout-audit.json) records accepted inputs; no payment was submitted. Country choices also span several countries while the implemented shipping calculation is uniform; actual international support was not established.

**Impact:** Customers can reach a financial action with unusable delivery/contact information and little assistance correcting it. Frontend checks also cannot replace server validation of fulfillment data.

**Remediation:** Normalize and validate supported-country phone/postal/address rules on client and server, associate inline errors, add autocomplete/input hints, and restrict destinations to supported fulfillment coverage.

**Acceptance check:** Invalid Indian examples cannot advance; valid supported-country formats work. Errors identify/focus the relevant fields and are announced. Direct invalid fulfillment payloads are rejected server-side.

<a id="f16"></a>
### F16 — Postal lookup failures invent delivery and COD promises

**Priority: P2. High confidence · injected browser network failure + source.** Domain entries: FE-005.

**Evidence:** [src/components/ProductDetail.tsx:149](/home/infinityzer0/Playground/eCom/src/components/ProductDetail.tsx:149) converts network failure into valid delivery using a postal-prefix heuristic. Even successful area lookup maps to inferred SLA/COD at [src/components/ProductDetail.tsx:136](/home/infinityzer0/Playground/eCom/src/components/ProductDetail.tsx:136). [src/app/checkout/page.tsx:423](/home/infinityzer0/Playground/eCom/src/app/checkout/page.tsx:423) exposes online payment, with no COD choice.

**Prerequisite / proof:** With postal-service requests aborted, code 111111 displays an express 2–3 day estimate and COD availability. [frontend/interaction-audit.json](/home/infinityzer0/Playground/eCom/docs/audits/2026-10-28/frontend/interaction-audit.json) records the exact positive result. India Post area existence itself does not verify merchant/courier service or payment coverage.

**Impact:** Customers are encouraged to purchase using unverified delivery/payment claims, especially during outages.

**Remediation:** Show verification unavailable on failure and use actual merchant/courier eligibility data for delivery estimates. Display COD only when supported through checkout and fulfillment.

**Acceptance check:** Failed/nonexistent/unsupported postal checks never receive affirmative eligibility. Any advertised delivery/COD offer corresponds to validated coverage and a usable checkout path.

<a id="f17"></a>
### F17 — Obsolete asynchronous responses can overwrite current selections

**Priority: P2. High confidence in source path · race not timed live.** Domain entries: FE-006.

**Evidence:** [src/components/ProductDetail.tsx:88](/home/infinityzer0/Playground/eCom/src/components/ProductDetail.tsx:88) starts postal lookups without cancellation/generation checks, while [src/components/ProductDetail.tsx:352](/home/infinityzer0/Playground/eCom/src/components/ProductDetail.tsx:352) changes/clears the input. [src/app/wishlist/WishlistGrid.tsx:15](/home/infinityzer0/Playground/eCom/src/app/wishlist/WishlistGrid.tsx:15) likewise has no effect cleanup or response-generation guard.

**Prerequisite / proof:** A slow response for input A can complete after B or after clearing the input and restore A's status. An earlier wishlist/account response can similarly replace the latest or emptied list. This follows control flow; the original browser audit did not time an out-of-order race.

**Impact:** Displayed delivery feedback can refer to another postal code and removed/previous wishlist cards can reappear. Saved IDs are not proven deleted.

**Remediation:** Abort superseded requests or commit state only when input/account/request identity still matches. Reset dependent state deliberately on selection changes.

**Acceptance check:** Deterministic delayed-response tests finish A after B and clear/switch wishlist while a request is pending; only current-input/account data is shown.

<a id="f18"></a>
### F18 — Data-service failures masquerade as empty, missing or invalid data

**Priority: P2. High confidence · backend source + injected frontend API failures.** Domain entries: BE-009, FE-007.

**Evidence:** [src/lib/neon.ts:77](/home/infinityzer0/Playground/eCom/src/lib/neon.ts:77) and [src/lib/neon.ts:289](/home/infinityzer0/Playground/eCom/src/lib/neon.ts:289) collapse query failures to null; [src/data/db.ts:91](/home/infinityzer0/Playground/eCom/src/data/db.ts:91) maps failures to empty/undefined data. [src/app/product/[id]/page.tsx:39](/home/infinityzer0/Playground/eCom/src/app/product/[id]/page.tsx:39) can call notFound and [src/app/api/auth/login/route.ts:16](/home/infinityzer0/Playground/eCom/src/app/api/auth/login/route.ts:16) can return invalid credentials. [src/app/wishlist/WishlistGrid.tsx:25](/home/infinityzer0/Playground/eCom/src/app/wishlist/WishlistGrid.tsx:25) and [src/app/admin/page.tsx:123](/home/infinityzer0/Playground/eCom/src/app/admin/page.tsx:123) also lack usable failed-fetch states.

**Prerequisite / proof:** Injected wishlist 500 yields both one saved item and “Your wishlist is empty”; injected admin 503 claims there are no products and invites first creation. Saved IDs remain intact. Source traces database timeouts to empty catalogue/missing product/wrong-password outcomes. See [frontend/interaction-audit.json](/home/infinityzer0/Playground/eCom/docs/audits/2026-10-28/frontend/interaction-audit.json) and [frontend/admin-filter-audit.json](/home/infinityzer0/Playground/eCom/docs/audits/2026-10-28/frontend/admin-filter-audit.json).

**Impact:** Customers and operators receive misleading business results, cannot choose an appropriate retry, and monitoring may see success during outages. Product not-found content during an outage may affect discovery; streaming means a fixed HTTP 404 is not assumed.

**Remediation:** Separate true absence from infrastructure failure throughout repository/API/UI contracts. Return retryable service errors or a deliberate cached/degraded state; retain useful data and provide announced retry controls. Keep internals out of responses.

**Acceptance check:** Database timeout, HTTP 500/offline and malformed-response tests show recoverable failure rather than empty catalogue/wishlist or wrong-password claims. Genuine empty/missing cases keep their intended states.

<a id="f19"></a>
### F19 — Shopping data stays stale across tabs

**Priority: P2. High confidence · wishlist browser reproduction; matching cart source defect.** Domain entries: FE-009.

**Evidence:** [src/context/WishlistContext.tsx:61](/home/infinityzer0/Playground/eCom/src/context/WishlistContext.tsx:61) and [src/context/CartContext.tsx:106](/home/infinityzer0/Playground/eCom/src/context/CartContext.tsx:106) subscribe only to a same-window auth event. [src/components/Header.tsx:30](/home/infinityzer0/Playground/eCom/src/components/Header.tsx:30) separately listens for storage changes, so identity and shopping state can diverge.

**Prerequisite / proof:** Two pages in the same disposable context/origin share localStorage. After one saves an item, the other still shows an empty wishlist despite the saved ID existing. [frontend/state-audit.json](/home/infinityzer0/Playground/eCom/docs/audits/2026-10-28/frontend/state-audit.json) records this. Cart lacks the same cross-tab subscription; cart lost updates were inferred from the write path rather than separately reproduced.

**Impact:** Tabs show inconsistent selections and can overwrite newer storage; an updated account header may accompany stale cart/wishlist identity.

**Remediation:** Use a synchronized account-keyed store via storage events/BroadcastChannel or equivalent, with an explicit conflict/merge policy and logout propagation.

**Acceptance check:** Adding/removing items and signing out in either tab updates all tabs without reload and never overwrites newer data or preserves another account's shopping context.

<a id="f20"></a>
### F20 — Malformed persisted cart data can crash every page

**Priority: P2. High confidence · synthetic persistence failure + source.** Domain entries: FE-010.

**Evidence:** [src/context/CartContext.tsx:45](/home/infinityzer0/Playground/eCom/src/context/CartContext.tsx:45) accepts truthy product/variant objects with little nested validation. The root-mounted drawer at [src/app/layout.tsx:39](/home/infinityzer0/Playground/eCom/src/app/layout.tsx:39) reads [src/components/CartDrawer.tsx:112](/home/infinityzer0/Playground/eCom/src/components/CartDrawer.tsx:112) even when closed.

**Prerequisite / proof:** Putting [{"quantity":1,"product":{},"variant":{}}] in the disposable guest-cart key and reloading throws while reading images[0], before opening the bag. The failure is recorded in [frontend/state-audit.json](/home/infinityzer0/Playground/eCom/docs/audits/2026-10-28/frontend/state-audit.json). It is intentionally malformed local data, separate from the resolved historical clean-session product error.

**Impact:** Corrupted or incompatible browser persistence can repeatedly prevent the whole storefront from loading; reload retains the bad record.

**Remediation:** Version and deeply validate stored cart records, discard/quarantine incompatible lines and tolerate storage failures. Limit the failure boundary so a bad cart cannot take down unrelated pages.

**Acceptance check:** Missing/malformed images, prices, IDs and incompatible record versions recover to a usable storefront with understandable cart recovery; repeated reloads stay usable.

<a id="f21"></a>
### F21 — Forms and purchase controls omit accessible names, selection and feedback

**Priority: P2. High confidence · DOM/source inspection; no screen-reader certification.** Domain entries: FE-011, FE-012.

**Evidence:** [src/app/login/page.tsx:164](/home/infinityzer0/Playground/eCom/src/app/login/page.tsx:164) and [src/app/admin/page.tsx:533](/home/infinityzer0/Playground/eCom/src/app/admin/page.tsx:533) display labels without input associations; [src/components/ProductDetail.tsx:308](/home/infinityzer0/Playground/eCom/src/components/ProductDetail.tsx:308) has only a gift-message placeholder. Metal/size/specification controls at [src/components/ProductDetail.tsx:253](/home/infinityzer0/Playground/eCom/src/components/ProductDetail.tsx:253) lack selected-state semantics; status/error containers at [src/app/checkout/page.tsx:443](/home/infinityzer0/Playground/eCom/src/app/checkout/page.tsx:443) and [src/app/admin/page.tsx:522](/home/infinityzer0/Playground/eCom/src/app/admin/page.tsx:522) lack live/error associations.

**Prerequisite / proof:** The browser reports zero associated labels for two login inputs and all eleven inspected admin controls. Specification/login/option buttons use CSS for selection. Native buttons have implicit button roles; the defect is missing semantic selection/panel relationships and feedback, not an absence of any role.

**Impact:** Screen-reader/voice-control users may not match fields to visible labels, distinguish repeated variant inputs, identify the selected purchasing option or learn that an asynchronous operation failed.

**Remediation:** Associate labels/descriptions/errors, group repeated fields, use native radio/select controls or complete tab/pressed semantics, and announce asynchronous outcomes with deliberate focus handling.

**Acceptance check:** Accessible names match visible labels and clicks focus their fields. Keyboard/screen-reader checks identify all selected values, correct panels and distinct variant groups; errors/success announce once without disrupting focus.

<a id="f22"></a>
### F22 — Price text and focus indicators fail applicable contrast targets

**Priority: P2. High confidence · source-based sRGB calculation independently rerun.** Domain entries: FE-013.

**Evidence:** [src/app/globals.css:113](/home/infinityzer0/Playground/eCom/src/app/globals.css:113) uses the light gold focus outline; [src/components/CartDrawer.module.css:250](/home/infinityzer0/Playground/eCom/src/components/CartDrawer.module.css:250) and [src/components/CartDrawer.module.css:272](/home/infinityzer0/Playground/eCom/src/components/CartDrawer.module.css:272) use gold item/total prices. [src/app/admin/page.tsx:719](/home/infinityzer0/Playground/eCom/src/app/admin/page.tsx:719) uses light gold small text. The 9px eyebrow at [src/components/Editorial.tsx:126](/home/infinityzer0/Playground/eCom/src/components/Editorial.tsx:126) inherits the ivory background from [src/components/Editorial.module.css:94](/home/infinityzer0/Playground/eCom/src/components/Editorial.module.css:94).

**Prerequisite / proof:** [frontend/color-contrast.json](/home/infinityzer0/Playground/eCom/docs/audits/2026-10-28/frontend/color-contrast.json) records light gold/white 2.354:1 (focus needs 3:1; small admin text 4.5:1), price gold/white 2.985:1 (15px text needs 4.5:1; 20px bold total 3:1), and dark gold/ivory 4.268:1 (small text needs 4.5:1). Dark gold on white passes 4.530:1. Logo artwork is excluded.

**Impact:** Prices, supporting text and keyboard focus become difficult to perceive for low-vision users. A token that passes on white does not automatically pass on ivory.

**Remediation:** Choose tested text/focus tokens for each surface; reserve light gold for decoration. Check actual neighboring/background colors across interactive states.

**Acceptance check:** Source/rendered verification meets relevant normal-text, large-text and non-text contrast thresholds for white/ivory surfaces and default/selected/hover/focus/error states.

<a id="f23"></a>
### F23 — The admin creator overflows a 320px viewport

**Priority: P2. High confidence · browser with synthetic authorized UI and blocked APIs.** Domain entries: FE-014.

**Evidence:** [src/app/admin/admin.module.css:31](/home/infinityzer0/Playground/eCom/src/app/admin/admin.module.css:31) and [src/app/admin/admin.module.css:61](/home/infinityzer0/Playground/eCom/src/app/admin/admin.module.css:61) allow intrinsic grid/card content to exceed narrow space; [src/app/admin/page.tsx:528](/home/infinityzer0/Playground/eCom/src/app/admin/page.tsx:528) renders the affected form.

**Prerequisite / proof:** At viewport 320, document scrollWidth is 351; the creator card spans x=16 to 351 and is 335px wide. [frontend/admin-overflow.json](/home/infinityzer0/Playground/eCom/docs/audits/2026-10-28/frontend/admin-overflow.json) and [frontend/admin-320.png](/home/infinityzer0/Playground/eCom/docs/audits/2026-10-28/frontend/admin-320.png) retain measurements/screenshot. Public routes did not show page overflow at the checked widths; clipped carousel descendants were not misclassified.

**Impact:** Narrow-phone/high-zoom operators must pan horizontally to use a form whose right side starts offscreen.

**Remediation:** Allow tracks/cards/controls to shrink with suitable zero minimums and minmax sizing, constrain intrinsic file-input widths and preserve control readability.

**Acceptance check:** At320 CSS pixels and desktop 400% zoom, the full admin form reflows without horizontal page scrolling or clipped labels/controls.

<a id="f24"></a>
### F24 — Filter state diverges from the URL and resets on category navigation

**Priority: P2. High confidence · browser + source.** Domain entries: FE-015.

**Evidence:** [src/components/ProductList.tsx:61](/home/infinityzer0/Playground/eCom/src/components/ProductList.tsx:61) resets local category/sort/price without resetting URL state. Category navigation at [src/components/ProductList.tsx:95](/home/infinityzer0/Playground/eCom/src/components/ProductList.tsx:95) changes the key supplied at [src/app/page.tsx:30](/home/infinityzer0/Playground/eCom/src/app/page.tsx:30), recreating local state.

**Prerequisite / proof:** From category=rings, Reset filters displays eight products but leaves that category in the URL; reload returns to the empty category. Highest-price sort becomes Featured after selecting Earrings. [frontend/admin-filter-audit.json](/home/infinityzer0/Playground/eCom/docs/audits/2026-10-28/frontend/admin-filter-audit.json) contains both observations.

**Impact:** Copied links/reloads disagree with visible results and category changes discard deliberate sorting/price selections.

**Remediation:** Adopt one consistent URL-backed filter model or preserve all intended state across remounts; clearing filters must update relevant query parameters.

**Acceptance check:** Sorting/price survive category changes as intended, Reset updates URL and UI together, and reload/share/back reconstruct identical results.

<a id="f25"></a>
### F25 — Payment help and return promises have no usable support destination

**Priority: P2. High confidence · source and complete route/link inventory.** Domain entries: FE-017.

**Evidence:** [src/components/ProductDetail.tsx:400](/home/infinityzer0/Playground/eCom/src/components/ProductDetail.tsx:400) promises returns; [src/app/checkout/page.tsx:206](/home/infinityzer0/Playground/eCom/src/app/checkout/page.tsx:206) tells customers to contact support. [src/components/Footer.tsx:106](/home/infinityzer0/Playground/eCom/src/components/Footer.tsx:106) and [src/app/profile/page.tsx:107](/home/infinityzer0/Playground/eCom/src/app/profile/page.tsx:107) expose shopping/account navigation without contact or order-help destinations.

**Prerequisite / proof:** No site support contact/link, return instructions or help route exists in the reviewed route/link inventory. No privacy/terms/shipping/returns pages were found either; legal sufficiency was not assessed. The concrete issue is inability to act on an explicit support/return instruction.

**Impact:** A customer with uncertain payment status or a return request lacks an actionable on-site next step.

**Remediation:** Provide a reachable monitored support channel and clear fulfillment/returns information. Link payment failures to a reference-bearing help action and publish applicable policy destinations where information is collected.

**Acceptance check:** Every support/return promise reaches an accessible working destination with enough purchase context to request help; it remains usable when order verification fails.

<a id="f26"></a>
### F26 — Catalogue creation and deletion can leave partial products

**Priority: P2. High confidence · source + corrected isolated admin failure.** Domain entries: BE-007.

**Evidence:** [src/app/api/admin/product/route.ts:108](/home/infinityzer0/Playground/eCom/src/app/api/admin/product/route.ts:108) writes the product before variants; [src/lib/neon.ts:175](/home/infinityzer0/Playground/eCom/src/lib/neon.ts:175) inserts variants sequentially. A partial failure returns a 200 warning at [src/app/api/admin/product/route.ts:115](/home/infinityzer0/Playground/eCom/src/app/api/admin/product/route.ts:115), yet [src/app/admin/page.tsx:319](/home/infinityzer0/Playground/eCom/src/app/admin/page.tsx:319) clears the form. [src/lib/neon.ts:194](/home/infinityzer0/Playground/eCom/src/lib/neon.ts:194) separately deletes variants before products despite cascade support.

**Prerequisite / proof:** The corrected authorized mock saves one product, forces variant insertion false and receives 200/warning. The original401 fixture was rejected and replaced during review. Deletion interruption is source-confirmed, not executed against real data. Current schema counts show no existing variantless products.

**Impact:** Products can become visible without purchasable variants, with a zero base price or incomplete options. The warning requests a repair flow that does not exist, while entered data is cleared.

**Remediation:** Treat a product and its required variants as one transactional aggregate; use a single cascade delete or equivalent atomic operation. Roll back and retain form state, or provide an explicit visible draft/repair workflow.

**Acceptance check:** Fail any variant insert/delete stage: catalogue remains unchanged or a deliberate recoverable draft exists. No accidental variantless live product and no loss of repair input.

<a id="f27"></a>
### F27 — Admin create requests can modify unrelated variant identities

**Priority: P2. High confidence · source + isolated relationship mismatch; requires admin authority.** Domain entries: BE-008.

**Evidence:** [src/app/api/admin/product/route.ts:70](/home/infinityzer0/Playground/eCom/src/app/api/admin/product/route.ts:70) validates fields without tying each variant to the new product or requiring unique/nonempty variants and integer stock. [src/lib/neon.ts:179](/home/infinityzer0/Playground/eCom/src/lib/neon.ts:179) updates stock/price for any colliding variant ID while retaining its original parent.

**Prerequisite / proof:** An authorized mock creates a new product while forwarding a variant belonging to another fixture product and returns 200. The actual conflicting-ID SQL path was inspected, not executed live. Empty variants and malformed image origins also lack the intended aggregate checks.

**Impact:** An administrative integration mistake can change another product's stock/price and leave the new product empty. This is distinct from F01: it requires administrative authority but corrupts data even for legitimate operators.

**Remediation:** Generate/bind identifiers server-side; validate the complete aggregate, nonempty options, bounded fields, compatible image sources, finite prices and nonnegative integer stock. Reject cross-product conflicts before any write.

**Acceptance check:** Mismatched/colliding IDs, empty variants and invalid numeric/image inputs fail 4xx with zero writes. Creating one product cannot alter pre-existing variants.

<a id="f28"></a>
### F28 — Newsletter persistence failure is reported as subscription success

**Priority: P2. High confidence · source + isolated failed persistence.** Domain entries: BE-010.

**Evidence:** [src/app/api/newsletter/route.ts:12](/home/infinityzer0/Playground/eCom/src/app/api/newsletter/route.ts:12) ignores the subscriber-helper result; [src/lib/neon.ts:269](/home/infinityzer0/Playground/eCom/src/lib/neon.ts:269) catches insert failure and returns false. The route then returns success.

**Prerequisite / proof:** The actual route with dbInsertSubscriber mocked false returns HTTP 200/success. See [backend/isolated-route-results.json](/home/infinityzer0/Playground/eCom/docs/audits/2026-10-28/backend/isolated-route-results.json). Duplicate-email ON CONFLICT success is a separate intentional case; no real subscriber was added.

**Impact:** The interface welcomes users to a list that did not store their subscription, concealing outages and losing intended registrations.

**Remediation:** Require successful persistence and return retryable failure otherwise; preserve entered email. Keep idempotent success for genuinely existing subscribers and validate canonical addresses.

**Acceptance check:** Insert-failure injection produces a recoverable UI error and retains input; a valid duplicate succeeds without creating another row.

<a id="f29"></a>
### F29 — Documented database bootstrap targets obsolete columns

**Priority: P2. High confidence · static SQL/script comparison + scoped schema metadata; scripts not executed.** Domain entries: BE-011.

**Evidence:** [neon_seed.sql:21](/home/infinityzer0/Playground/eCom/neon_seed.sql:21) defines products without base_price and [neon_seed.sql:63](/home/infinityzer0/Playground/eCom/neon_seed.sql:63) defines variant price instead of price_adjustment. After executing that seed, [scripts/seed.mjs:45](/home/infinityzer0/Playground/eCom/scripts/seed.mjs:45) updates those absent legacy columns. [scripts/migrate.mjs:51](/home/infinityzer0/Playground/eCom/scripts/migrate.mjs:51) unconditionally reads them before removal. The configured schema snapshot confirms they are absent.

**Prerequisite / proof:** Running the advertised seed against an empty/current-schema database would execute the schema/data batch, then fail its legacy-price update batch with undefined-column errors. The migration requires an old schema but has no documented source-version gate or repeatable migration ledger. No seed/migration was run during audit.

**Impact:** Setup, repeatable environments and recovery are unreliable; an operator can be left with partially completed bootstrap. This is a confirmed operational code mismatch, not an observed production data incident.

**Remediation:** Remove obsolete follow-up writes, separate legacy conversion from current bootstrap, add explicit migration version/precondition handling and document setup/recovery.

**Acceptance check:** A disposable empty database reaches current schema through documented commands. Seed reruns are safe; migration accepts only supported starting versions or reports already applied without partial changes.

<a id="f30"></a>
### F30 — Email lookup and database uniqueness use different identity rules

**Priority: P2. High confidence · source + database metadata; concurrency scenario not executed live.** Domain entries: BE-012.

**Evidence:** [src/app/api/auth/signup/route.ts:18](/home/infinityzer0/Playground/eCom/src/app/api/auth/signup/route.ts:18) performs a separate pre-check and insert without canonicalization. [src/lib/neon.ts:285](/home/infinityzer0/Playground/eCom/src/lib/neon.ts:285) looks up LOWER(email) with LIMIT1; [neon_seed.sql:91](/home/infinityzer0/Playground/eCom/neon_seed.sql:91) and the configured schema only enforce case-sensitive UNIQUE(email).

**Prerequisite / proof:** Concurrent differently cased registrations can both pass the pre-check and insert, then both match the same unordered case-insensitive login query. Whitespace/malformed addresses can create further inconsistencies; identical concurrent inserts can become generic 500 failures. No real duplicate accounts were created or observed.

**Impact:** Identity becomes ambiguous, sign-in may choose an unintended matching row, and duplicate-registration behavior becomes unstable.

**Remediation:** Define one normalization policy consistent with login, resolve existing collisions, enforce canonical uniqueness in the database and handle races as explicit conflicts. Validate trimmed structure/length before hashing.

**Acceptance check:** Sequential/concurrent case and whitespace variants cannot create distinct identities; login resolves exactly one intended profile and duplicates yield a deliberate conflict response.

<a id="f31"></a>
### F31 — Jewellery Care opens an empty content panel

**Priority: P3. High confidence · browser reproduction + source.** Domain entries: FE-021.

**Evidence:** [src/components/ProductDetail.tsx:405](/home/infinityzer0/Playground/eCom/src/components/ProductDetail.tsx:405) renders optional care text with no empty fallback while keeping its navigation control.

**Prerequisite / proof:** Golden Twist Drop Earrings opens a blank care panel in [frontend/state-audit.json](/home/infinityzer0/Playground/eCom/docs/audits/2026-10-28/frontend/state-audit.json).

**Impact:** A customer requesting product-care guidance receives no explanation or usable information.

**Remediation:** Provide accurate material-specific fallback guidance or an explicit unavailable state; avoid invented care advice.

**Acceptance check:** Null/empty care fields never open a blank panel, and any shared guidance matches the actual material.


## Conditional risks

These are verified code paths with additional configuration/catalogue/operator prerequisites. They are **not** claims that the triggering condition currently exists in production or that an incident occurred.

| ID | Priority | Finding | Domain entries |
| --- | --- | --- | --- |
| [C01](#c01) | P2 | Purity-distinct variants can become unselectable | FE-020 |
| [C02](#c02) | P2 | Missing media configuration is disguised as a successful upload | BE-013 |
| [C03](#c03) | P2 | Maintenance scripts can disable database certificate verification | SEC-012 |
| [C04](#c04) | P2 | Deployment helper copies one secret set into every environment | SEC-013 |

<a id="c01"></a>
### C01 — Purity-distinct variants can become unselectable

**Priority: P2. High confidence in conditional source behavior · absent from inspected catalogue.** Domain entries: FE-020.

**Evidence:** [src/components/ProductDetail.tsx:25](/home/infinityzer0/Playground/eCom/src/components/ProductDetail.tsx:25) initializes metal/size; [src/components/ProductDetail.tsx:70](/home/infinityzer0/Playground/eCom/src/components/ProductDetail.tsx:70) selects the first matching metal/size and falls back to the first variant. Purity is ignored. [src/app/admin/page.tsx:279](/home/infinityzer0/Playground/eCom/src/app/admin/page.tsx:279) can create multiple rows sharing the same metal label.

**Prerequisite / proof:** The locally configured catalogue has 25 products, 25 variants and no variantless products, so each currently has one variant. The collision requires a future/admin fixture with the same metal/size and different purity, or an invalid option combination. It was not inserted into the database.

**Impact:** A legitimate second SKU can be unreachable or an out-of-stock first SKU can mask available stock; the fallback can select a different SKU.

**Remediation:** Select exact purchasable variant identity or model every meaningful dimension; invalid combinations must remain unavailable.

**Acceptance check:** In a disposable fixture, each same-metal/size but different-purity SKU is independently selected, priced and added by its exact ID; no silent first-row fallback.

<a id="c02"></a>
### C02 — Missing media configuration is disguised as a successful upload

**Priority: P2. High confidence in conditional source path · current misconfiguration not demonstrated.** Domain entries: BE-013.

**Evidence:** [src/app/api/cloudinary/upload/route.ts:67](/home/infinityzer0/Playground/eCom/src/app/api/cloudinary/upload/route.ts:67) returns an unrelated placeholder URL with 200 if cloud name is absent/placeholder. [src/app/admin/page.tsx:241](/home/infinityzer0/Playground/eCom/src/app/admin/page.tsx:241) logs the warning, accepts the URL and continues creation.

**Prerequisite / proof:** This needs an authorized upload in an environment with missing/placeholder cloud-name configuration. No upload was performed and no current catalogue photo was identified as wrong through this path.

**Impact:** Operators can save products with a photo different from the file they selected while believing upload succeeded.

**Remediation:** Fail clearly before product creation, retain selected files/form state and reserve placeholders for an explicit draft choice.

**Acceptance check:** Missing media configuration returns an actionable error and no product write; configured uploads return the actual uploaded asset.

<a id="c03"></a>
### C03 — Maintenance scripts can disable database certificate verification

**Priority: P2. High confidence · source + offline parsed-option check; current local override differs.** Domain entries: SEC-012.

**Evidence:** [scripts/seed.mjs:29](/home/infinityzer0/Playground/eCom/scripts/seed.mjs:29), [scripts/migrate.mjs:29](/home/infinityzer0/Playground/eCom/scripts/migrate.mjs:29) and [scripts/upload-to-cloudinary.mjs:76](/home/infinityzer0/Playground/eCom/scripts/upload-to-cloudinary.mjs:76) set rejectUnauthorized:false. [security/tls-option-results.json](/home/infinityzer0/Playground/eCom/docs/audits/2026-10-28/security/tls-option-results.json) and [security/tls-option-check.mjs](/home/infinityzer0/Playground/eCom/docs/audits/2026-10-28/security/tls-option-check.mjs) show parsed option precedence without connecting.

**Prerequisite / proof:** A synthetic connection URL without SSL options retains disabled verification. The configured local URL overrides this and does not explicitly disable verification. The test did not perform a TLS handshake or inspect a provider certificate; another operator URL is required to activate the fallback.

**Impact:** With affected options and a network-positioned attacker, a maintenance connection can trust an impersonated database, exposing credentials or corrupting work.

**Remediation:** Remove blanket certificate bypasses; use verified TLS with explicit trusted CA/hostname and documented connection modes.

**Acceptance check:** Local controlled TLS fixtures with untrusted certificates/wrong hostnames fail for every supported configuration; valid trusted connections work.

<a id="c04"></a>
### C04 — Deployment helper copies one secret set into every environment

**Priority: P2. High confidence in script behavior · invocation and deployed values unverified.** Domain entries: SEC-013.

**Evidence:** [scripts/add-vercel-envs.mjs:12](/home/infinityzer0/Playground/eCom/scripts/add-vercel-envs.mjs:12) reads .env.local; [scripts/add-vercel-envs.mjs:29](/home/infinityzer0/Playground/eCom/scripts/add-vercel-envs.mjs:29) removes/re-adds all entries to production, preview and development without distinct sources.

**Prerequisite / proof:** The risky condition is running the helper with privileged production values or local test settings. The audit neither executed it nor inspected actual hosted environment values.

**Impact:** Preview/development can inherit production access, or local/test settings can replace production payment/database configuration. Remove-then-add also creates an avoidable configuration gap.

**Remediation:** Use explicit target/environment allowlists and isolated least-privilege credentials/databases/provider modes; validate before applying changes.

**Acceptance check:** A dry-run fixture assigns only intended distinct values to each environment, and authorized deployment verification demonstrates separation without printing credentials.


## Capability and quality recommendations

These are useful completeness/maintenance work with the scope limitations stated below, rather than assumed regressions against an unavailable product specification.

| ID | Priority | Finding | Domain entries |
| --- | --- | --- | --- |
| [R01](#r01) | P2 | Provide routine merchant editing and sized-variant operations | FE-019 |
| [R02](#r02) | P3 | Complete metadata and crawlable product discovery | FE-018 |
| [R03](#r03) | P3 | Increase the readability of supporting mobile copy | FE-022 |
| [R04](#r04) | P3 | Bound catalogue reads as inventory grows | BE-014 |

<a id="r01"></a>
### R01 — Provide routine merchant editing and sized-variant operations

**Priority: P2. High confidence · source-confirmed capability gap; no prior specification/regression assumed.** Domain entries: FE-019.

**Evidence:** [src/app/admin/page.tsx:279](/home/infinityzer0/Playground/eCom/src/app/admin/page.tsx:279) omits size from generated variants; [src/app/admin/page.tsx:751](/home/infinityzer0/Playground/eCom/src/app/admin/page.tsx:751) lists products with delete but no stock/price/content editor.

**Prerequisite / proof:** The current interface offers create/delete without a normal operation to replenish stock, correct a price/description or create sized variants. Direct database/manual workflows could exist but were not inspected.

**Impact:** Routine maintenance requires work outside the site or destructive recreation that can break stable product links.

**Remediation:** Add authorized aggregate editing with stock visibility, variant sizes and explicit pending/error handling while preserving product identity.

**Acceptance check:** A test administrator can replenish/correct a product and manage sizes without deleting it or changing its public URL.

<a id="r02"></a>
### R02 — Complete metadata and crawlable product discovery

**Priority: P3. High confidence in implementation observations · ranking/indexing impact unmeasured.** Domain entries: FE-018.

**Evidence:** [src/app/layout.tsx:20](/home/infinityzer0/Playground/eCom/src/app/layout.tsx:20) defines shared metadata; [src/app/product/[id]/page.tsx:24](/home/infinityzer0/Playground/eCom/src/app/product/[id]/page.tsx:24) has product title/description but no canonical/offer data. [src/components/ProductList.tsx:168](/home/infinityzer0/Playground/eCom/src/components/ProductList.tsx:168) renders an initial slice and expands via a button. No sitemap/robots metadata or public equivalents were found.

**Prerequisite / proof:** Utility/private routes inherit storefront metadata, and no deliberate canonical/indexing policy or Product/Offer structured data exists. Later grid items lack crawlable pagination links in that surface; JavaScript search-engine behavior does not guarantee Load More interaction.

**Impact:** Browser history titles and search presentation/discovery are less controlled. This is not evidence that later products are unindexed or that rankings declined.

**Remediation:** Define route-specific metadata/canonical/indexing policy, expose products via sitemap/crawlable pagination and validate current product offer data.

**Acceptance check:** Production HTML has intentional metadata, all public products have a crawlable discovery path and structured data matches visible prices/availability.

<a id="r03"></a>
### R03 — Increase the readability of supporting mobile copy

**Priority: P3. High confidence in source/DOM dimensions · usability recommendation, not a WCAG minimum-font-size claim.** Domain entries: FE-022.

**Evidence:** [src/components/Header.module.css:181](/home/infinityzer0/Playground/eCom/src/components/Header.module.css:181) reduces announcement copy to 6px at mobile widths; [src/components/Footer.module.css:58](/home/infinityzer0/Playground/eCom/src/components/Footer.module.css:58) uses 8px consent copy. [src/components/ProductList.module.css:53](/home/infinityzer0/Playground/eCom/src/components/ProductList.module.css:53) and [src/components/ProductDetail.module.css:636](/home/infinityzer0/Playground/eCom/src/components/ProductDetail.module.css:636) include small supporting labels.

**Prerequisite / proof:** Browser/CSS evidence shows 6–10px shipping/consent/filter/supporting copy; the announcement is hidden below 370px. No usability study, physical-device or iOS auto-zoom finding was made.

**Impact:** Customers may need magnification for information relevant to consent, shipping and product filtering.

**Remediation:** Use a readable supporting text scale and wrapping/shorter wording instead of shrinking essential content to fit a line.

**Acceptance check:** At100% and 200% text scale on narrow screens, these details remain readable and available without clipping or hidden essential information.

<a id="r04"></a>
### R04 — Bound catalogue reads as inventory grows

**Priority: P3. High confidence in query shape · no current latency/SLA failure measured.** Domain entries: BE-014.

**Evidence:** [src/app/product/[id]/page.tsx:45](/home/infinityzer0/Playground/eCom/src/app/product/[id]/page.tsx:45) reads all products to keep one related product; [src/lib/neon.ts:69](/home/infinityzer0/Playground/eCom/src/lib/neon.ts:69) includes full catalogue fields/minimum-price subqueries. Metadata/page independently look up the product; [src/app/page.tsx:18](/home/infinityzer0/Playground/eCom/src/app/page.tsx:18) loads the entire catalogue for client filtering.

**Prerequisite / proof:** Source establishes catalogue-size work and no explicit React request memoization for the repeated DB lookup. Next fetch memoization should not be presumed for direct database calls. The observed catalogue has only 25 products; exact network-call count and production latency were not measured.

**Impact:** Per-product and initial browse work/payload can grow unnecessarily with catalogue size.

**Remediation:** Use targeted limited related-product queries, appropriate server pagination/filtering and per-request deduplication while preserving price/stock freshness.

**Acceptance check:** A representative disposable larger catalogue shows bounded related-product rows and page payloads; intended lookups deduplicate within a request without stale commerce data.


## Defense in depth, strengths and withheld claims

- **Authorization boundaries:** missing tokens were rejected by local me/admin/upload routes; a customer token was denied in the isolated admin check. Editing local UI metadata alone is not a demonstrated server bypass. F01/F02 explain the actual authority failures.
- **SQL and text rendering:** reviewed runtime SQL uses parameterized tagged templates; maintenance updates use bound values. React renders text without an observed dangerous HTML sink. No direct SQL injection or reflected/stored XSS was established. Explicit bearer authorization on privileged mutations also means cookie-CSRF should not be asserted without a corresponding route behavior; revisit CSRF when implementing F12.
- **HTTP policy:** configured/local headers include frame denial, nosniff, referrer and permissions policies. CSP/HSTS were absent from the local HTTP development response, which does not establish their absence at production ingress. Add a tested CSP compatible with framework/payment resources and verify HTTPS/HSTS where deployed.
- **Media defenses:** upload allows JPEG/PNG/WebP declarations and checks 5MB after multipart parsing. Validate real decoded type/dimensions and request size earlier; fail closed on missing signing configuration. Provider processing may impose additional checks. Arbitrary script hosting or live unsigned-preset abuse was not shown.
- **Cryptographic comparison:** provider HMAC checks use ordinary string inequality at [src/app/api/verify-payment/route.ts:57](/home/infinityzer0/Playground/eCom/src/app/api/verify-payment/route.ts:57) and [src/app/api/razorpay/verify/route.ts:47](/home/infinityzer0/Playground/eCom/src/app/api/razorpay/verify/route.ts:47). Prefer validated-length constant-time comparison while fixing the larger payment design. No practical remote timing exploit was demonstrated.
- **Logs and operations:** raw driver/provider errors and email-bearing log labels merit redaction, retention/access controls and correlation IDs. Only console-level application logging and no repository-owned payment reconciliation dashboard/alert/runbook were found. External monitoring/backups may exist. No real leaked customer log record was observed.
- **Legacy artifacts:** the documented seed-admin password does not match its seeded hash in the offline check ([security/seed-credential-check.json](/home/infinityzer0/Playground/eCom/docs/audits/2026-10-28/security/seed-credential-check.json)); it is not a proven working default login. The inactive Supabase seed contains permissive legacy policies, but active code uses Neon and no active Supabase client/public DB key was found. Treat obsolete bootstrapping/policies as hazardous if reapplied, not an active Neon policy bypass.
- **Motion/performance safeguards:** Three.js is dynamically imported, pixel ratio is capped, visibility controls pause work and resources are disposed; reduced motion is respected in reviewed paths. No GPU leak or measured Core Web Vitals failure was established. Catalogue-growth work is explicitly R04.
- **Quality gate:** the application has no repository test script/suite covering the critical money/account/catalogue invariants. The audit harnesses prove selected failures; they are not a complete regression suite. Repair the original lint errors and add meaningful invariant tests with the fixes, rather than counting each diagnostic as a separate defect.

Production hostname/TLS/hosting/OS, WAF/rate limits, actual secret validity, payment capture/settlement/webhook configuration, refunds, email delivery, active provider audit logs, backups/restore, full accessibility conformance, cross-browser behavior and real concurrent stock writes remain unverified. No load/denial-of-service or malicious-image processing was attempted. Shipping/tax rules were checked for internal consistency only; their business/legal correctness requires the merchant's own validation.

## Remediation sequence and release gate

| Order | Work | Required proof before considering it complete |
| --- | --- | --- |
| **1. Contain authority exposure** | F01–F02: public roles, administrator review, secret rotation and environment separation | Public signup cannot grant admin; old-key sessions fail; provider rotation and account review are documented without exposing values. |
| **2. Build one purchase lifecycle** | F03–F07: immutable server quote/order, validated cart/stock, idempotent transaction, durable provider mapping, callbacks/events/reconciliation; include F14 accounting | Cheap proof cannot buy a changed cart; duplicate/out-of-order events produce one result; write failures cannot falsely confirm; last-unit races cannot oversell; browser loss remains recoverable. |
| **3. Make checkout resilient and patch runtime** | F08–F09, F15–F16: bounded SDK load/retry, dependencies, delivery validation and truthful promises | Failed SDK recovers; current supported dependencies and native image versions checked; invalid delivery data blocked and unavailable postal lookup is honest. |
| **4. Repair identity and persistence contracts** | F10–F13, F17–F20, F30: account isolation, session revocation/storage, abuse controls, request generations, error semantics, cross-tab sync and storage schema | Synthetic account transitions, expired/revoked sessions, malformed storage, delayed responses and database outages all retain correct recoverable behavior. |
| **5. Stabilize merchant operations** | F26–F29, C02–C04 and R01: aggregate mutations, input linkage, subscription results, bootstrap, media/config isolation and editing | Disposable-database tests prove atomic create/delete, no cross-product mutation and repeatable setup; configuration failures preserve input and never pretend success. |
| **6. Finish customer usability** | F21–F25, F31, C01 and R02–R04: semantics/contrast/reflow, filters, help, care, variant completeness, discovery and measured scale | Keyboard/screen-reader/manual narrow/zoom checks pass; state survives navigation; support destinations work; conditional variant fixtures and larger-catalogue tests are covered. |

The engineering release gate should require closure of **F01 and every P1** or an explicit accountable exception with a verified compensating control. Run a provider test-mode end-to-end purchase with the agreed account/guest policy, callback-loss recovery, persistence failure and replay tests; verify current deployment configuration instead of inferring it from this workspace. Keep ordinary customer browsing tests and the previously successful product/logo checks as regression coverage. Resolve lint and retain build/typecheck plus targeted business tests in CI. Audit recommendations alone are not remediation.

## Domain-to-canonical mapping

Every one of the 49 original entries maps exactly once below. Grouping joins related root causes rather than adding overlapping FE/BE/SEC counts. F02 retains two independent secret-rotation checks; F03 includes frontend stale quoting plus server amount trust; F07 joins durable backend recovery with transient customer confirmation; F14 retains both personalization and gift-accounting checks; F18 joins repository/API/UI error contracts; F21 combines form/control semantic failures. Conditional and recommendation IDs remain outside the 31 current-finding count.

| Original domain entry | Canonical record | Consolidated subject |
| --- | --- | --- |
| BE-001 | [F03](#f03) | The payment amount and purchase contents have no server-owned binding |
| BE-002 | [F04](#f04) | Failed persistence still produces an order confirmation |
| BE-003 | [F05](#f05) | A payment proof can trigger fulfillment more than once |
| BE-004 | [F06](#f06) | Server cart validation and inventory enforcement are missing |
| BE-005 | [F14](#f14) | Gift line options are not consistently preserved or priced |
| BE-006 | [F07](#f07) | Payment and order recovery depend on transient browser state |
| BE-007 | [F26](#f26) | Catalogue creation and deletion can leave partial products |
| BE-008 | [F27](#f27) | Admin create requests can modify unrelated variant identities |
| BE-009 | [F18](#f18) | Data-service failures masquerade as empty, missing or invalid data |
| BE-010 | [F28](#f28) | Newsletter persistence failure is reported as subscription success |
| BE-011 | [F29](#f29) | Documented database bootstrap targets obsolete columns |
| BE-012 | [F30](#f30) | Email lookup and database uniqueness use different identity rules |
| BE-013 | [C02](#c02) | Missing media configuration is disguised as a successful upload |
| BE-014 | [R04](#r04) | Bound catalogue reads as inventory grows |
| FE-001 | [F08](#f08) | A previously failed payment SDK load traps checkout in Processing |
| FE-002 | [F10](#f10) | Account carts and shipping details leak across a shared browser |
| FE-003 | [F14](#f14) | Gift line options are not consistently preserved or priced |
| FE-004 | [F15](#f15) | Invalid delivery contact details reach the payment step |
| FE-005 | [F16](#f16) | Postal lookup failures invent delivery and COD promises |
| FE-006 | [F17](#f17) | Obsolete asynchronous responses can overwrite current selections |
| FE-007 | [F18](#f18) | Data-service failures masquerade as empty, missing or invalid data |
| FE-008 | [F03](#f03) | The payment amount and purchase contents have no server-owned binding |
| FE-009 | [F19](#f19) | Shopping data stays stale across tabs |
| FE-010 | [F20](#f20) | Malformed persisted cart data can crash every page |
| FE-011 | [F21](#f21) | Forms and purchase controls omit accessible names, selection and feedback |
| FE-012 | [F21](#f21) | Forms and purchase controls omit accessible names, selection and feedback |
| FE-013 | [F22](#f22) | Price text and focus indicators fail applicable contrast targets |
| FE-014 | [F23](#f23) | The admin creator overflows a 320px viewport |
| FE-015 | [F24](#f24) | Filter state diverges from the URL and resets on category navigation |
| FE-016 | [F07](#f07) | Payment and order recovery depend on transient browser state |
| FE-017 | [F25](#f25) | Payment help and return promises have no usable support destination |
| FE-018 | [R02](#r02) | Complete metadata and crawlable product discovery |
| FE-019 | [R01](#r01) | Provide routine merchant editing and sized-variant operations |
| FE-020 | [C01](#c01) | Purity-distinct variants can become unselectable |
| FE-021 | [F31](#f31) | Jewellery Care opens an empty content panel |
| FE-022 | [R03](#r03) | Increase the readability of supporting mobile copy |
| SEC-001 | [F01](#f01) | Public signup grants administrator authority |
| SEC-002 | [F02](#f02) | Tracked signing and media secrets match local configuration |
| SEC-003 | [F02](#f02) | Tracked signing and media secrets match local configuration |
| SEC-004 | [F03](#f03) | The payment amount and purchase contents have no server-owned binding |
| SEC-005 | [F05](#f05) | A payment proof can trigger fulfillment more than once |
| SEC-006 | [F06](#f06) | Server cart validation and inventory enforcement are missing |
| SEC-007 | [F11](#f11) | Logout and privilege removal cannot revoke issued tokens |
| SEC-008 | [F12](#f12) | Bearer credentials are exposed to scripts and insecure cookie transport |
| SEC-009 | [F10](#f10) | Account carts and shipping details leak across a shared browser |
| SEC-010 | [F13](#f13) | Sensitive public APIs lack application abuse and payload budgets |
| SEC-011 | [F09](#f09) | Installed dependencies match published security advisories |
| SEC-012 | [C03](#c03) | Maintenance scripts can disable database certificate verification |
| SEC-013 | [C04](#c04) | Deployment helper copies one secret set into every environment |

