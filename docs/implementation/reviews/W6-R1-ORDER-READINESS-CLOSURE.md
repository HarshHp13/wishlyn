# Reviewer 1 — interim R1-W6-07 closure verification

**R1-W6-07 is substantively corrected in the exact local source below. This is finding-only interim feedback, not a W5, W6 or umbrella LGTM.**

- Reviewed local HEAD: `7cef443e13077e6c7b1d58243e2fea6d2c759791`.
- Temporary W5 boundary: `e54a95bc3de1717c3b81c5f83a8301514a076174`.
- Independent clean detached snapshot: `/tmp/wishlyn-completion-r1-w6-preliminary`.
- Scope: only R1-W6-07's same-account fresh order readiness, errors and customer/staff actions. The original preliminary report remains scoped to its older head.

The fix records the exact verified `auth.user` object with each completed order read. Readiness requires that object, the current endpoint/account key and a completed loading state. The render, current error and action paths share that readiness gate; actions additionally compare the captured loaded user with the current external auth user. Thus the old account ID/endpoint string cannot restore a ready old order after same-account reverification.

Independent checks passed:

- **11/11 targeted tests, zero skips:** the actual customer/staff component regressions and commerce client account/response/deadline cases.
- Reviewer-owned actual-source probes for both customers and staff hold the new current-status GET after the same account verifies. Obsolete status, cancellation/payment links and fulfillment actions stay hidden.
- Calling retained pre-verification customer cancellation and staff fulfillment handlers dispatches **zero mutations**.
- A fresh status-read failure shows its current retry action without restoring the old order. Retry hides the prior error and successfully publishes the newly confirmed/delivered status.
- Staff probe uses a staff viewer distinct from the customer purchase owner; no ownership/viewer conflation is required for readiness.
- Auth response listeners are cleaned up; scoped lint and targeted diff-check pass.

Evidence:

- `/tmp/wishlyn-completion-r1-w6-order-readiness-closure-tests.log`
- `/tmp/wishlyn-completion-r1-w6-order-readiness-closure-probe.mjs`
- `/tmp/wishlyn-completion-r1-w6-order-readiness-closure-customer.json`
- `/tmp/wishlyn-completion-r1-w6-order-readiness-closure-staff.json`
- `/tmp/wishlyn-completion-r1-w6-order-readiness-closure-lint.log`

The reviewer-owned probes execute the actual component and commerce helper with isolated deterministic hooks/effects and synthetic transport. They are source-level checks, not a real-browser run. The new held-read browser regression was inspected as source; no browser/build run is claimed. No further actionable issue was identified in this narrowly dispatched closure scope.

No root/author application source was edited, and no build, browser server, database, provider, external comment or merge was used. Final W5 corrections, the eventual published W6 exact HEAD/BASE and the prospective umbrella still require their independent reviews and gates. This document supplies no prospective approval or merge authorization.
