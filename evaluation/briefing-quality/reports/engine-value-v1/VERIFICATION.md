# Verification record

Base: `a2e111e2`; research branch: `research/engine-value`. Preregistration: `5498a9c5`; initial pilot implementation: `205132d2`. The final report/code are in the subsequent branch commit. No deployment or merge.

Local continuous run `20261115T200807.598671Z-fa5a28655039` passed all nine checks: 68 evaluation Python tests; 2 engine-value analysis tests; 165 evaluator Vitest tests; 387 engine Vitest tests; 3 exporter tests; evaluation, worker, research-script and briefing-package TypeScript checks. Another 14 research Python tests passed separately. Total **639 tests and four typechecks**. Pilot analysis tests passed again after the final reporting changes. Tests are not paid quality assessments.

Offline evidence audit: all three frozen input JSON hashes, all 41 completed generation source hashes and all 17 exact code snapshots verified. Twelve generation outputs were reused from historical paid artifacts. Ledger: 154 settled, zero new UNKNOWN/held operations; $2.649593 rounded charges. Archive includes source code only, no credentials or article bodies.

Independent code review found a missing frozen-input hash check in both follow-up runners. `assertFrozenInputs` now rejects changed, missing or duplicated fixtures before runtime creation; two tests pass. Historical source hashes were separately audited and unchanged. Scientific review checked counts/tables/ratios against the JSON; its reporting note about absent metric-level failure bounds was incorporated.

At the first implementation SHA `205132d2e94c7f007d495eabc145ae8b8ae87a1c`, dedicated [Briefing evaluation](https://github.com/AmmarMohanna/distilled.news/actions/runs/43751099727) passed, while [Project checks](https://github.com/AmmarMohanna/distilled.news/actions/runs/43751099760) failed in workspace tests, V3 correctness fixtures and browser checks. Other agentops campaigns passed. This is the same job pattern as the inherited reliability-branch issues documented in [CI_INVESTIGATION.md](../reliability-v3/CI_INVESTIGATION.md); job-name similarity alone does not prove identical causes.

Worker/web/runtime fixture paths, Playwright configuration, lockfile and root package manifest are unchanged from `a2e111e2`:

```powershell
git diff a2e111e2 --name-only -- apps/worker apps/web tests/e2e playwright.config.ts pnpm-lock.yaml package.json
```

The output was empty. Candidate core paths do change, so existing engine replay/typechecks and the new final CI run remain necessary; this is not a blanket assertion that all broader failures are inherited.

Inspect exact pushed-commit statuses with `node evaluation/briefing-quality/engine-value/github-checks.mjs`; give a numeric run ID to inspect job conclusions. The final reply reports the observed status for the final pushed SHA. This record does not substitute a prior SHA's green check for final CI.