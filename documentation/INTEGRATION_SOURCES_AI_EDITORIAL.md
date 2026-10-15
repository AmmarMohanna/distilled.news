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
