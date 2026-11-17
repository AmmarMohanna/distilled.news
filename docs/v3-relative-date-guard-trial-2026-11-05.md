# Relative-date publication guard trial

**Status: implemented as an opt-in candidate; not promoted.** V4 remains the selected runtime. This is a small factual-safety experiment prompted by the stopped evidence-first v2 evaluation, not evidence that a general semantic verifier has been solved.

## Observed failure and root cause

The retained Arabic fund item said Anthropic made its commitment “today”, although its only source was published 2026-10-18 and the briefing cutoff was 2026-10-20. The evidence-first editor and verifier both saw the timestamp and cutoff, yet accepted the claim. The matching Replit failure separately strengthened a possible spending effect into an actual usage reduction. These are generation and verifier-discrimination failures; the retained review rules out source identity, citation transport, evidence truncation and request-schema failure as explanations.

The existing prompt already instructs the writer and verifier not to transfer source-relative dates into the reader's cutoff-relative timeline. Prompt wording alone did not prevent the accepted failure. The new guard therefore addresses only the fully decidable temporal subset, not modality or general fact checking.

## Candidate

`generateBriefing(..., { safetyGuard: 'relative-date-v1' })` adds no model call and leaves default V4 request bytes unchanged.

When an item contains a reader-facing relative-date term (`today`, `yesterday`, `tomorrow`, or their Arabic counterparts), all cited sources have valid publication days, and **every** cited source predates the reporting-cutoff day, the item cannot be accepted on an `ok` verdict. It enters the existing targeted repair/recheck flow. If a repair still leaves the violation, the item is carried rather than published.

The guard intentionally does not infer event dates, inspect sources outside the citation set, detect translation quality, or judge a source published on the cutoff day. It uses UTC calendar days because the retained source timestamps and briefing cutoff are UTC; this limitation must be revisited if feed-local cutoff semantics change.

## Evidence and verification

- The retained failure is covered with a scripted false-`ok` verifier. With the candidate enabled it must repair to the source-anchored October 18 wording, then pass recheck.
- A separate replay proves the default V4 route still accepts the recorded false approval, so no historical or selected-runtime behavior was silently changed.
- Package type check: pass.
- Briefing test suite: 47 files, 230 tests pass.
- No provider request, deployment, publication, notification, migration, or financial operation was made for this trial.

This proves only the mechanical control and its regression behavior. It does **not** establish natural Arabic repair quality, false-positive rate, reader value, latency distribution, or a solution to the Replit modality/scope error.

## Research basis and adoption decision

TREC Temporal Summarization evaluates incremental information with nugget gain, redundancy and timeliness rather than word count alone. That supports treating reader-time correctness as a publication criterion, but it does not supply an off-the-shelf production guard. [TREC Temporal Summarization](https://pages.nist.gov/trec-browser/trec24/tempsumm/overview/)

NewsEdits distinguishes additions, deletions, edits and refactors in evolving articles, supporting the design principle that textual change must not be assumed to be a material new event. Its data is English/French newspaper revision history, so it is not adopted as a direct classifier for Arabic Telegram/X inputs. [NewsEdits](https://aclanthology.org/2022.naacl-main.10/)

Multi-News and the Wikipedia Current Events Portal dataset demonstrate that multi-document news synthesis and concise event summaries are legitimate targets, but neither establishes temporal grounding or source-faithful multilingual generation in this runtime. [Multi-News](https://aclanthology.org/P19-1102/) and [WCEP MDS](https://aclanthology.org/2020.acl-main.120/)

XL-Sum is useful future evaluation material for multilingual summarization, but it is not a substitute for product-specific Arabic source-faithfulness labels. [XL-Sum](https://aclanthology.org/2021.findings-acl.413/)

QAFactEval finds complementary value in QA and entailment factuality signals. It is deferred: adding a QA stage would increase latency/cost and has not been calibrated for the product's Arabic/English evidence or held-out reader windows. [QAFactEval](https://aclanthology.org/2022.naacl-main.187/)

## Next experiment gate

Before promotion, replay a frozen English and Arabic source-linked set that contains (a) this older-source relative-date failure, (b) same-day relative-date controls that must remain publishable, (c) no-relative-date controls, and (d) a repaired real model output. Compare publication holds, accepted factual claims, extra calls, settled cost and latency with V4. Do not generalize this narrow guard into a modality detector without human-reviewed counterexamples.
