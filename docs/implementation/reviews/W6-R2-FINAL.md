# Reviewer 2 — final W6 exact-pair review

Date: 29 October 2026. Reviewer: `/root/reviewer_two_completion`.

PR: [#7](https://github.com/HarshHp13/wishlyn/pull/7), targeting `codex/audit-remediation`.

**Verdict: +1 LGTM on exact HEAD `db55f388538777096034b50f2fec43c0b90f13c1` against exact BASE `c1813b34891d578ac62e9b07cd908dae84f3c766`. No remaining actionable W6 findings.**

Fetched GitHub PR HEAD and target branch at the start and after all verification. Detached HEAD and fetched PR HEAD both resolve to the full HEAD above; fetched target and merge-base both resolve to the full BASE above. The isolated checkout `/tmp/wishlyn-completion-r2-w6-preliminary` is clean. This is a new full W6 approval; my earlier preliminary and single-finding closure reports did not supply it. This approval does not cover the prospective whole umbrella, `main`, deployment or later commits.

## Full review scope and finding closures

Reviewed the entire W6 BASE diff, including checkout/order/account-reference state, commerce and merchant consumers, session preconditions, integer pricing, saved-address integration, purchase cleanup and W5 recovery contracts, Next error handling, fixture/migration/CI changes, browser harnesses, disposition and final provenance. The ten recorded W6 findings are substantively closed:

| Finding | Independently assessed final behavior |
| --- | --- |
| R1-W6-01 | Integer-paise estimates return an adjustment state for oversized valid stored bags. Saved owned purchases are resolved before unrelated current-bag limits. |
| R1-W6-02 | Paid cleanup compares the latest bag inside the common queued mutation/Web Lock and rechecks captured account authority. Unrelated committed or accepted edits survive. |
| R1-W6-03 | W5's complete approved store is preserved; the source difference is only two imports and seven cleanup lines. Unread owner baselines and accepted journals recover once without replacing durable data. |
| R1-W6-04 | Captured account headers, successful viewer checks, account/reference-keyed state and current session authority prevent A/B/A stale publication and wrong-account dispatch. |
| R1-W6-05 | External navigation cancellation and the 25-second request deadline are combined. Client transport tests exercise both. |
| R1-W6-06 | All five database suite variables are mandatory before any verification command starts; the complete independent suite actually runs with zero skips. |
| R1-W6-07 | Customer/staff order readiness binds to the exact verified user object and completed current status read. Retained former controls cannot mutate during a new same-account read. |
| R2-W6-01 | A new saved-order reference starts fresh state and approval; failed references expose retry while the prior purchase/Pay controls remain absent. Pending SDK startup and retired modal callbacks are inert after their lifecycle ends. |
| R2-W6-02 | Installed Next.js 16.4.3 documents `retry()` as a refetch/re-render action. The implementation uses it; inspected coordinator production evidence proves same-document catalogue recovery with guaranteed fixture-table restoration. |
| R2-W6-03 | Merchant admin and blocker clients validate explicit shared database options before client construction, connection or DDL. Hostile transport options cannot override a validated loopback host. |

Server authority still comes from the current session and role. `X-Wishlyn-Account-ID` is a precondition and never grants customer or staff authority; missing headers preserve session-authorized provider/legacy behavior. Customer purchase ownership is checked separately from staff viewer identity. Profile/address/wishlist/support routes remain covered by W5's stricter owned request model. Actual server tests reject stale shared-cookie reads/writes before commerce persistence, and matching customer headers cannot acquire staff privileges.

Checkout's saved-order and quote paths validate customer ownership, keep approval tied to the current purchase/reference, and retire SDK startup after account/user/order changes. Saved addresses require matching owner and viewer, a bounded valid address list, and the shared delivery model; selection checks current account again. Manual entry remains available on address failure. Integer pricing rounds each unit into paise before fees and quantity aggregation, while quote and UI use the shared shipping/tax rules.

## Independent exact-source probes

Nine additional probe invocations completed exit 0 against this final source:

- **Customer/staff fresh order readiness:** independently authored actual component/helper fixtures hold a same-account fresh status read. Old cancellation/payment/fulfillment actions remain hidden; invoking retained customer cancellation or staff form handlers sends zero mutations. Fresh read failure exposes current retry, retry hides the old error, and the confirmed/delivered response renders without obsolete actions. Staff viewer differs from the customer owner. Evidence: `/tmp/wishlyn-completion-r2-w6-final-order-readiness-probe.mjs` / `.json`.
- **Checkout SDK/reference/callback lifecycle:** independently authored actual `AccountCheckout`/commerce-helper fixtures verify same-owner reverification retires held SDK startup and resets approval; a new failing reference hides the previous piece/Pay control and retries to an unapproved new purchase; retired modal callbacks remain inert after lifecycle retirement and A/B/A return, with zero verification, cleanup or navigation. Evidence: `/tmp/wishlyn-completion-r2-w6-final-checkout-scope-probe.mjs` / `.json`.
- **Four independent purchase-cleanup journal cases:** accepted unread cleanup before a later local edit; another tab's unrelated committed bag before restoration; A-bound cleanup through A/B/A/B; and known write-failure cleanup followed by new edits/reverification. Exact quantities, private owner baselines and unrelated gifts survive; paid lines clear only when the latest conditional comparison permits it. Evidence: `/tmp/wishlyn-completion-r2-w6-final-cleanup-journal-probe.mjs` / `.json`.
- **R2-W6-03 transport matrix:** 28 rejected admin and 24 rejected blocker cases create zero clients and attempt zero network/DDL/migration operations, including cleanup after rejected setup. Valid local plaintext and verified-TLS controls preserve validated effective pg options. Evidence: `/tmp/wishlyn-completion-r2-w6-final-fixture-transport-probe.mjs` / `.json`.
- **Mandatory runner guard:** the actual verification script executes with a recording fake npm command. Omitting each required variable exits 1 and starts zero commands. Supplying all five preserves test → lint → typecheck → secret scan → build → production audit order. This probe intentionally avoids duplicating a heavy build. Evidence: `/tmp/wishlyn-completion-r2-w6-final-verify-guard-probe.mjs` / `.json`.
- **Preserved W5 boundaries:** 34 guest-state cases, the five latest selective/pending metadata supersession regressions and six unread-owner cart invariants pass with W6's exact shared store. Evidence: `/tmp/wishlyn-completion-r2-w6-final-w5-{guest-boundaries,selective-metadata-supersession,cart-invariants}-probe.mjs` / `.json`.
- **Actual routes/services/PostgreSQL authority:** independently reran stale cookie and revoked-session rejection, once-only replay preserving later removal, mixed batches, changed-payload/cross-owner rollback, global 409 token ownership and coherent support reads during a real concurrent committed reply. Evidence: `/tmp/wishlyn-completion-r2-w6-final-w5-authority-probe.ts` / `.json`.

The component/store probes run actual source in synthetic VM/hooks/API fixtures, including a keyed-lifecycle simulation; they are not newly claimed native-browser runs. The authority probe uses actual migrated PostgreSQL and drops its separate random database afterward.

## Complete tests, input verification and provenance

- **244/244 independent repository tests passed; zero failures and zero skips**, enabling security, commerce, storefront, merchant and account/service PostgreSQL coverage. Log: `/tmp/wishlyn-completion-r2-w6-final-tests.log`. I provisioned a separate reviewer-owned PostgreSQL 17 server, with five dedicated suite bases and suite-created child databases. Commerce's required exact database name exists only on that isolated server; none of root's browser databases were used. All suite bases and probe databases were removed, absence of extra databases was checked, and the disposable server was stopped/removed.
- The old dependency symlink was unavailable at setup. I replaced only my checkout's symlink with an independent successful `npm ci` install; root/author dependency directories were untouched. Installation reports zero vulnerabilities. Log: `/tmp/wishlyn-completion-r2-w6-final-install.log`.
- Whole-application ESLint and full exact-BASE diff-check passed. Log: `/tmp/wishlyn-completion-r2-w6-final-lint.log` (empty successful output). No duplicate full production build or native browser was launched.
- Independently compared **all 190 recorded application, test, asset and build-input SHA-256 values** with this exact published checkout: zero mismatches. Evidence: `/tmp/wishlyn-completion-r2-w6-final-fingerprints.json`. This verifies the manifest's unchanged-input relationship to root's validated source `da368b5e63dc2683351f7b3bf64de0342be71d2e` after the ledger-only rebase onto the final BASE. It does not pretend that an old-head run was executed again.
- Reviewed root's clean install, full verification/typecheck/secret scan/production build/audit and three production browser result groups: actual synthetic PostgreSQL customer/staff journey; guarded outage/retry; and intercepted checkout/SDK/reference/status/large-bag/address/layout matrix. These results remain attributed to the coordinator, with explicit mocked/provider distinctions. Local layouts report no horizontal overflow and exact logo centering at 320/390/768/1440px; recorded runtime exceptions and unexpected payment requests are empty.
- Coordinator reports final PR Quality CI successful. Vercel's success context accompanies an **Ignored/skipped deployment** notice; neither this report nor that context establishes a new hosted preview build/deployment. No hosted preview validation is claimed.

The complete audit disposition covers F01–F31, C01–C04, R01–R04 and U01–U06 while preserving E1–E5 owner-operated requirements and explicitly deferred optional features. It distinguishes recorded status/support from real refunds, invoices, carriers, notification delivery and live payment/provider evidence. No original `.env`, real customer data or email/payment/media provider was used or modified. No application source, public review comment or merge was changed by this reviewer.

This exact W6 pair is approved. Coordinator publication/integration remains separate. New commits invalidate this approval; the final whole umbrella needs its own independent exact-pair review after W6 integration.
