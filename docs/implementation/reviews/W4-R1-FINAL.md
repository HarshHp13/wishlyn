# W4 revised-head review — Reviewer 1

Date: 29 October 2026. Reviewer: `/root/reviewer_one_completion`.

PR: [#5](https://github.com/HarshHp13/wishlyn/pull/5), targeting `codex/audit-remediation`.

- Exact reviewed head: `545be876d0bb8302486ad695a32bca30fb6f0527`
- Exact reviewed integration base: `f8da3505a4ce96f51e0af97a714ac74820a92f4e`
- Independent detached checkout: `/tmp/wishlyn-completion-r1-w4`

## Verdict

**+1 LGTM** for this revised head and base. No actionable findings remain. This supersedes my earlier approval of `c37f7210fda634b527649761a82edda060d0a399`; that older approval does not approve this new commit. Reviewer 2 must independently approve the same head/base before merge.

## Re-review of R2-W4-01

Reviewer 2 correctly identified that the duplicate-create cache-hit path could return the old product title/revision together with a later merchant edit's new variant price. The initial 15-test suite did not exercise that inter-read schedule. My previous full review missed this path; the new reproduction and fix were assessed independently here.

The cached product query now takes `FOR SHARE` before `detail()` reads the aggregate. A normal merchant edit must acquire the conflicting product `FOR UPDATE` lock before updating either product or variants. That prevents a later edit from committing between the retry's sequential product/variant/history reads, while retaining the creation hash comparison, idempotency advisory lock, and established product-to-variant lock order.

The added regression executes actual PostgreSQL statements, delays only delivery after the retry's product read, and starts a normal edit. It observes the edit waiting on the product lock, verifies that the retry returns complete original title/revision/price, then verifies complete edited title/revision/price after the retry releases its transaction. Product creation and the initial stock event still occur once. The test is meaningful coverage of the reproduced schedule, rather than a mocked SQL consistency claim.

## Validation and scope

- Independently reran the full revised merchant suite: **16/16 passed, zero skips**. Unique disposable loopback PostgreSQL child database was created/dropped by the suite. Log: `/tmp/wishlyn-completion-r1-w4-final-tests.log`.
- Affected service/test ESLint passed; TypeScript passed; `git diff --check` passed.
- GitHub API confirms the new exact head and unchanged integration base.
- Reviewed all changes since the prior full-diff assessment: cached-row lock, regression, evidence and runbook correction. Prior unchanged UI/media/API/migration coverage is documented in `/tmp/wishlyn-completion-r1-w4.md`.
- No redundant local build or browser rerun was performed on the revised commit due the coordinator's resource limit; the prior independent build and browser-source/evidence review remain historical results. The coordinator will verify the new head's hosted gates before merge.
- No application source, configured store database, live provider, email or customer record was modified by this review. This is an implementation approval, not a production release or merge-to-main approval. Any further source commit/rebase or material base change needs re-review.
