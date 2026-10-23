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
