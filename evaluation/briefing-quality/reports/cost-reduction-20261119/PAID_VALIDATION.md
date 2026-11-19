# Completed paid validation of compact verification

## Verdict

**Technical qualification passed on the tested cases. Meaningful 50% cost reduction was not achieved. Do not describe this as economic readiness or enable it globally on this evidence.** No deployment, merge, production publishing change or flag activation occurred.

The actual selected engine returned the same 5 Arabic and 9 English stories, including identical text, citation IDs and update links. All 312 required reader/proof entries completed with unchanged support judgments; citation-support judgments also agreed. Both formats correctly assessed six source-derived controls. This is a small exposed development qualification, not evidence of population-wide factual accuracy or independent semantic non-inferiority.

## Actual per-briefing cost comparison

| Retained real window | Original stage receipts | Compact matched-stage reconstruction | Saving | Reduction |
|---|---:|---:|---:|---:|
| Lebanon, Arabic; 5 stories / 288 words | $0.334988 | $0.329698 | $0.005290 | **1.58%** |
| AI Industry Watch, English; 9 stories / 810 words | $0.735886 | $0.706088 | $0.029798 | **4.05%** |

The candidate totals combine unchanged historical upstream stage receipts with **new, actually charged verification calls**. They are not charges for two entirely fresh cold generations. The new verification charges were $0.079560 and $0.282704, compared with $0.084850 and $0.312502 historically. Acquisition, separate evaluation, infrastructure and discarded earlier attempts are excluded consistently. No new rate estimate is substituted for provider receipts.

Arabic all-stage input fell from 125,266 to 121,157 tokens; English from 281,227 to 262,400. Output grew from 10,557 to 10,923 and from 21,679 to 22,661 tokens respectively. The extra generated verification explanation offsets part of the input saving. These paid results demonstrate why a serialized-character reduction is not a dollar reduction of the same percentage.

## Small-input adverse finding

All six short-control verification requests used **more input tokens** with the compact format: +15 to +97 each. The reference instructions outweigh the eliminated repeated text. Four of six verifier bills increased; two decreased because output lengths varied. Aggregate verification-only charges were **$0.045848 original versus $0.046330 compact**, a 1.05% increase on this tiny set.

Do not compare control `paidUsage` totals as full-system savings: their exact upstream inventory/identity responses were reused, so fewer new calls were charged on the second arm. The verification-only comparison above isolates the changed stage.

This argues against unconditional activation. A later change could avoid compaction when the reference overhead exceeds the removed context, but that change is **not implemented or qualified by this run**. Existing frozen v1 requests must retain their exact paid wire format.

## Quality and completeness

Six controls were frozen before inference: an unchanged/altered Arabic three-token surname, an English possibility/condition control and 5-to-15-million substitution, and a French provisional-count control with an unsupported certainty/final-count variant. Each was run in original and compact formats with identical evidence, reader text, history, model and output obligations. The source facts determine the labels, not the tested judge.

| Format | Completed | TP | TN | FP | FN | Failed/unknown | Precision / recall / F1 |
|---|---:|---:|---:|---:|---:|---:|---|
| Original | 6/6 | 3 | 3 | 0 | 0 | 0 | 1 / 1 / 1 |
| Compact | 6/6 | 3 | 3 | 0 | 0 | 0 | 1 / 1 / 1 |

Each language has one positive and one negative control. These represent **four underlying source/evidence groups**, not twelve independent samples: the Arabic variants share one source, the English bridge and hospital examples are distinct, and the French variants share one source. Zero observed errors is not a general accuracy estimate. For illustration, even treating all six controls as independent would give a two-sided exact 95% accuracy interval of roughly 54–100%; dependence makes that interval optimistic as population evidence. There was no second model-family judge or new independent real-news test set in this qualification.

Both real engine runs completed without corrections, unaccounted sources or withheld batches. They retained 73 Arabic and 239 English proof entries (including full-reader obligations), with zero support/citation-status disagreements against their matched retained results. These are **not 312 independently verified gold claims**; multiple entries concern the same reader sentence. No omissions assessment or scientific claim-completeness claim was added. Prior editorial limitations and prior negative research remain valid.

## Latency: observed, not a causal speed claim

| Verification batch | Historical receipt | New compact receipt |
|---|---:|---:|
| Arabic, 73 entries | 48.342 s | 28.549 s |
| English, 92 entries | 42.598 s | 39.109 s |
| English, 131 entries | 50.183 s | 30.705 s |
| English, 16 entries | not extracted from historical ledger | 6.578 s |

The new isolated engine executions took 29.077 s and 77.022 s **with unchanged upstream responses reused**. Their historical executions took 84.019 s and 93.193 s with different reuse patterns. These are not matched cold end-to-end latency measurements. Receipt timing includes local admission/dispatch overhead and differs in provider time/load; single historical pairs do not establish a production speedup or SLO.

## Financial result

- New authorization: **$2 maximum**, including new unresolved reservations.
- Actual new charges: **$0.467256**, across **22 dispatches / 22 complete response receipts**.
- New unresolved operations/holds: **0 / $0**.
- Peak settled-plus-reserved exposure: **$0.711834**.
- Unspent authorization: **$1.532744**; no further inference is planned for this qualification.
- Historical holds **$0.658358** and **$0.012416** were neither cleared, replayed nor counted as confirmed new charges.

The configured key and account had available credit, and current provider prices were checked before dispatch. The existing runner serialized admission under the $2 cap, durably retained requests/responses and stopped on unknown operations or unexpected control outcomes. Exact completed upstream responses were reused only on model/system/user/schema/output-allowance equality. The three historical ambiguous request hashes remained forbidden.

## Protocol, reproducibility and deviations

Candidate code: `3107ea8b`. Local qualification-runner additions allow per-case frozen policy/options, explicit local key-file selection and stop-on-error/control-mismatch; these do not change deployed product code. Execution hashes, generation IDs, receipts, costs and outcome/ledger/case hashes are preserved in `PAID_MEASUREMENTS.json`. Complete sources, reader histories, requests, original and compact responses, pricing, preflight, frozen plan/cases and append-only journal remain in ignored `.local-reports/integration/compact-paid-20261119-v5/`.

Four earlier preparation directories are retained. They made **zero paid calls**: the dry replay exposed the Arabic baseline's intermediate novelty schema. Its actual retained request uses the consistent-links schema although its older plan did not contain the later separate wire marker. Experimental ancestry explicitly matches that recorded schema; all upstream requests then matched exactly and replayed identical outputs before paid dispatch. No historical snapshot or report was rewritten. The attempted launch from a nonexistent working directory also sent no request; the actual runner used the existing local key by path.

To reproduce the paid run, inspect its frozen artifacts and exact execution hashes. **Do not rerun its started directory or resend any operation.** A new experiment requires a new directory, versioned plan and authorization. Offline request-size/cost analysis remains available through `analyze-generation-cost.ts`; the original offline report remains unchanged.

## Release recommendation

Keep the candidate flag off pending a separate rollout decision and handling of the demonstrated short-input overhead. The tested compact format preserves observed checks and saves a few percent on these large briefings, but it does not solve the underlying $0.33–$0.71 generation cost. Further work should target the measured expensive stages rather than remove factual checks or advertise a 50% saving. No additional money was spent chasing a favorable result.

## Free verification

The existing continuous offline workflow passed all six checks after the funded run: Python evaluation tests, evaluator replay tests, full engine tests, dataset exporter tests, evaluation types and evaluator-worker types. Its honest machine-readable result is preserved in `PAID_OFFLINE_CHECKS.json`; it reports zero additional model calls and is not counted as paid factual-quality evidence. Independent code/evidence review recomputed the 22 receipts, total cost, peak exposure and zero final hold, and found no remaining important issue. Prior exact-head CI passed for `3107ea8b`; the result commit's GitHub checks remain authoritative.
