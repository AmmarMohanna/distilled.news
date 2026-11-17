# Real RSS editorial canary — 2026-10-04

This completed local experiment uses real approved RSS content and actual OpenRouter salience calls. It is an unlabeled evaluation dataset, not a deployment proof or a scorer-quality winner. Production configuration, source subscriptions, architecture, contracts and migrations were not changed.

## Frozen corpus and provenance

The final user instruction approved BBC World plus Al Jazeera English and DW World for this local canary. The latter two approvals did not add production subscriptions. The retained corpus is the available RSS material published within **2026-10-03T13:58:34.957Z to 2026-10-04T13:58:34.957Z**, capped at 12 items per source, ordered chronologically with source-item identity as a deterministic tie breaker:

| Approved source | RSS URL | Retained items | Declared XML language |
|---|---|---:|---|
| BBC World | https://feeds.bbci.co.uk/news/world/rss.xml | 12 | en |
| Al Jazeera English | https://www.aljazeera.com/xml/rss/all.xml | 12 | en |
| DW World | https://rss.dw.com/rdf/rss-en-world | 6 | Missing; preserved as unknown |

These are 30 RSS excerpts, not full articles. Coverage remains PARTIAL: finite feed snapshots and a per-source cap cannot prove complete historical coverage. The manifest preserves excluded rows/reasons and raw source XML with hashes. Published timestamps are simulated arrival proxies; the experiment does not reconstruct actual historical arrival, original article bodies, or source edit histories.

Corpus input hash: `16e0a591731274890548418bf7e0db20596659cd9b28a8938308f7db5efa32db`.

Chronological canonical intake/acquisition/intelligence produced 30 accepted evidence revisions, 29 Event identities / 30 Event versions, and 29 Storyline identities / 30 Storyline versions. One Event version has two independent publisher supports under the current algorithm; human review must establish whether that grouping is correct. No automatic claim of cross-source correctness or disagreement handling follows from that count.

Frozen Event salience input hash: `fe76d817b3c9ec9cac73b3f7c4c1589764a95d43032c0c2ad2a029520919da81`.

The canonical input array was frozen before either paid scorer ran. All arms receive identical text, identities, Feed revision, version and support features. Recency is fixed at one for this isolated salience comparison; replay retains the existing publication-window recency calculation. Durable source run/sequence assignment and deterministic UUIDs are local replay fixtures, not production connector-completion claims.

## Briefing replay results

Each scorer has an independent history for each cadence. Canonical UTC calendar windows enclose the frozen corpus, which adds boundary padding: 49 half-hour, 13 two-hour, five six-hour and two daily windows per arm. Padding adds no evidence or claimed coverage. The total is 12 histories / 207 windows.

The following counts were the same for deterministic, JEV-hybrid and GPT arms; identities/order can still differ and are preserved in the report:

| Cadence | Windows per arm | Published editions | Quiet windows | Failed windows |
|---|---:|---:|---:|---:|
| 30 minutes | 49 | 14 | 29 | 6 |
| 2 hours | 13 | 5 | 2 | 6 |
| 6 hours | 5 | 1 | 0 | 4 |
| 24 hours | 2 | 2 | 0 | 0 |

There are 66 retained simulated editions containing 93 reader-visible claims across the independent histories. Every published claim was checked against its exact retained EvidenceRevision and quote. Claim text equals the quoted excerpt in this fixed deterministic synthesis experiment; this is exact grounding verification, not an independent human judgment of article truth or usefulness.

No exact reader-visible claim recurred across editions within any individual arm/cadence history. Human unnecessary-repeat rate remains null/pending. Cross-cadence comparisons are separate simulated products; repeats across those independent histories are not counted as repeated delivery to one reader.

The current editorial decisions, candidate assessment references, score components, selections, source diversity/budget omissions, treatments, prior communicated states, draft/grounding/edition records and raw evidence are retained. The 30-minute and two-hour deterministic histories each contain one previous-edition comparison with `MATERIAL_NEW_FACT`. Adaptive treatment includes STANDARD and DETAILED; no synthetic editorial change was inserted into this corpus.

## Scorer execution and comparison limits

| Scorer | Actual calls | Reported cost USD | Scoring time total | p95 request/score latency | Fallbacks |
|---|---:|---:|---:|---:|---:|
| Deterministic | 0 | 0 | 8.62 ms | 0.74 ms | 0 |
| JEV (`typesafe/jev-1.13`) | 30 | 0.000702828 | 9.73 s | 449 ms | 16 |
| GPT (`openai/gpt-4.1-mini`) | 30 | 0.0059692 | 28.67 s | 1,135 ms | 0 |

Total actual calls: **60**. Reported total cost: **USD 0.006672028**, below the USD 1.60 reservation ceiling / maximum 80 calls. No calls were repeated to polish results. The persisted paid intent blocks automatic retries of interrupted/unknown outcomes. JEV's 16 fallbacks are all `EXPERIMENT_LOW_CONFIDENCE`; that arm is explicitly hybrid and not eligible as a clean native JEV comparison. GPT reported 9,487 input and 1,359 output tokens. Aggregate JEV tokens remain unknown because the existing fallback result contract does not preserve token counts for those rows.

The test-only counterfactual seam substitutes each frozen Event's overall salience score before the existing selection logic; other score components, relevance, window logic, budgets and publication remain unchanged. Exact score/prompt/model/policy/fallback sidecars identify the experimental score; unchanged production assessment policy labels must not be interpreted as native production JEV/GPT provenance. The seam is scoped to the Vitest module and introduces no production scoring flag.

Storyline salience remains deterministic. Consequently the daily Storyline comparisons do not demonstrate native JEV/GPT long-window Storyline scoring. Synthesis also remains the current deterministic extractive writer for all arms, isolating salience/selection effects. This is not a live GPT prose comparison.

Relative to deterministic selection, each experimental Event arm changed the selected target set in one 30-minute window, two two-hour windows and three six-hour windows; daily selections were unchanged. Full selected-order differences, candidate scores and failed-window selections are preserved separately. These descriptive differences do not establish improved selection.

## Observed failures and implementation follow-ups

- Each arm recorded 16 failed short-window publication attempts, all `TEMPORARY_UNAVAILABLE`. Selected evidence includes unknown-language DW revisions in each failure. The deterministic writer rejects evidence whose language differs from the configured English output; missing source language is therefore a concrete acquisition-to-synthesis compatibility issue. No English value was invented, no failure was relabeled quiet, and no production fix was made.
- `SYNTHESIS_BUDGET` omitted 8 candidates in the deterministic two-hour histories, 17 in six-hour histories and 25 in daily histories. `SOURCE_DIVERSITY` also omitted candidates. Those are runtime constraints, not human noise labels. Review the omitted necessary facts before changing budgets or declaring these omissions acceptable.
- Initial harness attempts exposed source-insertion scope invalidation, Windows SQLite journal path length and noncanonical rolling windows. Corrected setup uses the existing enrollment API after all source rows exist, shorter local persistence paths and canonical windows. Original failed artifacts are retained separately; they are excluded from the corrected comparison. Source content and paid judgments were not recollected.
- Human annotation is the next step for quality conclusions. Review the cross-publisher grouping, important omissions, caveat/fact retention, repetition, delta correctness and usefulness before changing JEV confidence policy or promoting any scorer.

## Local artifacts and human annotation

All captured content and model result artifacts remain ignored under `.local-reports/rss-editorial-canary-2026-10-04/`. They are retained locally and not committed as third-party fixtures. Persistent local D1/R2 replay stores are under `.local-reports/rcdb/`; initial canonical/failed stores are retained under the report directory's `storage/`.

- `review.html`: source items, Event/Storyline versions, side-by-side scores, per-window outputs, omissions/reasons, treatments, previous-edition deltas, failures, grounding, latency, cost and recurrence.
- `annotation-blind.html`: source/immutable intelligence review without scorer outcomes or briefing choices, for blind importance labeling.
- `corpus.json`, source XML files, `events.frozen.json`, `canonical-provenance.json`: frozen original inputs and exact support graph.
- `scorer-arms.json`, `scorer-selection-differences.json`, `replay-*-v2.json`: scorer and complete pipeline histories. Each replay retains typed sidecars plus exports of the local canonical tables; raw payloads remain in local R2.
- `event-annotations.template.json`: every offered Event version, with importance/important/noise intentionally null.
- `edition-annotations.template.json`: exact edition/claim IDs, output-bound hashes and facts behind offered candidates, including omitted candidates. Necessary-fact judgments must be human supplied.
- `artifact-manifest.json`: exact file hashes, canonical intelligence hash and verification counts. Annotate copies; do not edit frozen evidence or model outputs.

Human label contracts live in `evaluation/editorial-v1/README.md` and the executable schemas in `editorial-evaluation.ts`. Fill real reviewer identity, UTC timestamp and rubric version; then create strict HUMAN label objects from the templates, removing template-only fields/notes. Event importance is 0–3; important means omission materially hurts understanding, noise means no useful development. Never default nulls to zero/false or call model-generated labels human gold. Distillation labels must use their exact output hash, all offered claim IDs and the supplied fact IDs. Freeze independent annotations before calculating Recall@K/NDCG or human quality metrics.

## Reproduction and checks

Default test runs neither fetch sources nor load credentials nor spend provider budget. Live phases require `DISTILLED_RSS_EDITORIAL_CANARY=true` and `DISTILLED_RSS_CANARY_PHASE`:

1. `CAPTURE`: one bounded request per approved source; refuses to overwrite an existing corpus.
2. `FREEZE_EVENTS`: chronological canonical intake/acquisition/intelligence; refuses to replace frozen Event inputs.
3. `SCORE`: explicit authorized paid scoring on the frozen inputs. Load the ignored local `.env` with Node's `--env-file` wrapper; never print credentials. Known completed rows are reused; pending unknown paid outcomes require reconciliation.
4. `REPLAY`: set `DISTILLED_RSS_CANARY_ARM` to DETERMINISTIC, JEV or GPT; performs four independent histories without paid calls and validates cache hash/target identities. Complete matching histories are reused; partial histories require a new storage/run version.
5. `REPORT`: regenerate report and annotation scaffolding. Incomplete/unmatched comparisons are pending, not differences against an empty baseline.
6. `VERIFY`: require all 12 complete histories, exact frozen scorer identities, identical immutable intelligence traces, chronological selection/evidence bounds and exact published claim quotes; emit the artifact manifest.

Run the phase-selected harness from the repository root:

```powershell
corepack pnpm --filter @distilled/worker exec vitest run src/v1-intelligence/rss-canary-live.test.ts --maxWorkers=1
```

The date/run directories intentionally identify this frozen first dataset. A new corpus needs a new run version and fresh annotations, not edits to these files.

Verification: capture, corrected canonical Event freezing, paid scorer run, all three corrected replay phases, final report and full artifact verification completed. Artifact verification checked 12 histories, 207 windows, 93 exact published claims and identical intelligence hash `63809e3fb8d92986a56f6b853949653eb178ed1a005f6f7c378460c9a3125e04`. Offline canary/salience/evaluation tests passed 15 tests with two paid/live opt-in skips; contracts passed 44 tests; full workspace typecheck passed all seven packages. The focused v1 intelligence suite (`vitest run src/v1-intelligence --maxWorkers=1`) passed 18 files / 101 tests, with five explicit live/paid opt-in skips, in 261.13 seconds. No regression assertion or existing timeout was changed to obtain those results. The full worker/workspace test suites are not claimed rerun for this evaluation-only change.

The ignored `.local-reports/real-rss-editorial-canary-2026-10-04.zip` is a portable annotation bundle of the frozen JSON exports, source XML, reports, blank templates, artifact manifest and this runbook. Persistent Miniflare D1/R2 files remain local and are not required to read the exported evidence/intelligence/edition snapshots. Do not publish the bundle as an independently human-labeled benchmark until annotation is complete.
