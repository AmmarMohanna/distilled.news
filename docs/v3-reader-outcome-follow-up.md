# V3 reader-outcome follow-up — October 27, 2026

## Decision

Retain one narrow improvement: a complete, verified headline may have an explicitly empty body. V3 previously required both fields to contain prose, rejecting headline-only updates and encouraging duplication. This is a representation limitation, not proof that the verifier reasons correctly. No new stage, model, mandatory call, acquisition change or deployment was introduced.

New windows use frozen prompt version 4. Versions 1–3 retain their prompts and required-body behavior, including recovery of settled operations. The editor decides whether a body is necessary; code does not strip sentences. Missing body fields, empty headlines and uncited drafts remain invalid. The ordinary verifier and targeted repair still apply. Consolidation and repair preserve complete headline-only items.

## Experiments rejected first

Replacing the editor's writing paragraph with a main-idea instruction did not consistently improve the output: the survey draft strengthened potential productivity benefits into actual gains; a Bitcoin draft broadened a time-qualified inflow record. Adding a fictional concise-writing example still produced excessive detail and unsupported grouping/causality. Neither instruction was retained. This follows earlier unsuccessful verifier/model trials, rather than treating more prompting or a larger model as a solution.

## Matched real-window comparison

Each pair used identical saved articles, prior-reader history, GPT-4.1 editing, GPT-4.1 mini verification and inference limits. Only the optional-body editor instruction differed. Saved editor responses were reused once for complete engine verification/repair replay; their original costs and elapsed times are included below. Provider cache billing varied. The combined times add the original editor duration to the later replay duration: they are inference-path estimates, not continuous acquisition-to-publication measurements.

| Retained case | Words, baseline → candidate | Calls, baseline → candidate | Effective USD, baseline → candidate | Combined inference seconds, baseline → candidate |
|---|---:|---:|---:|---:|
| English altercation / army presence | 29 → 13 | 2 → 4 | 0.006808 → 0.008772 | 3.802 → 6.916 |
| Arabic explosion and soldiers voting | 71 → 19 | 2 → 2 | 0.011166 → 0.011454 | 3.502 → 3.140 |
| Arabic occupation report | 43 → 39 | 4 → 2 | 0.015038 → 0.013035 | 7.132 → 4.167 |

The two simple candidate updates lose repeated prose and routine publication-date commentary. Separate developments remain separate. The more complex occupation report retains its body, named attribution, security conditions and absence of a withdrawal deadline. The short explosion headline omits the alleged perpetrator; the voting headline omits the first-time detail. These are editorial omissions, not unsupported additions, and readers may value those details. The experiment does not establish perfect important-fact recall or that every short item is preferable.

The English candidate still required a university-name repair from Sagesse to Al-Hikma. This illustrates remaining verifier/translation sensitivity, not improved factual reasoning. Across the small cohort, total text falls 143 → 71 whitespace-delimited words, calls stay eight, effective cost is essentially unchanged ($0.033011 → $0.033261), and combined inference time is similar (14.436 → 14.223 seconds). Do not infer a general cost, speed or accuracy gain. The justified benefit is avoiding mechanically required repetition while keeping verification intact.

## Evidence and spending

Exact final reader text, source identifiers, omissions, measurements and result hashes are committed in `benchmarks/results/v3-reader-outcomes/headline-only-comparison.json`. Exact source snapshots, prior context, request bytes, generation receipts and per-call ledger records remain local in `.local-reports/v3-quality-improvement/` and `.local-reports/v3-reader-outcome-eval/`.

The entire current $5 quality task consumed **76 paid calls / $0.47717645** including rejected candidates, earlier verifier/model experiments and invalid harness attempts. All ledger entries settled; no uncertain exposure remains. Reused editor outputs were not charged again. Existing remote holds and financial history were untouched. No additional paid trials are justified by this small result.

Paid replays returned engine `published` results and saved exact outputs locally; they did not persist real application editions or publish to staging. A separate worker regression verifies isolated D1 publication/read-back of a complete headline-only item using mocked provider responses, and existing recovery tests cover settled-call reuse. That distinction matters: successful local engine verification is not independent proof of factual accuracy or live delivery.

## Validation and limits

Focused regressions cover complete headline-only verification, factual repair and re-verification, missing-body rejection, frozen legacy behavior, and consolidation/source preservation. Worker integration covers publication/read-back plus existing dispatch and crash recovery. TypeScript checks cover briefing and worker packages. Briefing package: 109 tests passed across 23 files. Worker V3 window integration: all 20 tests passed, including the new D1 read-back and frozen-version recovery cases. Both package TypeScript checks passed. PowerShell initially reported a nonzero wrapper status for expected test stderr despite the successful worker summary; a direct child-process rerun confirmed exit code 0 for all five new/compatibility cases.

No staging deployment or reader notifications. Model routing and the verifier's factual standards remain unchanged. The next useful evaluation is independently labeled, previously unseen windows assessing core-information retention, grouping and repetition—not another broad prompt search on these same examples.
