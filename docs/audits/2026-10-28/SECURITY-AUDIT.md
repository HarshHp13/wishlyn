# Wishlyn security audit

Date: 28 October 2026 (Asia/Kolkata). Scope: the current working tree of `/home/infinityzer0/Playground/eCom`, including the uncommitted redesign. Status: revised for reviewer round R1 and independently accepted in round R3; see REVIEW-LOG.md. The coordinating auditor completed the R1 corrections after the security author's revision session failed twice with a platform resource-routing error; the original report and evidence were preserved.

## Assessment

The application is not ready to process real customer orders safely. Public signup can issue an administrator session to an unauthenticated caller. The local signing secret is also identical to the predictable literal in tracked source. Payment verification authenticates the gateway identifier pair but does not bind it to a server-owned cart, total or one-time order record. These are concrete trust-boundary failures, not visual or speculative concerns.

The audit did not create a real user, change products, upload images, place orders, make payments or attempt to authenticate to an external provider. Administrative access was demonstrated only against in-memory route/database mocks. Source-controlled Cloudinary credentials match the configured local values, but their validity at Cloudinary was not tested. Production environment values, edge protection and account settings remain unknown.

SEC-012 and SEC-013 are conditional operational findings about maintenance/deployment helpers. They require an operator to run the helper with affected connection options or privileged environment values; neither is a demonstrated request-path exploit of the current website.

## Method and coverage

- Read every route under `src/app/api`, auth helpers, DB helpers and type mappings, client session/cart/wishlist code, checkout/profile/admin call sites, Next.js configuration, deployment scripts and both SQL seeds.
- Consulted the installed Next.js 16.2.9 authentication guide, including server-set cookie recommendations and authorization within Route Handlers. Client-side UI checks were not treated as server authorization.
- Ran the application route source in an isolated TypeScript-to-CommonJS harness with fake database functions, an ephemeral signing key and blocked unapproved imports. No network or live database access occurs in that harness.
- Made five local negative authorization requests. All denied missing tokens before mutation: `/api/auth/me`, admin GET/POST/DELETE, and Cloudinary POST returned 401. An isolated customer token received 403 from admin GET.
- Read local environment configuration solely for presence/equality checks and wrote only booleans. No credential values, user records or payment tokens are included in evidence artifacts.
- Ran `npm audit --json`; collected advisory applicability separately from scanner severity. Queried three public GitHub advisory summaries for image-processing prerequisites, without an exploit probe.
- Parent baseline: production build and TypeScript pass; full lint fails with 23 errors and 10 warnings. See `BASELINE.md`, `build.log` and `lint.log`. Those quality results do not establish security.

Severity: **P0 critical** means immediate broad privilege compromise; **P1 high** means material credential, payment or inventory compromise, or urgent vulnerable-runtime exposure; **P2 medium** means limited-scope exposure, resilience problems or a conditional configuration weakness; **P3 low** is hardening. Confidence describes the evidence, not whether the uninspected production deployment shares the local settings.

## Findings index

| ID | Priority | Finding | Evidence status |
|---|---|---|---|
| SEC-001 | P0 | Public signup grants administrator role based on email text | Confirmed in isolated real-route execution |
| SEC-002 | P1 | Predictable tracked JWT secret is the configured local signing secret | Confirmed redacted equality and offline forgery |
| SEC-003 | P1 | Tracked Cloudinary API secret matches configured credentials | Confirmed local equality; remote validity untested |
| SEC-004 | P1 | Payment amount and confirmed cart are not bound to a server-owned order | Confirmed static flow; backend provides isolated execution |
| SEC-005 | P1 | Payment verification replays order-write attempts and stock effects | Confirmed source and isolated execution; no live replay performed |
| SEC-006 | P1 | Unvalidated quantities allow stock corruption and bypass availability rules | Confirmed arithmetic/data flow; backend provides isolated execution |
| SEC-007 | P2 | Logout, role changes and account removal cannot invalidate issued sessions | Confirmed offline logout behavior and server checks |
| SEC-008 | P2 | Bearer tokens are readable by scripts and duplicated into insecure cookies | Confirmed client helper execution; no XSS asserted |
| SEC-009 | P2 | Saved shipping addresses survive logout and are shared between accounts | Confirmed local storage lifecycle and synthetic browser evidence |
| SEC-010 | P2 | Sensitive public APIs have no application-level throttling or strict payload budgets | Confirmed application omission; edge controls unknown |
| SEC-011 | P1 | Installed runtime and toolchain include known vulnerable dependencies | Confirmed scanner/version evidence; exploitability varies |
| SEC-012 | P2 | Database maintenance scripts can disable TLS certificate verification | Conditional operational risk; affected URL plus operator execution required |
| SEC-013 | P2 | Environment deployment helper copies the same secrets into production, preview and development | Conditional operational risk if helper receives privileged values; deployment state unknown |

## Detailed findings

### SEC-001 — Public signup grants administrator privileges

**Priority:** P0. **Confidence:** high. **Affected path:** unauthenticated `POST /api/auth/signup` to admin catalogue mutation/upload routes.

**Evidence:** `src/app/api/auth/signup/route.ts:25` assigns the role from `email.toLowerCase().includes('admin')`. Lines 27–42 persist that role and sign it. `src/app/api/admin/product/route.ts:23–35` and `src/app/api/cloudinary/upload/route.ts:20–28` accept a valid token with `role === 'admin'`, without a separate approval mechanism.

**Safe proof:** `security/isolated-auth-checks.cjs` calls the actual signup route with a synthetic address containing that substring and an ephemeral password; the database is mocked. Response status is 200, returned role is `admin`, and that returned token receives 200 from the actual admin GET handler with mocked catalogue reads. Missing-token and customer-token controls return 401 and 403, respectively. No real account was created.

**Impact:** an arbitrary internet caller can obtain an authorized admin token and then create/delete products or use the authenticated media-upload endpoint. There is no email-ownership check or out-of-band approval before the role grant. The root issue is the public role grant; a writable local `wishlyn-user` value by itself is not this server exploit.

**Remediation:** always create public registrations as customers; create/promote administrators only via an authenticated, audited management workflow. Review existing administrator accounts for unauthorized creation and revoke their sessions after fixing the grant.

**Acceptance:** a signup address containing the privileged substring must still receive `customer`; its token must receive 403 on every admin/upload operation. A separately provisioned legitimate administrator must retain access. Cover mixed-case and substring variants without making live test accounts in production.

### SEC-002 — Predictable JWT signing key allows forged privileged sessions

**Priority:** P1. **Confidence:** high for source and local configuration; production configuration unknown.

**Evidence:** `src/lib/auth.ts:4` uses a hard-coded fallback key. Lines 23 and 28 use it for signing/verification; lines 29–30 require only truthy identity/role claims. `src/app/api/auth/me/route.ts:13–20` does not load the corresponding profile. Protected routes trust the same token role.

`security/redacted-config-check.json` records that the configured local `JWT_SECRET` exactly equals the tracked fallback. `security/isolated-auth-results.json` records that a token for a nonexistent synthetic administrator, signed with the source-known fallback in an isolated module instance, is accepted. No token or key is recorded and no forged token was sent to the running application.

**Impact:** anyone who knows the literal can mint arbitrary signed administrator claims on deployments using it. Merely setting `JWT_SECRET` is insufficient if it retains that value. Source availability affects discovery, not the correctness of the cryptographic trust boundary.

**Remediation:** remove the fallback and fail startup when a strong secret is missing; provision a cryptographically random secret per environment, rotate the currently matching key, and invalidate previously issued tokens. Validate claim types and allowed roles; combine with SEC-007 for current-account/session checks.

**Acceptance:** missing/placeholder configuration prevents startup. Tokens signed with the old/default key are rejected; independently keyed environments do not accept each other's tokens. No secret or token appears in generated client bundles or logs.

### SEC-003 — Cloudinary credentials are committed as fallback literals

**Priority:** P1. **Confidence:** high that the credentials are in tracked source and match local configuration; remote service validity untested.

**Evidence:** `scripts/upload-to-cloudinary.mjs:24–26` contains the provider identifier, API key and API secret as fallbacks. `git ls-files` confirms the script is tracked. The signing code uses that secret at lines 40–50. `security/redacted-config-check.json` records equality with both locally configured credentials, without their values.

**Impact:** anyone with repository/history access has a configured provider secret capable of signing media operations if that key remains enabled. This bypasses the storefront's admin upload gate because the provider API can be called directly. This is not proof that an external account has been compromised, and no provider request was made to validate the credential.

**Remediation:** rotate/revoke the exposed provider secret, remove all literal fallbacks, scan repository history and prior deployment artifacts, then require server-only configuration. Review provider activity using the provider's own audit tools. Removing the current line alone cannot revoke copies already obtained.

**Acceptance:** the old secret cannot authorize provider operations; source/history handling and rotation are documented, scripts fail closed without configuration, and a secret scan rejects similar future additions.

### SEC-004 — Paying a low amount can confirm an unrelated expensive cart

**Priority:** P1. **Confidence:** high. **Cross-domain:** backend payment-integrity finding; consolidate once, not as two independent issues.

**Evidence:** the active checkout calls `/api/create-order` with a client-derived `amount` at `src/app/checkout/page.tsx:154–161`, and `/api/verify-payment` with a fresh client-supplied `orderId`, shipping data and cart at lines 182–192. `src/app/api/create-order/route.ts:32–34` gives the client amount precedence over server pricing and only applies a 100-paise minimum at line 70. The alternate `/api/razorpay/order` does the same at lines 24–28.

Verification computes the HMAC of the two gateway identifiers in `src/app/api/verify-payment/route.ts:50–57` and then independently computes a cart total from the newly submitted items at lines 68–110, marking that record `confirmed`. It does not retrieve the gateway order/payment or compare amount, currency, captured state, cart, customer or original order record. `src/app/api/razorpay/verify/route.ts:41–97` has the same missing binding. There is no persisted pending order created by either creation route.

**Reproduction model:** an attacker obtains a valid gateway callback for a minimum-value payment, then submits its valid identifiers/signature with a more expensive cart and a new application order ID. The signature still proves the same gateway payment, but says nothing about those replacement items or their price. `backend/isolated-route-results.json` confirms both creation routes forward a client amount of 100 paise and both verification routes process the unbound proof/cart without a real payment; the absence of an amount comparison is also directly visible in source. No claim is made that a payment can be forged without a valid proof or the gateway secret.

**Impact:** underpaid orders can be recorded as confirmed and reduce inventory. Fulfilment losses depend on whether operations trust the database's confirmation status, which is the status presented by this implementation.

**Remediation:** generate one pending application order on the server with immutable validated item snapshots, total/currency and owner; create the gateway order from that total; retain their mapping. Verify the callback against that stored gateway order, verify the payment's captured/paid state and amount with the provider as required, and transition only that order to paid. Remove or converge duplicate routes.

**Acceptance:** modifying amount/items/customer/order ID after gateway creation cannot change the purchase; a small valid payment cannot confirm a larger cart; mismatched currency/order/payment state is rejected before any order/stock write.

### SEC-005 — Payment proof replay causes repeated order and inventory effects

**Priority:** P1. **Confidence:** high. **Cross-domain:** backend replay/idempotency finding; consolidate once.

**Evidence:** both verification routes accept client-chosen application IDs and reuse the same valid gateway proof: `src/app/api/verify-payment/route.ts:24–28,98–115` and `src/app/api/razorpay/verify/route.ts:22–29,84–101`. `src/lib/neon.ts:224–237` does a plain insert and returns `false` on conflict/error; the caller ignores that boolean and continues decrementing stock. `neon_seed.sql:104–118` has no unique constraint on gateway order/payment IDs. This report's proof is the repository DDL and isolated route execution; it does not claim that a live duplicate order was persisted or that an uninspected production database has identical constraints.

**Reproduction model:** replay the same valid payment proof with two different application IDs: both requests reach a new order insert. Replay the same application ID: even an insert conflict does not stop inventory updates. Concurrent repeats are not transactionally serialized.

**Safe proof:** `backend/isolated-route-results.json` records two 200 responses for the same synthetic gateway proof under `merchant_A` and `merchant_B`, two mocked order writes and two stock decrements, for each verification route.

**Impact:** without an additional database constraint, one payment can generate multiple confirmed order records. The demonstrated route behavior repeats order-write attempts and stock calls; repeated requests can drain availability even when inserts fail. This is distinct from SEC-004: a correctly priced original purchase can still be replayed.

**Remediation:** enforce unique gateway transaction identity and a single state transition in the database, with idempotent responses for completed payments. Put order confirmation and stock changes in one transaction; check every operation's result. Deduplicate verified webhooks and browser callbacks against the same order record.

**Acceptance:** sequential and concurrent duplicate callbacks, including changed application IDs, produce exactly one confirmed order and one inventory decrement. Failed insertion must produce no inventory mutation.

### SEC-006 — Checkout quantities and availability are not validated on the server

**Priority:** P1. **Confidence:** high. **Cross-domain:** backend cart validation/inventory finding; consolidate once.

**Evidence:** verification treats `items` as a TypeScript interface, then forwards `item.quantity` directly to saved JSON and `dbDecrementVariantStock`: `src/app/api/verify-payment/route.ts:73–115`; alternate route lines 59–101. `src/lib/neon.ts:241–248` runs `stock = GREATEST(0, stock - quantity)` with no positive-integer or sufficient-stock condition. Creation routes also multiply submitted quantities and silently skip unknown variants instead of rejecting the cart (`create-order/route.ts:47–53`; `razorpay/order/route.ts:42–49`). No reservation or conditional sufficient-stock update exists in these application paths. Production database checks remain outside this proof; a nonnegative-stock constraint alone would not prevent subtracting a negative quantity from increasing a positive stock count.

**Reproduction model:** submit a negative integer quantity alongside any valid payment proof: subtracting a negative quantity increases stock. A quantity above available stock still creates a confirmed order and clamps inventory to zero. Unknown variants can become zero-price/undefined product metadata in verification. This requires a valid gateway proof, which SEC-005 lets a caller reuse.

**Safe proof:** the backend isolated result records quantity `-2` reaching the mutation and the stock formula producing `4` from an initial `2`; both creation routes also accept negative/fractional/above-stock quantities. All data are synthetic and all writes mocked.

**Impact:** authenticated payment status can be used to corrupt inventory, oversell items and create invalid order records. Browser min/max controls do not constrain direct API requests.

**Remediation:** validate nonempty bounded item arrays, IDs, positive safe integer quantities, strict booleans and bounded strings; reject every unknown variant. Verify availability and decrement atomically with a stock predicate/reservation; enforce DB checks as a backstop. Combine duplicate lines before validating stock.

**Acceptance:** negative, zero, fractional, nonnumeric, excessive and duplicate aggregate quantities are rejected without writes. Concurrent purchases never exceed stock; invalid variant IDs cannot create an order.

### SEC-007 — Issued tokens cannot be revoked when signing out or removing privileges

**Priority:** P2. **Confidence:** high.

**Evidence:** JWT lifetime is seven days (`src/lib/auth.ts:5,23`), and verification checks only signature/expiry plus claim presence (`26–35`). `/api/auth/me` returns embedded claims without a DB lookup (`route.ts:13–20`). Admin/upload guards likewise trust the embedded role. `clearAuthSession` only removes browser keys/cookies (`src/lib/authClient.ts:67–79`). There is no logout/revocation route, session table/token version or current-role check in the application.

**Safe proof:** the isolated harness signs out through the real client helper; browser token storage is cleared, but that same copied token still passes `verifyToken`. A deleted/demoted user cannot be detected by the observed server code because it never reads current profile state.

**Impact:** a copied administrator token remains usable until expiry after sign-out or role/account changes. The existence of theft is not presumed; the failure is inability to contain it or promptly remove authority.

**Remediation:** introduce revocable server sessions or a checked token/session version, perform current role checks for privileged actions, and revoke on logout, account disable and role changes. Prefer shorter access-token lifetimes with a deliberate refresh design.

**Acceptance:** a previously valid token is denied after logout/revocation and after administrator demotion/deletion, including from a separate client; other sessions behave according to a documented policy.

### SEC-008 — Tokens are exposed to any same-origin script and lack secure cookie transport

**Priority:** P2. **Confidence:** high for storage properties; no application XSS exploit found.

**Evidence:** `src/lib/authClient.ts:18–24` writes the bearer token to localStorage and `document.cookie`. The cookie is JavaScript-readable and has no `Secure` flag; it lasts 30 days even though the token expires in seven. The script-readable token is also broadcast in a custom event at line 27. `security/isolated-auth-results.json` confirms the cookie helper applies neither Secure nor HttpOnly.

**Impact/prerequisite:** injected or compromised same-origin/third-party JavaScript can obtain the bearer credential, including administrator authority; the cookie can be transmitted over plain HTTP when that deployment/origin allows it. The current checkout deliberately loads an external payment script. No claim is made that this external script is malicious or that omission of CSP alone constitutes XSS.

**Remediation:** set a server-owned HttpOnly, Secure, appropriately SameSite session cookie and remove duplicate token storage/event exposure. Align lifetime with server validity. If moving from Authorization headers to cookies, implement appropriate CSRF defenses for state-changing routes at the same time.

**Acceptance:** `document.cookie` and localStorage do not expose an authenticating token; server Set-Cookie applies required attributes and consistent expiry; cross-site mutation attempts fail while legitimate flows work.

### SEC-009 — Saved shipping details leak across accounts on a shared browser

**Priority:** P2. **Confidence:** high.

**Evidence:** checkout reads every saved address from the global `wishlyn-saved-addresses` key and auto-selects its first entry at `src/app/checkout/page.tsx:86–98`, then writes all submissions back to that same key at lines 118–128. No user identifier scopes it. `src/lib/authClient.ts:67–79` does not clear addresses on logout. The isolated helper check confirms the key remains after sign-out.

**Reproduction:** user A saves a synthetic shipping address and signs out; user B signs in using the same browser profile and opens checkout. A's saved address is available and may be selected automatically. This is a same-device/account-switch privacy issue, not a cross-device database disclosure. `frontend/checkout-audit.json` confirms a synthetic second account opens checkout with the first account’s synthetic name/address/phone already selected; no order was submitted. Its separate cart/gift-message contamination finding should be cross-referenced as a related persistence problem, not silently merged without preserving both stores.

**Impact:** names, phone numbers, email and physical address can be disclosed to a different account holder; orders can also use an old account's address inadvertently.

**Remediation:** associate saved addresses with a validated account on the server; if local persistence remains, scope it to the verified account and define a logout/guest cleanup policy. Do not select global previous-account data.

**Acceptance:** after A signs out and B signs in, B cannot see A's synthetic address or identifying fields. Returning to A restores only A's data under the selected privacy policy.

### SEC-010 — Expensive and state-changing public endpoints lack application abuse controls

**Priority:** P2. **Confidence:** high for application code; deployed edge rate limits are unknown.

**Evidence:** login immediately looks up the supplied email and performs bcrypt comparison (`src/app/api/auth/login/route.ts:10–25`); signup performs lookup and hashing with only a minimum password length (`auth/signup/route.ts:10–25`). Public payment creation reaches a provider API call (`create-order/route.ts:85`, `razorpay/order/route.ts:70`); newsletter writes any string containing `@` (`newsletter/route.ts:8–16`). There is no application-level rate limiter, progressive challenge, per-account/IP attempt budget or request-size budget for these paths. `request.json()`/`formData()` parse the body before any custom size checks. Wishlist's 50-ID cap is a positive local control, not a global request limit.

**Impact/prerequisites:** an attacker can repeatedly consume authentication CPU/database capacity or create gateway/subscriber records unless an uninspected edge service stops them. Login's nonexistent-account branch skips bcrypt, and signup's 409 response explicitly discloses account existence, making targeted abuse easier. No brute-force/load attack was executed.

**Remediation:** deploy distributed, endpoint-specific rate limits and request limits; bound strings/arrays before expensive work; add progressive bot controls for signup/newsletter/payment initiation and generic account-recovery responses. Document and test actual edge limits rather than assuming a hosting provider supplies them.

**Acceptance:** isolated tests show a bounded budget, 429/Retry-After behavior, recovery and multi-instance consistency; oversized requests fail before expensive hashing/provider work. Confirm legitimate shared-network customers remain usable.

### SEC-011 — Known vulnerable runtime and development dependencies remain installed

**Priority:** P1 for runtime remediation. **Confidence:** high for version/advisory match; individual exploit paths vary and were not executed.

**Evidence:** `package.json:22` uses Next 16.2.9; installed lockfile/runtime matches 16.2.9 with sharp 0.34.5. Full `npm audit` on this date reports **11 affected package entries: 1 critical, 9 high, 1 moderate**. The production-only audit reports 7 affected package entries. These are package roll-ups, not 11 independently exploitable website vulnerabilities. Raw evidence and exact advisory URLs are in `security/npm-audit.json` and `security/dependency-summary.json`. The scanner suggests Next 16.4.3 and compatible dependency updates; the exact current supported patch should be re-evaluated at remediation time.

| Component / advisory family | Application relevance / constraint |
|---|---|
| Next image optimization and sharp native image libraries | Relevant runtime surface: the app uses `next/image` with remote CDN images and server optimization. AVIF optimization advisory [GHSA-2xp9-vwfh-vxw4](https://github.com/advisories/GHSA-2xp9-vwfh-vxw4) affects this Next range; exploit requires a malicious image reaching optimization. An allow-listed CDN reduces arbitrary URL reachability but does not replace patched decoders. |
| Next SVG/native-library issue [GHSA-2464-fhr4-w9xw](https://github.com/advisories/GHSA-2464-fhr4-w9xw) | Advisory identifies glibc Linux and older sharp as prerequisites. This host is Linux, but the deployed host and ability to optimize attacker-controlled SVG bytes were not established. Default SVG restrictions still matter. Do not call this a demonstrated RCE. |
| Next image SSRF [GHSA-cjq9-62q9-8jv4](https://github.com/advisories/GHSA-cjq9-62q9-8jv4) | Requires an attacker-controlled allow-listed remote URL/DNS path. The configured hosts are established providers (`next.config.ts:5–21`); attacker DNS control was not demonstrated. Patch, but do not report proven private-network access. |
| Next Windows RCE; `next/og`; `use cache`; Server Actions; proxy/rewrites-specific issues | Windows production hosting unknown. No `ImageResponse`, `use cache`, `use server`, custom server, auth proxy or rewrites is present in reviewed source; those specific advisory prerequisites are not established here. |
| `follow-redirects` 1.16.0 | Runtime transitive dependency of the payment SDK HTTP stack. Advisories require relevant redirect/header configurations. The app itself uses a fixed provider SDK endpoint; credential leakage through a redirect was not demonstrated. |
| PostCSS/nanoid/source-map libraries | Production dependency presence does not prove request reachability: observed usage is framework build/transformation code, with no website endpoint accepting arbitrary CSS/source maps. |
| brace-expansion, browserslist, js-yaml, zod | Development/tooling paths in the lockfile. Update them for build-pipeline hygiene; do not present their scanner high ratings as public storefront exploit proof. |

**Impact:** known vulnerable parsers/framework components remain installed. Image optimization is exposed for configured image sources; attacker control of optimized image bytes was not established. Exploit severity can be high if the advisory's payload and platform prerequisites are met. The scanner's critical label must not displace the independently proven application-level findings.

**Remediation:** update supported Next/eslint-config-next versions together and refresh affected transitive dependencies, then validate framework changes against installed docs. Check the final sharp/native-library versions and run both production-only and full dependency audit in CI. Do not blindly run a force upgrade on the dirty tree.

**Acceptance:** runtime and development audits no longer show these version matches, or each remaining match has a documented, reviewed applicability/mitigation decision. Production build, image optimization, auth and payment regression tests pass after updates.

### SEC-012 — Maintenance scripts contain an insecure TLS fallback

**Priority:** P2, conditional. **Confidence:** high about code and option precedence; current local connection did not disable verification.

**Evidence:** `scripts/seed.mjs:29–32`, `scripts/migrate.mjs:29–32` and `scripts/upload-to-cloudinary.mjs:76–79` configure `ssl: { rejectUnauthorized: false }`. With a connection URL lacking overriding SSL options, node-postgres accepts an untrusted certificate. No script was run against a database.

**Important qualification:** `security/tls-option-check.mjs` and its saved `tls-option-results.json` instantiate `pg.Client` without connecting. They show that a synthetic URL without SSL options keeps certificate verification disabled, whereas the configured local URL overrides the unsafe object and does not explicitly disable certificate verification. This inspects option precedence, not a TLS handshake or a provider certificate. This report does **not** claim the current configured connection is demonstrably vulnerable to interception. A different deployment/operator URL can activate the unsafe fallback.

**Impact/prerequisite:** a network-positioned attacker can impersonate the database to an operator running these scripts with an affected URL, exposing credentials or changing migration/seed results.

**Remediation:** require verified TLS and a trusted CA/hostname configuration explicitly; remove blanket certificate bypasses and choose connection-string SSL modes deliberately.

**Acceptance:** a script connection using an untrusted certificate or wrong hostname fails for every supported configuration; trusted provider certificates connect. Tests must use a local fixture, not a live interception attempt.

### SEC-013 — Deployment helper spreads one environment's credentials to all environments

**Priority:** P2, conditional on invoking the helper. **Confidence:** high for code; actual Vercel configuration uninspected.

**Evidence:** `scripts/add-vercel-envs.mjs:12–24` reads all entries from `.env.local`; lines 29–46 remove/re-add each entry to `production`, `preview` and `development` without an environment-specific allowlist or distinct secret source.

**Impact:** running the documented helper with a production database/provider key gives preview/development the same privileges, increasing the blast radius of preview code or collaborator access. Conversely, local test values can overwrite production payment settings. This does not prove the helper has been run or that Vercel currently has identical secrets.

**Remediation:** explicitly map isolated environment credentials, database roles/databases and payment test/live accounts. Update one intentional target environment at a time; validate variable names and avoid remove-then-add outages. Require least-privilege service identities.

**Acceptance:** a dry-run fixture shows distinct environments receive only their intended values; preview cannot write to the production database or authorize production-provider operations. Deployment verification records names/status only, never values.

## Defense in depth and observations not counted as proven vulnerabilities

- **CSP and HSTS:** application config sets X-Frame-Options DENY, nosniff, a referrer policy and a permissions policy; local header checks confirm them. No CSP/HSTS was present on the local HTTP development response. Add a deliberately tested CSP for Razorpay, image CDNs and Next scripts, and verify HTTPS/HSTS at production ingress. Local HTTP absence cannot establish a production transport failure.
- **Upload validation:** the application permits JPEG/PNG/WebP MIME types and limits `File.size` to 5 MB after multipart parsing, but trusts the MIME declaration and permits unsigned fallback when signing keys are missing. The provider image endpoint performs its own processing; arbitrary script hosting or live unsigned-preset abuse was not demonstrated. Fail closed on missing production credentials, validate actual image dimensions/decoding, and enforce request-size/timeout limits before parsing/provider calls.
- **Signature comparison:** HMACs use string inequality rather than a constant-time byte comparison (`verify-payment/route.ts:57`; `razorpay/verify/route.ts:47`). Use correctly length-checked `timingSafeEqual` while fixing payment binding. No practical remote timing attack was demonstrated; this is lower priority than SEC-004/005.
- **Email ownership/canonicalization:** signup has no verification flow and checks only `includes('@')`. Case-insensitive lookup and case-sensitive unique-email storage conflict; backend covers the resulting identity/data consistency defect. Do not use user-supplied shipping email as authoritative order ownership.
- **Logs:** database helper failures log raw driver errors; profile lookup also embeds the queried email in the log label (`src/lib/neon.ts:290`). Redact PII and request/provider error details, set retention/access controls, and add useful event IDs. No production log access or actual leaked customer record was observed.
- **Seeded administrator:** the SQL file documents a default administrator credential, but an offline bcrypt check found the documented password does not match the stored seed hash. Treat this as broken/unsafe bootstrapping and fix through a controlled provisioning flow; do not assert that the printed default password grants current access.
- **Legacy Supabase seed:** `supabase/seed.sql:145` allows public profile reads and line 178's all-operations newsletter policy is permissive. The active application uses Neon; no configured Supabase client or public database key was found in active code. This is a dangerous obsolete deployment artifact if reapplied, not evidence of an active Neon row-policy bypass. Remove or clearly isolate obsolete instructions/schema.
- **SQL injection/XSS/CSRF findings withheld:** active SQL uses parameterized tagged templates (and maintenance updates use bound values); React renders text without observed `dangerouslySetInnerHTML`/DOM HTML sinks. Admin mutations require explicit Authorization tokens, not automatically attached cookies. No direct SQL injection, stored/reflected XSS or authenticated CSRF was established by source review. These observations do not guarantee absence outside reviewed code.
- **Admin UI mock fallback:** local UI can show an admin shell from stored metadata or a mock token; the tested server rejects missing/customer tokens. This is confusing UI state and not, by itself, a server permission bypass. SEC-001/002 are the real bypass paths.

## Evidence and reproduction inventory

All paths below are relative to this directory. Evidence intentionally excludes secrets and real customer data.

- `security/isolated-auth-checks.cjs` — rerun from the repo with `node docs/audits/2026-10-28/security/isolated-auth-checks.cjs`; offline, real source handlers, mocked DB, ephemeral key.
- `security/isolated-auth-results.json` — signup role, protected-route controls, fallback forgery acceptance and logout-storage results, with no tokens.
- `security/redacted-config-check.json` — boolean config/source equality only; was produced by reading local configuration, without provider connections.
- `security/negative-auth-and-headers.json` — local development 401 checks and selected HTTP headers. These checks intentionally fail before mutation.
- `security/seed-credential-check.json` — offline bcrypt comparison result, with no password/hash.
- `security/npm-audit.json`, `security/npm-audit-production.json`, `security/dependency-summary.json` — package advisory/version evidence; `npm audit` nonzero status is expected when advisories exist.
- `security/image-advisories.json` — public summaries for three relevant advisory families.
- `security/tls-option-check.mjs`, `security/tls-option-results.json` — offline `pg.Client` SSL option-precedence inspection; no connection or credential value is recorded.
- Backend/Frontend audit evidence — payment flow and shared-browser interactions are independently exercised by the domain owners and should be cross-linked by the consolidating reviewer.

## Limitations and handoff to reviewer

No production deployment, DNS/TLS termination, CDN/WAF limits, provider dashboard, active credential validity, protected customer/order rows, backup restoration, CI secrets or external account audit logs were inspected. No load testing, malicious binary-image processing, live signature replay, real signup/login guessing or destructive mutation was performed. The existing dirty tree was preserved and application code was not changed.

Reviewer should challenge priority, deduplicate SEC-004/005/006 with backend findings, and retain the explicit applicability qualifications for SEC-011/012/013. The independent reviewer accepted all five R1 corrections in round R3; see REVIEW-LOG.md. Final consolidation retains the explicit applicability qualifications.

## Review response — round R1

The original author incorporated R0 feedback in the initial draft. The coordinating auditor completed the following targeted revisions after two platform resource-routing failures prevented the author's next turn. This handoff must not be described as an independently completed security-author revision.

| Comment | Disposition | Revision / evidence |
| --- | --- | --- |
| R1-SEC1 | Accepted and corrected | SEC-005 now distinguishes repeated mocked order-write/stock attempts and repository constraints from actual persisted duplicate orders or unknown production schema. |
| R1-SEC2 | Accepted and corrected | SEC-006 no longer relies on an unlinked assertion about live DB checks; the observed negative-quantity route arithmetic and absent application reservation/sufficient-stock predicate remain the proof. |
| R1-SEC3 | Accepted and corrected | Added rerunnable offline `tls-option-check.mjs` and redacted `tls-option-results.json`; described parsed-option inspection separately from actual TLS handshake validation. |
| R1-SEC4 | Accepted and corrected | Assessment and index explicitly classify SEC-012/013 as conditional operational risks with operator/configuration prerequisites. |
| R1-SEC5 | Accepted and corrected | SEC-011 states that configured-source image optimization is exposed, but attacker control of optimized bytes and applicable exploit prerequisites were not established. |
