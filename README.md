# Wishlyn

Next.js storefront and store administration. Audit remediation is being delivered through the [implementation plan](docs/plans/2026-10-28-AUDIT-IMPLEMENTATION-PLAN.md). See the [identity/security runbook](docs/implementation/W1-IDENTITY-SECURITY.md) before enabling accounts or administrative writes.

## Local setup

Use Node.js 22 or newer and `npm ci`. Copy `.env.example` to an untracked environment file and fill in the intended environment's values. Never use production data for tests. `APP_ORIGIN` must match the browser origin; production requires an exact HTTPS origin.

Database bootstrap is schema-only and versioned. `node --env-file=.env.development scripts/migrate.mjs` reports pending migrations; add `--apply` only for the database you intend to migrate after reviewing preconditions. No default administrator, sample jewellery or fabricated reviews are created. Use `npm run dev` after configuring Next's local environment.

For a local PostgreSQL connection without TLS, both a loopback host and `DB_ALLOW_LOCAL_PLAINTEXT=true` are required in development/test. Remote and production connections always verify certificates. Explicit `DATABASE_CA_CERT` supports private trusted CAs.

## Validation

- `npm run typecheck` and `npm run build` validate compilation.
- `TEST_DATABASE_URL=... npm run test:security` uses a disposable loopback `wishlyn_*test` database server and creates/drops a unique test database per run; the supplied role needs `CREATEDB`.
- `npm run lint:security` checks the W1 change surface; the existing whole-application lint backlog is completed by subsequent implementation packages.
- `npm run check:secrets` scans tracked application/scripts/schema files for common credential patterns.
- `npm audit` and `npm audit --omit=dev` report dependency advisories.

Tests never fall back to `DATABASE_URL`; do not supply production credentials. The security tests also use a temporary local TLS fixture, synthetic users, mocked client responses and no live payment/media requests.

## Operations

Sessions use opaque HttpOnly cookies and server-side revocation. Public signup creates customers only. Provision administrators only after independently verifying the account and recording the privileged change; review legacy administrators before release.

Vercel configuration changes require one explicit `.env.<target>` profile, matching `WISHLYN_ENVIRONMENT`, and an intentional `--apply`. Dry run is the default. Secret rotation, provider webhooks, environment isolation and production migrations remain separately operated release prerequisites. The audit branch is not a production readiness guarantee.
