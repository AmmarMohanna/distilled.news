# Editorial distillation trial — November 3, 2026

## Decision

**Keep V4 unchanged. Neither candidate qualifies for adoption.** All 12 matched editor calls completed, but the first separate automated evaluator exhausted its output limit. Its truncated response is not a valid complete assessment. Execution stopped: three remaining evaluator calls were not sent. No transfer or full-pipeline finalist test ran. No deployed prompts, models, source behavior, frontend or campaign resources changed.

Total actual charges: **$0.232920, 13 calls**, independently reconciled in native accounting; no outstanding reservation or uncertain charge. Editor calls cost $0.154344; the one incomplete evaluator cost $0.078576. The renewed authorization was 16 calls/$3, valid 10:08:31–12:08:00 UTC. Unused approval is not a reason to continue a broken evaluator configuration.

## Method and exact evidence

Frozen corpus and V4 system hashes are unchanged. Four development cases (Lebanon and AI, each English/Arabic) used the same full original evidence, prior reader memory, GPT-4.1, temperature 0.1, JSON mode and 4,000 output tokens for baseline and both one-instruction candidates. Calls ran sequentially with no retries. No expected-development labels were given to the editor.

The evaluator was Claude Sonnet 4.5, separate from the editor model. It received full original evidence, exact reader memory, provisional expectations and three blinded drafts, with a separate private label mapping. It produced 4,000 tokens and `finish_reason=length`. Partial comments were not repaired, parsed as a complete verdict, used to rank candidates or treated as human truth.

All semantic observations below are **AI-assisted engineering review**, not human annotation or independent complete evaluator validation. Original text, timestamps and historical reader style were preserved. Development sources are familiar, not unseen-source evidence.

## Actual measurements

Each row is four editor calls. Words are headline plus body, using whitespace counts; Arabic/English word counts are descriptive, not linguistically equivalent. Time is the sum of provider-call wall times, not publication or full-pipeline latency.

| Version | Items | Words | Actual editor cost | Summed call wall time |
|---|---:|---:|---:|---:|
| V4 | 14 | 767 | $0.051432 | 21.921 s |
| Main change | 14 | 671 | $0.050168 | 18.097 s |
| Complementary evidence | 14 | 826 | $0.052744 | 16.734 s |

Main-change cost was 2.46% lower in aggregate; complementary-evidence cost was 2.55% higher. These are single samples with provider caching effects, not sustainable recurring-cost estimates. Aggregate latency hides regressions: Lebanon English main-change took 6.571 s versus baseline 3.906 s (+68%). No candidate has demonstrated the <=10% complete V3 cost/latency target. Verifier, repair and end-to-end generation were not measured.

| Case | V4 words | Main change words | Complementary evidence words |
|---|---:|---:|---:|
| Lebanon English | 142 | 137 | 127 |
| Lebanon Arabic | 128 | 46 | 100 |
| AI English | 286 | 261 | 324 |
| AI Arabic | 211 | 227 | 275 |

Exact calls, token usage, costs, timings and generated text are in `results-2026-11-03.json`; every draft is readable in `outputs-2026-11-03.md`. Exact request inputs and blind mapping are in `executed-inputs-2026-11-03.json`. Raw provider generation IDs, financial rows and private run details remain local.

## What the outputs show, provisionally

### Selection and grouping

Every version retained four expected Lebanon developments and three expected AI developments in these drafts. All kept the reported Baraachit strike separate from prospective strikes, combined the two Qantara reports, combined primary/secondary coverage of one fund announcement, and separated that announcement from Replit and METR. This does not show an improvement over V4: the baseline already did so. Reference grouping alone is not evidence of correct synthesis or full factual accuracy.

All Lebanon versions omitted the previously communicated Brent claim and drill announcement. This is only a known development continuity control. The reserved meaningful-casualty-update, quiet and security cases were not run, so no transfer or correction reliability result exists.

### Main-change instruction: inconsistent economy, possible loss of necessary meaning

Arabic Lebanon became four headline-only items (128 -> 46 words). This removes repeated bodies, but the Baraachit item now states the strike directly without the baseline body's reporting qualification. The source is the same single channel, [post 107632](https://t.me/lebanonnews2/107632), whose text is a reported `غارة حربية ... استهدفت اطراف بلدة برعشيت لجهة كونين`, not independent corroboration. Whether the stronger presentation is materially misleading remains unresolved without a complete evaluator; do not score the shorter output as an automatic win.

English Lebanon still includes routine missing-information filler in baseline and main-change: “No details on casualties or damage were provided” and “No further details were given.” The source posts do not require those sentences. The added instruction did not reliably solve the demonstrated wasted-reading problem.

The English fund escalator says “2% for every 50% rise in company value, at the board's discretion,” omitting the primary source's “above a set baseline” condition preserved by V4. Full source `public-benefit-fund` says: “an additional 2% added at the board's discretion for every 50% increase in the company's value above a set baseline.” This is a source-linked potential scope regression, not proof that the unchanged verifier would accept it. Arabic AI main-change grew from 211 to 227 words, adding evaluation-access background rather than uniformly distilling.

### Complementary-evidence instruction: no established gain, more background

English AI grows from 286 to 324 words; Arabic from 211 to 275. The METR item adds organizational/access-tier detail; the fund item adds governance detail. These may be supported facts but additional supported detail is not necessarily useful understanding. All versions already combined both fund reports; additional citations cannot establish improved synthesis.

English Lebanon removed two routine unavailable-detail statements, a local positive observation. The candidate did not establish important-development recall, grouping or synthesis gains elsewhere. No generic “analysis” or invented reader connection should be rewarded.

## Accounting and execution failures

The first runner correctly settled all twelve editors, then its attempt to create an overlapping evaluator grant was rejected by native accounting before any judge request. The correction reused all twelve settled outputs and created a separate exact four-operation evaluator account/scope, capped at $1.68, within the approved 16-call/$3 overall workflow. Original grants and historical financial records were not edited. The native overlap guard stayed intact; no editor call was resent.

The first admitted evaluator request settled, then the runner stopped on `OUTPUT_TRUNCATED_SETTLED_STOP`. The partial output requires more space because the evaluator enumerated many supported facts for all three drafts, not only consequential problems. No retries, increased token cap or additional judge calls were attempted. Native read-back confirmed 13 reservations, 13 reported settlements, $0.232920 actual, $0 held and zero uncertain operations. The earlier Hello-world diagnostic is a separate scope and is excluded.

## Next useful experiment

The completed editor comparisons do not justify promotion. Preserve baseline V4. First revise only the **offline evaluation output contract** to report consequential issues and compact per-development coverage, while still giving the judge all original evidence and requiring source quotations for problems. Validate the contract offline and calculate a fresh bounded approval; do not rerun editors. Reuse all exact settled drafts for independent review, then run reserved transfer and unchanged verifier/repair only if meaningful gain survives. Any factual ambiguity remains unresolved. No new product stages or agents are proposed.

The isolated performance campaign remains available for a later separately approved combined-load run; this editorial evaluation neither proves nor retests publication infrastructure.
