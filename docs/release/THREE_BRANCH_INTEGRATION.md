# Three-branch integration

Integration branch: `integration/beta-ui-extraction`.

The integration uses real merge commits. These exact fetched heads are ancestors of the result, rather than squashed replacements or a wholesale choice of one tree:

| Contributor scope | Input branch | Frozen head |
|---|---|---|
| Beta readiness, selected V4, production configuration and RSS security fix | `release/first-beta-readiness` | `03f8e3b1` |
| Frontend/reader, source recommendation and discovery, opt-in editorial refinements | `joud/ui-refinements` | `d21a040b` |
| Publisher extraction, RSS recovery, window coverage, read-path improvements and optional Gmail | `feature/model-located-article-extraction` | `0b34d7f5` |

## Conflict resolutions

1. The novelty model mocks independently received the same required zero-valued token metadata on two branches. Keep one complete response object per mock; preserve all assertions.
2. Publisher URL comparison combines BBC attribution handling, explicit RSS referral pairs, `xtor` aliases and the existing UEFA identity rules. BBC's `at_link_type` is also retained as a supported attribution alias. Arbitrary non-BBC `at_medium=article-2` and unknown `at_article_id` do not disappear. Edition/article IDs, different paths/origins/protocols remain distinct. Comparison never rewrites a retained source URL or a paid-operation identity.
3. Keep both publisher test blocks: BBC identity guards and Sciences et Avenir/BBC Arabic canonical extraction. Add identity-negative cases; do not weaken either branch's assertions.

The automatically merged shared paths were also reviewed: Joud's stale source-validation reset/general discovery survives alongside Aya's RSS helper fallback; the reader retains Joud's layout and source controls with Aya's focus/reconnect refresh policy; optional Gmail does not replace the configured Outlook transport.

## Runtime preservation

- Keep the release branch's `fast-xml-parser` 5.12.1 security fix and malformed-attribute regression, including when merging the newer RSS collector tests.
- Preserve V4 editor/verifier routing, immutable evidence, source accounting, uncertain-outcome fences, recovery and publication history.
- Explicitly set `CUTOFF_EDITIONS_ENABLED=true` for staging and production. Their previous code enabled cutoff preparation by default; the merged implementation makes it opt-in. Without this compatibility setting, deploying a clean merge would silently change delivery behavior.
- Preserve the branches' opt-in rollout boundaries. Topic/wording policies remain available and configured on Joud's environment; read caching, read sessions and artifact backfill remain controlled by their existing flags. They are not silently enabled globally as a side effect of integration.
- Keep staging and production D1/R2/queue identities distinct. Keep the existing mail transport, model routing and secret values; preserve dashboard-only variables using Wrangler's supported variable-preservation option.
- Migrations 0094–0097 add indexed/read-version support and update the derived readiness view. They retain unresolved acquisition jobs and financial records. Verify each target's journal and recovery bookmark before applying only pending migrations, staging first.
- The production and staging Workers share the existing external source-execution helper. Aya adds a `public_feed` helper capability; the helper needs separate version verification/update using existing SSH access. Worker deployment alone must not be reported as proof that the VPS code was updated.

## Verification and deployment evidence

Use the existing workspace typechecks, frontend and publisher tests, backend recommendation/extraction/coverage tests, Node/Python helper tests, browser fixtures and GitHub Project checks. No live feed or paid-model test is required merely to merge these features.

The initial combined local checks passed all workspace typechecks, 188 frontend tests, 83 selected extraction tests (one retained-HTML replay skipped), 10 Node helper tests, 34 Python helper tests and 145 desktop/mobile browser tests (one skipped). The combined backend checks exposed the missing BBC `at_link_type` alias; preserve its original failing assertion and fix the shared comparator, then rerun it and the publisher cases before deployment. Final CI status and deployment receipts are recorded separately against the exact deployed commit.

Deploy the same committed code and built frontend to the existing staging Worker, verify public read/session/asset/privacy boundaries, then deploy production and repeat the checks. Record Worker version IDs, Git tags, prior versions, unchanged secret-name sets and resource identities. A deployment smoke check is not a completed public-beta pilot or proof of editorial accuracy. Historical readiness findings and negative research results remain unchanged.
