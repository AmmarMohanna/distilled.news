# Final validation-contract regression investigation

19 October 2026. Branch `backend-validation-contract`; application source
`c389419`; pre-change baseline `3e00ffc`. The later evaluation/tool commits do
not change Worker source. **Strict regression is NOT GREEN. No new functional
regression was observed, but equal performance is not established.**

The [real-model evaluation](PUBLICATION_VALIDATION_REAL_MODEL_2026_10_19.md) is
complete: 12 actual calls/$0.0100792, five valid ACCEPTs, one valid UNRESOLVED,
six invalid UNRESOLVED, no unsafe ACCEPT. Its source/reader confusion and numeric
precision error remain the main blockers to enabling v2. There was no deployment,
activation or full briefing publication in this investigation.

## Fresh full run of the final application

`corepack pnpm --filter @distilled/worker exec vitest run --maxWorkers=1`
with default plus JSON reporters completed in **3,866.79 seconds**:

- **243/243 files** accounted for: 236 passed, four failed, three skipped.
- **1,688 tests:** 1,672 passed, five failed, 11 skipped; process exit **1**.
- All **440 Worker TypeScript byte hashes** stayed unchanged from run start
  through final comparisons. This covers the final novelty/ownership fixes,
  unlike the older broad run.
- Three failures were 10-second `beforeEach` timeouts: approved-synthesis
  certainty, approved-synthesis temporal, and modern UNKNOWN editorial-context
  recovery. One failed setup also caused `Server is not running` during cleanup.
- Two failures were five-second test timeouts: durable publication restart and
  cron publication. No ordinary assertion failure or process memory-limit failure
  was observed. This does not establish Cloudflare staging memory behavior.

All six v2 D1 publication integrations passed within that run, as did correction
lifecycle, retained recovery/accounting, canonical store/lease, source-budget,
coverage and semantic regression suites. The five failures remain failures.

## Baseline comparison of the original four cases

Three alternating baseline/current rounds ran serially in fresh processes, with
identical test/config/lockfile hashes, Node **v22.17.0**, and the same installed
dependencies. No other local D1 workload overlapped. Original callback/hook limits
and assertions were unchanged. Baseline was an immutable Git archive; its generated
dependency junctions pointed to the existing installation.

| Original case | Baseline strict passes | Current strict passes | Classification |
|---|---:|---:|---|
| Outbox relay | 3/3 | 3/3 | Failure not reproduced; unchanged outbox runtime path; no new regression demonstrated. |
| Durable publication restart | 3/3 | 2/3 | Timing-sensitive. Supplemental pre-change run also times out; primary sample remains asymmetric. |
| Cron publication | 0/3 | 0/3 | Confirmed pre-existing strict timeout. |
| Recovery after edition commit | 2/3 | 0/3 | Confirmed pre-existing timing sensitivity; current also passes in the full run. |

The three newly observed hook-failure cases each passed one fresh strict check on
**both** revisions: **6/6**, without raising the hook limit. Their full-run failures
were setup failures, not failed factual/financial assertions.

Separate 30-second CLI completion diagnostics passed all six selected assertions
across baseline/current restart, cron and edition recovery. These retained every
assertion but are **not strict acceptance passes**. They demonstrate functional
completion, including durable results and no duplicate model call, within that
diagnostic allowance. No repository timeout was edited.

The [machine-readable evidence](../benchmarks/validation-contract-final-regression-results.json)
includes all 24 primary outcomes, six strict hook checks, six completion diagnostics,
hashes and the supplemental observation. Vitest durations include fixtures;
passing durations can exceed the callback allowance. Timeout durations are
censored and must not be treated as completed callback or production latencies.

The restart asymmetry is not erased: a small additional latency cost cannot be
excluded by this sample. The additional old-code timeout proves susceptibility
predates this branch; it does not prove identical performance. Attribution to a
specific host bottleneck or portable timing certification would require a matched
independent host/CI measurement. No performance fix was guessed from these data.

## Supplemental-run and tooling limitations

A proposed five-pair isolated-snapshot follow-up did not complete. Its preflight
rejected 19 raw-byte differences that were exclusively CRLF/LF differences. The
PowerShell command continued into the existing follow-up wrapper despite that
preflight's nonzero exit; one baseline restart test ran and timed out. That is a
real supplemental baseline observation, not a completed paired experiment.

Its machine report was emitted at a 260-character Windows path, which Python
could not reopen normally. It was recovered using the Windows extended path and
pinned by hash. It is **excluded from primary rates**; no missing current result
was invented. A pre-execution report-path guard now rejects that boundary and
requests a shorter output directory. Generated archives and raw evidence remain
retained; original source was never replaced. The initial baseline archive was
also moved to a verified shorter workspace path after a long-path startup error,
before any primary comparison test executed.

The reviewed runner additionally requires a zero process exit, successful machine
report and passing selected assertion before recording PASS. Unique attempt files
prevent reuse/overwrite of interrupted reports. Its three safety tests pass.
Repository script tests pass **37/37**; saved-corpus/real-verdict offline replay
passes **2/2**. The live evaluation harness is skipped by default. Earlier final
repository-wide typechecks, frontend build and explicit staging-config Worker dry
run remain applicable to unchanged application source; they were not substituted
for this final full Worker run.

Reproduction after other local D1 workloads have exited:

```powershell
python scripts/compare-validation-timing.py --baseline-root .local-reports/b3e00ffc --current-root . --output-dir .local-reports/timing --rounds 3
python -m unittest discover -s scripts -p test_compare_validation_timing.py
```

Do not rerun until green or describe these findings as full performance equivalence.
Keep v2 disabled. The next validation work should address the observed fact-level
reader-witness errors and support/coverage confusion, preserving conflict blocking.
