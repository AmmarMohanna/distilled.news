# Reliability validation extension

This directory extends the existing evaluator. It imports the deployed prompts,
schema/grounding validators, completeness correction and reservation/settlement
code. It does not deploy a new evaluator or modify any publishing path.

Current actual observations are in
[`../reports/reliability-v2/RESEARCH_REPORT.md`](../reports/reliability-v2/RESEARCH_REPORT.md).
The continuation from `17edc3ec` is research-only: independent language checks,
bounded consistency correction, benchmark ambiguity audit and an exact frozen
production-core replay adapter. No candidate policy is imported by a deployed
Worker. Previous measurements remain under `reports/reliability-v1/`.

Install the offline-only pinned dependency before running tests:

```powershell
npm ci --prefix evaluation/briefing-quality/validation --ignore-scripts --no-audit --no-fund
```

The account had no funded inference balance during the continuation, and the
user selected finishing available work and pushing. New GPT/Claude full reruns,
nine prepared consistency corrections and the actual frozen-engine paired
campaign have **not** executed. The new language check was applied to saved
development cases only: two of three recorded language swaps were rejected,
one abstained. These outcomes must not be described as a model accuracy gain.

`revalidate.ts` preserves source/reference/paid records and writes a separate v2
diagnostic. `followup-report.py` reproduces the concise current report from
those diagnostics, original metrics, and local check logs. `current-engine.ts`
mirrors `v3-window.ts`'s frozen flags and source metadata; `retrieve-frozen.mjs`
uses SELECT-only source reads. An evaluator snapshot without those frozen
records is not silently treated as an actual deployed-engine input.

Independent detector thresholds are explicit, not calibrated probabilities:
whole-narration top score >=0.30 with margin >=0.12; minimum three words and
twelve letters; mixed-sentence detection uses weaker evidence only to abstain.
Proper names, quote-only material, unsupported languages and inadequate
evidence abstain. Short headlines may remain unknown. No threshold was tuned
to improve an observed benchmark score; tests exposed the detector's short-text
uncertainty before development revalidation.

Independent code review added two regression fixes. Arabic script alone cannot
establish narration: absent a syntactic/news cue, even a long Arabic list of
proper names abstains. A consistency correction now preserves both original
and replacement raw replies. Clearing any prior adverse/uncertain claim,
development or item assessment requires an explicit source-grounded
`CORRECTION_RECONSIDERED:<key>` limitations entry; otherwise the correction
fails. This records reconsideration rather than proving its semantic validity.
The original raw response remains available for auditing claim meaning.

The post-review zero-call results are retained separately in
`OFFLINE_REVALIDATION_R2.json`; the first diagnostic is not overwritten. Use
`revalidate.ts r2` to reproduce that revision. The detector classifies 19/24
eligible synthetic language packets and abstains on five, plus 4/6 real-source
controls with two abstentions. Full-model completion counts are unchanged.

The older protocol and result history follows.

Earlier observations are in
[`../reports/reliability-v1/FINAL_REPORT.md`](../reports/reliability-v1/FINAL_REPORT.md).
The initial disk-interrupted state is preserved in `PARTIAL_REPORT.md`. The
resumed experiment executed both challenge sets, chronological replays and
published-output assessment/retrieval. Missing paid assessments are identified:
the provider account balance reached about $0.043. Passing tests is not model
evaluation.

## Artifacts and references

- `protocol.json` was frozen before provider inference. The ignored
  `private/reliability-v1/freeze.json` records the UTC time and SHA-256.
- `build_controls.py` creates 42 matched multilingual constructed-source cases,
  with seven event groups. Labels and source-relative mutation rationales are
  separate from candidate packets. Legitimate paraphrases and a necessary update
  are correct controls.
- `real_controls.py` creates a separate 12-case retained-real-statement challenge
  set. It preserves semi-gross weight and possible-versus-occurred modality. These
  are historical source-conditioned challenges, not original full-window scores.
- `offline.ts` uses the existing `judge()` and its SQL financial transitions,
  against separate local SQLite ledgers and an immutable file-backed R2 adapter.
  Requests, raw provider responses, generation IDs, usage and failed cases remain
  private. No API key or authorization header is written into these artifacts.
- `run.ts` never opens reference labels. It uses the existing three-stage review
  and the original one-time missing-coverage-row correction.
- `resume.ts` checks original code/input hashes, skips terminal results and
  unresolved paid work, and only resumes unstarted/fully settled safe stages.
  Incomplete zero-call caches are quarantined, not confused with paid ledgers.
- `analyze.py` reports target-category confusion, case-level detection, language
  strata, disagreement, missing/failed work, actual cost from **all** ledgers and
  unresolved reservations. Unavailable ratios are null.
- `historical.py` and `baseline_bridge.py` execute the existing extractive
  baselines on the exact local retained evidence. `paired.ts` reuses `runOne()`
  for V3 and the existing single-editor baseline, with independent chronological
  reader histories and opaque prior IDs for judge blinding.

The resumed Windows run exposed a CP1252 stdin/stdout problem in the Python
bridge. `test_bridge.py` reproduced the keyword hashing error before the fix;
explicit UTF-8 corrected transport without changing `evaluate.py:baseline`.
`correct_baseline_bridge.ts` records an audit: six all-headlines outputs were
identical; six keyword outputs needed new deterministic execution. Failed
artifacts and their paid scoring attempts remain preserved. The supplement is
kept under `bridge-corrected/` and `bridge-scored/`.

`retained_plan.py` selects chronological metadata strata; `existing_reports.mjs`
retrieves existing deployed reports and checks snapshot hashes without invoking
the judge. `final_report.py` combines executed challenge, paired and actual
published observations while keeping them separate, with complete accounting
and explicit provider/schema/storage failure states. It never claims certified
held-out quality from the incomplete post-freeze material.

Labels are independently derived from retained source assertions and controlled
transformations, with AI curation. They are not labels produced by either tested
judge and are not independently adjudicated human gold. Importance is restricted
to explicit feed requirements in the controlled coverage fault. Translations and
mutations share their underlying event group.

The prespecified category scoring mask does **not** assert that secondary effects
of a fault are negative. Correct controls are negative for all seven categories;
an injected fault's primary category is positive. Report category precision in
that context, alongside case-level detection and review availability.

## Reproduction

Run from the research worktree root with the repository's installed dependencies.
No new package installation is required. The current host uses Node 22.17.0,
Python 3.13, and Node's experimental `node:sqlite`. Local dependency junctions
reuse installed packages and are Git-ignored; they are not repository changes.

```powershell
python -m unittest discover -s evaluation/briefing-quality/validation -p 'test_*.py'
node node_modules/vitest/vitest.mjs run --config evaluation/briefing-quality/vitest.config.ts
python evaluation/briefing-quality/validation/build_controls.py evaluation/briefing-quality/private/reliability-v1
python evaluation/briefing-quality/validation/analyze.py evaluation/briefing-quality/private/reliability-v1 --out evaluation/briefing-quality/private/reliability-v1/analysis.json
python evaluation/briefing-quality/validation/report.py evaluation/briefing-quality/private/reliability-v1 evaluation/briefing-quality/reports/reliability-v1
python evaluation/briefing-quality/validation/final_report.py
```

Offline TypeScript validation passed with the existing generated Worker bindings
included as inputs (omitting them produces unrelated missing `Env` fields):

```powershell
node node_modules/typescript/bin/tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --skipLibCheck --esModuleInterop --types node apps/worker/node_modules/@cloudflare/workers-types/index.d.ts evaluation/briefing-quality/worker/worker-configuration.d.ts evaluation/briefing-quality/worker/src/secrets.d.ts evaluation/briefing-quality/validation/offline.ts evaluation/briefing-quality/validation/run.ts evaluation/briefing-quality/validation/resume.ts evaluation/briefing-quality/validation/paired.ts
```

`report.py` regenerates the **interrupted-study** report. Its unperformed
experiment statements must be updated from actual artifacts if additional study
phases are subsequently executed; it is not a generic completion certificate.

Provider calls require the user's applicable authorization and existing key-file
path in `DISTILLED_EVAL_KEY_FILE`; key contents are read only in process memory.
The current request explicitly authorized real offline experiments. Provider
account credit remains shared with staging. No app-level monetary ceiling is
introduced by this extension.

For a fresh, authorized run with sufficient disk space:

```powershell
node packages/briefing/node_modules/tsx/dist/cli.mjs evaluation/briefing-quality/validation/run.ts evaluation/briefing-quality/private/reliability-v1/blind-controls.json evaluation/briefing-quality/private/reliability-v1/controls-run
```

For the **existing interrupted run**, do not restart it under a new identity or
delete ledgers. Use the guarded resume path after freeing disk space:

```powershell
node packages/briefing/node_modules/tsx/dist/cli.mjs evaluation/briefing-quality/validation/resume.ts evaluation/briefing-quality/private/reliability-v1/blind-controls.json evaluation/briefing-quality/private/reliability-v1/controls-run
```

Reconcile unknown outcomes separately using preserved receipts and the existing
accounting recovery implementation. A transport exception or absent result is
not permission to resend the same operation. Failed validated reviews remain in
the primary denominator; do not tune prompts on them and call a rerun held-out.

For historical paired preparation, supply the retained and public-export file
paths to `historical.py SOURCE PUBLIC OUTPUT --materialize`; then use
`paired.ts PRIVATE_PAIRED_PLAN PRIVATE_NEW_OUTPUT` and `run.ts` on its blind
generated packets. This preparation is not yet an executed paid comparison.
Source text, published prose and responses stay ignored under `private/`.

Untouched testing requires a post-freeze retained snapshot roster, original
snapshot hashes, full input qualification, source-only event grouping and an
explicit independence decision before candidate outputs are judged. A later
timestamp, a different article URL or another translation is not sufficient.
