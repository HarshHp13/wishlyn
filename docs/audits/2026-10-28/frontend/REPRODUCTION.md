# Frontend audit reproduction setup

This records the setup behind the 28 October 2026 browser JSON. It does not authorize a live order, payment, signup, newsletter subscription, upload or admin edit. Use only a newly created, disposable browser session against `http://localhost:3001`; never attach to the user's existing browser/profile.

## Recoverable fixture

[safe-reproduce.js](safe-reproduce.js) contains the five recovered phase functions used by the original audit, in their original order, with the following R2 additions:

- A context-level request guard fulfills all non-GET/HEAD requests and all `/api/` requests with a synthetic 503 unless a phase's more specific browser route already aborts/fulfills them. It also blocks Razorpay SDK and postal-service traffic. This guard applies to both same-origin tabs and stays installed until teardown.
- Payment `/api/create-order` and `/api/verify-payment` are additionally mocked within checkout. Admin `/api/auth/me` is a synthetic authenticated response and `/api/admin/product` is a 503 for **every method**. No mocked route forwards a request to its real endpoint.
- An explicit request-failure wait before Pay makes the observed SDK **error-before-click** ordering deterministic. The wait aborts the fixture if the SDK error is not observed; it does not continue toward a real payment.
- Screenshots go to `/tmp/wishlyn-fe-reproduction-*.png`, leaving the original evidence intact. JSON is returned to the CLI and should also be written to `/tmp`.
- `finally` closes the added tab, clears this disposable session's localStorage/cookies and navigates away before removing guards. The CLI session is then closed by the procedure below.

The R2 wrapper was syntax-checked but **not rerun live**. The original results remain the JSON/screenshots in this folder; the wrapper adds safeguards and recoverable setup rather than claiming a second execution.

From the repository root, with the existing local development server running:

```sh
playwright-cli -s=audit-frontend-repro open about:blank
playwright-cli -s=audit-frontend-repro --raw run-code --filename=docs/audits/2026-10-28/frontend/safe-reproduce.js > /tmp/wishlyn-frontend-reproduction.json
playwright-cli -s=audit-frontend-repro close
```

Run the close command even if a phase fails. Do not remove guards to make a test pass. If the CLI's process is interrupted before `finally`, close the disposable session; no browser state belongs to a real user.

## Original phase setup and observations

### 1. Screen checks — `screen-audit.json`

Starting with no user, token, cart or wishlist, navigate the homepage, representative long-title product, login, wishlist, admin, profile, checkout and a nonexistent product. Check 390px and 320px widths, h1/title/canonical/robots metadata, DOM label associations and page scroll width. Guest profile/checkout redirect to login. No forms are submitted. The administrative **unauthenticated** state here is different from the mocked admin form in phase 4.

### 2. Interaction checks — `interaction-audit.json`

The original local catalog contained `golden-twist-drop-earrings-edd44a4e` with at least two units of available stock. The gift merge check requires a public product with that stock and the same UI; if inventory has changed, record that precondition rather than editing inventory or bypassing stock protection.

1. Open that public product; select gift wrap. Add once with `Audit gift for Alice`, close the bag, change the text to `Audit gift for Bob`, and add again. Inspect the synthetic bag's localStorage record. It contains quantity two with only Alice's message.
2. Abort postal requests in the browser. Enter `111111`; the page reports express delivery and COD despite failed verification.
3. Save that product to the wishlist, then fulfill `/api/wishlist-products` with 500. Open Wishlist: the count remains one while the page says empty. Stored wishlist IDs are not deleted.
4. Set synthetic user A (`audit-a@example.invalid`) in localStorage and dispatch the app's same-window auth-change event. Then sign out locally and make the guest key empty to model a signed-in user with no prior guest cart; the global legacy fallback repopulates it with A's cart. Set synthetic B (`audit-b@example.invalid`) and dispatch the event: B's empty account cart imports that same line/message.

These account records are browser fixtures, not valid accounts or JWTs. Their ability to affect client rendering is not a claim of server authorization bypass.

### 3. Checkout checks — `checkout-audit.json`

Phase 2 leaves synthetic B active and its local cart populated. Seed the shared `wishlyn-saved-addresses` key with **synthetic** A data:

- Name: `Audit Alice Fixture`
- Email: `audit-a@example.invalid`
- Phone: `111`
- Address: `Audit-only first account address`, `Audit City`, `Audit State`
- Postal code: `xyz`; country: India

Block the Razorpay script **before entering `/checkout`**, and mock both payment routes. The mounted `next/script` request fails while the shipping step is shown. The shipping form preloads A's name/address/phone but keeps B's email. Continue to Payment accepts the invalid phone/ZIP. Wait until the initial SDK request has failed, then press Pay. Original observation after 1.8 seconds: Processing and Back are both disabled; `Razorpay` is undefined; the failed script element remains; no visible error exists. Source analysis of listeners attached after an already-fired error explains the unbounded wait. The 1.8-second observation alone is not treated as proof of infinite duration.

No payment modal or successful gateway handler is exercised. If application changes cause an order API call, the context guard returns 503 instead of forwarding it.

### 4. Filters and mocked admin — `admin-filter-audit.json`, `admin-overflow.json`

Clear synthetic session data. With the original catalog's empty Rings category, Reset filters shows eight products but leaves `category=rings` in the URL; reload returns to the empty category. On the homepage, choose highest-price sorting and then Earrings; the keyed component remount resets sorting to Featured.

To inspect the administrator form, set `audit-admin@example.invalid` and the **invalid** token string `audit-fixture-not-valid` in this disposable browser. Fulfill `/api/auth/me` with a synthetic admin response. Fulfill `/api/admin/product` with 503 for all methods. No real administrator is authenticated. Inspect labels and 320/390/768/1440px widths; do not submit the form or delete anything. The original 320px measurement was scrollWidth 351 with a 335px creator card. The saved 390px screenshot is not evidence of the separate 320px overflow.

### 5. Same-origin tabs and persistence resilience — `state-audit.json`

Clear storage and open two pages in the **same disposable browser context**, both at `http://localhost:3001`. Save a wishlist item in the first. Storage is shared immediately, but the second header/context remains unchanged. A different context or origin would not test the same bug. Close the extra page.

Open Golden Twist Drop Earrings and select Jewellery Care; the observed panel is blank. The control is a native button with an implicit button role; its absent explicit role/selected-state attributes do not mean it has no accessibility role at all.

Finally seed only the disposable guest-cart key with `[{"quantity":1,"product":{},"variant":{}}]` and reload. The closed root drawer throws on missing `images[0]`, producing the saved page-load error. Clear that record and reload to recover. This intentionally malformed fixture is distinct from a normal fresh-session product error; clean sessions worked.

## Other evidence

- [color-contrast.mjs](color-contrast.mjs) is an offline source-based calculation. Run `node docs/audits/2026-10-28/frontend/color-contrast.mjs` to print current values without browser/API interaction.
- The price/stock refresh limitation and out-of-order-response race are static code findings; this fixture does not modify database prices/stock or claim that the race was timed live.
- The purity-selection collision is conditional and absent from the inspected one-variant-per-product catalog. No product/variant fixture was inserted into the database.
