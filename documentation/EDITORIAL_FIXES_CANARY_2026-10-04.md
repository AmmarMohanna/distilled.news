# Editorial fixes and frozen RSS replay — 2026-10-04

Starting checkpoint: `dbc626838d4122f2b7b0d0bedd3b345d26909b65`, branch `codex/v1-downstream-pipeline`.

## Implemented policy

The guarded v1 runtime now prefers deterministic eligibility/prefilter → JEV Event salience → GPT fallback → deterministic final fallback. Storyline salience uses GPT → deterministic fallback; JEV Storyline judgment is not validated or enabled. This is separate from Storyline-change classification. Final selection still combines persisted EventSalienceAssessment, UserRelevance and WindowScore, then applies editorial repetition, diversity and synthesis budgets. Models cannot discover sources, alter intelligence identity or publish directly.

Only `overallScore` comes from semantic salience judgment. The other assessment components remain deterministic and are explicitly labeled in provenance. The frozen shared assessment schema remains vendor-neutral. An immutable `salience_provenance` sidecar references the assessment and exact input/result, including model, prompt/policy, judgment, confidence when returned, attempts, latency, reported/reserved usage and fallback route. `salience_intents` and `salience_results` use the existing document store; no migration or new service is required.

Paid calls occur outside retryable CAS transactions after durable intent commitment. Cached results prevent repeated model calls. An expired intent with unknown outcome conservatively falls back without reissuing the call. Contention does not consume briefing request retries. Durable window budgets cap calls at 20 and cost at $0.10, with $0.02 reserved per possible call; runtime also bounds provider latency and checks approved active evidence, exact current target, Feed revision and source approval before every actual provider request. Revocation during JEV prevents a subsequent GPT call.

Configuration: `V1_SALIENCE_POLICY=DETERMINISTIC` selects the explicit baseline. Otherwise semantic routing is preferred, using `OPENROUTER_API_KEY`, optional `V1_JEV_SALIENCE_MODEL` (default `typesafe/jev-1.13`) and `V1_GPT_SALIENCE_MODEL` (default `openai/gpt-4.1-mini`). Missing credentials, provider failure, uncertain outcomes and exhausted budgets retain labeled deterministic fallback. Existing downstream enablement and FeedSource approval guards remain required. Credentials and local reports are ignored and must not be committed.

## Language defect and resolution

The extractive writer previously compared absent evidence language directly against output language, treating UNKNOWN as incompatibility. Resolution now follows item declaration → source-feed XML declaration → trusted Source metadata with a reference → UNKNOWN. No existing safe detector was found; none was introduced. `und` and `und-Latn` remain UNKNOWN. Source-feed language is distinct from Distilled output language. No DW-specific inference was added.

Resolution provenance is validated and retained through supplied payload acquisition. UNKNOWN permits exact copied/extracted claims; it does not establish the output language or authorize translation. A known different language without an authorized multilingual writer fails with `TRANSLATION_REQUIRED`. Actual extractive capacity limits fail with `EXTRACTIVE_CAPACITY_UNSUPPORTED`. These remain FAILED, not QUIET. A synthetic authorized Arabic-to-English writer test verifies the existing generative seam and exact evidence quotes; it is not a live multilingual model evaluation.

## Frozen inputs and preservation

Original artifacts: `.local-reports/rss-editorial-canary-2026-10-04/`.
New version: `.local-reports/editorial-fixes-canary-2026-10-04-v1/`.

Corpus SHA-256: `16e0a591731274890548418bf7e0db20596659cd9b28a8938308f7db5efa32db`.
Frozen Event input hash: `fe76d817b3c9ec9cac73b3f7c4c1589764a95d43032c0c2ad2a029520919da81`.

The corpus contains 30 RSS excerpts: BBC World 12, Al Jazeera 12, DW 6. It was not recollected. Original manifest files were checked before/after replay. EventVersion, StorylineVersion and EventMembership graphs were compared with the original histories and remained unchanged. All original artifacts, including incomplete diagnostic attempts, were retained. Final corrected artifacts are `routing-v3.json`, `replay-{30,120,360,1440}-v2.json`, `summary-v2.json`, `review-v2.html`, and `manifest-v2.json`. Earlier routing/replay diagnostic versions are excluded from final conclusions.

The first local replay adapter passed evaluation-row columns into a strict scorer schema, incorrectly producing adapter fallback. Canonical projection fixed this test-harness defect. A second review found zeroed cached usage bypassed production budget simulation. Final routing-v3 preserves original judgment usage for budget simulation while reporting actual cached replay expenditure separately as zero. No new provider calls were needed for these corrections.

## JEV diagnosis and salience canary

All 16 original fallback cases were valid structured judgments with confidence below the unchanged 0.6 threshold. Counts: below threshold 16; malformed output 0; parse/schema incompatibility 0; provider/model failure 0. The 16 bounded rechecks remained below threshold (0.29–0.52). Ambiguous input, opinion/background, insufficient evidence and prompt mismatch are not independently established causes without human annotation. No threshold was lowered. OpenRouter describes JEV confidence as probability concentration; it is not a human-labeled accuracy result: [official JEV guide](https://openrouter.ai/blog/tutorials/how-to-use-jev/).

Standalone frozen Event routing: native JEV 14, low-confidence JEV 16, GPT fallback 16, deterministic fallback 0. Frozen Storyline versions: native GPT 30, deterministic fallback 0. Historical accepted native JEV and GPT Event judgments were reused; confidence absent from historical records was not invented. Future runtime judgments retain it.

New paid work was exactly 46 calls, all with reported cost:

| Work | Calls | Cost USD | Total model latency ms | Nearest-rank p95 ms |
| --- | ---: | ---: | ---: | ---: |
| JEV diagnostic rechecks | 16 | 0.000374514 | 5611.2063 | 913.6332 |
| GPT Storyline salience | 30 | 0.0059724 | 30915.9837 | 1361.3603 |
| Total | 46 | 0.006346914 | 36527.19 | 1276.7283 |

The standalone combined routing artifact represents 76 historical/simulated calls and $0.009852028 across 60 targets. These are not additional paid calls. All four corrected chronological replay histories used cached judgments: actual additional calls 0, actual additional cost $0.

## Old versus corrected histories

| Window | Windows | FAILED old → corrected | QUIET old → corrected | Editions old → corrected | Claims old → corrected |
| --- | ---: | ---: | ---: | ---: | ---: |
| 30m | 49 | 6 → 0 | 29 → 29 | 14 → 20 | 18 → 27 |
| 2h | 13 | 6 → 0 | 2 → 2 | 5 → 11 | 7 → 20 |
| 6h | 5 | 4 → 0 | 0 → 0 | 1 → 5 | 2 → 13 |
| 24h | 2 | 0 → 0 | 0 → 0 | 2 → 2 | 4 → 4 |
| Total | 69 | 16 → 0 | 31 → 31 | 22 → 38 | 31 → 64 |

Every corrected claim passed exact stored-revision/quote grounding: 64 checks, 0 failures. Exact repeated claims within each history: 0 before and after. Published-window replay/idempotency was checked. These are local simulated editions, not production publication.

Persisted assessment routing under actual production budget policy:

| History | Native JEV | GPT Event fallback | Native GPT Storyline | Deterministic budget fallback |
| --- | ---: | ---: | ---: | ---: |
| 30m | 14 | 16 | 0 | 0 |
| 2h | 14 | 16 | 0 | 0 |
| 6h | 12 | 13 | 0 | 5 |
| 24h | 0 | 0 | 27 | 2 |

The 24h history assesses 29 latest Storyline targets; the standalone frozen dataset includes 30 versions. Budget fallback is intentional and visible, not native semantic output.

Corrected candidate omissions: 30m SOURCE_DIVERSITY 3; 2h SOURCE_DIVERSITY 1 and SYNTHESIS_BUDGET 9; 6h SOURCE_DIVERSITY 3 and SYNTHESIS_BUDGET 14; 24h SYNTHESIS_BUDGET 25. These reason codes describe constraints, not proof that omitted stories were editorial noise. Full exported histories retain candidates, scores, selections, previous-edition deltas, treatments, evidence, editions and provenance.

## Limits and self-review

The replay validates routing, language handling, durable budget behavior, quiet/failed separation, immutable provenance and exact extractive grounding. It does not establish editorial quality, source truth, semantic repeat quality, Recall@K, NDCG or JEV superiority. Human labels remain required. Evidence is RSS excerpts, not full articles; collection is bounded and partial; publication timestamps proxy arrival, with UTC boundary padding. Cached replay exercises charged budget policy but does not reproduce live network elapsed-time deadline exhaustion. Cross-publisher behavior is only exercised when overlapping evidence actually occurs; publisher count alone does not prove disagreement/corroboration quality.

Self-review confirmed semantic preference in guarded runtime, vendor-neutral contracts, transparent fallback, per-call authorization, no guessed language, explicit unsupported translation/capacity failures, distinct QUIET/FAILED states and unchanged historical artifacts. No architecture redesign, new service, migration, production source change or deployment occurred.

## Verification

Results and exact commands are recorded below. No assertions or timeouts were weakened. Two editorial tests timed out during an earlier focused run concurrent with the large Miniflare replay; that run was interrupted and the complete focused suite rerun with one worker. Earlier two publication timeouts passed on unchanged isolated file rerun. These timing observations are retained rather than reported as passing first attempts.

| Command | Observed result |
| --- | --- |
| `corepack pnpm --filter @distilled/worker exec vitest run src/v1-intelligence/salience.test.ts src/v1-intelligence/salience-router.test.ts src/v1-intelligence/salience-persistence.test.ts src/v1-intelligence/rss-pipeline.test.ts src/v1-intelligence/publication.test.ts src/v1-intelligence/runtime.test.ts src/v1-intake/rss-language.test.ts --maxWorkers=1` | Earlier focused checkpoint: 35 passed, 3 opt-in skipped. Subsequent regressions included in larger run below. |
| `corepack pnpm --filter @distilled/worker exec vitest run src/v1-intelligence src/v1-intake src/v1-downstream-runtime.test.ts --maxWorkers=1` | 180 passed, 6 skipped, 4 engine test timeouts at unchanged 5000ms; 29 files passed, 1 failed, 1 skipped. |
| `corepack pnpm --filter @distilled/worker exec vitest run src/v1-intelligence/engine.test.ts --maxWorkers=1` | All 6 passed in isolation, including the 4 timeout cases. Engine assertions/limits unchanged. |
| `corepack pnpm --filter @distilled/worker exec vitest run --maxWorkers=1` | 396 passed, 6 opt-in skipped, 2 failed; 68 files passed, 2 failed, 1 skipped. All 6 engine tests passed in this run. Failures were recovery `after_tool_creation` at 45000ms and evidence replay setup hook at 10000ms followed by `Server is not running`. |
| `corepack pnpm --filter @distilled/worker exec vitest run src/agent-runtime-recovery.integration.test.ts src/v1-intake/evidence.test.ts -t 'recovers after_tool_creation\|same acquired result replays exactly once' --maxWorkers=1` | Both full-worker failure cases passed unchanged in isolation (recovery 16144ms, evidence replay 1303ms); 25 other tests filtered out. |
| `corepack pnpm --filter @distilled/agent-runtime exec vitest run test/rss-acquisition.test.ts test/browser.integration.test.ts --maxWorkers=1` | 59 passed, including real Chromium security/recovery tests. |
| `corepack pnpm --filter @distilled/agent-runtime exec vitest run --maxWorkers=1` | 264 passed, 2 opt-in skipped, 1 known unrelated source-text guard failure; 22 files passed, 1 failed, 2 skipped. |
| `corepack pnpm --filter @distilled/agent-runtime exec vitest run test/trusted-browser-api-guard.test.ts --maxWorkers=1` | Same guard assertion failed in isolation: `packages/agent-runtime/src/browser.ts: .dispatchEvent(`. This file and guard test were unchanged; failure matches the prior runtime checkpoint and was explicitly preserved. |
| `corepack pnpm --filter @distilled/browser-bridge exec vitest run --maxWorkers=1` | 82 passed across 8 files, including real bridge/Chromium, adversarial cleanup and synthetic secret-leak regressions. |
| `corepack pnpm --filter @distilled/connectors test` | 100 passed. |
| `node --test scripts/*.test.mjs` | 4 passed. |
| `corepack pnpm --workspace-concurrency=1 --filter @distilled/core --filter @distilled/web -r test` | Core 43 and web 5 passed. |
| `corepack pnpm --filter @distilled/contracts test` | 44 passed. |
| `corepack pnpm --filter @distilled/worker typecheck` | Passed. |
| `corepack pnpm typecheck` | All workspace packages passed. |
| `git diff --check` | Passed; normal repository CRLF conversion warnings only. |

Neither larger worker run is claimed as green. Isolated success and the full-run engine pass establish timing-sensitive failures rather than assertion mismatches; exact cause of scheduler/setup delays was not independently measured. Full package results are collected separately rather than claiming the root recursive test command was run successfully.

The opt-in canary phases also passed: FREEZE_STORYLINES, bounded SCORE, corrected chronological REPLAY (630.907 seconds), and REPORT. SCORE diagnostic revisions and cached replay corrections made no additional provider calls beyond the 46 reported above. The report validates unchanged original artifact hashes and exact support for all 64 corrected claims.

Replay commands (already completed; SCORE uses durable cached intents and must not be treated as permission for unbounded paid re-evaluation):

```powershell
$env:DISTILLED_EDITORIAL_FIXES_CANARY='true'
$env:DISTILLED_EDITORIAL_FIXES_PHASE='FREEZE_STORYLINES' # then SCORE, REPLAY, REPORT
corepack pnpm --filter @distilled/worker exec vitest run src/v1-intelligence/editorial-fixes-canary.test.ts --maxWorkers=1
```
