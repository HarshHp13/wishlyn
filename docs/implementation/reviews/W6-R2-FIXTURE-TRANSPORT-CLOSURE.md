# Reviewer 2 — interim R2-W6-03 closure verification

Date: 29 October 2026. Reviewer: `/root/reviewer_two_completion`.

Exact unpublished ROOT HEAD: `7cef443e13077e6c7b1d58243e2fea6d2c759791`.
Temporary W5 boundary: `e54a95bc3de1717c3b81c5f83a8301514a076174`.

**R2-W6-03 is verified corrected on this exact interim snapshot. This is finding closure only: no W5, W6 or umbrella LGTM, deployment approval or merge authorization is issued. The final published pair remains pending.**

The separate detached checkout `/tmp/wishlyn-completion-r2-w6-preliminary` is clean. Its HEAD and fetched local branch HEAD match the full ROOT HEAD above; merge-base matches the full temporary boundary above. Root and author checkouts were not changed.

## Validation precedes both merchant connection sinks

At `tests/merchant/merchant.test.ts:58`, the administrative client now receives `databaseConfig(url.toString(), process.env)` rather than a raw connection string. The existing literal loopback and disposable pathname assertions run first. Test-local plaintext configuration is set before shared validation. Unsupported or duplicated URL options therefore throw before the client constructor is evaluated, before `connect()`, and before `CREATE DATABASE`. After rejection `admin` remains unset, so cleanup cannot attempt `DROP DATABASE` either.

At `tests/merchant/merchant.test.ts:181`, the archive-test blocker also receives `databaseConfig(databaseUrl, process.env)` before its constructor, connection or transaction begins. The generated child URL follows the already validated base URL, and the second sink independently validates it.

The shared helper returns explicit validated pg options without `connectionString`, allowing only singleton `sslmode` and `application_name` URL parameters. An installed pg client's effective options retain the validated host and port; transport parameters cannot be reinterpreted by a second connection-string parse. Valid explicit TLS retains `rejectUnauthorized: true`. The reviewed sibling account-service and security fixture client constructions also use this shared helper; no remaining raw merchant connection-string sink was found.

## Independent reproduction rerun and extended controls

I adapted my original actual-source VM proof to the corrected source and added separate blocker controls. The admin setup source executes unchanged. For the blocker-only control, a test-local setter is injected into the VM closure to feed hostile URLs to that second sink; the callback itself remains the actual current source. All network, SQL and service operations are synthetic recording fixtures. Actual `databaseConfig` and the installed pg option parser execute normally.

- **28 rejected admin cases:** the original `?host=remote-fixture.invalid` reproduction; encoded host-key override; hostaddr, port, SSL/certificate/libpq/user/password/database/connection-string/options overrides; repeated allowed keys; invalid application name/TLS mode; literal remote host, nondisposable pathname, unsupported protocol and fragment.
- **24 rejected blocker cases:** the same hostile query-parameter matrix at the blocker sink.
- Every rejected URL creates **zero clients**, attempts **zero network/DDL/transaction operations**, and reaches **zero migration calls**. Admin cleanup also records zero database mutation.
- Three valid local admin controls retain `127.0.0.1:5432`, preserve permitted plaintext or verified TLS, and complete recorded fixture-create and cleanup paths. One valid explicit-TLS blocker control retains loopback and verified TLS and completes its recorded transaction.

Evidence:

- `/tmp/wishlyn-completion-r2-w6-transport-closure-probe.mjs`
- `/tmp/wishlyn-completion-r2-w6-transport-closure-probe.json` — `FIXED_R2_W6_03`, completed exit 0.

## Limited targeted checks

- **6/6 tests passed; zero skips:** four current merchant hostile-parameter VM tests and two shared database configuration tests. Log: `/tmp/wishlyn-completion-r2-w6-transport-closure-targeted-tests.log`.
- Scoped ESLint and scoped temporary-boundary diff-check for `tests/merchant/merchant.test.ts` and `tests/merchant/fixture-config.test.mjs` passed. Log: `/tmp/wishlyn-completion-r2-w6-transport-closure-lint.log`.
- Final detached HEAD/FETCH_HEAD/merge-base and checkout cleanliness were rechecked after the probes.

No application source or original environment was modified. No real database/network/provider operation, full suite, build, browser run or external review comment was performed. W5's outstanding sixth-head blockers and the final W6/umbrella review are outside this closure check. A later revision requires review against its own exact published pair.
