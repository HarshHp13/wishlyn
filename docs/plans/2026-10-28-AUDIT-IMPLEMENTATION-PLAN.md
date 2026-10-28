# Wishlyn audit implementation plan

Date: 28 October 2026. Base: `main` at `d11e46b31b1cce7aa609622b7581b0779e558f05`.

## Objective and delivery boundary

Make the existing store dependable for customers and practical for administrators, preserving the centered symbol-only logo and current visual identity. Deliver the confirmed audit fixes and minimum customer/merchant workflows through reviewed pull requests. This is an implementation program; a passing build alone does not establish production readiness.

Sources: [consolidated technical audit](../../WEBSITE-AUDIT.md), [frontend](../audits/2026-10-28/FRONTEND-AUDIT.md), [backend](../audits/2026-10-28/BACKEND-AUDIT.md), [security](../audits/2026-10-28/SECURITY-AUDIT.md), [audit review log](../audits/2026-10-28/REVIEW-LOG.md), and [product/feature audit](../audits/2026-10-28/PRODUCT-FEATURE-AUDIT.md). The consolidated technical IDs are canonical; overlapping domain entries are not counted twice.

Scope includes all F01–F31, C01–C04 and R01–R04, customer discovery/bag/checkout/account continuity, product and inventory maintenance, and basic merchant order operations. Missing product facts, provider credentials, legal/business policy decisions and optional luxury services are tracked separately below. No live purchase, customer-data mutation, deployment, production migration or merge into `main` is part of this delivery.

## Branch and review protocol

1. Integration branch: `codex/audit-remediation`, created from the stated `main` commit in an isolated managed worktree.
2. Open an umbrella draft PR from integration to `main` with this plan and the audit evidence. It remains unmerged into `main`.
3. Each implementation agent receives explicit files/responsibilities and an isolated worktree. Its feature branch starts with `codex/` and targets **`codex/audit-remediation`**, never `main`.
4. Two independent agents review each implementation PR: Reviewer 1 emphasizes security/data correctness; Reviewer 2 emphasizes product behavior, accessibility and integration. Both review the whole change where relevant.
5. Reviewers send concrete findings to the implementing agent. The agent fixes them, adds meaningful regression coverage, reruns affected checks, updates the PR, and requests review again.
6. Merge only with zero unresolved actionable findings and **two explicit LGTMs for the same exact head SHA and integration base**. An amended commit, rebase, conflict resolution or material base change invalidates earlier approvals until both reviewers re-review.
7. Publish attributed review results on the PR and record the approved SHAs/checks in the implementation ledger. One GitHub credential represents agent comments; do not misrepresent it as two independent GitHub accounts or circumvent branch protection.
8. The coordinator verifies the base, clean checks and +2 evidence before merging into integration. Sequential dependent merges keep shared contracts reviewable. Finish with an integrated validation pass and both reviewers' review of the umbrella diff.

The environment permits three active subagents alongside the coordinator. Reviewer analysis and implementation are scheduled within that limit; multiple implementation agents have separate ownership, and reviews occur as capacity becomes available. No agent may reset, overwrite or revert another agent's work.

## Shared architecture and invariants

### Identity and request boundary

- Public signup always creates a customer. Administrator provisioning is an explicit operational procedure.
- Use opaque, revocable server sessions, HttpOnly cookies, production Secure, appropriate SameSite and aligned expiry. Privileged operations read current server authority. Logout invalidates the current session; role removal cannot leave a usable admin token.
- Remove browser-readable bearer credentials and production mock-user paths. Treat a cached user as display state only; verify account identity before hydrating private shopping data.
- State-changing cookie-authenticated requests enforce same-origin/CSRF checks together with the session migration. Apply distributed, endpoint-specific abuse budgets and bounded body/field validation before expensive work.
- Use a shared typed error contract: validation, unauthenticated, forbidden, missing, conflict, rate-limited and unavailable are distinct. Responses never expose credentials or database internals.

### Money, inventory and recovery

- Represent monetary calculations in integer paise. Centralize existing shipping/gift/tax rules so UI and server agree; the existing commercial rates remain subject to merchant approval.
- A server-owned immutable purchase stores verified owner, exact variant IDs, quantities, gift options/messages, address, currency, line prices, total and provider mapping. Client totals are never authority.
- Validate every line; aggregate stock demand across repeated variants while preserving distinct gift-line identity. Reserve stock atomically before payment, with explicit cancellation/expiry release and safe late-payment handling.
- Browser callback, verified webhook and reconciliation share one idempotent transactional transition. Provider amount/currency/order/captured state must agree with the purchase. An uncertain or failed persistence result cannot produce confirmation.
- Durable customer and admin order pages share the same state. Customers can read only their own orders. Order snapshots preserve historical commercial facts when products change or archive.

### Catalogue and client state

- Product plus variants is a transactional aggregate. Server-generated IDs and ownership validation prevent editing another product's variants. Editing preserves public product identity; archive is preferred when historical references exist.
- Use current, bounded catalogue queries and explicit service errors. Distinguish a real empty catalogue from a database outage.
- Browser stores are versioned, validated, account-scoped and synchronized across tabs. Guest migration occurs once under a documented policy. No previous-account fallback is allowed.
- Exact variant identity covers metal, purity and size. Different gift messages remain distinct from bag through merchant fulfilment.
- Keep truthful material information and service messaging. Missing facts get an explicit unavailable/omitted state, never invented composition, certification, membership or delivery guarantees.

## Work packages and dependencies

| Package | Implementation responsibility | Depends on | Primary audit mapping |
| --- | --- | --- | --- |
| W1 Identity, request security and deployment hygiene | Auth/server sessions, request guards, shared migration/test foundation, secret removal, dependencies, upload/config/scripts | Plan | F01–F02, F09, F11–F13, F30, C02–C04; auth part of F18 |
| W2 Reliable commerce and durable orders | Authoritative quotes/orders, reservation/payment/recovery, checkout, customer/admin order views, current schema/bootstrap | W1 | F03–F08, F14–F15, F29; order continuity and operations gaps |
| W3 Storefront and shopping-state repair | Cart/wishlist, product selection, discovery, accessibility, honest content, service errors, newsletter, SEO/bounded reads | W1; integrate W2 contracts before final review | F10, F14, F16–F22, F24–F25, F28, F31, C01, R02–R04; U01–U05 |
| W4 Merchant catalogue and inventory | Transactional create/edit/archive, variant/size controls, stock audit history, admin UX | W1 + W2 database contracts | F23, F26–F27, R01; catalogue/inventory/operations gaps |
| W5 Customer service and account completion | Account profile/addresses/wishlist continuity, password change/recovery capability, support requests and policy configuration, after-sales requests | W1 + W2; coordinate W3 state contract | F10, F25; U06 and account/service gaps |
| W6 Integrated release verification | Cross-package regression, clean lint/build, audit status, migration/runbook, full-diff double review | W1–W5 | All records and release gates |

Parallel implementation is appropriate only after shared interfaces are established. Conflicting files are handed off explicitly or rebased after the owning PR merges; nobody concurrently edits the same checkout, auth or database module in a shared checkout.

### W1 — Identity, security and engineering foundation

Tasks:

- Replace substring-based administrator signup; normalize/validate emails, enforce canonical database uniqueness and report collisions before migration.
- Replace JWT fallback/browser token storage with revocable sessions and coordinated login/me/logout/client consumers. Recheck current administrator authority for catalogue/upload APIs.
- Add shared validation/errors, JSON and upload size limits, same-origin protection and distributed rate limits with `429`/`Retry-After` behavior. Document proxy/IP trust assumptions and fail-closed infrastructure behavior.
- Remove secret literals and misleading upload success; scripts use explicit environment selection, verified TLS and dry-run-safe configuration. Add a redacted environment template and rotation/admin-review runbook; never copy local credentials into commits or logs.
- Upgrade supported affected dependencies with installed Next.js upgrade guidance, aligned eslint-config-next and checked lockfile; retain full/runtime dependency reports and explicit dispositions.
- Establish meaningful tests and CI commands. Database/session/request regression tests run on a disposable local database; never load the existing configured database for mutation tests.

Acceptance: public-signup fixtures cannot call privileged routes; logout/demotion invalidate authority; no authenticating credential appears in local storage/events; cross-site mutation is rejected; rate/size limits work; canonical-email races yield one identity; missing media/config fails honestly; build/lint and dependency verification are recorded.

### W2 — Trusted purchase and order operations

Tasks:

- Add versioned migrations for server purchases, line/address snapshots, provider identity uniqueness, reservations and order/stock integrity constraints. Bootstrap and migrate known legacy schemas deliberately; abort on conflicting existing data rather than silently rewriting it.
- Consolidate both public payment endpoint pairs onto a single service. Validate supported India addresses and bounded carts before provider calls; compute totals from current catalogue prices and per-line gift options.
- Persist intent and reserve aggregate variant stock atomically; bind the provider order. Define expiration/cancellation and captured-after-expiry reconciliation states.
- Verify signatures and provider amount/currency/capture status against the durable order. Share atomic idempotent completion across callback/webhook/reconcile paths; retain uncertain payments for operations.
- Replace the SDK loading trap with bounded retry, progress/error announcements and navigable recovery. Show the authoritative quote and require acknowledgement after price/availability changes.
- Add permanent customer order history/detail/receipt and admin order queue/detail, payment exceptions and deliberate fulfilment/tracking updates. Never manufacture a statutory tax invoice or provider refund confirmation.
- Preserve gift instructions, exact product/variant snapshots and commercial totals through merchant views. Add protected reconciliation and explicit manual refund/service handoff when provider operations require configuration.

Acceptance: concurrent last-unit attempts cannot both reserve; duplicate callbacks/webhooks/retries yield one order and stock effect; insertion/stock failure rolls back or remains visibly recoverable; another customer cannot read an order; reload/closed-browser payment recovery retains reference; invalid addresses and cart quantities fail; gift totals are order-independent; fresh bootstrap and migration rerun succeed in disposable PostgreSQL.

### W3 — Customer browsing and shopping state

Tasks:

- Version/deeply validate bag persistence; repair malformed records without crashing pages. Use verified-account keys, explicit guest migration, cross-tab synchronization and logout handling for bag and saved items.
- Preserve distinct gift-line identity, expose gift message/fee and product links, and reconcile stored snapshots with current catalogue availability and server quotes.
- Make URL the consistent source for category/search/price/sort and reset/back/reload. Hide empty categories and unsupported rating sort; provide useful no-results/retry states.
- Select exact variant ID, show a specification for one actual option, expose all purity/size combinations and unavailable states; add useful image zoom with keyboard/focus handling.
- Cancel superseded postal/wishlist requests; show lookup uncertainty instead of fabricated COD/delivery promises. Align supported geography and shipping-threshold wording with checkout.
- Fix labels, field errors, selected-state semantics, live feedback, text/focus contrast and supporting mobile text. Preserve logo centering and gallery/bag behavior.
- Remove unsupported material defaults/membership/security assurances, empty care panels, test-mode production hints and misleading CTA destinations. Keep approved facts; do not rewrite real catalogue data speculatively.
- Return honest catalogue/wishlist/newsletter errors, preserve retry inputs, bound catalogue/related-product reads, and add route metadata/canonical/sitemap/robots/accurate structured offers without invented reviews.

Acceptance: A → logout → B never displays A data; two tabs converge; malformed storage remains usable; gifts stay separate; every fixture variant is reachable; filters round-trip; offline/500 never claims empty/success; keyboard, 320px and 200% text checks pass; lightbox is operable; production metadata matches published data.

### W4 — Routine merchant operations

Tasks:

- Introduce server-validated aggregate create/update with transactional product/variant saves, safe archive, and explicit public/draft status where publication facts are incomplete.
- Bind variants to their product; generate new IDs server-side; reject invalid price/stock/size/media/foreign variant input before writing. Keep historical order snapshots and URLs stable.
- Add product search, edit/preview/publish/archive flows, size/purity/metal/price/stock controls and clear draft/stock/availability indicators.
- Record stock adjustments with actor/reason/time; prevent overwriting reservations or stale concurrent edits. Add low-stock visibility and usable load/save/retry states.
- Retain unsaved input/upload selections on failure; use merchant-facing labels, associated form controls and reflow at 320px without overflow.

Acceptance: a merchant edits/replenishes/archives without deleting/recreating; product/variant fault injection causes no partial public aggregate; cross-product IDs fail without writes; stock history records valid adjustments; concurrent reservation/edit paths preserve inventory; missing media cannot publish unrelated stock imagery.

### W5 — Account and operated service foundation

Tasks:

- Replace the role/member placeholder account with real orders, profile, addresses and security tasks. Ensure server ownership for all personal data and synchronize private saved items where implemented.
- Add password change with current-password verification and session revocation; implement recovery tokens and a configurable transactional delivery adapter only if tokens can be delivered safely. Never return reset tokens to a browser or simulate email delivery.
- Add authenticated order-linked support/return/cancellation requests and an admin queue with status/history. Eligibility and actual refunds require approved policy/provider behavior; a submitted request is not a refund.
- Add truthful service destinations/configuration and explain pending/unconfigured capabilities. Do not publish invented contact addresses, international shipping, warranties, protection programmes or legal policy text as approved.
- Keep receipt wording distinct from tax invoice; document transactional notification setup, retry/exception handling and account creation/guest-checkout tradeoffs.

Acceptance: one customer cannot read/update another's addresses, wishlist or requests; account tasks persist across sessions; password change revokes old authority; support requests remain linked to durable orders and staff can respond via the store workflow; disabled delivery configuration reports unavailable rather than false email success.

### W6 — Integration and release evidence

- Run clean dependency installation, lint, type/build and all meaningful unit/route/database tests on the final integration head. Test migrations against both fresh and representative legacy disposable schemas.
- Use a separate local test server and disposable data for browser journeys. Do not change the existing development server or live configured data. Record synthetic/mocked/provider-test provenance.
- Exercise discovery → exact variant/gift → bag → quote → interrupted/retried order; account switch/cross-tab; customer order retrieval; merchant edit/stock/order/support operations; validation/outage/empty states.
- Retain desktop/mobile screenshots and automated evidence as needed, with no credentials/customer data. Verify native dialogs, keyboard focus, labels, price/focus contrast, narrow reflow and route metadata.
- Update the audit mapping with implemented commit/PR, verified checks and remaining release gates. Both reviewers examine the final integrated diff and any integration fixes.
- Keep the umbrella PR reviewable and unmerged into `main`. Do not call the store production-ready until operational gates below have evidence.

## Full finding traceability

| Audit IDs | Work package | Concrete completion criterion |
| --- | --- | --- |
| F01 | W1 | Public signup has no admin-grant path; current role enforced |
| F02 | W1 + external gate E1 | No fallback literals; old session design invalidated; provider rotation separately verified |
| F03–F07 | W2 | Trusted immutable order, atomic stock and idempotent verified recovery |
| F08 | W2 | Failed SDK load terminates and retry works |
| F09 | W1 | Affected dependency versions removed or explicitly reviewed/disposed |
| F10 | W3/W5 | Account isolation for bag, gifts, addresses and saved items |
| F11–F12 | W1 | Revocable HttpOnly server session plus CSRF-protected consumers |
| F13 | W1 | Distributed rate/body budgets before expensive handlers |
| F14 | W2/W3 | Line-specific gift identity, instructions and authoritative pricing |
| F15 | W2 | Shared supported-country server/client delivery validation |
| F16–F17 | W3 | Honest postal failures and stale-response cancellation |
| F18 | W1/W3/W4 | Infrastructure failure distinct from invalid credentials/empty/missing |
| F19–F20 | W3 | Cross-tab convergence and deep storage recovery |
| F21–F22 | W2/W3/W4/W5 | Accessible names/state/errors and measured contrast |
| F23 | W4 | Admin reflows at 320px and zoom |
| F24 | W3 | Complete URL-backed filtering/reset/back behavior |
| F25 | W3/W5 + E3 | Usable support path; approved policy/contact facts when available |
| F26–F27 | W4 | Transactional catalogue, valid ownership and no arbitrary variant upsert |
| F28 | W3 | Persistence failure is retryable, duplicate subscription idempotent |
| F29 | W1/W2 | Versioned documented current bootstrap and migration reruns |
| F30 | W1 | Canonical email constraint and deliberate collision handling |
| F31 | W3 + E4 | No blank/invented care panel; verified item facts supplied separately |
| C01 | W3/W4 | Same metal/size with different purity is exactly selectable/editable |
| C02 | W1/W4 | Missing media config fails, drafts distinguish missing photos |
| C03–C04 | W1 + E2 | Verified TLS and explicit isolated deployment environment selection |
| R01 | W4 | Stable-identity product/variant/stock editing |
| R02–R03 | W3 | Correct crawlable metadata and readable mobile copy |
| R04 | W3 | Bounded related/public catalogue reads with fresh commerce data |

## Product gap disposition

| Gap / recommendation | Delivery decision |
| --- | --- |
| U01 material truth; empty care/dimensions/stone; all 25 records | Remove unsupported defaults and add editorial controls now (W3/W4); actual facts require E4 |
| U02 late charges, threshold/country/COD inconsistencies | Shared transparent totals, India-only supported flow and no unsupported COD claims (W2/W3); E3 approves rates/tax/policies |
| U03 search/filter redundancy and weak URL state | Implement W3; typo-tolerant external search and advanced relevance remain optional |
| U04 inspection/fit/scale | Accessible zoom and accurate dimensions presentation in W3; new photography/measurements/certification require E4 |
| U05 bag/gift review and variant identity | Implement W2/W3; new packaging imagery requires approved assets |
| U06 orders/profile/address/security/support | Implement W2/W5; notification/reset delivery requires E5; guest checkout is explicitly deferred until guest identity/recovery/service model is approved |
| Product create/edit/draft/archive/variant/stock operations | Implement W4; taxonomy and catalogue data correction require merchant facts |
| Order queue, tracking, exceptions, support/return requests | Implement W2/W5; carrier automation, statutory invoices, actual refunds and service eligibility require E3/E5 |
| Verified reviews/moderation | Defer until purchase verification and moderation/consent operations are defined; remove meaningless rating controls now |
| Newsletter campaigns/preferences/unsubscribe | Fix subscription persistence now; marketing delivery/consent/list integration require provider and policy work E5 |
| Coupons, loyalty, membership, financing, gift cards | Optional later programs; remove unsupported membership language now |
| Gift finder, curated edits, shareable lists, restock notifications | Optional discovery/retention phase after core reliability and staffing decisions |
| Concierge/appointments, aftercare/repair, AR/360/video/personalization | Optional; service staffing, media and actual catalogue needs must justify investment |
| Analytics/search reports/funnel dashboards | Define events/metrics in runbook; production tracking requires consent policy and chosen analytics service |
| Bulk import/export, granular staff roles, ERP/CRM/carrier integration | Later operational scale work; current admin authority remains explicit and audited |

These deferred enhancements are recorded recommendations, not secretly treated as completed features. Exposing a menu item without a working journey is not acceptable completion.

## External release gates

| Gate | Required evidence / owner | Engineering deliverable |
| --- | --- | --- |
| E1 Secret rotation and account containment | Owner rotates/revokes the exposed signing/media secrets, reviews existing administrator accounts and invalidates unauthorized access | Fail-closed configuration, new revocable session model, rotation/account-review instructions; never claim removal equals rotation |
| E2 Deployment/database | Owner selects environment-isolated credentials, approved migration window, backup/restore and scheduler/webhook configuration | Versioned migrations, dry-run/preflight, rollback/recovery runbook and disposable-DB tests; no live migration in this task |
| E3 Commercial/service policies | Merchant approves supported geography, fees/taxes, dispatch/returns/cancellation/warranty eligibility and real support details | Consistent configurable rules, safe truthful defaults, working support-request path; no fabricated policy promises |
| E4 Product positioning/facts | Merchant confirms fashion/fine/mixed classification, actual base metals/finish, dimensions, care, stones/certification and photography | Accurate omission/unavailable states and product editor; no guessed bulk data corrections |
| E5 External operations | Owner supplies payment test/webhook configuration, transactional email provider, carrier/invoice/refund/marketing/analytics choices and operated service process | Integration hooks, explicit unavailable/reconciliation states and setup/check procedures; no fake sent email/refund/shipment |

## Validation, rollback and definition of done

Every package records commands, results and limitations. Tests target invariants and observed regressions; avoid tests that merely repeat implementation. Database transactions, canonical uniqueness and concurrency require disposable PostgreSQL evidence, not only mocks. Provider tests use sandbox credentials only and remain a separate release gate when unavailable.

Schema changes are additive where possible. Migrations check preconditions and conflicts before writes; rollback must preserve durable purchases, payment references and stock history. Prefer disabling checkout/affected operation and forward repair over destructive downgrade after real commerce records exist. Runbooks identify this boundary.

The engineering program is complete when all selected packages are merged into integration with +2 exact-commit reviews, integrated checks pass, every audit ID has an honest disposition, and remaining business/provider gates are explicit. The umbrella PR stays open for human review and deployment preparation; `main` is unchanged.

## Implementation ledger

| Package | Branch / PR | Head / approvals | Validation / status |
| --- | --- | --- | --- |
| Plan | `codex/audit-remediation` → `main` | Pending | Initial plan and audit evidence |
| W1 | Pending | Pending | Not started |
| W2 | Pending | Pending | Not started |
| W3 | Pending | Pending | Not started |
| W4 | Pending | Pending | Not started |
| W5 | Pending | Pending | Not started |
| W6 | Integration | Pending | Depends on implementation packages |
