# W3 — Storefront and shopping-state remediation

Date: 28 October 2026. Feature branch: `codex/audit-storefront`. Target: `codex/audit-remediation`; never `main`.

## Implemented behavior

- The bag and wishlist load only after server session verification. Unknown/loading/error identity hides private snapshots without deleting account records. Authenticated records are keyed by immutable account ID; a confirmed guest-to-account transition consumes the guest selection once. Legacy universal records with ambiguous ownership are not imported.
- Browser storage is versioned and deeply validated. Invalid product/variant relationships, malformed images, unsupported image hosts, unsafe prices and invalid quantities are rejected. Storage denial retains a usable in-memory session and a visible notice.
- Web Locks serialize local read-modify-write operations across tabs. Each mutation reads the latest stored selection, and storage events update other tabs. Older browsers without Web Locks use synchronous last-committed-update behavior; multi-tab conflict guarantees apply to browsers with that API.
- Exact variant ID, gift-wrap choice and normalized gift message form the bag-line identity. Different messages remain separate; quantities share the same variant's available-stock budget.
- Bag opening refreshes current catalogue snapshots through a bounded read API. Deleted products remain visible as unavailable, stock reductions require adjustment, and price changes produce a review notice. An unsuccessful refresh offers retry rather than silently approving checkout. Checkout itself remains the server-authoritative purchase boundary owned by W2.
- The bag includes product links, gift instructions, shipping/tax estimates and an estimated total. The footer's shopping-bag action opens that drawer.
- Category, search, maximum price, sorting and page are URL-backed. Categories without published products and the meaningless rating sort are removed. Newest is labelled accurately; catalogue pagination is crawlable and returns eight products per page.
- Public SQL queries return bounded pages, category highlights, exact requested variants and one related product. Public availability subtracts reservations; unpublished products are excluded. Missing data and database outages remain distinct.
- Every product option is selected by exact variant ID, including purity-distinct choices. Single-option products show a specification instead of a false choice. A native dialog enlarges images and supports keyboard navigation/focus return. Tabs expose selected state, relationships and keyboard behavior.
- Postal lookups cancel superseded requests and time out. A recognized postal area does not become a delivery-date or COD promise. Lookup failure is explicitly uncertain.
- Wishlist requests are cancelled/remounted when the selection changes; failures preserve the saved list and provide retry. Newsletter success follows an actual committed insert or real duplicate; infrastructure failures return retryable 503 responses.
- Missing care/dimensions/stone information no longer becomes invented product facts. Unsupported universal precious-material, return, dispatch and COD promises are removed from the covered storefront surfaces. Product/editorial wording remains neutral pending merchant facts.
- Accessible labels, status/error feedback, contrast and transactional text were improved. Narrow screens retain the centered symbol-only logo. Footer grid tracks shrink at enlarged text sizes.
- Product metadata, canonical URLs, accurate offers, robots policy and a runtime sitemap index/chunk implementation expose published products without requiring a database during the application build. No fabricated reviews are emitted in structured data.

## Audit mapping

| Audit IDs | Implementation and checks |
| --- | --- |
| F10, F19, F20 | Verified-identity stores, migration/isolation, cross-tab locks, bounded serialization, malformed-source recovery; state/store tests |
| F14 | Personalized line identity and aggregate quantity validation; state tests and browser gift flow |
| F16, F17 | Postal cancellation/timeout/uncertainty; wishlist lifecycle cancellation and retry; browser failure scenarios |
| F18 | Typed catalogue failures propagate; wishlist and bag expose retry; real PostgreSQL outage injection |
| F21, F22 | Labels, selection/tab state, live messages, native-dialog focus, stronger text/focus tokens; browser and contrast checks |
| F24 | Complete filter URLs and server pagination; URL round-trip tests and browser reload/category/reset |
| F25 | Truthful delivery/help wording and `/support` links; usable service endpoint depends on W5 |
| F28 | Bounded/canonical newsletter request, rate budgets, real persistence result; database failure trigger test |
| F31 | Explicit missing-care state and help entry, no guessed cleaning advice; browser check |
| C01 | Exact variant selection, including shared metal with distinct purity; SQL fixture and browser selection |
| R02 | Route metadata, published offer data, dynamic sitemap index and bounded chunks; production build and HTTP/browser checks |
| R03 | Readable supporting copy and wrapping/shrinking grids; 320–1440px and synthetic 200% text checks |
| R04 | Bounded server pages/highlights/related queries and React per-request product lookup caching; PostgreSQL tests |

## Validation and evidence

Testing uses an isolated PostgreSQL container (`wishlyn-w3-postgres`, loopback port 55443, database name ending in `storefront_test`) and synthetic catalogue records. Browser images intentionally reuse local assets as fixture media; screenshots do not represent new real product claims. No existing configured database, real customer, real account signup or provider payment was exercised.

| Check | Result / boundary |
| --- | --- |
| `npm run test:storefront` with `STOREFRONT_TEST_DATABASE_URL` | 20 passing: five SQL/route cases, ten state/filter/multi-tab cases, five contrast pairs. Database tests refuse non-loopback or non-`storefront_test` URLs. Without that explicit variable, the five database cases are skipped. |
| `npx tsc --noEmit` | Passed |
| Scoped ESLint covering every W3 source/test file | Passed without warnings; the CLI's required standalone browser-function expression has one documented rule suppression |
| `npm run build` | Passed without `DATABASE_URL`; runtime sitemap handlers avoid build-time catalogue access |
| Production browser | Exact SKU/gifts, native-dialog focus, tabs, postal failure, wishlist retry, filter persistence/reset, published sitemap coverage; zero page exceptions |
| Responsive header/product | 320, 390, 768, 1440 CSS pixels: zero horizontal overflow, logo center offset 0 |
| Text enlargement | Synthetic doubling of computed text sizes after hydration, 320px: scroll width 320; not a physical-device/browser accessibility certification |
| Contrast | Current source tokens: gold/ivory 6.31:1; white/gold 6.70:1; supporting text/ivory 4.73:1; selected/hover pairs also meet 4.5:1 |

Evidence: [tests](evidence/storefront/tests.log), [build](evidence/storefront/build.log), [lint](evidence/storefront/lint.log), [browser results](evidence/storefront/browser-results.json), [text enlargement](evidence/storefront/text-zoom.json), [contrast](evidence/storefront/contrast.json), [desktop product](evidence/storefront/product-desktop.png), [mobile product](evidence/storefront/product-mobile.png).

The first sitemap approach exposed a build-time dependency through `generateSitemaps`; it was replaced by runtime Route Handlers. An intermediate Next development server continually refreshed while routes/build artifacts changed in the shared environment. Final browser evidence uses the production build and a disposable PostgreSQL server with a trusted local TLS certificate. Development overlays, expected anonymous `/api/auth/me` 401s and automation-induced hydration warnings are not treated as product exceptions.

## Reproduction

1. Start a dedicated disposable PostgreSQL instance. Do not use existing `.env` credentials. Set `DATABASE_URL` to that loopback test database and `DB_ALLOW_LOCAL_PLAINTEXT=true` for local nonproduction setup only; run `node scripts/migrate.mjs --apply`.
2. Set `STOREFRONT_TEST_DATABASE_URL` to the same loopback URL with `storefront_test` in its database name and run `npm run test:storefront`. Fixtures create 20 products, one draft, two purity variants for the first product, and reservation-aware stock. Fault triggers/table renaming occur only in this disposable database and are cleaned up in `finally` blocks.
3. For production browser verification, configure trusted PostgreSQL TLS (`DATABASE_CA_CERT`) and run the production build/server on `http://localhost:3043` with `APP_ORIGIN` and `NEXT_PUBLIC_APP_URL` set accordingly. Never disable certificate verification in production mode.
4. Open a fresh named Playwright CLI session from a temporary directory outside the watched checkout, then run `tests/storefront/browser-checks.mjs` using an absolute filename. The script clears only that disposable browser's local state and blocks business mutations; catalogue read APIs may update request-budget counters in the disposable database.
5. Copy successful JSON/screenshots to the evidence directory after execution. Close the dedicated browser/server. Remove the disposable container when reviews finish. The original server at port 3001 is unrelated and remains untouched.

## Integration dependencies and release limits

- W1's verified auth state, typed request helpers, database layer and rate-limit tables are required. This branch was initially tested on W1 checkpoint `28c015e`; it must be rebased onto the final merged W1 before final approvals.
- W2 owns authoritative quotes, payment execution, inventory reservations and `commerce-rules.ts`. Current provisional bag arithmetic matches the existing ₹350 gift, ₹250 shipping, ₹3,000 free-shipping and whole-rupee 3% tax behavior. Adoption of W2's shared helper and checkout's `refreshCart`/`cartStatus` contract must be completed at the integration rebase before final approval. The displayed estimate is never payment authority.
- W5 supplies `/support` and service/account operations. W3 does not claim that a support link alone is a staffed service. Merchant-approved policy/contact facts remain release gates.
- Material facts, corrected catalogue records, certification, measurements and care must come from the merchant. No speculative live catalogue correction was performed.
- The account-scoped wishlist here is browser persistence. Server/cross-device synchronization is a W5 capability; this package does not claim it.
- Set the real canonical store URL at deployment. The existing `https://wishlyn.com` fallback is retained; provider, carrier, tax, privacy/consent and marketing configuration remain external release decisions.
- Final +2 approval must apply to the same PR head after all dependency rebases. This document records implementation evidence, not a prospective LGTM or a production-release approval.
