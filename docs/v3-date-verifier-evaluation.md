# V3 date verifier comparison — October 23, 2026

The proposed general date-checking instruction was tested and **reverted**. It
caught the retained errors, but increased false rejections on fresh supported
examples. No product prompt, model routing, deployment or pipeline change remains.

## Experiment

The candidate instructed the existing verifier to connect each stated date to
the event and supporting source passage, omit unsupported dates, accept supported
timezone conversions, and associate issues with the correct numbered item.
It added no model calls to the product and named no particular company.

All evaluation requests used `openai/gpt-4.1-mini`, temperature 0.1, JSON mode,
and a 3,000-token output limit. Baseline/candidate held-out requests differed only
in the system prompt. There was one response per request, with no paid retries.

| Evaluation | Baseline | Candidate |
|---|---|---|
| Retained Oura incorrect filing date | Approved in preceding baseline test | Flagged |
| Retained MIT unsupported paper date | Approved in preceding baseline test | Flagged |
| Two real-source controls with unsupported dates omitted | Both accepted | Both accepted |
| Four fresh incorrect examples | Three flagged, one falsely approved | All four flagged |
| Four fresh supported examples | One falsely rejected | Two falsely rejected |

The fresh cases are explicitly synthetic: an updated recall article, a source
published before local midnight but after UTC midnight, an undisclosed permit
date, and an announcement of a conditional future launch. Correct versions
preserve accurate concise paraphrases and omit unnecessary details.

The candidate rejected “Cobalt has obtained a construction permit, with work
expected to begin in December” because it omitted that the approval date was
undisclosed. That omission does not make the statement inaccurate. Both prompts
also rejected the correct source-local date in the midnight example. This small
sample supports rejecting this candidate, not estimating general error rates.

The real-source paired tests used full retained articles and the exact failing
body paragraphs, but reused the source article titles as test headlines rather
than the published briefing headlines. The common reporting cutoff was October
25, not each original window close. The candidate's bad Oura verdict also added
an unnecessary criticism of its source headline. Consequently these controls
are not a complete replay of publication and do not establish perfectly precise
issue explanations.

## Decision

The candidate does not meet the requirement to catch errors without rejecting
accurate prose. The product prompt was restored byte-for-byte. Repair calls were
not run after this failed acceptance check; there is no claim of improved repair
or end-to-end publication quality. UTC storage remains appropriate. Neither
these results nor the preceding baseline establish that delayed publication
caused the date errors.

The next investigation should compare a small evidence-presentation change that
distinguishes source-local publication context from normalized UTC timestamps,
using the same supported controls. That is a hypothesis, not an implemented or
proven fix. Avoid adding more date instructions without comparative evidence.

## Evidence, accounting and checks

- Eight new calls, **$0.0050248** actual inference charges, all settled and read
  back from the existing staging accounting ledger. No new outstanding evaluation
  holds, historical accounting changes or production mutations.
- This is additional to the preceding seven-call baseline ($0.0049324); combined
  date investigation charges are **$0.0099572**. Infrastructure costs unmeasured.
- Candidate real controls: 3.249, 1.411, 2.160 and 1.470 seconds. Held-out baseline
  calls: 2.524 and 1.853 seconds; candidate: 2.141 and 2.304 seconds. These timings
  include provider response and settlement, exclude admission/setup, and are not
  acquisition-to-delivery latency.
- Safe synthetic requests, labels, hashes and actual responses are committed in
  `packages/briefing/test/fixtures/v3-date-prompt-comparison.json`.
- `date-prompt-comparison.test.ts` checks identical comparison inputs, artifact
  hashes and the observed false approvals/rejections. These are recorded-outcome
  regressions, not fresh model qualification tests.
- Full real-source requests, responses, reservations and ledger read-back remain
  locally in `.local-reports/v3-date-candidate/`; the preceding baseline is in
  `.local-reports/v3-date-evaluation/`. Credentials are excluded.
- Focused factual/recorded/repair-numbering regressions: **12/12 passed**.

No staging deployment or reader notifications occurred.

## Follow-up: separate metadata from source text

The requested evidence-presentation alternative was also tested, without editing
the product. Each source's existing combined header became separate labelled
`ARTICLE METADATA (publication timing, not event timing)` and `ARTICLE TEXT`
blocks. No source text, timestamp, system prompt, model or decoding parameter
changed. Missing publisher-local timezone information was not invented.

This follow-up used the **actual published briefing headlines** and exact body
paragraphs for both real cases, correcting the earlier test-headline limitation.
Both bad/good variants were tested separately with baseline and presentation
formats: eight calls. Two additional calls tested the presentation on the same
synthetic bad/good batches, reusing their saved identical baseline results.

| Result | Baseline | Separate metadata/text |
|---|---|---|
| Two incorrect real paragraphs | Both falsely approved | Both falsely approved |
| Two supported real alternatives | Both accepted | Both accepted |
| Four incorrect synthetic examples | Three caught | All four caught |
| Four supported synthetic examples | One falsely rejected | One falsely rejected |

The layout helped one synthetic judgment but did not resolve either real failure.
It was **not retained as a product fix**. Single responses do not establish a
general improvement or statistical significance. Do not continue accumulating
prompt instructions or layout changes on the strength of synthetic results alone.
The existing verifier's semantic false approvals remain an acknowledged limitation.

Ten additional calls cost **$0.0046496**, all settled and read back; zero new
outstanding evaluation holds. Combined charges for the initial baseline, rejected
instruction and layout tests: **$0.0146068**. No new editor or repair calls were
made, and this is not an end-to-end publication evaluation. Exact local requests,
results, source relationships and ledger read-back are retained in
`.local-reports/v3-date-presentation/`. Safe synthetic responses are appended to
the committed comparison fixture. No production or staging deployment occurred.
