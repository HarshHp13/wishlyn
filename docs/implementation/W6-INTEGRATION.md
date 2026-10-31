# W6 — Cross-package integration and validation

Date: 29 October 2026. Branch `codex/audit-integration-completion`, [PR #7](https://github.com/HarshHp13/wishlyn/pull/7); implementation target `codex/audit-remediation`. W1–W5 are merged. W6 is merged after two final exact-head/base approvals; umbrella PR #1 remains open and `main` is unchanged.

## Integrated behavior

- Product, bag and checkout share integer-paise pricing and gift/shipping rules. Oversized saved bags show an actionable adjustment state; unrelated saved orders remain accessible.
- Checkout and order views use verified external authentication, captured account preconditions and account/reference-scoped state. Requests carry `X-Wishlyn-Account-ID`; the server compares it with its session without granting authority from it. Clients validate successful `viewerId` responses separately from customer purchase ownership and reject A→B→A stale completions.
- Same-account reverification hides old order/payment/staff actions until fresh status arrives. Navigation, order replacement or refresh retires pending payment SDK startup. Request deadlines combine with navigation cancellation; failed saved-order reads expose retry.
- Payment cleanup compares the latest account bag inside its queued Web Lock mutation. New unrelated edits and unread durable baselines survive. The W5 shared store is preserved; W6 adds only two imports and purchase-conditional cleanup.
- Account-owned saved addresses populate validated delivery details. Manual entry remains available if that service fails.
- The installed Next.js 16.4.3 error boundary uses `retry()` to recover failed server content after infrastructure restoration.
- Quality CI requires all five database suite URLs and runs complete tests, lint, typecheck, tracked secret-pattern checks, production build and production dependency audit. Database fixture connection options are validated before client construction or mutation. Migration assertions follow the installed migration set, and storefront fixtures migrate before seeding.

## Review findings addressed

| Finding | Correction and meaningful verification |
| --- | --- |
| R1-W6-01 | Oversized saved bag returns an adjustment state; integer pricing tests and large-bag/saved-order browser recovery. |
| R1-W6-02 | Purchase-conditional cleanup runs inside the cart mutation/lock; queued, cross-tab and unread-baseline regressions. |
| R1-W6-03 | W5 owner memory survives verification uncertainty; accepted owner edits replay once after the durable baseline returns. |
| R1-W6-04 | Auth state and account/reference scope prevent superseded results, private-data leakage and accidental logout; deterministic browser held responses. |
| R1-W6-05 | Combined cancellation/deadline signals; stalled transport and navigation cancellation tests. |
| R1-W6-06 | Five database variables are mandatory; all five suites execute with zero skips in full verification. |
| R1-W6-07 | Loaded order state binds to the exact verified user generation; customer/staff old handlers send no mutations while fresh status is pending. |
| R2-W6-01 | New order references reset prior order and approval state; failed references retry without paying an earlier order. |
| R2-W6-02 | Actual fixture outage/recovery confirms framework retry restores the same document. |
| R2-W6-03 | Merchant admin/blocker fixture clients validate shared database options before connection or DDL; hostile-parameter regressions. |

Separate interim closure records: [order readiness](reviews/W6-R1-ORDER-READINESS-CLOSURE.md), [fixture transport](reviews/W6-R2-FIXTURE-TRANSPORT-CLOSURE.md). They establish those findings' correction, not final W6 approval.

## Complete candidate evidence

| Check | Recorded result |
| --- | --- |
| Clean dependency installation | `npm ci` succeeds; zero reported vulnerabilities. |
| All package tests | **244/244 pass; zero failures, zero skips**, with security, commerce, storefront, merchant and account/service PostgreSQL cases enabled. |
| Static/configuration | Whole-application lint, typecheck, tracked secret-pattern scan and diff-check pass. |
| Production build and dependency audit | Next.js 16.4.3 build passes; `npm audit --omit=dev --audit-level=moderate` reports zero vulnerabilities. |
| Actual customer/staff browser journey | Profile/address persistence, exact guest/cart variant and quantity, delayed guest tab, gift quote reload, server wishlist, order/service ownership, staff reply, reservation-safe stock edit and archived-order preservation pass. |
| Catalogue outage/retry | Guarded fixture table is restored; Retry recovers the catalogue in the same document. |
| Mocked checkout regressions | Stale order/SDK/account/status, failed saved-order retry, oversized bag and saved address checks pass; no payment requests or runtime exceptions. |
| Reflow and logo | 320/390/768/1440px checks have no horizontal overflow and exact logo center; actual account/support/checkout fit 320px. |

Evidence: [manifest and input fingerprints](evidence/integration/verification.json), [clean install](evidence/integration/clean-install.log), [full verification log](evidence/integration/verify-all-packages.log), [actual journey](evidence/integration/browser-journey.json), [retry](evidence/integration/retry-recovery.json), [mocked matrix](evidence/integration/browser-regressions.json), [mobile](evidence/integration/checkout-mobile.png), [desktop](evidence/integration/checkout-desktop.png), [customer/staff journey](evidence/integration/customer-staff-journey.png).

Checks ran at local source `da368b5e63dc2683351f7b3bf64de0342be71d2e`, incorporating approved W5 head `2b504ca4c16a431c1a0e9733fec1380e31e568ff`. Rebase onto merged integration/ledger base `c1813b34891d578ac62e9b07cd908dae84f3c766` changed no application, test, asset or build input; the manifest records that comparison. Later evidence/documentation commits do not claim a new runtime test run. The final published head passed GitHub Quality, including 244/244 tests with zero skips and the complete static/build/dependency checks. Both final reviewers independently passed all 244 tests; their reports and the verified merge pair are recorded below.

## Reproduction and fixture boundaries

Run `npm ci`, then `npm run verify` with all five explicit URLs. Required variables: `TEST_DATABASE_URL`, `COMMERCE_TEST_DATABASE_URL`, `STOREFRONT_TEST_DATABASE_URL`, `MERCHANT_TEST_DATABASE_URL`, `ACCOUNT_SERVICE_TEST_DATABASE_URL`. Each suite validates its disposable-database contract. Never load the original store environment into mutation tests. CI provisions its own PostgreSQL service and suite databases.

Local verification uses dedicated loopback PostgreSQL with synthetic records and a separate production server at `http://localhost:3126`; its trusted fixture CA is provided through `DATABASE_CA_CERT`, with matching `APP_ORIGIN`/`NEXT_PUBLIC_APP_URL`. Payment/media/email credentials are absent; provider traffic is blocked or intercepted. Both root server and named browser are closed after checks.

- `tests/integration/seed-browser-fixture.mjs` requires `INTEGRATION_TEST_DATABASE_URL` for exactly the loopback `wishlyn_integration_browser_test` database. It resets only that disposable fixture, including request budgets.
- Open `playwright-cli -s=wishlyn-completion` at the fixture origin. Run `browser-journey.mjs` via `run-code --filename=<absolute-path>` for actual APIs/SQL/session flows.
- Run `tests/integration/retry-recovery.mjs` with the same guarded URL while the matching browser/server run. It temporarily renames only that fixture's products table, guarantees restoration, then verifies same-document Retry.
- Run `browser-regressions.mjs` via Playwright CLI for synthetic API/SDK responses and layout checks. Unexpected API mutations and foreign/provider traffic are blocked.

## Operational prerequisites

All E1–E5 remain owner-operated release gates: secret rotation/admin review; environment isolation/backups/live migrations/schedules; approved commercial/service policies/contact details; real product/material/care/media facts; payment sandbox/webhooks/refunds/invoicing/email/carrier/consent/analytics operations. Fixture evidence does not establish live payments, notifications or fulfillment. [Audit disposition](AUDIT-DISPOSITION.md) maps every finding and deferred recommendation. Preserve durable business history and use forward repair after real purchases; keep the documented safe defaults until operational evidence exists. No merge into `main` is authorized by this workflow.

## Final review and integration record

Approved head `db55f388538777096034b50f2fec43c0b90f13c1` against base `c1813b34891d578ac62e9b07cd908dae84f3c766` was merged at `dc25e6de8221e94cfa436c31bc180fb851c9d9b1`. Reports: [Reviewer 1](reviews/W6-R1-FINAL.md) and [Reviewer 2](reviews/W6-R2-FINAL.md). Both attributed public approvals preceded the merge; Git merge parents establish the exact pair. [Review ledger](REVIEW-LEDGER.md) and [machine-readable merge evidence](merge-verification.json) retain the public links and checks.

The Vercel context reported success for an ignored deployment, so this program does not claim a successful hosted application build. The successful local/CI production build and synthetic browser evidence above are independently identified. Final whole-umbrella reviews are tracked on [PR #1](https://github.com/HarshHp13/wishlyn/pull/1); it remains open and E1–E5 remain outstanding.
