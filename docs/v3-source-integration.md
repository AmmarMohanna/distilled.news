# V3 and source integration — October 22, 2026

## Pinned inputs

- Integration branch: `codex/integrate-v3-source-fixes`.
- Shared scheduling foundation: `ac6299fc21109c119d8eeb88776635aa538f4ed4`.
- Dataset/source branch: `codex/twenty-feed-dataset` at `5b2dd90`.
- Source date/readability fixes from this chat: `35883ed`, committed on the new
  integration branch before merging.
- Required V3 input: `feat/v3-factual-reliability` at
  `399acc9d56333995006d572067870c44c16a7b2b`.

Merging only `feat/parallel-cloudflare-event-reconciliation` at `2f69242`
would omit the subsequent factual follow-up and twenty-article evaluation.
The integration includes the exact requested later commit and its ancestors.

## Preserved behavior and acceptance requirements

| Area | Required behavior |
| --- | --- |
| V3 pipeline | Editor -> verifier -> targeted repair when needed -> persistence. No mandatory V2 claim extraction, Event graph or reconciliation on newly admitted V3 work. Previously started V2 operations keep their original recovery/financial identities. |
| Full retained evidence | Preserve full retained articles, including final qualifications beyond 6,000 characters. Keep finite input/context admission, batching and provider limits. |
| Product integration | `BRIEFING_ENGINE=v3` selects the product V3 path while retaining existing feeds, storage, fixed-window scheduling, editions, citations and outbox contracts. |
| Reporting intervals | Delays do not move the original reporting cutoff. A new feed waits for its first full local interval; timezone handling remains intact. |
| Freshness | Original publication differs from update/collection/acquisition time. Initial stale backlog is excluded before paid inference. Meaningful late discoveries keep original dates. Empty eligible windows buy no inference. |
| Ordering and recovery | Older runnable windows have priority. Blocked windows may be bypassed without deleting recoverable state, UNKNOWN outcomes or financial history. |
| Reader memory | Use actual previously published reader prose; retain the existing 21-day/16-item selector. Do not manufacture V2 Events as memory for V3. |
| Source ownership | Verification and repair batches use local indices mapped back to original item/source identities. Sparse repair cannot overwrite another story or take its citations. |
| Temporal checks | Verification and repair receive the reporting cutoff. Preserve publication/event-date distinctions, source-relative today, uncertainty, attribution and grouped-predicate scope. |
| Routing | Editing and repair: GPT-4.1. Verification: GPT-4.1 mini. Historical comparisons do not authorize changing deployed routes. |
| Accounting | Preserve durable account reservations, provider identities/receipts, settlement, uncertain-outcome recovery and retry fences. Product V3 uses the existing account ledger rather than the legacy V3 spend ledger. |
| Acquisition | Preserve helper capacity admission, fair scheduling/control lanes, batched reads, isolated preparation with guarded commits, retry/cooldown handling, and source diagnostics. Keep original-date provenance and reject detectably encoded/corrupted article bodies before V3. Generic helper extraction does not prove COMPLETE content. |
| Evidence | Retain failure fixtures, generated text, source references, regression tests and evaluation reports without relabeling failures as successes. |

## Conflict resolution and shared files

Git reported one textual conflict, in `v1-intelligence/store.ts` imports. The
resolution keeps both `validateV3Edition` from the V3 branch and
`withCanonicalCommitTurn` from the source branch, together with the existing
admission guards. No entire-file ours/theirs resolution was used. The merged
store retains V3-specific edition validation, source batching, and isolated
transaction computation followed by guarded canonical commits.

The automatically merged `runtime.ts` and `types.ts` retain both lanes' additions.
The V3 reassessment bypass and publication branch remain ahead of V2 semantic
processing. The V3 package, temporal prompts, repair mapping, worker adapters,
core edition changes and retained evaluation reports come from `399acc9`.
Source acquisition/normalization files and the forty-feed dataset remain from
the source lane. Worker package dependencies, the workspace test catalogue and
the lockfile include `@distilled/briefing`.

New regressions in `v3-source-integration.test.ts` exercise the actual combined
local D1 path: acquired full text through isolated publication commits and public
citations; account-ledger use and duplicate-delivery reuse; an old original
publication date excluded despite current acquisition/update metadata; and a
corrupted article rejected before it reaches V3. Provider responses are doubles,
so these checks do not establish semantic factual quality.

## Migration and QA resource review

- V3 adds `0067_v3_model_spend.sql`; the source lane adds
  `0068_source_execution_admission.sql`. They have different names/numbers and
  create independent tables.
- No previously deployed migration is renamed or edited. Historical numeric
  prefix collisions remain unchanged; migration identity is the full filename.
- `scripts/check_v3_source_integration_migrations.py` checks byte preservation,
  fresh installs, upgrades from either pinned parent, schema convergence,
  replay, foreign keys, and preservation of existing grants, source capacity
  leases and an uncertain V3 financial hold. It uses only in-memory SQLite.
- `wrangler.dataset-qa.jsonc` retains Worker `distilled-news-sources-qa`, D1
  `f34f4399-1e3b-4d4f-ba17-564e54e9f941`, bucket
  `distilled-news-qa-v3-raw`, its collection/acquisition/intelligence/control
  queues and private execution binding.
- `wrangler.v3-qa.jsonc` retains the separate isolated V3 Worker/D1 and its
  existing spending-DB binding. It must not replace the dataset QA config.
  Its historical evaluation scope/expiry is retained evidence, not new spending
  authority.
- This integration task prepares a branch. The earlier sources-QA release
  `027c0e5f-7c07-4562-a7e9-ab6e830e6b5d` contains source fixes only. Deploying
  the merged branch while a live QA environment has `BRIEFING_ENGINE=v3` would
  activate the newly integrated product V3 path, so deployment needs its own
  current resource/accounting review. No production replacement or reader
  notification rollout is part of this branch integration.

The separate Python VPS patch remains a repository change unless separately
deployed; a Worker bundle cannot update that service. Existing acquired records
and published editions remain immutable.

## Retained evidence and qualification limits

The following reports and all supporting `benchmarks/results/` evidence are
preserved from the exact V3 input:

- `docs/v3-shared-product-scheduling.md`
- `docs/v3-overnight-evaluation.md`
- `docs/v3-factual-reliability-followup.md`
- `docs/v3-twenty-feed-evaluation.md`

The prior unchanged-code twenty-article evaluation persisted and read back six
items using four calls costing $0.0723856; its approximately 41-second total
excludes acquisition. These are historical measurements, not integration
results. Factual reliability remains incomplete: retained examples include false
approvals involving dates, attribution and grouped security claims. Successful
persistence and passing mocked tests must not be presented as factual accuracy.

## Integration verification

- All 47 V3 briefing-package tests passed, including retained factual-failure
  replay and temporal/subset ownership checks.
- The five-file V3 Worker run passed 39 tests, including the new combined
  source-to-V3 path and account/uncertain-outcome recovery tests.
- The shared ten-file scheduling/admission/recovery run initially passed 106/107.
  The failing stale-support test double matched an obsolete identity-review
  policy string and therefore returned the wrong response shape. It now imports
  the current `IDENTITY_REVIEW_POLICY`; no product guard or assertion was weakened.
  All nine review-isolation cases passed on the corrected-file rerun.
  That final two-file run also passed all three combined source/V3 cases after
  strengthening exact persisted citation ownership assertions (12/12 total).
- The three connector files passed all 121 tests. Python helper tests passed 29.
- All eight package TypeScript checks passed. Dataset-QA and isolated V3-QA
  Wrangler dry-run bundles both passed; neither command deployed.
- All three migration histories passed against in-memory SQLite: fresh install
  applies 74 filenames; either parent needs exactly one remaining migration.
- A single trailing blank line in an inherited benchmark test was removed for
  `git diff --check`; its test logic and retained evidence are unchanged.

Across these groups, 343 distinct focused tests passed; reruns are not counted
as additional coverage. The initial 106/107 result remains recorded above.

These are focused engineering checks, not a full Worker-suite success or a
new factual-quality evaluation. No paid inference, grant change, remote
migration, deployment or notification was performed for this integration.
