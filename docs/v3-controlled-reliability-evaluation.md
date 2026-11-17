# V3 controlled reliability and cost evaluation — October 23, 2026

## Outcome

Retain one confirmed implementation fix: malformed verifier item identifiers can
no longer become approvals through coercion or duplicate-key overwriting. Keep
the GPT-4.1 editor, GPT-4.1 mini verifier, existing prompts and evidence layout.
No staging/production deployment or live feed modification occurred.

Ten newly authorized verifier calls cost **$0.0166356**, below the approved
**$0.11** conservative exposure. All settled; no new outstanding evaluation holds.
No editor, repair or full-pipeline inference was initiated in this experiment.
Unused budget is not permission for additional calls: all ten planned calls are used.

Gemini 2.5 Flash with thinking disabled showed some development-set improvements,
but no advantage on the held-out set and about 31% higher actual evaluation cost.
It is not selected for publication. The real temporal false approvals remain
unresolved; the parser fix does not make semantic judgments correct.

## Frozen baseline and evidence limitations

Starting revision: `dfa8234`, branch `feat/v3-post-integration`.

The development set references immutable, hashed existing fixtures:

- Full acquired Replit, Anthropic and security-roundup articles, bad retained
  bodies and supported alternatives in `v3-factual-reliability.json`.
- Prior date-instruction and source-layout results, including their failures.
- The Oura/MIT saved production responses and the earlier 20-article space run
  were reviewed offline; these were not relabelled as unseen held-out cases.

The new `v3-controlled-baseline.json` freezes nine explicitly synthetic sources,
**21 distinct held-out cases**, prior reader history, and a seven-item ordinary
batch. Categories cover dates, attribution, shared factual scope, modality,
negation, forecasts, concise omissions, correction counts, new information and
confirmation without new information. The ordinary batch contains two independent
ministry items from one article, plus unrelated items, a real update relative to
the supplied history, and a correction. It does not juxtapose two alternative
drafts of the same story. Its seven items reuse cases from the 21-case set and
must not be counted as seven additional independent examples.

Labels are assistant-reviewed entailment judgments tied to explicit synthetic
source passages, **not independent human gold**. The development fixture contains
an acknowledged disputed full-security control and overlapping alternative
versions that can legitimately look redundant in a batch. Original source bytes
were neither rewritten nor repaired. Source hashes and exact paid request hashes
are checked offline. `eval/controlled-baseline.ts` reconstructs all ten requests
without provider access.

### Baseline strengths and actual errors

- V3 previously persisted five small AI NEWS editions with seven source-linked
  items. All ten calls settled for $0.0447756; engine processing was 11.5–15.5s
  per edition. Prior-reader memory grew and no repeated published item was seen
  in that sample. This was delayed backlog recovery, not on-time delivery proof.
- Both the Oura filing date and MIT paper-posting date were introduced by the
  editor and falsely approved. The source article timestamp was not sufficient
  support. UTC storage itself is not shown to be the cause.
- The previous 20-article space run persisted six items, 20/20 source-integrity
  checks passed, and one unsupported sentence was automatically repaired.
  Source-relative signing chronology still passed incorrectly. One body was
  partly encoded and another had conflicting freshness metadata: these limit
  quality judgments and must not be attributed solely to the verifier.
- Earlier incorrect security grouping and joint attribution were approved in
  recorded tests. Full security and alternate shorter versions in one batch
  also create redundancy confounds; a redundant verdict is not proof that the
  model understood the underlying factual mistake.
- Supported paraphrases have been rejected. Prompt/layout candidates previously
  failed to establish a reliable improvement and were already reverted.

## Cause investigation and retained fix

The unchanged parser used `Number(row.i)` and a Map keyed by item number:

1. `null`, `false` and the string `"0"` became index zero and could approve it.
2. A response with `fix` then `ok` for index zero silently kept the latter.
3. Correctly numbered out-of-order verdicts mapped correctly, including shared
   source evidence. Sparse repair numbering continues to pass its regression.

Four safety assertions failed against the original engine; all pass after the
small fix. Require a numeric integer in the batch's range and reject duplicate
valid indices. These malformed responses use the existing `callJson` correction
path, with its existing one corrective retry; repeated failure aborts. No new
inference stage, mandatory call, queue or financial path was added. Valid response
call counts remain unchanged. No recorded live response reviewed here establishes
that these malformed indices caused the known Oura/MIT errors; their returned
indices were valid.

The parser cannot detect a valid item number paired with a semantically wrong
explanation. The earlier adjacent-alternative batch demonstrated that separate
model behavior. Neither model did it in the seven-item ordinary batch here.
Production-shaped semantic association failures are therefore **not reproduced**,
not ruled out. Do not add machinery to fix a production mechanism not established.

Complete source evidence and correct identifiers were present for the real date
misses. This supports a semantic interpretation failure, but does not isolate
model capacity versus ambiguous instructions as the sole cause. The earlier
instruction/layout experiments provide negative evidence against those particular
changes, not proof that all such changes are ineffective.

## Controlled experiments

The first phase used deterministic/replayed checks only, with no paid calls.
After the user's new explicit approval, four development calls were run, followed
by six held-out calls because the candidate showed enough promise to test once.

All requests: JSON mode, temperature 0.1, output limit 2,000. Same system prompt,
source evidence, drafts and labels for each matched pair. Only verifier route
changes; Gemini thinking is explicitly disabled. This is a defined model/mode
configuration comparison, not a study isolating thinking effort separately.
No tools or search, automatic retries, alternate-provider retries or repairs.
Full output/usage was saved before settlement; uncertain outcomes would stop
the experiment with their full reservation held. Each call was reserved through
the existing accounting code; the frozen ten-call plan and cumulative conservative
exposure check enforced this task's new authorization independently of staging's
tracking-only operating setting. No old authorization was reused or edited.

| Candidate | Development result | Held-out result | Decision |
|---|---|---|---|
| Existing GPT-4.1 mini | Three bad drafts approved; one marked redundant. Two supported Replit alternatives unnecessarily flagged; another overlapping correct Anthropic version marked redundant | 21/21 expected decisions; ordinary batch 7/7 | Keep baseline routing |
| Gemini 2.5 Flash, thinking disabled | One bad draft approved; two flagged; one marked redundant. Seven supported alternatives accepted | 21/21 expected decisions; ordinary batch 7/7 | No demonstrated held-out advantage; do not retain |
| Strict verifier index parsing | Four deterministic safety failures before fix; zero afterward | Normal shared-evidence mapping and valid calls unchanged | Retain confirmed bug fix |
| Previous date instruction | Caught retained date errors but increased held-out false rejections | Prior documented comparison | Rejected; not repeated |
| Previous metadata/text separation | Missed both real date errors | Prior documented comparison | Rejected; not repeated |

The development numbers need interpretation. Gemini's Replit explanation includes
questionable calendar reasoning and objections to a combined revenue sentence;
an output labelled `fix` is not automatically a correct diagnosis. Its security
explanation identifies a genuine Google/Microsoft actor/action issue but does not
diagnose every incorrect exploitation-status implication in the same paragraph.
Its source-relative Anthropic “today” miss remains. No downstream repaired output
was evaluated, so reduced unsupported claims after repair is **unproven**.

The held-out incorrect group contains ten factual errors and one pure repetition
case; both models catch all ten and mark the repeat redundant. All ten supported
cases pass. These short synthetic sources are easier than full real articles.
The flawless held-out score indicates a coverage ceiling in this small set, not
general model reliability or superiority. No model was tuned against its held-out
responses and no further paid trial followed.

## Separate editorial relevance findings

No editor-model comparison was authorized or run. Existing AI NEWS evidence shows
Oura's mainly patent-related lawsuit included while a16z's move into AI/robotics
was omitted as “venture fund rebranding.” That rationale understates a relevant
mandate change, but a short reading budget can justify omissions. Oura/Meta and
Warhound have varying indirect AI relevance. This is a prioritization concern,
not a factual verifier defect or proof every omitted detail must be published.

The frozen editorial rubric separates must-consider public-service, banking,
safety and material-update stories from optional detail and paid promotion.
“Must consider” is not exhaustive article reproduction. Prior-reader history
distinguishes a second outlet confirming a known closure from reopening and
corrected inspection counts. Source-grounded semantic selection quality on this
rubric remains unmeasured: verifier results are not editor selection results.

## Actual cost, latency and recurring-cost implications

Public OpenRouter model catalog read on October 23, 2026:
`https://openrouter.ai/api/v1/models`. Prices per million input/output tokens:
GPT-4.1 $2/$8; GPT-4.1 mini $0.40/$1.60; Gemini 2.5 Flash $0.30/$2.50.
Gemini lists separate internal reasoning pricing, hence the explicit disabled
setting. Availability/support for JSON parameters was inspected and the actual
responses were usable. These checks do not qualify it for unattended publication.

| Five matched evaluation calls | Input/output tokens | Actual cost | Mean provider-plus-settlement time |
|---|---|---|---|
| GPT-4.1 mini | 17,987 / 949 | $0.0072156 | 3.193s |
| Gemini 2.5 Flash | 18,945 / 2,256 | $0.0094200 | 3.243s |

Actual prices include provider-reported accounting/caching effects; input sizes
and tokenization differ. Gemini's longer explanations outweighed its cheaper
input price in this run. One sample per group is not a latency distribution.
These timings exclude reservation/setup and are not article-to-delivery latency.

Whole-workflow observations, not merely verifier prices:

| Previously measured workload | Calls | Actual inference cost | Engine time |
|---|---|---|---|
| No acquired articles | 0 | $0 | 0 |
| Small AI NEWS editions, 1–3 input articles | 2 each | $0.008955 average | 11.5–15.5s |
| 20-article space replay, one repair/recheck | 4 | $0.0723856 | 24.159s |
| Earlier 21-article larger/chunked run | 10 | $0.2605756 | 59.128s |

These are different corpora, not equivalent-workload speed comparisons. A quiet
window with articles that the editor rejects still costs an editor call; zero
cost applies only when no eligible input reaches inference. The larger run is
not evidence of a saturated production distribution.

In the 20-article case, editor $0.055474 + initial verifier $0.0046684 + repair
$0.010204 + recheck $0.0020392 = $0.0723856. Total verifier cost is only about
9.3% of the workflow. One unnecessary GPT-4.1 repair can cost more than both
verification calls together. A fixed-token counterfactual replaces $0.0067076
of mini verification with $0.0052088 of Gemini verification, giving $0.0708868
total: about 2.1% cheaper **only if** token usage, repairs and editor output stay
identical. Actual comparison output lengths differed, so this is not a measured
pipeline saving. No viable configuration won a candidate full-pipeline test.

Illustrative 30-day, 30-minute schedules, inference only:

- 1,440 nonempty windows at the small measured average: approximately $12.90.
- 80% genuinely input-empty windows and 288 small nonempty windows: $2.58.
- A 20-article repaired workload every window: $104.24.
- The earlier 21-article/10-call workload every window: $375.23.

These deliberately conditional scenarios are not forecasts of all feeds. Real
volume, article lengths, chunks, repairs, caching and empty-window share must be
measured per feed. Acquisition/Cloudflare costs are excluded. Thus no sustained
cost reduction is claimed for a verifier swap.

## Fresh deadline-to-publication requirement

Previously saved AI NEWS editions were recovered backlog and do not prove timely
delivery. A read-only check of the two newly created Lebanon feeds found no
briefing requests yet at this evaluation's read-back; their first closes were
still upcoming at 13:14:53.352 UTC (16:14:53.352 Beirut). No schedule or live feed
was modified or manually invoked. Fresh nonempty automatic deadline-to-persist
latency is **not measured** here. It remains necessary to observe a genuinely
nonempty close, record its fixed deadline and persisted timestamp, and separate
acquisition delay, queue delay and inference duration. Do not substitute a replay
or quiet-window completion for that measurement.

## Reproducibility, tests and remaining work

- Frozen sources/development hashes: `test/fixtures/v3-controlled-baseline.json`.
- Offline request reconstruction: `eval/controlled-baseline.ts`.
- Ten exact response texts, request hashes, tokens, costs and scored rows:
  `benchmarks/results/v3-controlled-reliability/summary.json`.
- Raw requests/provider replies, explicit authorization, catalog snapshot and
  independent ledger read-back: `.local-reports/v3-controlled-baseline/` locally.
- Original sources/financial holds untouched; key stays in ignored `.dev.vars`.
- Briefing package: **59/59 tests pass**, including prior repair-numbering tests.
  Briefing and Worker TypeScript checks pass. Focused Worker V3 persistence,
  spending, source integration and window/recovery tests: **39/39 passed**.

Only the confirmed parser fix should be reviewed for merge. No semantic-model
winner, prompt change, layout change or relevance change is justified yet.
The next useful paid work would require a separate explicit authorization and a
harder, independently reviewed real held-out corpus, with finalists tested through
repair and publication. It is not justified merely because this budget has money
left. Fresh autonomous delivery observation and human review of relevance can
proceed separately without introducing new product stages.

## Separately authorized Haiku 5.5 follow-up

The user subsequently approved **five calls, at most $0.02**, explicitly for
`anthropic/claude-haiku-5.5` on these frozen verifier inputs. This did not reuse
the preceding approval. Two development calls were followed by the three held-out
groups after an encouraging actor/action finding. No new editor, repair or
full-pipeline calls, retries or deployments were performed.

Haiku used `reasoning: {effort: "low"}`, JSON mode and the same 2,000-token total
output cap. The OpenRouter catalog did not list temperature support, so temperature
was omitted; the baseline used 0.1. This is a **configuration comparison**, not
an experiment isolating only model identity. Sources, drafts, system prompt and
reader history are unchanged. The model reported 3,677 reasoning tokens across
the five calls, included in actual billed usage. All replies finished normally.

| Frozen group | GPT-4.1 mini | Haiku 5.5 low |
|---|---|---|
| Anthropic source-relative “today” error | Falsely approved | Falsely approved |
| Replit timing error | Falsely approved | Falsely approved |
| Google/Microsoft wrong shared attribution | Not diagnosed | Correctly flagged |
| Seven supported development alternatives | Two unnecessary fixes; one redundancy judgment | Six accepted; one disputed metric objection |
| 21 distinct held-out cases | 21/21 expected decisions | 21/21 expected decisions |
| Ordinary seven-item batch, reusing held-out cases | 7/7 | 6/7; one false rejection |

The ordinary-batch rejection is concrete: “The utility plans up to six hours of
daily supply from November 2 if fuel arrives” was flagged for omitting that the
schedule was not guaranteed. It already preserves the plan, upper bound and fuel
condition; the missing redundant disclaimer does not make it false. Haiku accepted
this exact item in the supported-only batch. Thus the held-out result is sensitive
to batching; do not report this model as flawless on the held-out set overall.
Its issue was attached to the correct item number. No wrong-item association was
observed in this ordinary batch.

The disputed development objection concerns “reducing distillation attacks by
up to 99%.” The source measures data harvesting through those attacks, about
90–99%. The fixture's label was already documented as questionable because it
changes the measured quantity. Haiku's specific objection about dropping the 90%
lower bound is not automatically a sound factual criticism, but this control is
not independent gold and must not be counted as a certain false rejection.
The ordinary conditional-electricity false rejection alone prevents selection.

Actual matched five-call cost: **$0.0057072**, versus mini **$0.0072156** and
Gemini **$0.0094200**. Haiku was about 21% cheaper than mini in this evaluation,
not the 75% savings one might infer from input-token list prices alone. Its mean
provider-plus-settlement time was **11.778s**, versus mini **3.193s** and Gemini
**3.243s**. Individual Haiku times: 21.940, 10.027, 15.480, 8.352 and 3.090s.
These are single observations on fixed groups, not full-briefing delivery times
or model latency percentiles. Reasoning/output lengths, tokenization and cache
effects differ.

All five reservations settled; zero new outstanding experiment holds. No old
financial records or live feed data changed. All five allowed calls are used;
unused dollars do not authorize another trial. Exact sanitized results are in
`benchmarks/results/v3-haiku-controlled/summary.json`; raw requests, provider
payloads, the approval manifest and ledger read-back are local in
`.local-reports/v3-haiku-controlled/`. Offline reconstruction checks every request
hash. The tested configuration is **not selected**: its cost advantage does not
yet establish sustainable whole-pipeline savings, particularly when a false
rejection can trigger a much more expensive GPT-4.1 repair and recheck. No routing
or prompt change is retained and no full-pipeline improvement is claimed.
