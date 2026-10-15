# Source and AI editorial integration review

This chronological review preserves the original preflight snapshots. The final
sections record authorized staging activation and actual canary outcomes; earlier
"pending" statements describe their checkpoint, not the current deployment.

## Compared revisions

- Common implementation: `23c4c49`.
- AI editorial/recovery parent: `61c354871dadde07d261064db6408f8f016131e0`.
- Source scalability parent: `9052b56434adb58474f52fc1f78dfba4b7fd6eb4`
  (`origin/backend-sources-reiteration` when inspected).
- Integration merge: `943352281570436287523c10b1235ba1e49c9151`, with the
  recovery revision as first parent and source revision as second parent.

The decisions below concern the actual code; historical rollout claims in
`CONNECTOR_SCALE_1000.md` are not independent evidence for this integration.

## Component decisions

| Component | Decision | Reason and retained constraints |
| --- | --- | --- |
| Indexed feed scheduling, collection clock, per-feed dispatch | Source parent | Durable claims, configuration wakeups, bounded dispatch and continuation yielding replace population scans in explicitly enabled queue mode. |
| Collection, acquisition and intelligence queue routing | Source parent plus integration guards | Preserve dedicated lanes; queue mode now requires all three bindings and cannot silently fall back to the legacy processing backlog. |
| Per-feed intelligence admission | Source parent plus ownership review | It is an admission lease, not evidence, model-spending or commit authority; canonical leases and CAS remain necessary. |
| RSS public transport | Combination | Retain recovery parent same-origin redirect support and immediate durable handling of rate limits, with source parent public-cache composition. |
| Full-article acquisition and website listing discovery | Source parent | Independent article candidates use canonical acquisition; undated content stays undated and homepages do not become complete articles. |
| Telegram scheduling and authority | Source parent | Fair single-session lane, immutable rechecks and explicit current-origin deletion evidence; absence is not deletion. |
| Paid provider accounting and read recovery | Source parent plus integration guards | Per-source/provider reservation accounting, persisted aggregate limits and saved-result replay remain; UNKNOWN submission fences now apply even without a source cap. |
| Anonymous public fetch cache | Source parent | Validators and representation headers remain scoped; current approval is rechecked on reads and after transport; durable cleanup retains immutable generation identity. |
| Intake and intelligence read batching | Source parent additive changes | Batch immutable graph reads within fresh guarded attempts without truncating the approved evidence/candidate universe. |
| Editorial planning, continuation, publication and model recovery | Recovery parent plus compatible batching | Retain asynchronous lifetime fixes, account-spending controls, reader-history grounding and Event-owned approved facts. |

## Integration safety findings

A queued source list previously allowed maintenance to change a subsequently
legacy-owned source back to connector ownership. Queue-mode maintenance now
skips those rows. Transport approval and downstream feed admission also reject
a product owner that differs from an existing canonical feed owner.

Source spending limits are cumulative reservation ceilings, not provider invoice
costs. `SOURCE_PER_PROVIDER_BUDGET_USD=15` means an independent allowance for each
provider of each source. It has no code default; omitting it must not erase
UNKNOWN paid-submission fences. Those fences now remain both in preliminary
checks and in the atomic reservation statement regardless of source-cap setting.
Existing reservations and operator grants are retained.

Queue-mode budget initialization preserves existing D1 grants but can create a
missing grant from deployment configuration. Copying nonzero QA budgets to a
fresh deployment therefore authorizes new spending. This integration review does
not authorize doing so; live deployment settings require a separate exact read
and preservation review. Source-provider authority does not authorize model
account spending.

The read optimizations reduce database round trips but still read retained feed
graphs and active evidence. They do not establish bounded total semantic work,
five-minute live freshness, sustained retention capacity or grounded publication
at 1,000 feeds. A simulated single collection cycle is not evidence of those gates.

## Focused source validation

Test-first regressions demonstrated missing queue-binding fallbacks, stale
collector/owner admission and uncapped UNKNOWN paid-submission bypasses before
production fixes. The four-file focused run covered:

- `connector-integration-safety.test.ts`: six tests passed.
- `source-budget.test.ts`: ten tests passed, including three uncapped UNKNOWN cases.
- `connector-scale.test.ts`: 22 tests passed.
- `connector-runtime.test.ts`: 26 of 28 passed on the initial run; the two existing
  enrollment cases hit ten-second setup-hook timeouts with `Server is not running`.
  Rerunning only those two cases passed both, without changing timeouts/assertions.

Thus the initial run was **64/66**, followed by **2/2** on the isolated rerun.
This targeted result is not a full Worker-suite certification. Whitespace checks
for the reviewed patch passed. No remote calls, grant changes or deployment were
performed as part of these source checks.

## Retained writer fidelity diagnosis

Sanitized retained writer/repair diagnostics demonstrated false lexical failures:
`Day 1` versus `first day`, `Day 2` versus `second day`, and `Oct. 13` versus
`October 13`. A minimal fixture retains the relevant exact approved facts,
evidence references, timing and draft prose in
`apps/worker/src/v1-intelligence/fixtures/staging-writer-ordinal-dates.json`.

The narrow recognizer change normalizes first/second only directly before `day`
and recognizes Oct/Oct. as October. It keeps the existing reporting/event date
attachment rules. The recognizer diagnostic version is `reader-fidelity-floors-v7`;
that returned label is not used to construct paid model operation identities.
Existing billed calls and saved model results are retained.

The pure fidelity suite initially had **three intended failures and 14 passes**;
after the change all **17 tests passed**. Wrong-day substitutions, date digits
reused as ordinary quantities and report metadata converted into event dates
remain rejected. Retained `On October 14` event claims without event-date authority
remain invalid. `10,000+` is not automatically equivalent to strict `over 10,000`,
and the current range-end interpretation for October 13-15 remains unresolved.
Missing required quantities, including the original omitted 8 a.m., remain subject
to the same hard quantity floor.

These lexical repairs do not certify the retained drafts, a successful grounded
edition, reader novelty, or sustained publication quality. The retained writer
failures still include genuine or unresolved bound/date issues. No additional
model invocation or remote mutation was made for this diagnosis.

## Dispatch generation and optional-product follow-up

A subsequent ownership review found that downstream completion originally reset
`connector_queue_dispatch.available_ms` by kind/body hash without matching the
expiring generation token. An older successful consumer could therefore release
a replacement delivery. The local candidate now sends a reserved transport-only
`_connectorDispatchToken`, strips it before canonical runners and journals, and
completes by exact kind/body-hash/token CAS. Only the matching one-shot completion
can refill downstream work. Legacy tokenless messages cannot release a generation.
The relay delivery propagates this token separately from its execution lease;
collection feed/poll claims retain their existing independent tokens. No queue
schema, canonical message union, model payload or paid operation identity changes.
The generation tests pass (5/5); removing generation matching produces both intended negative-control failures. The combined boundary run passes 65/65.

The resource-constrained local full Worker run exposed a core-only compatibility
error: optimized `synchronizeV1ProductSource` SQL referenced optional product tables
even when no product binding existed. SQL resolves those table names before it
can discover the empty binding result. The local candidate first checks the
indexed V1 binding and returns only for an unbound source; bound sources retain
the complete optimized product/configuration/owner checks. An enrolled product
source now performs this additional indexed boundary read, so the existing read
budget assertion is two reads. This is not a catch-and-ignore database failure
or a relaxation of product authorization. The dedicated core-only regression and existing product/blocked-briefing suites pass within the combined 65-test boundary run, with unchanged deadlines.

## Anonymous-cache capability follow-up

Source approval preserves RSS query parameters, and source egress authorization
checks origin/host/userinfo without rejecting credential query keys. Header-only
cache bypass was therefore insufficient for an approved URL containing an explicit
`access_token`, `api_key`, `apikey`, `token` or `authorization` parameter. The local
candidate bypasses shared lookup/storage for those exact decoded parameter names,
case-insensitively; it does not classify paths or arbitrary query values as private.
Ordinary public search/page queries retain shared reuse and per-feed authorization
is still checked before transport and after reading bytes.

`FeedHttpPort` does not expose a per-call `maxBytes` bound. The demonstrated limit
mismatch is between actual wrappers: source transport permits 2,000,000 bytes,
while article acquisition permits 512,000. Cache entries previously ignored that
wrapper distinction. An optional wrapper cap now defaults to the unchanged
2,000,000-byte source limit and is explicitly matched to each actual
`BoundedFeedHttp` instance. Both immediate cache hits and waiting consumers check
their own cap before returning bytes; fresh and bypass responses are checked too.
Existing attempt/timeout arguments are validated before any cache hit can return.
All 16 cache regressions pass. Removing the demonstrated protections produces 11 intended failures; restoring the exact production guards passes 16/16 again.

## Four correctness findings

1. **Incomplete processing is not quiet coverage.** Failed pre-boundary acquisition/reassessment is persisted as incomplete coverage. Valid available stories may publish; an empty result with incomplete intake or unresolved ownership is deferred explicitly. Quiet classification and synthesis completion are atomic, including restart recovery.
2. **The internal briefing endpoint reads durable outcomes.** Missing editions no longer imply `NO_NEWS`. Published, confirmed quiet, pending, deferred, blocked, failed and withdrawn states remain distinct. Public product status uses the same distinction.
3. **Facts belong to Events, not whole articles.** Semantic Events without resolved propositions cannot borrow all sentences from a shared article. Genuine legacy fallback is restricted to that Event's retained, source-supported state. Unresolved ownership remains durable processing work; another supported sibling does not hide the gap.
4. **Trace pagination is scoped.** Page predicates, latest-context queries and SQL counts avoid loading unrelated drafts/plans/claims. A 999-record context fixture verifies bounded retrieval for overview/articles/candidates; records/sources/operations skip unrelated context reads. Exact totals and cursor/context binding remain. A safe `briefingRequest` projection avoids the sanitizer's raw `request` redaction; CLI accepts both new and legacy saved projections.

## Verification record

Focused checks at this checkpoint:

- Boundary regressions: **9 files, 65/65 passed**, including queue generation, scale, core-only compatibility, public product states, blocked briefing, incomplete intake, Event ownership and atomic quiet recovery.
- Repaired retained baseline contracts: **97/97 passed**. These were 11 assertion failures reproduced on unchanged recovery parent `61c3548` (86/97 passed). Corrections update stand-in admission metadata, explicit legacy-expiry fixtures, retired wallet expectations and the trace's legitimate read inventory; no production admission guard is relaxed.
- Fidelity regression: **17/17 passed**, including retained ordinal/calendar false positives and genuine date/quantity rejection.
- Trace and cache: **55/55 passed** (39 trace, 16 cache).
- Trace API, source lineage and CLI: **7/7 passed**.
- Python source helper: **23/23 passed**. Node helper: **7/7 passed**.
- Atomic intelligence turn fencing and late settlement: **9/9 passed**, with guard-removal negative control.
- Schema/migration compatibility checks: all pass (see below).

The earlier local full Worker run was interrupted after roughly 17 minutes on a paging Windows host; it is **not a completed or passing suite**. Its setup timeouts (push, ledger and publication restart) require isolated/final CI classification. Unchanged recovery-parent GitHub run [38621703585](https://github.com/AmmarMohanna/distilled.news/actions/runs/38621703585) independently had **12 failed, 1,357 passed, 10 skipped** Worker tests. Eleven are the reproduced contract failures above. The twelfth test advanced a fake clock to 60 seconds despite the actual 180-second model deadline; its corrected boundary test and all nine semantic-model tests pass without changing production deadlines. Final workspace typechecks (all seven packages), frontend Vite build and exact `wrangler.staging.toml` dry-run pass. The dry-run compiled the new queue and asset bindings without deployment. Linux full-suite results and any remaining failures must be appended; focused runs are not a substitute.

## Migration inventory and compatibility

There are **64 full migration filenames**: 53 unchanged common files, ten source additions and one recovery concurrency amendment. Wrangler records the complete `d1_migrations.name`, so matching numeric prefixes do not make different filenames interchangeable. No migration was renamed or discarded.

`python scripts/check_ai_source_integration_migrations.py` checks original bytes, fresh creation, upgrades from both parents, identical final schemas, repeat-safe migration tracking and representative retained records (including encrypted mail, private feeds, evidence, grants and UNKNOWN liabilities). Its negative controls reject changed historical migrations, renames, liability clearing and QA grants.

Read-only staging has **54 applied**, with these ten additive files pending:

```text
0048_connector_scaling.sql
0050_connector_financial_scope.sql
0051_connector_feed_scope_index.sql
0052_connector_relay_lease.sql
0053_connector_uncertain_scope_index.sql
0054_connector_collection_clock.sql
0055_connector_source_execution_claims.sql
0056_connector_telegram_lane.sql
0057_connector_read_recovery.sql
0058_connector_intelligence_turns.sql
```

A local reconstruction of the current recovery schema has 220 objects, all present remotely. Two remote-only objects are a historical smoke-intake table and Cloudflare's internal KV table. One table SQL differs in newline formatting only. Back up before applying the reviewed additive sequence; preserve all existing migration rows and data. No remote migration has been applied by this integration yet.

## Exact staging preflight (October 15, 08:24 Beirut)

- Worker: `distilled-news-staging`; account `e32b564514d4f9b9e383b7dd30dbb026`.
- D1: `distilled-news-staging`, `ab259bfe-6029-4e20-8cb6-eea6b7a67459`.
- Existing deployed version: `feb41152-2a44-462a-ad9b-d0f26f6f3754`, recovery `61c3548`; preceding rollback version `a2ffa7b5-903a-4d6f-907d-337e4979a5a6`.
- Existing R2 and native frontend ASSETS binding remain. Outlook origin, secrets and public/private routing remain unchanged.
- Existing processing queue/DLQ remain. Three dedicated staging queues and their three DLQs still need creation and binding; none points to sources QA.
- Staging source-helper VPC service resolves to a healthy tunnel with four connections. This verifies connectivity, **not** authenticated application extraction.
- Staging configuration preserves actual existing X authorization (`x_twitterapi_io` 10.01 cumulative reservation ceiling, 0.01 operation ceiling); no QA 15/source defaults or new grants are introduced.
- Existing OpenRouter grant: $50 over October 12-19; effective concurrency 25 from an existing amendment. Reported cost **$10.877258308**, held exposure **$1.528542294**, 26 unresolved reservations (25 previously operator-quarantined), one unresolved still occupying active admission. These are a snapshot, not an execution-termination guarantee. No exposure is cleared or concurrency amended here.
- X provider accounting separately contains one unresolved $0.01 operation with no retained payload reference. The merged conservative legacy fence may block further X submissions until receipt-backed reconciliation; do not call this restored X service.

Only AI Industry Watch2 currently has active approved sources (three RSS sources). Old Lebanon/AI test feeds are paused; do not resume them without authorization. Source queue mode and full-article acquisition can trigger new normal paid semantic work after deployment. The user requires **separate confirmation for real-model canary execution**; preserve that gate even though code deployment is the target.

## Actual existing publication, not integration validation

The recovery deployment published the October 15 01:00 Beirut window at 01:04:16 (edition `4fd1b3e2cfbe578c08c826933e395126d30a8aa955494673831f6bcaeb5c697a`). The real planner saw all seven candidates in 44,267 bytes, selected a UK AI minister cyber-warning and YouTube labels, and deferred five. Final publication communicated one attributed minister-warning fact; YouTube was selected but did not receive duplicate publication. Writer/verification generation reported $0.0027948 and 85,803 ms; this is not the full window cost.

This is a baseline observation, not proof of the integration. Deferred significance rationales and shallow excerpts still need independent quality evaluation. Later recovery-deployment windows include terminal `TEMPORARY_UNAVAILABLE` and `INVALID_REQUEST` failures. New diagnostics do not establish the historical CAS root cause. No terminal window is reset or fabricated. The historical withdrawn Anthropic edition and OPEN correction obligation remain unchanged; no verified corrective delivery is claimed.

## Rollout and remaining gates

Before deployment: pass the complete Linux checks, final typechecks, frontend build and exact staging dry-run; refresh both parents; push a clean reviewed integration. Back up D1 and record exact queue, binding, migration, grant and liability snapshots. Add only the reviewed staging resources/migrations. Preserve all secret bindings with the supported deployment mechanism.

Rollback must account for in-flight new queue message kinds and dispatch generations. Keep the additive schema and queues; do not purge evidence or paid records. Do not attach an older consumer that silently acknowledges unsupported messages. Use a reviewed compatible rollback/configuration sequence rather than assuming a Worker version change undoes queue infrastructure.

No integration deployment or real-model canary has occurred at this checkpoint. Separate authorization is needed before enabling the new normal paid execution; use the one currently active feed, retain old feeds paused and inspect the next naturally scheduled window. Inspect source acquisition, Event ownership, all planner coverage, verified publication and ledger facts, not merely HTTP or test success.

## First full integration CI and follow-up

[Project checks run 38688511683](https://github.com/AmmarMohanna/distilled.news/actions/runs/38688511683), commit `5927f8f`, completed the full workspace test step. Worker: **1,482 passed, two failed, 11 skipped** (212 files). The two failures were exact, not timeouts:

- Selection invoked the source review prefetch before its own complete selection prefetch. This redundantly requested duplicate-analysis/mention context and assumed an entity array absent from the older minimal selection fixture. Remove the review-only invocation from selection; retain it in reassessment. Selection still builds all candidate targets and warms all owned propositions/slots/entities in bounded batches. The original 100-Event/104-revision test, zero sequential document-read assertion and <=12 preload-query bound now pass.
- The added store test expected missing keys in `readMany`, contradicting the recovery sparse-map contract and another existing test. Preserve the sparse map used by callers (including iteration over real operations), verify `get(missing)` is undefined and an absent key is not a successful record; foreign IDs still throw and stale snapshots still fail CAS. No production scope guard changed.

The two affected suites now pass **13/13**. No size/read budget, validation assertion or timeout was increased.

Other complete CI packages passed: connectors **237**, contracts **44**, core **43**, agent runtime **267** (two skipped), web **27**, browser bridge **82**. CI also passed all script tests, helper tests and workspace typechecks. Build and Playwright were skipped because the two Worker assertions failed; a subsequent full run is required after the fix.

Local isolation of push/ledger/publication yielded **26 passed, 18 deadline failures**: all 14 push tests timed out in the shared 10-second setup, four publication tests exceeded five seconds, and all 13 ledger tests passed. The exact unchanged-parent push setup also exceeds ten seconds. Three of four publication failures reproduce on unchanged `61c3548`; the refutation case passed on the parent but timed out locally after integration, including an isolated rerun. The complete Linux integration run passed **all 14 push, 17 publication and 13 ledger tests**, with original deadlines. Thus these are local deadline observations, not silently waived failures or proof of a production outage. No deadlines were changed.

The acquisition benchmark workflow passed on `5927f8f`. The final follow-up full CI result remains to be recorded.

A refreshed read-only staging snapshot at 08:48 Beirut still shows the old Worker and unchanged grants/liabilities. Its actual 05:00 edition (`2b23de3c...f49cb`) reviewed all nine candidates (47,341 bytes), selected four and published three with three ledger entries: Anthropic revenue, Ricursive chips and Gudea crisis-monitoring. Writer/verification generation cost $0.0062716, 107,725 ms; not a full window subtotal. The following 06:00/07:00/08:00 requests each failed `TEMPORARY_UNAVAILABLE` after five attempts. Neither these publications nor failures validate the undeployed integration.

## Complete workspace verification and final batching preservation

[Project checks 38689851392](https://github.com/AmmarMohanna/distilled.news/actions/runs/38689851392), code `2283111`, passed **all 1,484 Worker tests**, with 11 intentionally skipped; all other package tests, scripts, helper tests, workspace typechecks and workspace builds also passed. Desktop/mobile Playwright completed **275 passed, six failed, one skipped**. This is not an all-green workflow.

The six failures reproduce exactly on an independently built, unchanged `61c3548` frontend with original assertions and deadlines: four Preferences-panel no-internal-scroll assertions (two viewports in both browser projects), and two guest-page expectations for an `All feeds` button. Current `AppExperience.tsx` intentionally guards category buttons by an authenticated account; its guest behavior is unchanged by this merge. Preferences measurements require frontend follow-up; no scrolling assertion, layout or deadline was weakened to hide the failures. The relevant frontend source differs from the recovery parent only by the new unavailable-source warning and response type. Baseline browser logs remain ignored locally.

A final path review also caught a consequence of removing the broad review prefetch: selection's independent-support counting would read duplicate judgments sequentially. A new regression constructs two distinct grounded Events, requires both candidate identities, and fails with two direct duplicate-document reads. The fix preloads duplicate judgments across the complete selection snapshot only, after plan/Feed/history validation. It keeps full review prefetch in reassessment and full owned semantic-reference batching in target retrieval. Foreign-ID scope checks, fresh CAS snapshots and cached misses remain unchanged.

That regression, all 34 selection-quality tests and four 100-Event/read-cost tests pass **39/39**; duplicate direct reads fall from two to zero in the two-Event fixture without candidate loss. Final Worker typecheck and exact staging dry-run pass. The final code checkpoint must receive the complete CI rerun too; the known six baseline browser failures are not waived or reported as green.

Staging backup export completed successfully: 1,291,495,617 bytes, SHA-256 `f02b1e07e8bbb80f87ec4c35998f1811b4cd45c98e2dec16bb1c02b1900b9cd7`. It is retained only in the ignored local review directory; its private contents were neither printed nor committed. Export succeeded and its final SQL statement is terminated; a complete 1.29-GB restore test was not performed. The separate migration compatibility checker did exercise full parent-schema upgrades with preservation fixtures. Wrangler's own remote migration listing independently confirms the same ten pending full filenames. No migrations or queue-resource creation have occurred.

## Authorized activation and first integration canary (October 15)

The user approved activation and observation of the active Feed's next normal
scheduled model-backed window. Reviewed code `303b73958827ceb9fbce0f6db39a993ffebf7abb`
was deployed to **distilled-news-staging**, version
`5010024a-1933-4eba-bfa6-e895b4fbacb0`. The previous version was
`feb41152-2a44-462a-ad9b-d0f26f6f3754`. No production, sources-QA or contributor
branch was changed. Both remote parent heads still match the compared revisions.

All ten reviewed additive migrations applied successfully: staging now records
64 exact migration filenames. Six staging queues were created (collection,
acquisition and intelligence, each with its own DLQ), retaining the original
processing queue/DLQ. All four primary consumers point to the staging Worker.
Existing D1/R2/assets/helper bindings, 14 secret bindings and existing variables
were preserved. Only the reviewed queue scheduling, shared public fetch and
full-article flags were enabled. The frontend asset is `index-Bp6wyXX2.js`;
the public Feed API returns 200 and anonymous operator-trace access returns 401.

[Complete checks for 303b739](https://github.com/AmmarMohanna/distilled.news/actions/runs/38691988606)
passed **1,485 Worker tests, 11 skipped**, all other package/script/helper tests,
workspace typechecks and builds. Playwright remains **275 passed, six failed,
one skipped** with the same unchanged-parent failures classified above. This is
not a fully green browser suite. The staging Worker dry-run also passed.

The only active sourced Feed is AI Industry Watch2; old Lebanon/AI Feeds remain
paused. TechCrunch polling succeeded; a BBC poll retried and then completed
normally. Its intermediate generic exception was not retained sufficiently to
prove a root cause. VentureBeat has recorded RATE_LIMIT coverage and exhausted
polls; configured provider availability is not evidence of successful acquisition.
No new EvidenceRevision was accepted during the observed activation-to-canary
interval, so full-article enrichment and new semantic construction are not live
validated by this window. A retained reassessment did complete normally.

### Actual 10:00 Beirut outcome: failed writer precheck, no publication

Request `f433410b1ebdb23d5deda25d59de169955be2dfad9f6e6194de724924a25effa`
was created naturally at 07:00:38.015Z for 06:00-07:00Z. It had zero pending
intake jobs and two failed October 14 reassessments (`IDEMPOTENCY_CONFLICT`).
These remain explicit INCOMPLETE coverage, rather than becoming quiet news.

Shortlist `980181de...00e4d` contains **35 candidates, 67 facts, 31 ledger entries,
two relevant correction obligations, zero overflow**. The real comparative plan
`42b7c308...950c` offered all 35 candidates in **65,805 bytes**, accepted 35
decisions, selected four and deferred 31. No candidate was capacity-excluded.
The planner operation `0c88711f...11d0` succeeded in **39,162 ms**, with
36,979 input/4,984 output tokens and **$0.022766** reported cost. Three relevance
calls also succeeded. Candidate/fact reference ownership validated; meaningful
selection rationales were associated with their actual source facts. This is live
schema/coverage evidence, not proof that every editorial judgment was sound.

Selection `8599231d...d85b` committed all four selected stories. Synthesis and
one bounded repair completed with known costs/results. Both drafts were rejected
by the deterministic precheck: the approved phrase **"One of the core promises"**
was interpreted as mandatory numeric `1`, while the prose used **"a core promise"**.
Only that story had precheck issues; the other three passed. No semantic grounding
call occurred. The synthesis job and request are terminal FAILED/INVALID_REQUEST
after one attempt. There is **no edition or ledger entry for this window**; it
was not reset or manually republished.

The six natural model calls reported **$0.027457136** total. Account reported
spending moved from $10.914427942 to **$10.941885078**; held exposure remained
**$1.528542294**, with 26 unresolved reservations including 25 existing operator
quarantines. The existing $50 grant, effective concurrency 25, amendments and
historical liability records were unchanged. No investigation-only paid call ran.
One observed acquisition CAS rejection reported changed Feed epoch, unchanged
intake scope and no writes; no CAS exhaustion was observed. Success timings/query
counts are not universally persisted, and this does not establish the historical
CAS failure's cause.

### Narrow partitive-quantity repair

The new floor recognizes a regular plural partitive only when the counterpart
contains the matching indefinite singular noun phrase. It does not globally
ignore `one`, invent counts from arbitrary articles, change numeric materiality
helpers or weaken model entailment. Exclusive/bounded quantities, explicit
population counts, another numeric `one` in the same fact, and unmatched noun
phrases retain the numeric floor. Unrecognized inflections remain conservative.
The diagnostic fidelity label changes to v8; no paid-operation identity changes.

The exact retained source/original/repair prose is preserved in a minimal sanitized
fixture. Pure regressions were **five failing/seven passing before**, then all
12 passing. Two D1 publication-boundary tests failed before and pass afterward:
the draft can reach independent verification, retain both mandatory facts and
citations, project the ledger and replay idempotently; a negative semantic verdict
still prevents publication and communication. These controlled verifier responses
are structural tests, not live entailment judgments. The wider focused run passed
**86/86** with unchanged deadlines. Full follow-up CI/deployment results must be
recorded before claiming this repair live validated. The terminal 10:00 window
and its paid results remain untouched.

### Important quality gaps remain

- Firmus's Nvidia-backed IPO cancellation and the two sides of the OpenAI
  researchers' dispute were offered to the real model, not excluded by capacity.
  They were deferred as older/less relevant to products or breakthroughs, although
  the actual Feed includes company announcements and industry developments.
  Reporting age is not reader repetition; these are questionable editorial
  judgments, not evidence-processing failures in this window.
- The researchers' allegation and employer's counterclaim are separate Event
  candidates from the same article. One retained Anthropic Event combines the
  cruelty policy with the independent police-tip incident. These stored identity
  problems are not repaired by complete candidate coverage or faster selection.
- Five SOURCE_REVISED obligations remain OPEN on the active Feed; two appear in
  this shortlist. Revision alone does not prove a factual correction. No verified
  corrective delivery is claimed. The older withdrawn Anthropic-policy history
  on a paused Feed is unchanged too.
- The window used retained excerpts. It cannot prove complete source acquisition,
  new Event construction, X/Telegram health, sustained scalability, or useful
  published editorial quality. X still has the legacy unresolved provider
  submission noted above; no new financial authority was created.


## Fidelity repair activation and accounting verification

The partitive repair is committed as `93d83ea607833426a9c09721915c2df1c9efda5b`
and deployed to staging as `e05d2278-2405-4395-ad39-45621e6fc1c6`. Compatible
rollback reference: integration version `5010024a-1933-4eba-bfa6-e895b4fbacb0`.
No additional migration or resource creation accompanied this repair. Read-back
confirmed identical bindings, all 14 secret names, variables, grants/amendments,
64 applied migrations, reported cost and held exposure. Frontend assets are
unchanged. The old 10:00 terminal window was not reset.

The first complete CI attempt on this code passed **1,499 Worker tests, 11 skipped**,
and all connectors/contracts/core/web/browser-bridge tests. Agent runtime had
**266 passed, one failed, two skipped**: `runtime-timeout.test.ts`,
`cancels on lease renewal failure without settling a late model response` failed
at its `flushUntil` startup predicate, before model invocation and lease-loss
assertions. The implementation and test are byte-identical to `61c3548`. The
complete affected five-test file passes in local isolation on both revisions
with unchanged deadlines. This is a precisely located intermittent test-startup
failure; its CI recurrence must not be hidden behind the Worker pass count.
A complete unchanged workflow rerun was initiated. Its final outcome is recorded
below when available; the first attempt skipped build and Playwright.

Local contracts/core/connectors/frontend builds passed. The root build command
first failed before compilation because this shell lacks standalone `pnpm`;
running its same package sequence through Corepack reached the default Worker's
Docker-image step, which requires an unavailable local Docker daemon. Worker
code build with `--containers-rollout=none` passed, as did the exact separate
staging dry-run. This does not claim a local Docker image build succeeded.

The existing trace builder was executed against read-only staging D1, without
an admin-session bypass or a model call. It reports 35 eligible/offered/judged,
four SELECT, 31 DEFER, zero SUPPRESS, four selected but uncommunicated, no edition
or ledger communication, and FAILED/INVALID_REQUEST. All 35 candidates were
returned. Overview used 19 queries; the candidate view used 27. Local diagnostic
elapsed times include separate Cloudflare API round trips and are not Worker
API or selection latency measurements. Its Feed-operation cost total is
explicitly not a window-only cost; the separately reconciled six-call canary
cost above is the window's confirmed charge.

Correction projection clarification: the active Feed has five immutable rows
whose stored state is OPEN, but **three already have NON_MATERIAL_SOURCE_REVISION
resolution records**. Only two remain unresolved, YouTube Music labels and
Anthropic revenue; both reached the canary shortlist. These are distinct from
the older withdrawn Anthropic-policy edition on a paused Feed. Neither the
presence of a revision obligation nor its DEFER handling proves misinformation
or successful corrective communication.

Persisted semantic states also locate the grouping problems in pre-integration
GPT judgments: the two researcher Events share judgment `2039110c...25ba`, while
the combined Anthropic policy/police-tip Event references `e0cfca92...265d`.
The Event versions were created October 13. They are not provisional budget
fallbacks, and the read-batching integration did not create these identities.
No historical canonical identity or paid judgment was rewritten during audit.

## 11:00 canary: correction output capability mismatch

The first request on Worker `e05d2278-2405-4395-ad39-45621e6fc1c6`,
`46ff121c54ff8608ee25aa8a63843bc5c0fe8dc5da7d45849482b62e07e8472a`,
reached a real comparative planner but ended FAILED after five attempts, with
no committed selection, writer draft, edition or ledger projection. The known
planner result cost $0.0226252 and took 38,273 ms. Its 35 candidates and 67 facts
were retained; the server rejected the proposal with SCOPE_DENIED.

Offline replay locates the rejection in ADDRESS validation: the model claimed
to address both SOURCE_REVISED obligations, while no offered candidate owned
either obligation. Their prior Event/Storyline IDs are absent from this candidate
set. Merely selecting similar news is not corrective ownership. Changing only
those two decisions in a diagnostic copy makes the remainder validate; this copy
was never used for publication, persisted as a replacement, or sent to a model.

The narrow repair removes ADDRESS from the provider output capabilities only
when no offered candidate owns the obligation. It preserves DEFER and all source
correction, ready-withdrawal, candidate ownership and full-plan validation rules.
It does not infer a corrective relationship or resolve an obligation. Existing
paid operation identities, input policy and historical results are unchanged;
the terminal request is not reset or rebilled.

Regression before repair: one failure, three passes. After repair: four passes,
including owned source corrections and mandatory withdrawal corrections. The
actual retained workload's repaired schema passes provider admission with 133
enum values, 10,470 schema string characters, 688 properties and nesting depth 4.
All 35 candidate keys and 67 facts remain available. The original raw proposal
still fails the authoritative validator, as required.

## Full-suite uncertainty after the partitive repair

The unchanged CI rerun also failed the agent-runtime startup predicate above.
Its Worker result was 1,497 passed, two failed and 11 skipped. The failures were:
`push.integration.test.ts` / unprojected-edition notification (10-second setup
hook) and `publication.test.ts` / restart from durable draft and grounding
(5-second test). Both passed the first complete CI attempt. In isolation on this
machine, both deadline failures reproduce on the integrated revision AND unchanged
`61c3548`, with the original deadlines. The agent-runtime five-test file passes
in isolation on both. No failing assertion or timeout was weakened. These results
classify the precise failures and baseline behavior; they do not establish a
fully green suite or prove the underlying timing cause. Build and Playwright
were skipped by both failed workflows. Earlier integration browser results and
baseline comparisons remain separately recorded above.

The correction-capability repair is committed as `a915d68`. Focused results:
67 planner/schema tests passed; 49 integrity tests passed and four existing
semantic-replay tests were explicitly skipped. Worker typecheck, exact staging
dry-run and `git diff --check` passed. No frontend/source/runtime binding changes
are part of this repair. The larger CI limitations above remain unresolved.

Predeployment read-back: 64 migrations, eight staging queues, unchanged $50
seven-day grant and effective concurrency 25. Reported model cost $10.964510278;
held UNKNOWN exposure $1.528542294 across 26 unresolved operations, with the
same 25 prior operator quarantines. No financial record was changed to make
capacity available. The 11:00 planner's known charge explains the increase from
$10.941885078 after the 10:00 attempt. No investigation-only model call was made.

## Current release verification: 38c41f1

Code repair `a915d68` and its report checkpoint `38c41f1` are deployed as Worker
`bfa07b46-bcf5-4f18-86cf-c642cfcce625`. Read-back preserves every binding/variable,
64 migration names, eight queues, the existing grant/amendment and historical
financial liabilities. Compatible rollback is prior integrated Worker
`e05d2278-2405-4395-ad39-45621e6fc1c6`; no database snapshot rollback is proposed.

[Project checks 38706854159](https://github.com/AmmarMohanna/distilled.news/actions/runs/38706854159)
completed: Worker **1,503 passed, 11 skipped**; connectors 237, contracts 44,
core 43, agent runtime 267 (two skipped), web 27 and browser bridge 82 passed.
Workspace typechecks, script/helper checks and workspace builds passed.
Playwright: **275 passed, six failed, one skipped**. All six are the same
baseline-reproduced cases: Preferences panel internal overflow at 1280x720 and
390x664 under both projects (four failures), and the guest All feeds button
visibility assertion under both projects (two). The former measures real retained
layout overflow; the latter conflicts with the existing account-guarded control
and needs a frontend contract decision. Neither is dismissed as Chromium load.
The earlier agent startup and Worker deadline failures did not recur in this run.
No assertions or deadlines changed.

Additional durable editorial run: **68/68 passed**, including 40/100/120-candidate
coverage, complete comparison across context-sized cohorts, UNKNOWN fencing,
retained billed results after restart and model-capacity continuation. Combined
focused runs for this repair: 184 passed, four explicitly skipped replay tests.
These deterministic tests do not establish model editorial accuracy.

The real public reader loaded without JavaScript errors, rendered 12 retained
editions and the correction-pending warning, did not claim Feed unavailable and
has no Brief now control. The underlying API remains publication-only; anonymous
operator trace access remains denied. No mailbox/authentication changes occurred.

Remaining correction ownership is now concretely located: prior YouTube and
Anthropic-revenue Event roots are WITHDRAWN with no current memberships. The
shortlist cannot safely invent a link to similar current stories. Both obligations
remain unresolved; no corrective delivery is claimed. This is distinct from the
older withdrawn Anthropic-policy edition on the paused Feed.

Quality inventory of retained canary evidence: 36 distinct revisions have body
lengths of only 83-424 characters. This does not validate new full-article
acquisition. Firmus and both sides of the researchers' dispute appear in real
accepted plans across seven distinct windows; duplicated plan/projection records
are not extra model reviews. Their latest accepted treatment was DEFER with
age/product-focused rationales, not a capacity exclusion. The current 31-entry
ledger has no literal Firmus/IPO/researchers witness; this bounded search is not
itself a semantic proof of novelty. These items remain in the current shortlist.

Immediately before 12:00: no active intake jobs; 75 ACQUIRE and 73 REASSESS DONE,
plus two retained REASSESS failures (IDEMPOTENCY_CONFLICT). These are job counts,
not unique article counts or a claim that every semantic judgment is correct.

## Natural 12:00 canary: verified publication, with honest coverage gaps

Request/edition `69ae778152e834144d7916d5d6b920d4c96db6315ad11803e9176d3f10920471`
was created at 12:00:43.192 Beirut on October 15. The real plan accepted all 35
candidates/67 facts, selected four and deferred 31; input 65,805 bytes, no capacity
exclusions or deterministic publication. Operation `d5290d7f...b546e8` succeeded
in 34,802 ms, 36,977 input / 4,866 output tokens, confirmed cost $0.0189284.
Selection `068fe287...e94baa` committed. Both obligations remained DEFER. One
DEFER target reference points to unrelated Plaud work; it grants no corrective
ownership and is not evidence that alias interpretation is universally correct.

Writer: 3,475 input / 430 output tokens, 11,948 ms, $0.002078. Independent grounding/
novelty verifier: 3,464 input / 1,378 output tokens, 18,962 ms, $0.0035904. All
three charges are confirmed, totaling **$0.0245968**. Four stories were grounded;
four facts in two stories were reader-new, while the two YouTube and two Anthropic
revenue facts were ALREADY_COMMUNICATED with actual prior prose witnesses.

Existing `verified-repetition-v1` reconciliation removed only those two repeated
stories. Plaud funding and Brad Smith regulation comments survived, preserving
all four mandatory new facts. No repair call or fallback edition was needed.
The fidelity attestation passed. Edition publication status became PUBLISHED at
**12:06:22.491**; the request became DONE/PUBLISHED at **12:06:31.826**, zero recorded
failure attempts. The queue execution completed in 335,803 ms. This is not a
low-latency or sustained-throughput claim; provider latencies alone do not explain
all elapsed processing time.

Two new communication-ledger entries project the actual published prose. The API
returns 13 editions with this edition first and two original TechCrunch/BBC URLs.
A real browser renders both stories and two references on expansion, and preserves
them after reload. The collapsed card intentionally previews only the lead story;
the second is not missing from the API or edition. No new unsupported event date
appears: both stories are framed as earlier source reporting. Funding amount,
Smith attribution and the tech-company qualification are retained. The Plaud
application/founder name and deeper funding context cannot be recovered from the
retained short excerpt; the output does not invent them. This is a successful
real-model publication path, not proof of comprehensive or substantive coverage.

Financial read-back: reported spending $10.989107078, held exposure $1.528542294,
26 unresolved liabilities and the same 25 prior quarantines. Three new reservations
settled normally. Total confirmed model-cost increase across the observed 10:00,
11:00 and 12:00 windows is **$0.074679136**, matching the account delta. No
investigation-only model call, new grant, concurrency change or UNKNOWN release
occurred. Browser delivery remains PENDING with no acceptance receipts; the owner
has zero push subscriptions. Publication is confirmed, device notification is not.

The live trace exposed a final reporting defect: incomplete coverage overwrote
DONE/PUBLISHED with diagnostic BLOCKED. The follow-up changes only read-only state
precedence: publication is SUCCESS, with the separate COVERAGE/BLOCKED problem
still present. Both new intake/semantic-coverage regressions failed before and
pass after; the complete trace and partial-publication run passed **45/45**.
Worker typecheck and staging dry-run passed. Direct read-only replay of actual
staging records shows 35 offered/judged, four grounded, two published/projected,
and the two excluded repetitions. All 35 candidate records are available; overview
used 21 queries and candidate view 28. Local elapsed trace times include external
D1 API round trips and are not Worker API latency measurements. This final
read-only patch is additional to the full CI result on `38c41f1`, not falsely
included in that earlier 1,503-test count.

Unresolved: two historical reassessment failures; withdrawn-root correction
ownership; 31 deferred candidates including Firmus/researchers; thin retained
source text; the demonstrated Anthropic policy/police-tip grouping; X's historical
provider fence; no natural Telegram or new full-article canary; six baseline browser
failures. No historical edition, paid identity or failed request was reset. Main,
main2, production and sources QA were untouched.

## October 15 independent integration audit (follow-up from 96f91d4)

Audited starting commit `96f91d4`; same integration branch, no repeat merge. Original latest inspected heads: recovery `61c354871dadde07d261064db6408f8f016131e0`, sources `9052b56434adb58474f52fc1f78dfba4b7fd6eb4`; common base `23c4c49d06561fbe1c7f02af0a640f1135a4547c`. Both heads and `34a7a6c` are ancestors. Conclusions below use actual source, local D1 tests and independent read-only Cloudflare/D1 queries, not branch authorship.

## Component comparison

| Component | Retained result and evidence |
|---|---|
| Indexed scheduler/fair continuation | Source implementation retained: indexed due-feed/poll queries, durable ownership, configuration wakeups and per-feed refill. Integration adds generation-specific completion and mandatory lane configuration checks. 1,000-feed local dispatch test processed 1,000 messages in 420 ms; synthetic, not live throughput. |
| Queue lanes/renewable turns | Source collection/acquisition/intelligence separation retained alongside recovery publication pipeline. Token/lease checks and feed/source CAS remain authoritative; each retry owns a fresh transaction cache. Existing integration tests cover expiration, stale delivery and concurrent Feeds. |
| Acquisition/provenance | Source full-article, Google/website discovery, canonical URLs and pagination retained. New RSS update repair lets excerpts request reacquisition; canonical promotion still rejects downgrade, conflicting ordering and revoked scope. No historical refetch. |
| Telegram/provider finance | Source session lane, explicit edit/deletion checks and independent primary/fallback accounting retained; recovery UNKNOWN fences strengthen provider submission safety. No live Telegram validation on the sole active RSS Feed. |
| Shared public cache | Source anonymous-only cache retained, with private/cookie/credential bypass and independent authorization/receipts. 1,000-consumer reuse covered locally; no shared Event ownership introduced. |
| Events/editorial/publication | Recovery semantic construction, Event-owned facts, global comparison, continuation, reader ledger, writer/independent verifier and correction safeguards retained. This preserves implementation functionality, not proof that model judgments are correct. |
| Model financial state | Recovery streaming receipts, spending authority, settlements, UNKNOWN compatibility and existing approved quarantine behavior retained. No grant or concurrency changes, new quarantine or financial settlement performed by this audit. |
| Product/authentication | No frontend, visibility, Outlook, push configuration or source schedule code changed. Public/Private contracts and manual-Brief-now retirement retained. |
| Migrations/resources | Exact 64-file union retained, including six duplicate numeric prefixes; full filenames govern migration identity. Fresh/recovery/source SQLite upgrade checks converge without deleting history. Staging independently has all 64, with none missing/extra. |

## Four prior review findings

1. Failed intake is explicit `INCOMPLETE`, not successful quiet coverage; available verified stories may still publish. The two failed current revisions remain genuinely unrecovered.
2. Internal briefing response reads durable outcome instead of equating missing edition to `NO_NEWS`.
3. Shortlist fallback uses exact Event-owned retained state and membership support, not all article sentences.
4. Trace resolves window/page context in scoped SQL. A separate live repair-reference defect was reproduced and fixed: overview now follows the edition verification ID, rather than assuming the original draft ID. It does not hydrate all historical drafts.

## Independently verified actual staging

Worker `distilled-news-staging`, account `e32b564514d4f9b9e383b7dd30dbb026`, D1 `ab259bfe-6029-4e20-8cb6-eea6b7a67459`. Sources QA is separate and untouched. Version `f6096ff9-32a3-4045-9801-8a973017f715` explicitly annotates commit `96f91d4`; all deployed staging variables match Wrangler. Four queue lanes plus four DLQs, R2, private VPC source-service binding and 14 secret bindings are retained. Binding presence is not proof of a successful Telegram request.

Only AI Industry Watch2 is active with three RSS sources; old Lebanon/AI test Feeds are paused. They were not resumed. Existing authorization remains $50/7 days with the pre-existing effective concurrency25. Snapshot13:35 UTC: reported $11.194038418, held exposure $1.528542294,26 unresolved liabilities and unchanged25 approved historical quarantines. Held exposure was not written off and expired leases were not interpreted as provider termination.

## Actual publications and omissions

| Beirut window | Retained outcome |
|---|---|
|12:00|35 candidates/67 facts all model-reviewed;4 SELECT,31 DEFER. Two repeats removed by independent verifier. Plaud funding and Brad Smith regulation comments published,4 mandatory facts,2 ledger entries. Edition69ae7781...0471 at12:06:22.491;3 confirmed calls total$0.0245968.|
|13:00|33 candidates all reviewed;2 SELECT,31 SUPPRESS. No edition; durable DEFERRED because intake coverage remains incomplete. These are accepted omissions, not input-capacity exclusions.|
|14:00|2 candidates/4 facts,2 SELECT; no edition, DEFERRED/incomplete coverage.|
|15:00|2 candidates/30 facts, both offered and selected. Full BBC article3594chars, one provisional Event28 candidate facts;22 required facts published in one long claim. One repeated sibling removed;1 ledger entry. Edition54bc7868...9cf0 at15:06:54.518. Planner$0.0060912 plus writer/repair/verifier$0.0167916=$0.0228828;4 confirmed calls.|
|16:00|3 candidates offered;1 SELECT,2 DEFER. Selection committed; writer and one repair completed but quantity fidelity rejected the required headline$75 versus body/draft$74.99. FAILED/INVALID_REQUEST,1 recorded attempt, no semantic-verifier call or edition. Planner/writer/repair total$0.0186504. Terminal request untouched.|

The public API independently returns14 editions, including noon and15:00; unauthenticated operator trace returns401. The long15:00 text is already one stored writer claim: frontend joining did not create this grouping.

## Confirmed quality and retention gaps

- Five rematches of the full BBC article remain rejected. Exact original and repair diagnostics: `MATERIAL_BACKGROUND`, backgroundMentionIds[1]. A related-story-style 'How ... could ...' heading triggers the blanket hedge prohibition. Model references resolve correctly. Removing the guard would risk losing genuine uncertain facts. Even accepting this response would not prove its proposed Event grouping correct.
- The engine's rejected-construction fallback formed one provisional Event over the mixed article. Investor outreach, other companies, market movements and safety commentary were then approved as22 new required facts, with zero designated context facts. Publication success is not validated semantic separation.
- Firmus IPO cancellation and both sides of the OpenAI researchers dispute were reader-UNSEEN but SUPPRESS/OUT_OF_SCOPE at13:00. Rationales narrowed broad industry interests to current model/product news and invoked reporting age. This is a demonstrated judgment mismatch, not a reason to force every deferred candidate into publication. Ticket promotions/unrelated entertainment had defensible omissions. No story count/input capacity excluded these candidates.
- Durable editorial omissions are reconsidered for new evidence/version, changed Feed interests/revision or policy. Unchanged compatible omissions retire; new reader-history context alone is not an implemented reopening condition. No retained example yet proves that latter limitation caused a later omission.
- Reader history knows only generic Anthropic revenue growth, not the newly published precise financial figures. Generic contextual overlap is not proof that all new details repeat. The repeated YouTube sibling was independently rejected rather than projected as new.
- Exact revenue fact ends 'the BBC understands'; published prose omits that explicit source qualification. Approved structured attribution was unset/UNSPECIFIED and the verifier accepted. Citation supports origin, but explicit reporting qualification was lost. Assess materiality rather than inventing a correction automatically.
- Current retained revision inventory:75 excerpts83-476chars and2 full articles3487-3594chars. Full acquisition is now demonstrated on natural arrivals; historical thin evidence was not refetched. No complete-source coverage claim is justified.
- Two FAILED Oct13 reassessments are Microsoft regulation revision8efef... and WindBorne62ec... . Current revision IDs remain unchanged; only observation pointers advanced on replay. Their coverage failure is truthful. The new alias-order/case regression is independently proven but not falsely assigned as their historical cause; prior provenance collision repair does not reset terminal jobs.
- Three SOURCE_REVISED obligations are currently OPEN on the active Feed. The old withdrawn roots cannot be invented into current corrective ownership. No verified corrective ledger delivery is claimed. Older paused-Feed Anthropic-policy correction is distinct.
- RSS publication-date-only change detection remains an inherited limitation: fingerprints exclude publication metadata. A naive hash change risks rediscovering/rebilling history; a compatibility-safe metadata propagation repair remains needed.

## Bounded fixes

`02b118b`: entity witness equality now uses the same label normalization/sorted aliases as its existing durable identity; retains original immutable entity/provenance. Paid identities/policy versions unchanged. Reordered aliases and case-only labels failed before, pass after; changed support still rejects.

`a874962`: URL-bearing excerpt/listing may reach ACQUIRE; acquired full article must pass independent canonical guards. Both variants failed before, pass after, and failed excerpt fallback preserves prior full text. No historical jobs or records reset.

`2a76b3a`: trace overview reads bounded, Feed-scoped grounding records from published verification references. New regression failed null-versus1 before; also rejects counting superseded initial grounding as final. Actual15:00 replay now reports2 grounded,1 published,1 ledger-projected.

## Verification and release

Local:71/71 intake/evidence/semantic-state/connector-scale tests;42/42 trace tests;4/4 partial-publication tests. Worker and workspace typechecks pass, frontend build passes, staging dry-run passes, migration checker passes, git diff --check passes. First draft fixture failures (incorrect strict proposal property and attempted mutation of an immutable fixture) were corrected; immutable production guards were preserved. Full CI/release results will be appended after completion.

No manual edition, investigation-only inference/provider call, remote migration, grant amendment, reset, new quarantine, source refetch or production/QA deployment occurred in this investigation.


Broader verification at `a874962`: full Worker1509 passed/11 skipped, contracts44, core43, web27 and browser-bridge82 passed. Two other suites had one failure each: agent-runtime266 pass/1 fail/2 skipped (500-setImmediate startup readiness race, before settlement assertions), connectors236 pass/1 fail (exact10 ms expectation versus actual14 ms elapsed time). Both pass in isolation. The following test-only correction replaces the readiness poll with the stub request-start promise and freezes Date.now for deterministic telemetry; no assertion/deadline changed. Complete affected files subsequently pass80 connector and5 runtime tests; runtime typecheck passes. These are not claimed as a fully passing final workspace run: final CI is pending. Earlier six browser failures have separate baseline evidence (four real Preferences overflow cases, two guest-navigation contract mismatches); this audit does not hide or weaken them. Final staging deployment and later-window results are recorded separately after their actual execution.


### Independent verification completion and later natural window

Final CI at `d1e5274`, run38747463097:2210 workspace unit tests passed (Worker1510, connectors237, agent-runtime267, browser-bridge82, contracts44, core43, web27);13 unit tests skipped. Workspace typecheck, script tests, source-helper Python tests and full build passed. Playwright275 passed/6 failed/1 skipped. Exact six failure identities match unchanged61c3548 baseline artifacts: four genuine Preferences overflow cases (43px desktop/91px small-mobile) and two guest-All-feeds expectations inconsistent with the account guard. Overall CI is red, not fully green. The earlier startup and telemetry flakes did not recur after their deterministic test-only setup fixes; no application timeout/assertion was relaxed.

Code-only staging release `d1e5274` installed version `cb328002-dae9-4c7f-9f5c-9dff4c7134a4`; rollback reference remains `f6096ff9-32a3-4045-9801-8a973017f715`. Independent post-release comparison shows identical bindings/variables/queue IDs/migration names, identical bytes for the two checked historical editions and identical spending-grant JSON hash.14 secret bindings preserved; no remote migration. Snapshot:reported$11.322453584,held$1.528542294,26 unresolved/same25 historical quarantines, unchanged concurrency25.

The normal17:00 request/edition `27a5241e...9198` published at17:12:54.792 BEFORE this release, on96f91d4.3 candidates were offered/judged;1 SELECT and2 DEFER. Writer used one repair and independent grounding;27 required facts were projected in one545-word claim/one ledger entry. Four confirmed model calls (planner plus synthesis/repair/grounding) cost$0.0270404. The quantity check now passed with both source values represented; the16:00 terminal failure was not reset. Crucially, the verifier explicitly classified3 Apple/OpenAI facts ALREADY_COMMUNICATED and24 Bee facts NEW. The three old facts still published inside the merged mandatory story. This is a confirmed novelty/grouping defect, not proof of successful noise filtering. The old Apple product, OpenAI court case and new Bee launch are distinct developments even though the technical Event owns all their facts.

Further independent scope check: the deployed strict-model shortlist ownership fix is correct, but optional deterministic/no-planner runtime151 can still reach editorial.ts142's article-wide fallback. An offline real-D1 two-Event construction yielded both article sentences for each target's legacy editorial delta. This inherited path is not enabled on staging; it remains a P2 limitation rather than an assertion that all Event-ownership routes are fixed.

A real article-trace read then failed on `no such column: b.batch_key`. RSS connector_batches uses handoff_id; connector_provider_batches uses batch_key. The original trace unit fixture created only the latter. The follow-up regression uses the exported real RSS schema, reproduces the exact SQL failure, and checks discovery-without-intake plus cross-Feed isolation. The bounded repair chooses each table's actual identity column; no record, evidence or paid operation is altered. Follow-up verification/deployment and the18:00 normal window are reported after actual completion; they are not inferred from the17:00 publication.

Priority remaining quality work: validate semantic repartition of composite/provisional and historically merged Events; distinguish reporting age/urgency from broad industry Feed relevance; reconcile verified repeated facts inside mixed mandatory stories while preserving new facts; assess reporting qualification loss; recover the two genuinely unrecovered revisions safely; resolve obligations only through a justified verified lifecycle. SOURCE_REVISED is a trigger, not itself proof of misinformation. No automatic obligation clearing, source refetch, historical reset or forced publication was performed.


### RSS diagnostic follow-up verification

The sibling source-view query had the same table-identity mismatch. Its actual exported RSS-schema regression failed with `no such column: batch_key` before the mapping fix and passes afterward, preserving Feed/source scope and the observed-only status. Full trace files pass45/45. A prior run concurrent with typechecking crossed two unchanged5-second deadlines (125-candidate pagination and repeated read-only requests); an isolated full rerun passed both without modifying deadlines or assertions. Worker typecheck and staging dry-run pass. Actual read-only D1 source trace returns all3 active sources in32 queries; article trace returns the Bee revision in44 queries. These bridge counts include diagnostic queries, not model execution. No financial or editorial behavior changed.


### Actual 18:00 post-release failure and bounded delivery isolation

The normal18:00 request50c6f159...e739 ran on cb328002 (d1e5274), not the later diagnostics release. All5 candidates/236 candidate facts were offered in128485bytes;5 accepted GPT judgments,3 SELECT(Bee,Gudea,YouTube Music),1 DEFER(Anthropic unresolved high-consequence identity),1 SUPPRESS(GTA6 outside scope), no capacity exclusion. Selection0969c332...e9ef committed3 stories. Planner$0.022186, writer$0.0092176 and one repair$0.0101196 total$0.0415232 confirmed across3 calls. Request FAILED/INVALID_REQUEST with1 failure attempt, no edition or ledger. Original/repair prechecks persisted; repaired Bee omitted required headline$75 and asserted October15 as an event date without approved event-time authority. Gudea omitted the mandatory Disrupt2026 appearance and Thomin biography/two decades. These are not grounds to relax temporal/quantity verification. No semantic-verifier call occurred. The separate2 failed historical reassessments remained INCOMPLETE coverage, not the immediate writer failure.

Sampled actual CAS diagnostics distinguished Feed epoch change and source epochs390->391->392, with scopes otherwise unchanged. The final live log records SYNTHESIS_PUBLICATION/INVALID_REQUEST and331714ms queue duration. These observations do not retroactively establish the cause of historical long CAS exhaustion.

The demonstrated missing recovery was that repaired writer precheck failure killed every independent sibling. The narrow adaptive extension retains candidate-owned failures as WRITER_PRECHECK_FAILED/SELECTED_UNCOMMUNICATED using existing durable pending delivery and adaptive deferred work. It records all mandatory facts and source references, preserves original and repaired paid drafts, and derives an immutable subset draft containing unchanged passing siblings. Full independent entailment, temporal/action fidelity, novelty, correction and citation verification remain mandatory. Global/unknown or duplicate ownership failures cannot be isolated. A semantic failure alone cannot activate this precheck path. There is still at most one writer repair.

Publication identity remains the original scheduled-window edition identity; only fully verified surviving candidates can enter it and the ledger. Missing candidates stay uncommunicated and eligible for a later normally planned window, with a distinct future-window edition identity. No mutable or supplementary append to the original edition is introduced. One delivery job is created per immutable edition. Original selection/CAS, source authorization and reader-history checks remain intact at commit. Historical FAILED windows are never reopened. Successful provider results retain their original identity; subset grounding is separately evidence-bound and UNKNOWN fences stay enforced. Restart tests interrupt verification-result persistence after settlement and require reuse without a second verifier call. Candidate diagnostics follow the edition's exact derived draft reference with bounded Feed-scoped reads.

This is a publication failure-isolation fix, not a claim that Gudea/Bee writing, Event separation, scope judgments or actual live correction delivery is now correct. The earlier strict published-source guards remain in place. No monetary permissions, source account, migration or model setting changes are included.


Focused verification for this follow-up:5/5 new real-D1 failure-isolation modes;23/23 across adaptive/partial/temporal publication, writer feedback and isolation;46/46 complete trace tests; Worker typecheck and staging dry-run pass. The target publication case failed at rejectDraft before the patch and publishes only the valid story after it. A derived-draft trace test failed before the exact-reference lookup and passes afterward. The initial test draft omitted the existing required importance field and was corrected without changing validation; an early local run also exceeded its existing60-second deadline. Subsequent complete runs pass unchanged deadlines. No broader-suite success is inferred from these focused results. Previous released482852e full CI had2212 unit passes,13 skips, passing workspace typecheck/builds and275 browser passes/6 failures/1 skip; the exact6 names match unchanged61c3548 baseline evidence. The next commit's own complete CI and live result must be reported separately.
