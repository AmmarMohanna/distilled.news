# Review corrections before rollout

All three reported findings were reproduced and fixed on `perf/adaptive-verification-context`, continuing `a37050f4`. No paid inference, deployment, merge or changes to published news occurred. Campaign spending remains **$3.3653396 of $5**, with no new unresolved reservations; historical holds remain untouched.

## 1. Withdraw superset/subset reuse

**The subset optimization from `a37050f4` is removed.** Identical source text is not an identical model request when surrounding sources or the response schema differ. The regression returns two structurally valid bindings for the same source: an omitted role in a two-source batch and an explicit supported role in the source-only batch. Before the fix the second extraction was skipped; afterward both requests execute and each independently extracted role reaches its own factual review.

Memoization is again restricted to the exact ordered source batch, source metadata, model and schema policy within one generation. Exact-batch concurrency coalescing remains. Partial invalid extractions are not completed cache entries. A rejected source operation fences later source dispatch within that generation, preserving provider/payment uncertainty rather than borrowing data or sending a replacement. No cross-window cache or changed model routing was added.

The prior report's subset-reuse section and `SUBSET_TRACE.json` describe withdrawn historical work, **not a capability or saving of the current candidate**. Those original artifacts remain preserved. The earlier ~2% compact-proof cost measurements are unchanged; no additional repair-subset saving is claimed.

## 2. Check token intervals, not string equality

After validating token IDs and ordering, the opt-in reader inventory guard compares inclusive person/role intervals. It rejects any nonempty intersection, including identical, partial and contained spans. Disjoint adjacent spans and absent roles remain allowed. Arabic, English and French regressions cover each case without name/title dictionaries. Unmarked historical policies retain their previous parsing behavior.

The new partial-overlap tests failed before implementation and passed afterward. The context-dependent batch regression also failed before removal of subset reuse. No threshold or source-support requirement was weakened to make them pass.

## 3. Classify context and proof policies independently

`verificationWirePolicies()` checks for each exact controlled policy instruction independently. Appending the compact-proof instruction no longer makes compact reader context appear original. The tests cover original, context-only, proof-only and combined prompts. Request hashing and exact recorded-response matching are unchanged.

The corrected zero-network replay matches the same **81 requests across 22 retained cases**, with unchanged decisions and reader output. Its metadata is now:

| Policy dimension | Correct count |
|---|---:|
| Original reader-context verification requests | 16 |
| Compact reader-context verification requests | 8 |
| Compact-proof verification requests | 14 |

The previous combined replay reported 22 original / 2 compact reader-context requests. That classification was incorrect; it did not affect exact-request matching or financial totals. Context and proof counts overlap and must not be added as mutually exclusive categories. `COMBINED_REPLAY.json` is the new versioned result; previous replay artifacts are preserved.

The legacy adaptive replay still matches **39 requests across eight cases**, with 6 original / 4 compact context requests and zero compact-proof requests. No model was called to regenerate either replay.

## Verification

The initial full offline run hit a 30-second timeout in the existing evaluator D1 fixture's setup hook. Its report is preserved as `INITIAL_OFFLINE_CHECKS.json`; it is not called a pass. No timeout or assertion was changed. The unchanged rerun passed all six checks, including 166 evaluator tests and 577 engine tests. Engine, worker and qualification/replay CLI typechecks also passed. Final results are in `FINAL_OFFLINE_CHECKS.json`; no timeout or assertion was changed.

The existing finite-admission runner, append-only paid ledgers, UNKNOWN fences and original model responses were not changed by these fixes. The new policies remain inactive on deployed environments. The remaining anonymous-role attribution miss from the rejected source-skipping experiment is not represented as solved by these structural fixes.
