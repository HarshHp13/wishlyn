# W1 — Identity, request security and configuration

Implementation branch: `codex/audit-identity-security`, targeting `codex/audit-remediation`. This package is not a deployment or a secret-rotation claim.

## Changes and audit mapping

| Audit records | Implemented behavior |
| --- | --- |
| F01 | Public signup always inserts `customer`; supplied role and privileged email substrings have no effect. No fixed administrator is seeded. |
| F02 | JWT signing/fallback is removed; legacy JWT/header/local-storage credentials are rejected. Media scripts have no credential fallback. Pattern checks prevent common source-secret regressions. Provider rotation/history review remain external. |
| F09 | Next.js and eslint-config-next upgraded together to 16.4.3, React/React DOM 19.3.1, pg 8.23.1 and sharp 0.35.5; affected transitive versions refreshed through the lockfile. JWT dependencies removed. |
| F11–F12 | Seven-day opaque sessions are stored only as SHA-256 token hashes. Cookie is HttpOnly, SameSite=Lax, path=/, Secure in production. Logout revokes current session. Profile role/password/email/disabled changes advance a session version via database trigger, permanently invalidating previously issued authority. |
| F13 | Shared origin checks, bounded streamed JSON/multipart readers, timeouts, canonical input validation and atomic PostgreSQL request budgets. Uploads validate/decode/reencode limited-size raster images; no SVG/unsigned fallback. |
| F18 (auth/admin loading) | Auth infrastructure failures return retryable 503 instead of wrong-password claims. Admin catalogue failures and account verification failures have honest error states. W3/W4 complete other data paths. |
| F30 | Trimmed/lowercase email policy, race-safe canonical uniqueness, pre-migration collision detection and 409 signup conflicts. UTF-8 password byte limit prevents bcrypt truncation. |
| C02–C04 | Missing media settings fail explicitly; shared script/runtime TLS configuration never disables remote certificate validation; deployment helper targets one matching environment profile and rejects shared local secrets. |
| F29 foundation | Checksum-tracked, advisory-locked migrations and schema-only bootstrap; obsolete seed writes/default administrator/sample catalogue removed. W2 owns commerce migration and any necessary legacy price conversion. |

## Shared contracts

- `database.ts`: `query<T>(text, values) → QueryResult<T>`; `transaction(work: (PoolClient) => Promise<T>) → T`; lazy pool and `closeDatabase()`.
- `session.ts`: `SessionUser { id, email, role }`; `getSession(request)`, `requireSession(request)`, `requireAdmin(request)`; `createSession(userId, response, client?)`, `revokeSession(request, client?)`. Current server authority is checked on every protected request. No bearer compatibility path remains.
- `api.ts`: `ApiError(status, code, message, headers?)`, `apiError(error)`, `assertSameOrigin(request)`, streamed `readBody`, `readJson(request, maxBytes?)`, `requireObject`.
- `rateLimit.ts`: `rateLimit(request, { scope, limit, windowSeconds, identity? })`. Database UPSERT, not process memory, enforces the budget across application instances.
- Client: `getAuthState`, `getServerAuthState`, `subscribeAuth`, `refreshAuthSession(force?)`, `setAuthSession(user)`, `clearAuthSession()`. Tokens never enter browser storage/events. `wishlyn-auth-change` carries `{user,status}` only.

Client states are `loading`, `authenticated`, `guest`, `error`. **`user:null` during loading/error is uncertainty, not logout.** Private data should be hidden but its account-keyed storage must remain intact. Only `guest` confirms anonymous state after server 401/successful logout. A generation guard rejects stale responses; another tab's auth invalidation triggers fresh server verification. A failed logout does not claim revocation succeeded.

## Configuration and deployment

Production requires `APP_ORIGIN` set to the exact HTTPS store origin. POST/PUT/PATCH/DELETE cookie-authenticated browser requests must send the same Origin and must not be cross-site. Missing Origin fails closed; external webhook handlers must validate their provider signatures instead of using this browser guard.

Set `TRUSTED_CLIENT_IP_HEADER` only if the chosen ingress strips client-supplied copies and replaces them with a trustworthy value. Allowed names are `x-vercel-forwarded-for`, `cf-connecting-ip`, `x-real-ip`. Do not expose a direct backend path bypassing that ingress. With no trusted header, traffic shares an explicit unattributed-network bucket; this is conservative and may require operational tuning for a larger/shared-network audience. Login also has a canonical-email budget. W2/W3 apply the shared guard to their owned endpoints.

Current budgets: login 100/network and 10/email per 15 minutes; signup 30/network and 5/email per 15 minutes; upload 30/admin per 15 minutes; admin catalogue reads 120/admin and writes 30/admin per 15 minutes. Requests exceeding limits receive 429 and Retry-After. PostgreSQL failure fails closed. Values require tuning from actual abuse and customer traffic rather than silently disabling safeguards.

`DATABASE_URL` is explicit and lazy; do not load original local credentials into test worktrees. Remote TLS always verifies certificate/hostname; private CAs can be supplied in `DATABASE_CA_CERT`. The only plaintext exception is a loopback database in development/test with `DB_ALLOW_LOCAL_PLAINTEXT=true`. URL SSL options cannot override certificate checking.

`node scripts/add-vercel-envs.mjs --environment preview --file .env.preview` is a dry run. The profile must declare `WISHLYN_ENVIRONMENT=preview`. Apply requires `--apply`, `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`; only that target is updated via provider upsert, with no remove-then-add credential gap. Existing sibling profiles are checked for reused database/media/payment secrets. This cannot prove isolation of provider environments that are not supplied locally: verify those separately. Provider values/responses are not printed. Payment key mode must match the target.

Cloudinary requires explicit cloud/key/secret. The browser upload route accepts JPEG/PNG/WebP up to 5 MB and 20 million pixels, checks declared versus decoded format, strips metadata/reencodes, and only accepts an actual URL for the configured cloud. The maintenance image importer takes an approved JSON manifest and is dry-run by default. If provider uploads complete but a later database operation fails, uploaded assets may require manual review; the database transaction rolls back.

## Migration and recovery

`node --env-file=.env.development scripts/migrate.mjs` lists pending migrations without changing schema. Add `--apply` after backup/review to apply all pending migrations in one transaction with an advisory lock. Checksum changes or unknown applied migrations fail rather than rewriting history.

001 creates the original schema without sample rows. 002 detects canonical email collisions before modification, adds the canonical constraint, session revocation fields/tables and shared request budgets. A collision aborts the entire migration transaction; resolve actual account ownership deliberately before rerunning. No default user password or admin role is provisioned. Existing administrators require independent owner review; this implementation does not decide who is legitimate.

The old `db:seed` command is a schema-only compatibility entry point requiring `--apply`. Do not rerun historical SQL/demo scripts against a production store. The legacy `neon_seed.sql` is now schema-only; the versioned runner is canonical.

Rollback: before accepting new sessions, restore a verified pre-migration backup only if no newer business writes exist. After live writes, disable affected account/admin operations and forward-repair; do not restore the insecure JWT path. Opaque sessions intentionally invalidate all previous JWT clients. Password/role/disable updates invalidate all sessions of the changed account; logout revokes just the current session. Record authorized role changes and administrator provisioning externally until the operations package supplies an audit interface.

Schedule `node --env-file=<approved-file> scripts/cleanup-security.mjs --apply` to delete expired sessions and rate-budget rows. Dry run makes no connection or change. Monitor cleanup and 503/429 rates without logging raw credentials, addresses, passwords or token hashes.

## Validation and reproducibility

The security suite uses synthetic data and a disposable local PostgreSQL 17 server. `TEST_DATABASE_URL` is mandatory and must be a loopback database named `wishlyn_*test`; it never falls back to `DATABASE_URL`. Each invocation creates a distinct `wishlyn_security_<random>_test` database and drops it afterward, allowing both reviewers to run independently. The supplied test role needs CREATEDB. Schema-collision testing uses another unique disposable database. No configured store database is read or mutated.

Example local fixture setup (credentials are deliberately synthetic):

```sh
docker run -d --name wishlyn-security-test -e POSTGRES_USER=wishlyn_test -e POSTGRES_PASSWORD=fixture_only -e POSTGRES_DB=wishlyn_test -p 127.0.0.1:55441:5432 postgres:17-alpine
TEST_DATABASE_URL=postgresql://wishlyn_test:fixture_only@127.0.0.1:55441/wishlyn_test npm run test:security
npm run typecheck
npm run lint:security
npm run build
npm run check:secrets
npm audit
npm audit --omit=dev
docker rm -f wishlyn-security-test
```

The fixture port/name must be unused. Independent reviewers can reuse the same isolated PostgreSQL server because each run creates its own database. The final command removes only that explicitly created disposable container.

Tests cover public-role escalation, canonical-email concurrent signup, revocation/demotion/re-promotion/disable, legacy-token rejection, cookie attributes/hash storage, cross-origin/payload validation, UTF-8 password limits, request budgets across concurrent connections and separate processes, failure/error redaction, atomic profile/session rollback, migration collision rollback, upload misconfiguration and fake-image rejection, browser claim tampering, stale auth responses, pending/error versus guest semantics and failed logout. A separate real TLS negotiation fixture proves untrusted/wrong-host rejection and trusted matching-certificate acceptance using the shared runtime/script configuration.

CI uses its own PostgreSQL service, tests, W1 lint, typecheck, build, secret patterns and runtime dependency audit. Whole-application lint still includes pre-existing W2/W3/W4 findings; W6 is responsible for the final complete gate. Existing audit probes describe the old implementation and are preserved as historical evidence, not treated as current acceptance tests.

## Recorded local results

- 21 security tests passed, including real PostgreSQL races/rollback/migrations and actual TLS negotiation fixtures.
- TypeScript check passed; Next.js 16.4.3 production build passed with 21 routes generated. No existing development server was stopped or reconfigured.
- W1 lint passed with zero errors and two pre-existing native-image warnings in the legacy admin form, which W4 replaces.
- Full and runtime npm audits both reported zero vulnerabilities. Common tracked-source credential-pattern scan passed.
- Evidence is retained in `docs/implementation/evidence/w1/`; logs are local fixture results, not live-provider verification.

## Release gates and limitations

- Remove/revoke exposed provider credentials and audit historical source/deployment artifacts through owner-authorized provider operations. Source removal is not rotation. No provider credentials were changed here.
- Review existing administrators, inspect hosting access and isolate preview/production database/media/payment credentials.
- Apply tested migrations to the selected deployment only after backup and migration review. Configure the exact origin, trusted ingress and cleanup operation.
- The original umbrella Vercel preview failed before application changes; local checks do not certify provider deployment. Provider logs/settings remain an external gate.
- Live login/signup/media provider writes, real purchases, webhooks and production configuration were not exercised. Tests use local fixtures, including controlled image rejection without external upload.
- Other audit packages replace legacy payment, shopping persistence, catalogue operations and customer services. This branch is a security foundation, not an assertion that the entire store is ready for real orders.
