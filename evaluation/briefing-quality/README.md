# Briefing quality and user evaluation

The separate [Cloudflare evaluator](worker/README.md) now monitors the staging
deployment asynchronously, with private D1/R2 results and its own $5/day LLM-review
ledger. The user authorized reuse of the existing OpenRouter key. Grafana aggregate export is enabled and its OTLP ingestion response has been verified. Academic
experiments and human calibration remain separate, and are not activated by this.

For the recurring offline check runner and background, see
[Continuous evaluation](CONTINUOUS_EVALUATION.md). Run
`python evaluation/briefing-quality/continuous.py` for a single pass and a JSON
health report. The GitHub Actions workflow runs on matching pushes and pull requests; daily
scheduling additionally requires it on the default branch.

November 2 regression expansion: 68 Python tests, 67 replay/Worker tests, 100 existing
briefing-engine tests and three exporter tests (238 total), plus two TypeScript checks.
These checks use synthetic/provider-double fixtures. Live monitoring records are
separate; neither establishes human factual quality or participant outcomes.

Use [the current report](reports/FINAL_REPORT.md), [human handoff](HANDOFF.md), [review protocol](REVIEW_PROTOCOL.md), and [spending proposal](reports/PAID_RUN.md). Overall evaluation remains incomplete. `reports/INITIAL_REPORT.md` and `suite.py` preserve the initial experiment; legacy `suite.py audit/score/study` are superseded by the commands below.

Full articles, generated briefings, reviewer identities and participant data must remain under Git-ignored `private/`. The authoritative current artifacts are `private/run-20261027/`, `private/challenges-current/`, `private/preflight-current/` and `private/preparation-diagnostics.json`. Earlier private attempts remain preserved. Public reports contain aggregate metadata and hashes.

Requires Python 3.11+ standard library, Node 24 (tested 24.11.1), and installed repository TypeScript/Vitest plus briefing-package tsx. No Python packages, credentials or network are needed offline. The host lacked a pnpm executable; these commands use installed binaries. Sandbox escalation was needed for the TypeScript loader's filesystem/user-profile access, without paid calls.

Run from the repository root:

```powershell
python -m unittest discover -s evaluation/briefing-quality -p "test_*.py"
node --test scripts/export-acquired-benchmark.test.mjs
node node_modules/vitest/vitest.mjs run --config evaluation/briefing-quality/vitest.config.ts
node node_modules/vitest/vitest.mjs run --root packages/briefing --config vitest.config.ts
node node_modules/typescript/bin/tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --skipLibCheck --types node evaluation/briefing-quality/replay.ts evaluation/briefing-quality/replay.test.ts evaluation/briefing-quality/diagnose.ts
```

Current results: 21 Python, ten replay, 100 existing V3 and three exporter tests passed; TypeScript passed. Recorded fixtures/provider doubles establish regressions and harness behavior, not new factual model quality.

Fresh immutable run (choose new output names if these exist):

```powershell
python evaluation/briefing-quality/evaluate.py prepare C:/Users/Joud/Downloads/v3-extended-acquisition-20261023.zip --out evaluation/briefing-quality/private/run-20261027
python evaluation/briefing-quality/challenges.py evaluation/briefing-quality/private/run-20261027 --out evaluation/briefing-quality/private/challenges-current
packages/briefing/node_modules/.bin/tsx.cmd evaluation/briefing-quality/replay.ts --preflight evaluation/briefing-quality/private/run-20261027 evaluation/briefing-quality/private/preflight-current
packages/briefing/node_modules/.bin/tsx.cmd evaluation/briefing-quality/diagnose.ts evaluation/briefing-quality/private/run-20261027 evaluation/briefing-quality/private/challenges-current evaluation/briefing-quality/private/preparation-diagnostics.json
python evaluation/briefing-quality/evaluate.py agreement evaluation/briefing-quality/private/run-20261027/article-review.csv
python evaluation/briefing-quality/evaluate.py quality evaluation/briefing-quality/private/run-20261027/quality-observed.json evaluation/briefing-quality/private/run-20261027/quality-expected.json
python evaluation/briefing-quality/study.py evaluation/briefing-quality/templates/observations.csv --out evaluation/briefing-quality/private/study-empty-validation.json
```

`prepare` verifies all ZIP members/checksums, snapshot/case hashes, exact full-field exporter rebuilds, timezone-aware half-open membership, historical profiles, chronology, seeds and unassigned records. It screens cross-split lexical candidates without certifying semantic independence. Whole tracks and feed/ID/URL/body identity components stay together. No held-out semantic packets or outputs are generated. French held-out remains unavailable; see the handoff before freezing anything.

All-headlines and keyword baselines replay 60 development windows each. All-headlines retains headlines and full-body fallbacks; keyword uses case-folded Unicode interest-token overlap, deterministic ranking, exact URL/body deduplication and a five-item limit. Neither translates or semantically judges importance. Both record their own actual locally published history, but deliberately do not use it for novelty selection. Missing initial history is a recorded deliberate cold start. Latency includes local selection/history handling, excluding disk writes, acquisition, notifications and models. Blind packet IDs are randomized; system-bearing prior IDs are anonymized. Intrinsic output style can still reveal the baseline.

Ten synthetic/adversarial cases are kept separate from real data. Both baselines actually execute on them. The V3 preparation diagnostic runs on 60 real plus ten synthetic cases. Semantic success for conflicts, partial evidence, cross-language content or malicious instructions remains unmeasured without human/approved model assessment. The actual-engine tests cover routing, repair, source ownership, history isolation, empty input, malformed JSON, admission and unknown-outcome fences.

The model harness imports the actual core V3 engine and fixes replay time to windowEnd. The single-LLM baseline sees all full input articles in one editor call, with the same interest, output-language and reading-budget instructions and its own published-history selector. It has no verification, repair, tools or retrieval. Input/request limits fail explicitly. V3's existing whitespace normalization, duplicate folding and short-text skips remain observable system behavior; diagnostics record them. This does not establish that every raw body survives V3 preparation. Worker freshness/scheduling, pending-source carry, production reservations/settlement, database publication and notifications are outside this local-core comparison. Application behavior is unchanged.

Paid execution requires approval of the exact manifest plus a dedicated environment key. See [PAID_RUN.md](reports/PAID_RUN.md). A CLI hash is a technical guard, not proof of user consent. Before execution, code/config/prompt hashes and Git revision must match. Each call journals a conservative reservation before sending, stores request/response artifacts, and retains unknown outcomes. There are no transport retries or same-directory restarts. Current manifests permit development only. A wider validation/held-out campaign requires a reviewed split and new authorization.

For actual observations and labels, keep private copies and use:

```powershell
python evaluation/briefing-quality/evaluate.py agreement evaluation/briefing-quality/private/reviews/independent.csv
python evaluation/briefing-quality/evaluate.py quality evaluation/briefing-quality/private/reviews/adjudicated.json evaluation/briefing-quality/private/run-20261027/quality-expected.json
python evaluation/briefing-quality/study.py evaluation/briefing-quality/private/study/observations.csv --out evaluation/briefing-quality/private/study/results.json
python evaluation/briefing-quality/freeze.py evaluation/briefing-quality/private/run-20261027 evaluation/briefing-quality/private/steward/certificate.json
```

Agreement uses independent `status=reviewed` R1/R2 rows before adjudication. Categories: relevance `yes/no/uncertain`, importance `0/1/2/3`, novelty `new/update/correction/repeat/uncertain`. It reports raw agreement, categorical Cohen kappa, quadratic-weighted importance kappa, confusion counts and missing pairs. Preserve reviewer originals and adjudicate separately.

Quality JSON extends `templates/adjudicated.example.json` with required `cluster` (the split independence component) and `judgmentOrigin` (`human` or `ai`). Adjudicated records need distinct reviewer IDs and an existing private evidence file. Finite/nonnegative/consistent counts are checked. Splits, languages and judgment origins remain separate. Outputs include per-case and micro/macro ratios, numerators, denominators, undefined cases, missing expected judgments, paired system differences and cluster-level ranges. Fewer than five independent components gets no confidence interval; otherwise the fixed-seed cluster bootstrap is exploratory. Accuracy, relevance, importance coverage, critical-fact completeness, all-fact recall, duplicate rate and novelty precision are separate. A zero denominator is unavailable. Unknown prior-history novelty needs an explanatory evidence note, not perfect novelty. Count each reference fact once.

Study analysis uses `templates/observations.csv`; validates status, order, finite numbers, ranges, counts and duplicate observations; and pairs only the same participant/language/task pair with distinct A/B packs and a shared frozen key version. It preserves missing conditions, timeouts, withdrawals and missing metrics, and reports within-participant differences for time, missed facts, comprehension, usefulness and effort. Empty-template analysis is a plumbing check with zero participants. Full recruitment, consent, matching and observation instructions are in the handoff.

After real results arrive, rerun analysis and update `reports/FINAL_REPORT.md`. Preserve old runs/failures. Never substitute reference summaries for published history or present overlapping pilot material as independent held-out evidence.
