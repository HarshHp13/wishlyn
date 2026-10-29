# W4 — Merchant catalogue and inventory

Date: 29 October 2026. Branch: `codex/audit-merchant`. Target: `codex/audit-remediation`.

## Result

Administrators can create, edit, preview, publish, replenish and archive products in `/admin`. Product and variant identifiers are assigned by the server. An edit keeps existing product URLs, order snapshots and variant history. New products default to a draft; publication requires a description, product media, at least one active variant and the merchant's explicit confirmation of the product facts.

| Audit records | Implemented behavior |
| --- | --- |
| F23, F21–F22 | Merchant workspace has associated labels, error/status feedback, focus controls, usable stock and variant fields, and narrow-screen reflow. Unsaved form and selected upload state survive account verification and recoverable upload/save failure. |
| F26–F27 | Product and variants save as one PostgreSQL transaction. Server-generated IDs, current product revision and variant ownership validation reject arbitrary/foreign/omitted existing variants before writes. Failed variant/history writes roll the aggregate back. |
| R01 | Search, draft/published/archived filters, low-stock visibility, edit/preview/public link, sizes, material/finish, prices and stock adjustments replace delete/recreate maintenance. |
| F18 | Failed catalogue loads and saves offer retry and retain form inputs. A successful response follows a committed aggregate. |
| Inventory/operations gaps | Stock adjustments record actor, reason, time, before/after and delta. Current reservations cannot be overwritten. Physical changes apply to the locked current stock instead of restoring stale counts from a form loaded before payment. |
| W2/W3 integration | Checkout locks products before variants when capturing a purchase, using the same ordering as merchant edits. Draft/archive and disabled variants are excluded from new quotes, public variants, related products, active offer prices and sitemap queries. Saved purchase snapshots remain intact. |
| Media configuration | Product image validation, Cloudinary transforms and the Next optimizer support the explicit configured Cloudinary cloud. Previously approved legacy media can be kept on its original product; new stock-image/local/foreign-cloud substitutes are rejected. |

## API and data contracts

`GET /api/admin/product` returns a bounded 20-item merchant list, categories and `nextOffset`; `search`, `status`, `lowStock` and `offset` filter the list. `GET ...?id=<id>` returns a transactional consistent product detail with its variants and the latest 100 stock adjustments.

`POST` creates an aggregate using a bounded `requestKey`. Retrying the same request cannot create a second product or repeat initial stock; changing a previously committed request's content returns a conflict. `PUT` edits an existing `id` and `revision`. Every existing variant must be kept in the aggregate; disable a discontinued option instead of deleting it. `stockAdjustment` is a signed integer delta, never an absolute stock overwrite. Nonzero deltas require `stockReason`.

All routes require current administrator authority, the same origin, endpoint-specific shared request budgets and a bounded JSON body. The obsolete destructive `DELETE` route is removed; archive uses the same revision-checked update as other product changes. Customer/foreign sessions and malformed ownership inputs cannot bypass these boundaries.

Migration `004-merchant.sql` adds product status/revision/fact confirmation/update metadata and idempotent creation references, active variant state and `merchant_stock_events`. It preserves the publication of existing legacy records so the migration does not silently remove the existing catalogue. Merchant review of their facts is still required. New records use the service's explicit draft default. Payment stock movements stay in durable commerce order history; merchant adjustments have a separate audit trail.

## Validation and evidence

| Check | Result / scope |
| --- | --- |
| `MERCHANT_TEST_DATABASE_URL=... npm exec tsx -- --test tests/merchant/merchant.test.ts` | 15 passing, zero skips. Uses unique disposable PostgreSQL databases; covers transaction rollback, duplicate creation, cross-product IDs, stale edits, reserved stock, payment versus stale form, archive/quote serialization, consistent snapshots, active offer pricing, bounded search and route authorization/validation. |
| W4 scoped ESLint | Passed without errors or warnings. |
| `npm run build` | Production build and TypeScript passed without a store database. |
| Production browser fixture | Create/edit/replenish/publish/archive controls, stable product link, stock history, retained form/uploads through auth refresh and upload/save failures. APIs and media are intercepted synthetic fixtures; these checks do not claim provider uploads or live merchant writes. |
| Responsive verification | 320, 390, 768 and 1440 CSS pixels, and separately doubled computed text at 320px; geometry and screenshots recorded in the browser evidence. |

Evidence: [tests](evidence/merchant/tests.log), [lint](evidence/merchant/lint.log), [build](evidence/merchant/build.log), [browser results](evidence/merchant/browser-results.json), [browser script](../../tests/merchant/browser-checks.js), [mobile recovery](evidence/merchant/admin-320-retry.png), [desktop](evidence/merchant/admin-desktop.png), [enlarged text](evidence/merchant/admin-320-double-text.png).

The first enlarged-text harness doubled computed sizes while walking parent/child elements, compounding inherited text sizes. It exceeded screenshot dimensions. The corrected harness snapshots every original computed size before applying a single factor of two; this was a harness correction, not a storefront defect.

## Reproduce

Use a dedicated loopback PostgreSQL base named `wishlyn_*test`, with a synthetic role permitted to create databases. The suite creates a unique `wishlyn_merchant_<random>_test`, migrates the current schema, tests it and drops it in cleanup. It never falls back to the store's `DATABASE_URL`. Without `MERCHANT_TEST_DATABASE_URL`, database tests skip explicitly; that is not acceptance evidence.

```sh
MERCHANT_TEST_DATABASE_URL='postgresql://fixture_user:fixture_only@127.0.0.1:PORT/wishlyn_merchant_test' \
  npm exec tsx -- --test tests/merchant/merchant.test.ts
npm run build
```

For the saved browser script, run the production build on `http://localhost:3144` in a separate checkout/process. It intercepts all API requests, fulfills one synthetic image, and blocks other remote requests. It writes screenshots under `/tmp/wishlyn-w4-browser/`; create that directory first. The script is a standalone Playwright CLI function expression.

```sh
playwright-cli -s=wishlyn-merchant-check open about:blank
playwright-cli -s=wishlyn-merchant-check --raw run-code --filename=tests/merchant/browser-checks.js
playwright-cli -s=wishlyn-merchant-check close
```

## Release and recovery boundaries

- Apply reviewed migration 004 only in the chosen isolated deployment after backup/preflight. No production database was accessed or migrated by this work.
- Confirm actual product composition, finish, sizes, care and photography before publication. The form does not invent certification, precious-metal status or care instructions.
- Configure `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` before building and the matching explicit server upload credentials at runtime. Public cloud configuration is embedded in the build; changing the cloud requires a rebuild. Uploaded media can remain orphaned if a later database save fails, so operations must review unused assets.
- Categories are bounded existing setup data; this package does not implement category administration, bulk imports or granular staff roles. Those are deferred scale features in the plan.
- Archive excludes new quotes and browsing but preserves previously saved purchase references; it does not cancel already reserved purchases. Discontinue a variant through its active flag, without deleting its inventory or order references.
- After real orders/stock events exist, preserve those records and forward-repair. Do not drop the new tables or restore the former insecure/destructive admin routes as a rollback.
- `/admin/support` depends on W5. Final shared CI, all-package tests and the complete integrated review remain W6. This document records implementation evidence; both independent reviewers still must approve the exact PR head/base before merge.
