# Editorial behavior v1 evaluation

This is a local reproducible harness, not a production canary or a human-quality result. `inputs.v1.json` contains eight frozen synthetic Event inputs drawn from the implementation's behavior fixtures and three separate Storyline change inputs. Their state/identity fields are implementation inputs, not importance labels. Existing repository gold files measure acquisition/extraction and are unsuitable salience or reader-usefulness gold. No appropriate frozen human-labeled set was found.

Run from the repository root:

```powershell
corepack pnpm --filter @distilled/worker exec vitest run src/v1-intelligence/editorial-evaluation.test.ts src/v1-intelligence/salience.test.ts --maxWorkers=1
```

The default run makes no provider calls. It emits `EDITORIAL_EVALUATION` with input hashes, exact ranking, scorer/model/prompt/policy versions, per-input latency and measured efficiency. Human-quality fields say `PENDING_HUMAN_LABELS`. Arithmetic tests use explicitly synthetic mock annotations; they are not benchmark gold. The paid smoke test is skipped by default.

Frozen Event-array hash: `15c13ea9d0d45bb5f0f59f0c458ec82c4a87925b83e5ac4d00291e03ea122229`.

Frozen Storyline-change-array hash: `483fc065ec7cc06e94dd6bc9c41364d5e1cd2fb8998ec8edae8cac382c01e6bc`.

These hash canonical JSON arrays, not formatted file bytes. Do not edit inputs or annotations after inspecting model results. A new corpus requires a new version/hash and independently frozen annotations. A synthetically labeled corpus tests software; real human-quality claims also require a representative independently reviewed news corpus.

## Scorer boundary

`EventSalienceScorer` returns salience components, execution provenance and usage. The live feed transaction uses `DeterministicSalienceScorer` only, with the previous formula and a bounded 6000-character salience representation. Full evidence/delta preservation remains separate. JEV/GPT are experiment-only adapters; no production feature flag, startup key, network call or selector authority was added. Relevance and WindowScore remain independently persisted assessments. Experimental overall scores use the same frozen LOW/MEDIUM/HIGH/CRITICAL bands (`.1/.4/.75/1`); remaining components are explicitly deterministic baseline components, not claimed provider judgments.

The separate Storyline experiment classifies NO_MEANINGFUL_CHANGE, MINOR_UPDATE, MATERIAL_UPDATE, MAJOR_STATE_CHANGE or TURNING_POINT. Its outcome is never promoted into production automatically. A repeat, approval-to-signing and postponed-vote fixture execute the deterministic baseline; native provider execution is pending local credentials.

The JEV client uses the existing native Decisions API pattern after checking [OpenRouter's official JEV example](https://openrouter.ai/blog/tutorials/how-to-use-jev/). The GPT client uses the [official chat-completions API](https://openrouter.ai/docs/quickstart). Both receive the same bounded input and offered criteria, validate typed responses, use one request with no automatic retries, reject redirects and bound response size/time/calls/reserved cost. Known actual charges are recorded even if the answer is malformed or the reservation was exceeded; an overrun stops the client. Missing cost or a lost/late outcome retains the reservation and closes further calls. Tokens may remain unknown independently of known cost. These per-run experimental ledgers are not a resumable production provider-job system.

## Exact human label contracts

The executable strict schemas are exported from `apps/worker/src/v1-intelligence/editorial-evaluation.ts`. All three require `origin: "HUMAN"`, a nonempty `annotatorId`, UTC `createdAt`, and `labelPolicyVersion`. Only an independently human-reviewed file qualifies; model-generated labels must not be represented as human annotations.

Event labels require:

```json
{
  "origin": "HUMAN",
  "annotatorId": "reviewer-identity",
  "createdAt": "2026-10-04T00:00:00Z",
  "labelPolicyVersion": "human-salience-v1",
  "datasetHash": "hash-of-the-exact-event-array",
  "events": [
    {"targetVersionId": "exact-offered-version", "importance": 0, "important": false, "noise": false}
  ]
}
```

This is a shape example, not a valid label file or gold assignment. Label every frozen Event exactly once. `importance` is integer0–3 (negligible, limited, significant, exceptional); `important` answers whether omission would materially hurt reader understanding; `noise` answers whether the item contributes no useful development. An important item cannot also be noise. Use a written rubric and independent reviewers before freezing the file. Set `DISTILLED_EDITORIAL_LABELS_PATH` to that file to evaluate the deterministic run. The harness rejects wrong hashes, duplicate/foreign/missing Event IDs and invalid scalars. It records a label-file hash without changing the file.

Storyline labels use `datasetHash` and `changes: [{id, change}]` with every frozen change ID and the enum above. Supply them to `evaluateStorylineChanges`; the same mismatch protections apply. Compare separate model runs on the identical corpus/labels.

Distillation labels are bound to an exact immutable output snapshot rather than reused across different prose. `evaluateDistillation` accepts `{editionId, claims:[{id,text}], sourceFactIds, candidateEventIds, selectedEventIds}`. Export actual edition claim IDs and exact source-fact references from the retained support graph; reviewers must inspect that support and candidate set. Its label file requires:

- `outputHash`: canonical hash of the exact snapshot.
- `requiredFacts: [{id, retained}]`: human-identified source facts necessary for correct understanding, each referencing an offered source fact.
- `claims: [{id, supported, unnecessaryRepeat, redundant, correctDelta}]`: every reader-visible claim exactly once.
- `noiseEventIds`: all human-identified noise in the offered candidate set.
- `storylineCoherence` and `humanUsefulness`: integer1–5 under the frozen rubric.

Required-fact retention measures signal retention and information loss. Claim labels measure grounding, unsupported-claim rate, unnecessary repetition, intra-edition redundancy and delta correctness. Coherence/usefulness remain human ratings. Reading words and estimated reading minutes at200wpm are measured without labels; estimated minutes are not a timed reader study. Empty denominators return null, not artificial perfect scores.

## Metrics and honest interpretation

Implemented Event metrics: important-event Recall@K, NDCG@K using graded gains, false-noise inclusion, important-event omission, and human pairwise ranking agreement (model ties earn half agreement). All require exact frozen human labels. Efficiency includes latency/p95, throughput, calls, reported versus reserved/unknown costs, tokens and fallback counts. A run with deterministic fallback is not a clean native-model comparison; `nativeModelQualityEligible` and row provenance expose this.

Implemented distillation metrics: signal retention, information loss, noise rejection, repeat rate, redundancy, grounding, unsupported-claim rate, delta correctness, coherence/usefulness and estimated reading time. These are not ROUGE or summary-similarity substitutes. Actual human measurement is pending.

Measured locally before checkpoint: deterministic eight-input runs used zero calls/tokens and cost$0; scoring compute varied about3–12ms across cold local runs, with p95 dominated by initial setup. Those tiny synthetic timing samples are not production throughput or an inference-provider benchmark. Synthetic JEV/GPT transport execution and strict-result/budget/fallback tests passed. No real provider key was present; no native provider latency/cost or quality was measured, and no superiority is claimed.

## Optional bounded provider smoke

Only with authorized local credentials, explicitly set `DISTILLED_EDITORIAL_PAID_SMOKE=true`, `OPENROUTER_API_KEY`, `DISTILLED_JEV_MODEL`, and `DISTILLED_EDITORIAL_GPT_MODEL`, then run the command above. It validates both model names before spending. It makes at most one Event and one separate Storyline request per provider: four requests with total reserved cost ceiling$0.08, response limit8KB and five-second deadlines. Actual unexpected overruns are recorded and stop that client. The output says `SMOKE_ONLY_NOT_COMPARATIVE_QUALITY`; one input is not a comparative benchmark. Do not repeat a lost-outcome smoke automatically or publish credentials/results with source secrets. Complete the frozen human-label protocol before larger quality experiments.

No deployment or remote migration is part of this harness.
