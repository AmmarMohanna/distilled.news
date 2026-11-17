# V2 model comparison: real pilot, 21 October 2026

**Keep the existing staging configuration. None of the tested configurations
produced a source-reviewed, validated and persisted useful briefing.** The
specialized configuration with thinking disabled got furthest: three distinct
events and a three-story draft, but verification blocked publication. Lower price
or a successful typed response is not sufficient evidence for promotion.

The owner approved up to $3, 60 calls and four hours. We made **32 calls costing
$0.199765629**. Remote ledger readback at 12:48:34 UTC matches every local receipt,
including reservation/settlement tokens and costs; **zero unsettled operations**.
Conservative reservations totaled $0.883016. Reservations are not actual charges.
Two canceled timed-out calls were settled from two matching provider generation
metadata reads each, with no completed semantic output reused or inference retried.
No deployment, candidate routing change, reader notification or external publication.

## Inputs and comparison boundary

All main runs imported the same immutable acquired Laplace, Replit and Anthropic
articles. Evidence hash:
`d8651e44c878a0738b3b5d5fc5ad4d7f330e3b43d18b279c9e30ba3c109f77c6`.
The initial event graph and publication memory were identical and empty. A separate
matched verification test supplied actual prose from a previously persisted real
V2 edition as prior publication context. This is not a full end-to-end comparison
with nonempty publication history.

Acquisition here means importing saved source evidence, not fetching live news.
The runner used the actual article-intelligence, independent identity checks,
editorial, writing, verification and local publication code, existing prompts and
application validators. It supplied candidate request compatibility controls only.
One sample per arm; no significance, reliability, P95 or unattended delivery claim.

The sanitized [machine-readable results](../benchmarks/results/v2-model-comparison-2026-10-21.json)
include every paid call, input hashes, model revisions, requested controls,
per-stage wall time, database counters, actual costs and artifact hashes. Original
sources, raw responses and private local databases remain under `.local-reports/`.

## Actual routing

| Arm | Understanding / identity / reconciliation | Editorial | Writing | Verification |
| --- | --- | --- | --- | --- |
| A | GPT-6 Luna | GPT-6 Luna | GPT-6 Luna | GPT-6 Luna |
| B | DeepSeek V4.1 Flash | MiMo V2.6 Pro | Claude Haiku 5.5 | GPT-6 Luna |
| C | GPT-4.1 mini | GPT-4.1 mini | GPT-4.1 mini | GPT-4.1 mini |

C reflects the deployed task configuration, not historical full GPT-4.1 runs.
Exact IDs are `openai/gpt-6-luna`, `deepseek/deepseek-v4.1-flash`,
`xiaomi/mimo-v2.6-pro`, `anthropic/claude-haiku-5.5`, `openai/gpt-4.1-mini`.
Canonical revisions were respectively 20260922, 20260910, 20260921 and 20261007
for the four candidates. The separately listed DeepSeek `-1017` model was not
silently substituted. All calls used OpenRouter, with provider fallback disabled;
serving endpoints were not pinned, so load/cache/provider variance can affect time.

Luna received explicit medium or low effort. MiMo did not advertise effort levels;
its initial call used provider-default thinking. The additional B arm requested
`reasoning.enabled=false` for DeepSeek and MiMo, and low for Luna/Haiku. This
records the requested control, not an assertion that every backend implements
identical reasoning behavior. Unsupported temperature was omitted for Luna/Haiku.
8192 output tokens were allowed for construction/writing and 12288 for
editorial/verification, including reasoning. These are tested resource allowances,
not native model limits. [OpenRouter reasoning documentation](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens)
describes the shared controls and reasoning-token accounting.

The configured `typesafe/jev-1.13` was absent from the public catalog. A different
`typesafe/jev-router` entry had unresolved variable pricing. Neither was silently
substituted or invoked. JEV remains unqualified in this pilot.

## Full pipeline outcomes

Times begin before saved-article processing and end at the terminal result.
**There is no successful time-to-useful-persisted-briefing measurement.** Costs
include failed operations, and exclude the separately listed matched-stage calls.

| Arm | Calls | Actual USD | Wall seconds | Outcome |
| --- | ---: | ---: | ---: | --- |
| C, mini | 3 | 0.022762800 | 46.213 | Independent event-identity review returned an inconsistent Laplace match for Replit; rejected before publication. |
| A, medium | 4 | 0.013804825 | Not comparable | Three articles processed after zero-call harness recovery; editorial rejected protected-proposition demotion. |
| A, low | 4 | 0.014042325 | 108.255 | Three articles processed; same editorial protected-proposition demotion. |
| B, medium | 1 | 0.003625161 | 184.762 | DeepSeek timed out without completed JSON; canceled generation billed. |
| B, low | 1 | 0.003826208 | 177.053 | DeepSeek exhausted the response allowance before complete JSON. |
| B, thinking disabled | 7 | 0.034252231 | 362.411 | Construction, editorial, writing and verification ran; publication unresolved. |

A-medium's first response was incorrectly rejected by the evaluation harness's
SSE model-identity parser because of heartbeat comments. The parser was fixed and
the exact already-settled response replayed, preserving all 48 Laplace claims and
the original failed receipt. No replacement call was made. Its resumed local run
took 148.221 seconds, following a 59.943-second interrupted attempt; these do not
form an uninterrupted comparable latency sample.

B-low's original harness surfaced a generic deferred provider error. Its retained
response identifies output continuation as necessary; the harness now preserves
the production semantic error prefix. The original run did not exercise a complete
production continuation sequence, so this is not proof that DeepSeek can never
complete the task with a different allowance.

B with thinking disabled retained **89 ClaimMentions and three canonical events**,
one per source. Its 930-word draft contained all three stories. Editorial took
129.316 seconds, writing 14.228 and verification 56.841, including stage overhead.
The verifier marked 37 facts NEW, six UNRESOLVED and three NOT_COMMUNICATED.
Missing details included the Nature-paper context, how AV developers train on
edge cases, and the wider adoption/robotics context. The actual publication
decision was `UNRESOLVED`: `INCOMPLETE_NOVELTY_VERDICT` and
`MISSING_MANDATORY_COVERAGE`. The wrapper surfaced `TEMPORARY_UNAVAILABLE`;
the retained publication record provides the precise reason. No edition persisted.
This run recorded 722 database reads and 576 writes in the local adapter; local
filesystem/database overhead is not a Cloudflare production latency benchmark.

## Matched downstream tasks

These use identical saved successful V2 task inputs, avoiding differences in
earlier construction. Passing a decoder means typed output, not factual quality.
The following latencies include provider response capture and settlement, while
the JSON also records encompassing task wall time.

| Task / model | Seconds | Actual USD | Result |
| --- | ---: | ---: | --- |
| Editorial / MiMo, default thinking | 178.570 | 0.017945154 | Timed out; stable canceled-generation billing recovered. |
| Editorial / Luna low | 32.247 | 0.005141800 | Application rejected editorial result. |
| Editorial / mini | 36.565 | 0.016659600 | Application decoded the common editorial result. |
| Writer / Haiku low | 11.279 | 0.002957300 | Typed draft; source-review issue below. |
| Writer / Luna low | 35.013 | 0.002256675 | Typed draft; source-review issue below. |
| Writer / mini | 8.818 | 0.006388800 | Typed draft; source-review issue below. |
| Prior-publication verification / Luna medium | 83.226 | 0.008478050 | All 29 required facts correctly ALREADY_COMMUNICATED. |
| Prior-publication verification / Luna low | 46.847 | 0.007167050 | All 29 correctly ALREADY_COMMUNICATED. |
| Prior-publication verification / mini | 32.181 | 0.017818800 | Incorrectly returned 28 NEW and one NOT_COMMUNICATED. |

On the identical history test, Luna low reduced observed time by 44% and cost by
15% versus medium while preserving this test's decisions. This is useful evidence
for further testing, not proof that low preserves accuracy across all tasks.

## Independent source review versus verifier decisions

Review below is **AI-assisted review against original full sources, not human
gold certification**. It is independent of the generated verifier decisions.

| Matched writer draft | Source-grounding issue found in review | Application decision using returned verifier answers |
| --- | --- | --- |
| Luna | Attributed Replit revenue growth to its OpenAI partnership; the source's antecedent is the Anthropic partnership. | Luna accepted the draft: a consequential missed error. |
| mini | Assigned Laplace's competitive advantage to the shared evidence foundation; the source associates it with AI testing AI methodology. | mini accepted the draft: another missed error. |
| Haiku | Introduced an unsupported question linking the founder's competitive-advantage quote to the rival's fundraising. | Luna rejected for a missing mandatory fact, but did not identify this quote-context error. |

All three preserved the specific in-development qualifier for Laplace's agents;
the previously observed available-versus-developing strengthening did not recur
in these drafts. Haiku retained source-age framing and the disputed partnership
more clearly. Luna and mini omitted useful temporal/dispute context. This is not
enough to qualify any writer for unattended publication.

The first standalone draft-verification harness omitted mechanically generated
claim IDs, causing decode errors. The fix uses the exact production claim-hash
formula. Offline recovery asserts that both provider payload and schema hashes
are byte-identical to the paid requests; no extra inference was needed. The
recovered ACCEPT/REJECT values above come from the real application reducer,
not from a custom permissive grading rule. They are matched-stage decisions,
not persisted editions.

## Remaining gaps and next engineering decision

No model is promoted. First preserve these actual failed responses as focused
regressions for partnership attribution, quote antecedents, protected editorial
facts and novelty completeness. A faster candidate cannot compensate for those
errors. The baseline also failed; keeping it configured is not a claim that its
accuracy has been established.

This pilot does not qualify multilingual output, a chronological later-update
sequence, every correction/packet-boundary case, long-packet reconciliation
scalability or successful publication frequency. Those require additional real
evidence, reviewed labels and repeated matched runs. No further broad paid sweep
was started merely because unused authorization remained.

## Reproduction and verification

From the feature worktree, using retained private local fixtures:

```text
node apps/worker/node_modules/vitest/vitest.mjs run --config benchmarks/v2-configuration-comparison.vitest.config.ts
node apps/worker/node_modules/vitest/vitest.mjs run --config benchmarks/v2-comparison-replay.vitest.config.ts
node apps/worker/node_modules/vitest/vitest.mjs run --config benchmarks/v2-comparison-draft-replay.vitest.config.ts
node apps/worker/node_modules/typescript/bin/tsc --noEmit -p benchmarks/tsconfig.v2-configuration.json
python benchmarks/summarize-v2-model-comparison.py
```

Paid runners and billing recovery are explicitly gated and excluded from the
ordinary offline suite. Local fixture replays skip when private evidence is
absent. They do not establish live model quality through mocks. The summary
generator asserts remote/local cost and token identity before writing sanitized
results; it has no network or inference capability.

Verification: 12 preparation/budget/saved-input tests and two retained-response
replay tests passed; the comparison TypeScript project passed `tsc --noEmit`.
The live runner's passing test status only means it recorded an outcome; model
or publication success must be read from the outcome records above.
