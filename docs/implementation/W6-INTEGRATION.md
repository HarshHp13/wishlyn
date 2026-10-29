# W6 — Cross-package integration and validation

Date: 29 October 2026. Branch `codex/audit-integration-completion`; every implementation PR targets `codex/audit-remediation`. The umbrella remains open for human review. This document records engineering evidence and outstanding operational gates.

## Integration changes

- Bag, product gift/shipping wording and checkout use shared integer-paise commercial rules. Oversized but structurally valid saved bags show an adjustment message; unrelated saved orders remain accessible.
- Checkout consumes verified external auth state, waits for bag hydration, refreshes current catalogue snapshots before quoting, and hides uncertainty without treating a superseded request as logout. Order/approval/callback state is scoped to account and requested order reference.
- Payment cleanup compares the latest account bag within the same queued Web Lock mutation. A concurrent or queued unrelated shopping change survives payment of an earlier quote.
- Integration preserves the W5 shared store: account memory survives uncertainty, unread durable baselines recover before replaying owner-bound local edits, and shared guest claims remain distinct from fresh local intent. W6 adds only purchase-conditional cleanup to that store.
- Commerce requests combine navigation cancellation with a 25-second deadline. Saved-order failure exposes a working retry action. Same-account reverification refetches the order status and hides obsolete payment controls until that read completes; it also retires pending SDK startup for the prior checkout approval.
- The installed Next.js error boundary uses `retry()` to refetch failed server content after infrastructure recovery.
- Checkout reads account-owned saved addresses and validates their delivery shape before applying them; manual entry remains available during address-service failure.
- Commerce, order and merchant requests carry the account captured by the displayed form/action as `X-Wishlyn-Account-ID`. The server checks it against its session without deriving authority from it; clients validate successful `viewerId` responses, separately from customer order ownership. Order forms reset across account/reference changes. Completion flags recover through same-account verification without publishing private results during uncertainty.
- Whole-application lint, all package tests, typecheck, secret patterns, build and runtime dependency audit are the CI gate. Five database variables are mandatory for `npm run verify`, preventing omitted database suites from appearing successful. Each suite enforces its own disposable-database contract. Migration tests compare the current migration set rather than a stale three-file list; the storefront suite applies current migrations before fixtures.

## Review findings addressed

| Finding | Fix / regression evidence |
| --- | --- |
| R1-W6-01 | `estimateTotals` returns an actionable limit state; unit tests and browser oversized-bag/saved-order recovery checks. |
| R1-W6-02 | Purchase-conditional cleanup inside `cartStore.mutate`; real queued/cross-tab store tests and ownership transition. |
| R1-W6-03 | Hidden account-keyed memory restored after verification; blocked-write/loading/error/A→B regression. |
| R1-W6-04 | Authoritative auth snapshot and account/reference component scope; browser deterministically completes a superseded response while newer verification is pending. |
| R1-W6-05 | Combined abort/deadline signals; stalled external-controller fetch and navigation-cancellation tests. |
| R1-W6-06 | Mandatory five-suite DB configuration and full verification in Quality workflow; final full-matrix results recorded below after W4/W5 integration. |
| R2-W6-01 | New saved-order reference resets order and approval state; browser B failure shows retry and sends no payment for earlier A. |
| R1-W6-07 | Orders readiness/actions bind to the exact verified auth-user generation; customer/staff actual-component tests and a held fresh-status browser read hide obsolete controls. |
| R2-W6-03 | Merchant fixture connections use validated database options before construction/DDL; actual-source hostile-parameter regressions run without network or mutations. |
| R2-W6-02 | Installed framework `retry()` API; actual fixture-table outage/recovery browser check succeeds without full-page navigation. |

## Evidence collected before W4/W5 rebase

- 93/93 tests pass with security, commerce and storefront database cases enabled; no skips. Source: [test log](evidence/integration/tests-w1-w3-and-regressions.log).
- Whole-application lint passes with two native-image warnings in the prior admin form (replaced by W4); typecheck/build and credential-pattern scan pass. [Build](evidence/integration/build-before-w4-w5.log).
- Production Next.js 16.4.3 browser: stale order navigation, overlapping verification, large bag, saved-order recovery, account-owned address selection/quote, 320/390/768/1440 reflow; no page exceptions or payment requests. [Results](evidence/integration/browser-regressions.json), [desktop](evidence/integration/checkout-desktop.png), [mobile](evidence/integration/checkout-mobile.png).
- Actual catalogue outage and restored content using the framework retry action: [result](evidence/integration/retry-recovery.json).

These are intermediate checks, not final W4/W5 acceptance. Final exact-head reviewers, complete matrix and integrated account/merchant journeys remain required before merge.

After stacking the W4/W5 implementations, 55/55 commerce/merchant tests passed with zero skips, including stale shared-cookie read/quote/cancellation rejection and administrator viewer/owner separation. Commerce route fixtures now set their own origin and compare migration history with the installed migration list. Final five-package verification remains pending the revised W5 head.

## Disposable fixture reproduction

All tests use dedicated local PostgreSQL, synthetic accounts/products and intercepted provider requests. No existing application database, customer or business provider was modified. Create a test-only role with CREATEDB and distinct databases:

| Variable | Database requirement |
| --- | --- |
| `TEST_DATABASE_URL` | Loopback `wishlyn_*test` base; security creates/drops random child databases |
| `COMMERCE_TEST_DATABASE_URL` | Loopback database exactly `wishlyn_test_commerce`; suite recreates its schema |
| `STOREFRONT_TEST_DATABASE_URL` | Loopback database with `storefront_test` in its name; suite migrates and writes fixtures |
| `MERCHANT_TEST_DATABASE_URL` | Loopback `wishlyn_*test` base; merchant creates/drops random child databases |
| `ACCOUNT_SERVICE_TEST_DATABASE_URL` | Loopback database ending `account_service_test`; suite creates/drops random child databases |

Run `npm ci`, then `npm run verify` with all five explicit URLs. Never load the store's existing `.env` into mutation tests. The Quality workflow provisions its own PostgreSQL service/databases. Local production browser verification uses a dedicated server at `http://localhost:3126`, a fixture PostgreSQL server with a trusted local TLS certificate and `DATABASE_CA_CERT`, and `APP_ORIGIN`/`NEXT_PUBLIC_APP_URL` matching the test origin.

`tests/integration/browser-journey.mjs` covers the actual profile/address, exact variant/gift quote, wishlist, customer/staff support, stock reservation, archive and account-isolation flows. Its guarded seed resets only the named browser database, including request budgets; repeated fixture runs cannot inherit old local bags or exhausted test budgets. Run it in the isolated `wishlyn-completion` browser opened at the fixture origin.

`tests/integration/retry-recovery.mjs` is a Node runner requiring `INTEGRATION_TEST_DATABASE_URL` for exactly the loopback `wishlyn_integration_browser_test` database. It temporarily renames only that fixture’s products table and guarantees restoration, then confirms the Retry action restores the catalogue in the same document. Keep the matching production fixture server and named browser running.

`tests/integration/browser-regressions.mjs` is consumed by `playwright-cli run-code --filename=<absolute-path>`. API/payment responses are intercepted with synthetic data; foreign traffic and unexpected API mutations are blocked. For error recovery, temporarily rename only the fixture database's `products` table, load `/` and observe the boundary, restore the table in a guaranteed cleanup, then click Try Again and verify catalogue navigation returns. This is never an operation for business data.

## Operational boundary

E1–E5 from the implementation plan remain owner-operated release gates: exposed-secret rotation/admin review; environment isolation/backups/live migrations and schedules; merchant-approved pricing/policies/contact details; actual product/material/care/media facts; payment sandbox/webhooks/refunds/invoicing/email/carrier/consent/analytics setup. Source removal does not establish rotation. A local mocked provider does not establish live money movement, fulfilment or notifications. Keep checkout/payment and notification capabilities at their documented safe defaults until those gates have evidence. After real purchases exist, use forward repair and preserve order/payment/stock/support history rather than destructive schema downgrade.

## Final integration results

Complete clean-install verification on the fifth W5 source passes **183/183 tests with zero skips**, whole-application lint, typecheck, tracked credential-pattern checks, production Next.js 16.4.3 build and the production dependency audit (zero reported vulnerabilities). The actual customer/staff journey, mocked payment/checkout matrix and same-document outage/retry check also pass on that source. These results remain intermediate: both reviewers subsequently reproduced retained guest data after a storage-denied logout (R1-W5-06), so W5 needs a corrected source and renewed approvals before final W6 acceptance and merge.
