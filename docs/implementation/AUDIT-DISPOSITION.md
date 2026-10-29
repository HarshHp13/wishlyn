# Audit disposition and release prerequisites

The audit findings describe the original application snapshot. Engineering disposition below refers to the implementation branches and fixture evidence, while E1–E5 require owner-operated evidence before release. The original reports remain historical evidence.

Implementation provenance and exact approved heads/bases: [review ledger](REVIEW-LEDGER.md). Validation and reproduction: [W6 integration](W6-INTEGRATION.md). W1–W4 have been merged into `codex/audit-remediation`; W5 and W6 are still awaiting final review and merge. Nothing in this document authorizes merging the umbrella into `main`.

## Engineering findings

| Audit IDs | Implemented behavior / evidence | Package / disposition |
| --- | --- | --- |
| F01 | Public signup ignores privileged inputs; server verifies current administrator role. Security route/database tests. | W1, [PR #2](https://github.com/HarshHp13/wishlyn/pull/2), merged |
| F02 | No fallback credentials; opaque revocable sessions; tracked-source credential-pattern gate. Removal does not establish provider rotation. | W1, merged; E1 outstanding |
| F03–F07 | Owned immutable quotes; exact variant/gift snapshots; atomic stock reservations/payment application; retries, duplicate callbacks, mismatches, expiry and reconciliation. Real PostgreSQL concurrency and synthetic provider tests. | W2, [PR #3](https://github.com/HarshHp13/wishlyn/pull/3), merged; provider operations require E5 |
| F08 | SDK loading fails with a bounded timeout and supports retry. SDK tests. | W2, merged |
| F09 | Dependency upgrades and production dependency audit. Security dependency/TLS tests; final audit output recorded with W6. | W1, merged; final W6 audit pending |
| F10 | Owned bag/gift state survives uncertainty without exposing another account; server saved pieces and owned/versioned addresses; captured-account preconditions prevent stale forms writing through another shared cookie. | W3 merged; W5/W6 final review pending |
| F11–F12 | HttpOnly revocable sessions and origin checks for mutations. Role/disable/password-change/logout and stale-session regression tests. | W1, merged |
| F13 | Shared PostgreSQL rate budgets and bounded request bodies before expensive operations. Security multi-process/route tests. | W1, merged |
| F14 | Exact gift-line identity, per-line messages and integer-paise totals shared by product, bag and checkout. Pricing, purchase and bag tests. | W2/W3 merged; W6 final review pending |
| F15 | Shared validated Indian address model and supported-country behavior. Commerce validation/quote tests. | W2, merged; approved commercial policy requires E3 |
| F16–F17 | Postal lookup has explicit failure/unknown feedback and cancels stale responses. Storefront implementation and browser evidence. | W3, [PR #4](https://github.com/HarshHp13/wishlyn/pull/4), merged |
| F18 | Infrastructure outages produce retryable service errors; guest/forbidden/missing/empty remain distinguishable. Catalogue, auth, merchant route tests and actual fixture outage/retry browser evidence. | W1/W3/W4 merged; framework retry integration in W6 pending |
| F19–F20 | Versioned storage validation, account migration, serialized Web Lock mutations and cross-tab notifications; usable memory recovery when storage fails. Real store regression tests. | W3 merged; W5 guest transfer/W6 payment cleanup final review pending |
| F21–F22 | Named controls, labels, keyboard focus, selected/state/error feedback and measured text/control contrast. Storefront contrast tests and retained browser evidence. | W2/W3/W4 merged; W5/W6 final review pending |
| F23 | Merchant catalogue/editor use a narrow single-column layout; W4 320px/zoom browser evidence. | W4, [PR #5](https://github.com/HarshHp13/wishlyn/pull/5), merged |
| F24 | Search/filter/sort/page state is URL-backed; resetting/back/forward preserves independent controls. URL/state tests. | W3, merged |
| F25 | Durable owned support requests, order references, staff replies/status/history and configured service/contact text. Account/service PostgreSQL and browser tests. | W5 final review pending; policy/contact approval requires E3 |
| F26–F27 | Transactional product/variant create/edit; stable IDs; revision checks; stock deltas protect reservations and sales; retries return a coherent aggregate. Real merchant concurrency tests. | W4, merged |
| F28 | Newsletter persistence exposes retryable failure and idempotent duplicate subscriptions. Storefront route tests. | W3, merged; delivery/consent requires E5 |
| F29 | Versioned checksum migrations with fresh/legacy/rerun/failure tests; forward-repair runbooks preserve business history. | W1/W2 merged; deployment/migrations require E2 |
| F30 | Canonical unique email and deliberate legacy collision handling. Migration/security tests. | W1, merged |
| F31 | Unknown care/material/stone/dimensions are omitted or marked unavailable; editorial fields and factual confirmation govern publishing. No guessed catalogue corrections. | W3/W4 merged; real facts require E4 |
| C01 | Same metal/size with different purity remains exactly selectable and editable. Catalogue/merchant fixtures. | W3/W4 merged |
| C02 | Missing upload configuration fails safely; drafts permit missing imagery; media URL/type/size/pixel checks guard uploads. | W1/W4 merged; owned media requires E4/E5 |
| C03–C04 | TLS configuration cannot be disabled by URL query overrides; environment credentials are explicitly isolated. Actual local TLS regressions. | W1 merged; deployment evidence requires E2 |
| R01 | Stable product/variant identity with stock history and publication/archive controls. Merchant tests/browser evidence. | W4 merged |
| R02–R03 | Route metadata, crawlable catalogue links and readable mobile copy. Storefront metadata/contrast and browser evidence. | W3 merged |
| R04 | Bounded public/related catalogue reads; current catalogue prices and availability are revalidated before immutable quoting. Catalogue/pricing/concurrency tests. | W3/W4 merged; W6 integration pending |

## Product and operational gaps

| Gap | Disposition |
| --- | --- |
| U01: product truth and all 25 original records | Truthful omission and editorial controls delivered by W3/W4; record correction, positioning and material/care/photo evidence require E4. |
| U02: late charges, geography, threshold and COD promises | Shared transparent totals and supported Indian delivery delivered by W2/W3/W6; merchant fee/tax/policy approval remains E3. |
| U03: weak browsing/search state | URL-backed controls delivered by W3. Advanced relevance/typo search remains optional later work. |
| U04: inspection, fit and scale | Accessible image inspection and known dimensions delivered by W3; new photography, measurements and certification require E4. |
| U05: bag/gift review and exact identity | Per-line bag editing and gift pricing/messages delivered by W2/W3/W6; packaging imagery requires approved assets. |
| U06: account and after-sales value | Orders, profile, addresses, password security, server saved pieces and customer/staff support delivered by W2/W5. Recovery delivery requires E5. Guest checkout is explicitly deferred pending guest identity/recovery/service decisions. |
| Daily catalogue/stock operations | W4 delivers create/edit/draft/archive/variants and stock history. Taxonomy and actual catalogue corrections require merchant facts. |
| Order queue, tracking, exceptions, support and returns | W2/W5 deliver staff records/workflows. Carrier booking, statutory invoices, actual refunds and eligibility require E3/E5. Recording a status does not perform the external operation. |
| Verified reviews/moderation | Deferred until verification, staffing/moderation and consent are defined; meaningless rating controls removed. |
| Newsletter campaigns/preferences/unsubscribe | Persistence repaired; marketing provider, consent, delivery and preference/unsubscribe operations remain E5. |
| Coupons, loyalty, membership, financing and gift cards | Optional future programs; unsupported membership language removed. |
| Gift finder, curated edits, shared lists and restock alerts | Optional later discovery/retention work after core reliability and staffing decisions. |
| Concierge, appointments, repair, AR/360/video and personalization | Optional; actual product needs, staffing and media must justify implementation. |
| Analytics, search reports and funnel dashboards | Measurement requirements documented below; chosen service and consent policy remain E5. |
| Bulk tools, granular staff roles, ERP/CRM/carrier integration | Deferred operational scale work; current administrator authority is explicit. |

## External release gates

All five remain **outstanding**. Fixture tests establish implementation behavior; no owner-operated action was performed by this task.

| Gate | Required owner evidence | Delivered engineering support |
| --- | --- | --- |
| E1: containment | Rotate/revoke exposed secrets, inspect repository/history/provider access, review administrator accounts and invalidate unauthorized access. | Fail-closed configuration, revocable sessions and rotation/account-review instructions. |
| E2: deployment/database | Isolated credentials, approved migration window, tested backup/restore, deployment TLS and approved scheduler/webhooks. | Five versioned migrations, preflight/recovery runbooks and disposable fresh/legacy/concurrency/TLS tests. |
| E3: commercial/service policies | Approved geography, prices/fees/taxes, dispatch/returns/cancellation/warranty eligibility and real contact details. | Shared commercial rules, explicit safe defaults, configurable policy text and working service requests. |
| E4: product facts | Fashion/fine/mixed positioning, real base metal/finish/stone/dimensions/care/certification and photography. | Exact options, truthful omission and factual-confirmation editorial controls. |
| E5: external operations | Payment sandbox/webhook/refund evidence; transactional email; carrier/invoice/marketing/analytics choices; consent and staffed service process. | Provider hooks, reconciliation/unavailable states, durable operated queues and setup instructions. |

Checkout/payment and notifications retain their documented safe defaults until applicable gates have evidence. The Vercel status check may report success for an ignored deployment; it does not prove a hosted application ran. Local production fixture/browser evidence is separately identified.

## Measurement after owner approval

Choose the analytics service and consent rules before collecting events. Measure catalogue-to-product navigation, exact-option selection, bag additions/edits, quote validation failures, quote-to-payment attempts/confirmed reconciliation, service-request creation/reply latency and staff stock/edit conflicts. Separate provider-confirmed payment outcomes from UI callbacks; measure failures and abandonment without recording addresses, gift messages, credentials or support text in analytics. Define owners, retention and alert thresholds before rollout.
