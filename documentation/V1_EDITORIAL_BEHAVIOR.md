# Editorial behavior v1 implementation record

This records implemented behavior and local proof. Local implementation and verification checkpoints are complete; human quality comparison and deployment remain pending. The task ledger is `docs/superpowers/plans/2026-10-04-distillation-editorial-v1.md`.
The frozen architecture and connector contracts remain authoritative.

## Previous communication

Selections compare actual published claims with current supported facts through
stable Event/Storyline lineage. Evidence supporting an earlier edition is not
automatically reader knowledge. Typed selection metadata retains exact earlier
edition/target/claim/support references, supported additions, repeat penalty and
initial context/treatment guidance.

Conservative deterministic equivalence preserves argument order, attribution
punctuation, numbers and attached units/signs/operators, negation, temporal words
and progressive versus completed actions. It recognizes a narrow set of lexical
equivalents; it does not claim general semantic entailment.

Independent reports can increase corroboration without producing another story.
Quiet windows settle the existing durable request without an edition, synthesis
or delivery job. A communication fingerprint fences cached selection, provider
reservations and publication. Reconciliation retains spent budgets and never
reopens an unknown provider outcome. Changed source epochs trigger selected
support revalidation; unrelated ingestion does not itself revoke authorization.

Milestone A pushed commit: `9c103af0d6654a13d838fcca065327cfacd2e6b8`.
Local proof: 29 focused editorial/fact/selection/publication/runtime tests, 44
contracts tests and all seven workspace typechecks passed. Reviewed defects were
reproduced before fixing. Earlier recovery-test deadline failures passed in
isolation and in final focused runs without changing the existing deadline.

## Live intervals

Normal live durations are 30, 60, 120, 360, 720 or 1440 minutes. `FeedRecord`
optionally retains `briefingSchedule`; durable request/selection windows retain
the duration, IANA timezone, optional local delivery anchor, concrete UTC bounds
and schedule policy. Legacy `windowKind` stays a compatible coarse category:
30 minutes → `30M`; 1/2/6/12 hours → `HOURLY`; 24 hours → `DAILY`.
Window assessment identity includes the complete window configuration and
communication context. There are no separate ranking engines for each interval.

Policy `local-calendar-anchors-v1` closes windows at a local daily anchor
(default `00:00`). A 24h schedule is one local calendar day: DST can make its
elapsed bounds 23 or 25 hours. Shorter durations advance by elapsed minutes from
the local anchor. Any remaining fragment closes at the next daily anchor, so
adjacent windows leave no gap or overlap; that final DST-day fragment can be
shorter than the nominal duration. The concrete bounds remain canonical.
Nonexistent anchors move forward through the gap; repeated anchors select the
earlier occurrence. This uses Temporal's explicit `compatible` disambiguation,
not hand-coded timezone offsets. See the [Temporal timezone documentation](https://tc39.es/proposal-temporal/docs/zoneddatetime.html).

The existing protected `/v1/downstream/enroll` accepts optional configuration:

```json
{
  "sourceId": "an-already-approved-canary-source",
  "ownerId": "its-owner",
  "briefingSchedule": {
    "durationMinutes": 1440,
    "timezone": "Asia/Beirut",
    "deliveryAnchor": "08:00"
  }
}
```

Runtime authorization, canary source scope, active owner/source checks and guarded
product configuration updates apply before enrollment. Migration
`0043_v1_live_intervals.sql` adds a nullable duration column and lifecycle
triggers. Existing product cadence edits clear a previous custom live override;
simultaneous explicit interval/cadence updates preserve their new interval.
Schedule changes fence in-flight work and increment Feed revisions.

Historical UTC/weekly windows remain readable and explicitly reproducible.
Weekly configurations are excluded from new live cron scheduling. Historical
tables are not rewritten or deleted. New live wire requests reject unsupported
durations, fixed UTC offsets, missing policy/timezone and noncanonical bounds.

Local milestone B proof: 18 timezone/wire tests; focused product, runtime,
selection and RSS-with-real-local-R2 fixtures passed (34 passed, one opt-in live
RSS test skipped). Workspace typechecks passed. The Worker bundled in a dry run
with unchanged containers excluded. The declared full build compiled packages
and web assets, then stopped because the Docker CLI required for the existing
browser container was unavailable.

No remote migration, deployment, real model experiment or deployed proof has run
in this phase. Deployment still requires confirmation of the authorized
development/test target. Adaptive synthesis, disagreement preservation,
long-window grouping and comparative evaluation remain subsequent milestones.

## Interval-aware treatment and synthesis

The same window engine continuously shifts weight from novelty/recency/material change toward impact/persistence/turning points as nominal duration grows. WindowScore remains separate from salience and relevance; suppressed editorial decisions score zero for the window. Repeat penalty reduces novelty without hiding distinct supported facts.

New live 12h/24h selections use exact current StorylineVersion targets where available, with ungrouped Events retained. A 24h approval/signing fixture emits one story citing both EventVersions and both evidence revisions; a short-window selection remains event-focused. Multi-event long-window stories receive HIGH context/DETAILED treatment; simple single-fact stories remain BRIEF. These are guidance categories, not fixed prose lengths.

Synthesis receives typed supported delta and treatment/context guidance. Full communication history stays immutable in SelectionRecord; model context uses only the most recent relevant edition with bounded background. Selection budgets the shaped input payload, rather than evidence text alone. Evidence choice covers distinct delta facts; the deterministic fallback quotes complete short representations for every selected evidence item instead of silently dropping later sides/developments. Larger/translated inputs require the configured bounded model.

Explicit boilerplate can be suppressed only when no additional non-feed terms survive removing the boilerplate. Literal keyword nonmatches remain unknown semantic relevance and influence ranking; they are not sufficient to suppress a local or paraphrased development. Human relevance evaluation is still required.

Verification: treatment/editorial/facts focused run 18 passed; updated facts/model run 6 passed. Existing publication recovery hit its unchanged 5s deadline in the broader run and passed in isolation (4.34s). No timeout/assertion was relaxed. Worker typecheck and diff check rerun before commit. Disagreement-preservation enforcement and experimental scorer/evaluation work follow separately.

## Disagreement and uncertainty preservation

Grounding now checks information preservation as well as claim entailment. Quantities, ordinary negation, uncertainty, attribution-containing qualified statements and unresolved outcomes are conservative required facts from the selected complete representations. Each required side must be quoted from its own exact revision and communicated in the reader-visible claims. Exact full-context extraction satisfies this deterministically; paraphrases/translations require the existing verifier to return offered preserved-fact IDs in the same reserved grounding call. Supporting quotes alone do not establish reader-visible preservation.

A reading ceiling drops an over-budget story whole. A collective preservation verdict is never reused after clipping its opposing claim, and semantic verdicts are accepted only for the complete supported proposal set. Unsupported claims remain omitted and provider-call budgets/recovery remain unchanged. Historical optional verifier results remain readable; missing preservation verdicts can pass only via conservative literal preservation.

Local fixtures: government20 vs unionover100 retains both source sides and unresolved discrepancy; truthful one-sided synthesis fails; loss of 'may' fails; separate 'not approved' outcome survives as a requirement; concise verified paraphrase succeeds with both revision supports; reading-budget clipping cannot create one-sided consensus. Initial preservation file: 7 passed; final expanded fixtures: 9 passed. This is local deterministic/synthetic-verifier proof, not a human quality evaluation or deployed production proof. Quantitative/caveat detection is deliberately conservative; semantic importance and prose usefulness still require frozen human labels.

Final G verification: preservation9 +model2 =11 passed. Word quantities/quantifiers (two versus three; all versus some) and Unicode numbers are protected. Unknown/non-English representations conservatively preserve all offered complete facts; translations rely on the same grounding verdict. Independent final review reported no further material G findings. Publication isolation: seven existing tests passed; recovery still hit its unchanged5s deadline in full-file and individual reruns under current load. This remains reported rather than hidden or relaxed.

## Experimental scorer and evaluation

Live scoring now consumes EventSalienceScorer through the deterministic implementation only. Experimental JEV/GPT clients are independently callable with strict input/output schemas and baseline fallback; they cannot replace relevance, WindowScore, selection, grounding, or startup. No production model flag was introduced. Native clients use bounded one-shot calls, record known actual charges before validating answers, stop on overruns/unknown outcomes, and cannot settle late responses after timeout. Synthetic execution, malformed-answer/cost-overrun and timeout/late-result regressions passed.

The separate Storyline-change experiment is not promoted into production. Frozen eight-Event and three-Storyline inputs, exact executable human labeling schemas, hash validation and reproducible commands are in evaluation/editorial-v1/README.md. Event metrics cover Recall@K/NDCG/noise/omission/human ranking agreement. Distillation metrics cover necessary-fact retention/loss, noise rejection, repetition/redundancy, grounding/unsupported claims, delta correctness, coherence/usefulness and reading estimates. Quality requires genuine frozen human labels; synthetic arithmetic unit annotations are not gold. Repository acquisition gold is unsuitable for these questions.

Actual local baseline measurements: eight inputs, zero model calls/tokens, cost$0, about3–12ms total scoring in small cold runs. This is not a production throughput benchmark. JEV/GPT native latency/cost/quality are unmeasured because local provider keys were unavailable. Paid smoke is opt-in and skipped; there is no provider superiority claim. Human ranking/distillation quality remains PENDING HUMAN LABELS.

New draft records persist actual prompt versions; full-context extractive output records deterministic-extractive-editorial-v2. Legacy drafts without that field retain selected-evidence-v1 on resume. Earlier immutable editions retain their original provenance. RSS assertions now check the explicit new extractive/prompt versions instead of silently attributing changed behavior to v1.

## Final verification in progress

Scorer/evaluation milestone pushed: 3e4b583. Both JEV and GPT use OpenRouter; the owner explicitly confirmed this provider choice. Exact model IDs and local credentials remain pending. No native provider result is claimed.

Fresh workspace typecheck passed all seven projects. Contracts: 44 passed. Full worker publication file: all eight tests passed, including recovery at 2.96 seconds under its unchanged five-second deadline. Earlier deadline failures remain recorded as intermittent; no deadlines/assertions were weakened.

The isolated trusted-browser-api-guard still fails on .dispatchEvent( in packages/agent-runtime/src/browser.ts. Git diff from 5116318 confirms that file and its guard are untouched in this phase. Full broader verification continues.

## Actual bounded OpenRouter execution

After the owner supplied an ignored, untracked local environment file, one explicitly authorized smoke used existing configured IDs `typesafe/jev-1.13` and `openai/gpt-4.1-mini`. No credential was printed, tracked or committed. Earlier unavailable-key statements describe the pre-smoke state.

| Execution | Result | Latency | Reported cost USD | Tokens in/out |
|---|---|---:|---:|---:|
| JEV salience, approval fixture | HIGH (.75), no fallback | 1062.21 ms | .000020286 | 483/50 |
| JEV storyline, approval to signing | MAJOR_STATE_CHANGE | 283.44 ms | .000022344 | 532/72 |
| GPT salience, identical approval input | HIGH (.75), no fallback | 935.01 ms | .000176 | 260/45 |
| GPT storyline, identical transition | MAJOR_STATE_CHANGE | 1029.62 ms | .000236 | 326/66 |

Four requests reported total cost $0.000454630, within the $0.08 reservation ceiling. These are single-fixture smoke timings, not comparative throughput or human quality measurements. The deterministic Storyline baseline calls this transition TURNING_POINT; that disagreement needs human labels, not an invented gold answer. Both actual providers' quality remains PENDING_HUMAN_LABELS. Paid harness command used Node's `--env-file=.env` to supply the process environment, explicitly enabled the smoke and fixed both model IDs. Five evaluation tests passed. No paid request is automatically repeated.

## Whole-phase review corrections

The initial full worker run completed 63 files with 344 passed, six failed and 17 skipped. Two tests hit unchanged five-second deadlines; both full files then passed in isolation (14 tests, 27.90 seconds). Four individual SQL failures plus a 15-test bootstrap suite setup failure came from multiline migration0043 triggers being split by older line-oriented test loaders. Formatting each trigger as one statement, matching0040, fixed the concrete compatibility defect without altering SQL or assertions. Authentication/bootstrap/product/full-migration regression rerun:29 passed. Fix pushed as29b75f6.

Final review reproduced an interaction across previous-communication and disagreement handling: after publishing government20, delta-only evidence could omit its support when union100 arrived. Selection now retains necessary comparison context from the latest related edition's first two material facts. Exact immutable published claim-to-evidence references support paraphrases; old metadata retains conservative matching compatibility. Only current active revisions on the exact target qualify. Two facts with at most three published supports each bound context to six revisions, and full evidence still counts against existing input/inspection budgets. Routine corroboration stays suppressed; history is not accumulated. Selection policy increments tov5. A D1 fixture keeps20/100/unresolved with both revisions, and another rejects a later one-sided100 output while retaining the first edition. Pure20-edition history and paraphrase tests protect bounds and exact support.

Focused comparison-context regression run:33 passed across preservation/editorial/treatment/scoring/facts; final exact-map pure tests:6 passed. This remains conservative bounded context, not a claim of universal semantic memory: unrelated paraphrases can still evade lexical repeat equivalence and require human evaluation.

Practical root `corepack pnpm test`:scripts4/contracts44/core43/connectors100/web5 passed; agent263 passed, two failed, two opt-in skips. Known unchanged `.dispatchEvent(` guard failed as before. The other failure was runtime-timeout's generation-change `flushUntil` scheduling assertion; its complete five-test file passed in isolation unchanged. Real Chromium integration57 passed in the root run. Root recursion stopped before browser-bridge/worker, which are verified separately.

Additional final checks:all seven workspace types passed; focused acquisition adapters21 passed; full build compiled packages/web/worker bundle then failed on unavailable Docker CLI for the existing container. Worker-only `wrangler deploy --dry-run --containers-rollout=none --outdir dist` passed,5040.15KiB (gzip1008.34KiB). No deployment or remote migration occurred. Full worker rerun against corrected code and standalone browser-bridge verification are pending below.

## Final full worker result

`corepack pnpm --filter @distilled/worker exec vitest run --maxWorkers=1` passed all 63 files:369 tests passed, two explicit opt-in tests skipped,663.43 seconds. Both prior five-second deadline failures passed unchanged, all authentication migration-loader failures passed after the formatting correction, and both new previous-edition disagreement regressions passed. The regular full suite deliberately did not load local credentials or repeat the paid smoke. Deterministic eight-input compute in this run was2.13ms with zero calls/tokens/cost, a tiny synthetic sample rather than production throughput.

Implementation commits after5116318:9c103af (previous communication/quiet),69479db (live intervals),e6ca7e0 (adaptive treatment/storyline deltas),3d77bdb (disagreement grounding),3e4b583 (experimental scoring/evaluation),29b75f6 (migration-loader compatibility),0dc01bc (bounded exact prior support). The final documentation commit records verification separately.

No new ownership subsystem or deployed service was added. Editorial/schedule helpers extend existing modules; EventSalienceScorer supplies the requested replaceable evaluation boundary; the standard Temporal library handles timezone rules; the separate evaluation harness does not participate in live selection. Existing connector shared wire schemas stayed unchanged. Additive0043 and optional feed/schedule/selection/claim-support/grounding/draft-provenance fields are the only persistence-contract extensions in this phase. Thirty-one repository files changed across implementation, tests, configuration/lockfile, fixtures and documentation.

## Final reproducible verification commands

Run from the repository root. Results below describe the corrected implementation; aggregate failures and their isolated reruns remain separately reported.

| Command | Result |
|---|---|
| `corepack pnpm --filter @distilled/worker exec vitest run --maxWorkers=1` |63 files,369 passed,2 opt-in skips; exit0 |
| `corepack pnpm --filter @distilled/contracts test` |44 passed |
| `corepack pnpm typecheck` |All7 workspace projects passed, including worker/browser adapters; final exit0 |
| `corepack pnpm --filter @distilled/browser-bridge exec vitest run --maxWorkers=1` |8 files,82 passed,56.91s |
| `corepack pnpm --filter @distilled/agent-runtime exec vitest run test/rss-acquisition.test.ts test/http-html-acquisition.test.ts test/source-acquisition-orchestrator.test.ts test/production-source-acquisition-service.test.ts --maxWorkers=1` |4 files,21 passed |
| `corepack pnpm --filter @distilled/worker exec vitest run src/authenticated-profile-store.test.ts src/authenticated-profile-bootstrap-trigger.test.ts src/authenticated-profile-manual-bootstrap.test.ts src/v1-intelligence/product.test.ts src/migrations-clean.test.ts --maxWorkers=1` |5 files,29 passed after migration fix |
| `corepack pnpm --filter @distilled/worker exec vitest run src/agent-runtime-store.test.ts src/v1-intelligence/engine.test.ts --maxWorkers=1` |Both initial deadline failures isolated:14 passed; final full suite also passed |
| `corepack pnpm --filter @distilled/worker exec vitest run src/v1-intelligence/editorial-facts.test.ts src/v1-intelligence/preservation.test.ts src/v1-intelligence/editorial.test.ts src/v1-intelligence/treatment.test.ts src/v1-intelligence/scoring.test.ts --maxWorkers=1` |33 passed before final exact-map extension; latest full suite includes34 tests across those files, all passed |
| `corepack pnpm --filter @distilled/worker exec vitest run src/v1-intelligence/editorial-facts.test.ts --maxWorkers=1` |Final exact-support/paraphrase/bounds6 passed |
| `corepack pnpm test` |scripts4/contracts44/core43/connectors100/web5 passed; agent263 passed,2 failed,2 skipped; recursion stops before worker/bridge |
| `corepack pnpm --filter @distilled/agent-runtime exec vitest run test/runtime-timeout.test.ts --maxWorkers=1` |Aggregate generation-change scheduling assertion passes unchanged in isolation:5 passed |
| `corepack pnpm --filter @distilled/agent-runtime exec vitest run test/trusted-browser-api-guard.test.ts --maxWorkers=1` |Known deterministic guard still fails on unchanged WebSocket shim; no guard weakening |
| `corepack pnpm build` |Packages/web compiled; worker bundled; existing container build fails because Docker CLI is unavailable |
| `corepack pnpm --filter @distilled/worker exec wrangler deploy --dry-run --containers-rollout=none --outdir dist` |Final exit0;5041.88KiB, gzip1008.74KiB; dry run only |

Actual paid smoke command (model IDs are existing configuration; no credential value appears in this command):

```powershell
node --env-file=.env -e "const {spawnSync}=require('node:child_process'); const env={...process.env,DISTILLED_EDITORIAL_PAID_SMOKE:'true',DISTILLED_JEV_MODEL:'typesafe/jev-1.13',DISTILLED_EDITORIAL_GPT_MODEL:'openai/gpt-4.1-mini'}; const r=spawnSync('corepack',['pnpm','--filter','@distilled/worker','exec','vitest','run','src/v1-intelligence/editorial-evaluation.test.ts','--maxWorkers=1'],{env,stdio:'inherit',shell:true}); process.exit(r.status??1);"
```

Result:five evaluation tests passed, four native provider requests confirmed, no fallbacks, total reported cost USD0.000454630. The ignored/untracked local credential file is not committed. Do not automatically repeat this paid experiment.

Persisted-state proof is local Miniflare D1/R2 only: exact EvidenceRevision/EventVersion/StorylineVersion/assessment/candidate/edition support, publication request and retry/intent state, retained historical support, source revocation and absent quiet-window edition/delivery effects were asserted. No deployed D1/R2/queue or serving production proof was inspected in this phase. All six live durations and Beirut/NewYork DST/anchor behavior passed, historical weekly remains readable, and live weekly scheduling is excluded. Budgeted context uses latest two material facts; arbitrary paraphrase equivalence, semantic relevance and human compression/usefulness remain evaluation limitations. No JEV/GPT superiority or production promotion is claimed.
