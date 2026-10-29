# W5 — Customer account and operated support

Date: 29 October 2026. Branch `codex/audit-account-service`, targeting `codex/audit-remediation`. Two independent approvals on the final head/base are required before merge. This package does not deploy, rotate secrets, send live email or execute refunds.

## Delivered behavior and audit mapping

| Scope | Behavior |
| --- | --- |
| F10, U06 account data | Owned profile names and up to 20 saved Indian delivery addresses persist on the server. Client-supplied owner IDs never select an account. Address/profile versions reject stale edits; private state is hidden during session uncertainty and keyed by verified account identity. |
| F10 saved pieces | Authenticated wishlists persist across sessions/devices. Server row locks serialize add/remove/toggle. A once-only import consumes the verified account's versioned browser list; ambiguous universal records are never imported. Guests retain W3 browser behavior. Failed requests expose retry and never report success. |
| U06 security | Current-password verification precedes password changes. New credentials are limited to 72 UTF-8 bytes; bounded legacy current-password authentication remains compatible. Profile locks recheck the current session/version before writes. Password changes revoke every session and outstanding reset token atomically. |
| U06 recovery / E5 | A configured Resend delivery adapter issues 20-minute, hashed, single-use, session-version-bound tokens. Tokens reach the customer only in the email link fragment, never an API response or browser storage. Failed/uncertain delivery invalidates its token. Recovery is disabled by default and reports unavailable honestly. |
| F25, U06 operated support | Authenticated order-linked help, return-review and cancellation-review requests have durable customer/staff conversations and an admin queue. Owned order references are checked server-side. Unchanged retries reuse a key; changed details require a fresh key. Status/history/version commit together. Detail reads use a repeatable-read transaction to prevent mixed revisions during concurrent staff replies. |
| F21–F22, R03 | Named controls, visible focus/error/status feedback and responsive account/support forms reflow at 320px. Shared header/footer remain outside account-keyed private content, preventing auth-refresh loops. |
| E3/E4 facts | `/support` publishes only explicitly approved service/contact text. Missing policies have truthful unavailable wording. A submitted request is neither a provider refund nor a cancelled confirmed purchase. |

## API and integration contracts

All owned browser mutations use same-origin protection, streamed JSON limits, server sessions and distributed request budgets. Private reads use `Cache-Control: no-store`. Identity is selected exclusively by the verified session. Password and recovery paths have additional abuse budgets before expensive work.

- `GET/POST /api/account/profile`: `{ profile: { ownerId, email, firstName, lastName, version } }`. POST edits names/version; email/role remain server authority.
- `GET/POST /api/account/addresses`: `{ ownerId, addresses: [{ id, version, label, firstName, lastName, phone, address, city, state, zipCode, country }] }`. POST creates without ID, updates with owned ID/version, or deletes with `{ action: 'delete', id, version }`. Root's W6 integrates selection into checkout; saving an address does not establish delivery eligibility.
- `POST /api/account/password`: `{ currentPassword, newPassword }`; success clears the session cookie after all-session revocation commits.
- `GET/POST /api/account/wishlist`: `{ ownerId, items, version, browserImported }`. Mutations use `add/remove/toggle` plus `productId`, or a once-only `import` plus `productIds`; entire-list replacement is not accepted.
- `POST /api/account/recovery`: `{ email }`. Disabled configuration returns 503. Configured requests return the same 202 acceptance text for unknown accounts and failed/uncertain delivery; that text asks the user to check email and makes no sent-email claim.
- `POST /api/account/reset-password`: `{ token, newPassword }`. Consumption/profile change/session revocation share one transaction. Outstanding links can finish safely if issuance is disabled later.
- Customer `GET/POST /api/support`, `GET/POST /api/support/[id]`; staff `GET /api/admin/support`, `GET/POST /api/admin/support/[id]`. Creation requires a valid owned order, request UUID, kind, subject and bounded message. Replies require current version; staff choose status and a customer reply reopens a resolved request. Pages are bounded to 20 requests and conversations to 200 events.

`src/lib/account/types.ts` exports the shared account/address/wishlist/support types. Existing purchase snapshots, payment state, reservation counts and fulfilment are not changed by service requests. Receipts remain distinct from statutory invoices.

## Safe recovery delivery setup

Recovery requires all of:

```text
ACCOUNT_RECOVERY_ENABLED=true
APP_ORIGIN=https://the-approved-store-origin
RECOVERY_EMAIL_FROM=<verified sender accepted by Resend>
RECOVERY_EMAIL_API_KEY=<environment-isolated provider credential>
```

The endpoint is fixed to `https://api.resend.com/emails`, verifies an actual provider message ID, and uses a bounded request and provider idempotency key. The adapter passes a plain-text message only. No token, provider response or credential is logged. A token is usable only after delivery is recorded as sent; a timeout/failed response consumes it, even if a provider later delivers that message. The customer must request a fresh link. This favors safe recovery over treating ambiguous provider success as a usable credential.

Operator acceptance still requires approved sender/domain verification, isolated preview/production credentials, real provider sandbox/allowlisted mailbox testing, delivery monitoring and an operated escalation channel. No live mailbox/provider was used here. Unknown accounts and delivery failures receive identical acceptance semantics to avoid disclosing account existence through provider outages. Monitor aggregate `delivery_state`/expiry counts rather than raw tokens, email payloads or password values. Purge expired/consumed tokens after the approved security retention period; retain aggregate delivery failures for operations. Do not re-enable or resend a failed token.

The workflow has no automated transactional purchase/support notifications. Customers and staff follow replies in the store; notification delivery, retries and exception monitoring remain E5 setup work rather than simulated email. Guests must create/sign into an account to recover owned data/orders. Guest checkout remains deliberately deferred in the main implementation plan.

## Approved service facts

Set `SERVICE_POLICY_APPROVED=true` only after merchant approval. Optional `SUPPORT_EMAIL`, `SERVICE_SHIPPING_POLICY`, `SERVICE_RETURNS_POLICY`, `SERVICE_CANCELLATION_POLICY`, `SERVICE_WARRANTY_POLICY` then populate the help page as text. Missing/unapproved values are omitted or show that approved details are not published. No contact address, guarantee, geographic promise, return eligibility or legal policy was invented.

Staff must review eligibility and record confirmed operational actions. “Resolved” is conversation status, not evidence of a provider refund, carrier booking or tax invoice. Requests/history remain linked to the immutable order even if the catalogue changes. Actual refunds, carrier automation, statutory invoicing and merchant-approved service criteria remain E3/E5 gates.

## Migration and rollback

Migration 005 is additive and independent of merchant migration 004. It adds owned account data, hashed recovery records, support requests and events with foreign keys, state/size constraints, owner indexes and request-key uniqueness. The existing checksum/advisory-lock migration runner remains canonical. Fresh migrations and reruns passed on disposable PostgreSQL.

No production migration was run. Before release review the full migration set, backups, retention and environment configuration. After real account/support/order writes, disable affected operations and forward-repair; do not destructively downgrade or erase support history. Existing profiles/orders are not backfilled from guesses about email ownership.

## Validation and reproducibility

After W4 merged, W5 rebased onto integration `81df15a21281791cd3b2b95d44e77c5e98b8d0cf`. The final account/service suite runs all current migrations, including merchant migration 004 and account migration 005.

- **18 tests pass, no skips:** 15 actual disposable PostgreSQL cases and 3 isolated client-state cases. They cover cross-account isolation, optimistic concurrent edits, server wishlist convergence/import, CSRF/invalid inputs, UTF-8/password verification, all-session revocation, transactional failure rollback, single-use/expired/version-bound/failed-delivery recovery, owned/idempotent support requests, staff/customer history, coherent reads during concurrent replies, and stale A/B/A client responses. Provider email calls are stubbed in the recovery tests; no external email is sent.
- Typecheck, scoped ESLint and production build pass. Root W6 owns whole-application lint and final integrated validation.
- Browser checks use a separate local development server and **actual disposable PostgreSQL**, synthetic users and purchase data. Remote requests are blocked. Profile/address persistence, wrong-password input retention, server saved pieces, account switch isolation, support creation/customer reply/staff reply and disabled recovery pass. Account/support widths are 320px with scroll widths 320; all account controls are labelled. No page exceptions occurred.

Evidence: [tests](evidence/account-service/tests.log), [typecheck](evidence/account-service/typecheck.log), [lint](evidence/account-service/lint.log), [build](evidence/account-service/build.log), [browser result](evidence/account-service/browser-results.json), [mobile account](evidence/account-service/account-mobile.png), [mobile request](evidence/account-service/support-mobile.png), [desktop staff conversation](evidence/account-service/support-desktop.png).

Database suite setup uses a dedicated disposable server and a role with CREATEDB:

```sh
ACCOUNT_SERVICE_TEST_DATABASE_URL=postgresql://<synthetic-role>:<fixture-password>@127.0.0.1:<unused-port>/wishlyn_account_service_test \
  npm exec tsx -- --test tests/account-service/*.test.ts tests/account-service/*.test.mjs
```

The suite refuses non-loopback or incorrectly named databases, creates a unique child database, migrates it, and drops that child afterward. It never falls back to `DATABASE_URL`. Independent reviewers can share the explicitly disposable server because each invocation has a separate database.

Browser setup:

```sh
ACCOUNT_BROWSER_DATABASE_URL=postgresql://<synthetic-role>:<fixture-password>@127.0.0.1:<unused-port>/wishlyn_account_service_test \
  npm exec tsx -- tests/account-service/browser-fixture.ts
DATABASE_URL=<same explicit disposable URL> DB_ALLOW_LOCAL_PLAINTEXT=true APP_ORIGIN=http://localhost:3055 \
  npm run dev -- --port 3055
playwright-cli -s=wishlyn-w5-account open http://localhost:3055/login
playwright-cli -s=wishlyn-w5-account --raw run-code --filename=<absolute-path>/tests/account-service/browser-checks.mjs
playwright-cli -s=wishlyn-w5-account close
```

The browser fixture is deliberately destructive only to the explicitly named loopback `wishlyn_*account_service_test` database. It uses synthetic accounts `browser-a@example.test`, `browser-b@example.test`, `browser-admin@example.test`, password `Browser fixture password`, and product `browser-product`. The browser script uses those constants and derives the order from the account's actual saved purchases. Adapt these fixture constants/origin when W6 uses its separate integrated fixture. Screenshots are local synthetic evidence, not a certification of physical devices or live operated services.

The first browser attempt exposed a header-remount auth loop, fixed before review. A subsequent harness selector was corrected from an exact wrapping-label match to the observed combobox accessible name. Two earlier build/typecheck processes ended with SIGTERM during shared resource pressure; they provided no acceptance result. Later successful checks are the recorded evidence.
