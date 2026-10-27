# Unread catch-up brevity fix ? 2026-10-27

The retained live failures included complete 156/178/185-word outputs rejected by the 120-word parser, plus one independent unknown provider outcome with no retained response. Generic route errors obscured the distinction.

## Focused change

Keep GPT-4.1 mini, one call, 512 output tokens, original full briefing evidence, chronology and 120-word acceptance ceiling. Replace the broad 40?80-word instruction with a request for up to three main developments, three sentences and 80 words, explicitly omitting lower-priority news. No deterministic text cutting or automatic repair calls. Typed output/unknown-outcome errors replace the same generic error for all failures. Unknown requests remain fenced and held. Retained complete responses can be inspected again without paid retry.

## Real bounded comparison

Same four inputs as the preceding model trial, including a synthetic correction control; prompt brevity instruction is the changed variable. Four calls, $0.0023404 actual, all settled, no outstanding evaluation holds. No deployment, notifications or live configuration changes.

| Case | Baseline mini words | Revised words | Revised time | Actual USD |
|---|---:|---:|---:|---:|
| development-correction | 23 | 21 | 1.056 s | 0.0001568 |
| heldout-arabic | 58 | 57 | 1.884 s | 0.0005056 |
| heldout-english-news | 84 | 72 | 2.242 s | 0.0004912 |
| retained-overlong-failure | 127 | 69 | 1.778 s | 0.0011868 |

Acceptance increased from 3/4 to 4/4 in this replay. Mean revised latency 1.740 s versus baseline 2.601 s. Small one-shot reused set; not a general latency guarantee.

## Semantic review and limits

AI-assisted review against supplied briefing text, not original sources. Correction retains up-to-10% proposal and approval condition; English preserves three developments while dropping messaging-app overview. Arabic still strips preliminary attribution from the Qantara report and Channel 12 attribution from the confrontation, also present in the baseline. Large batch now selects a few developments rather than listing everything, but still packs multiple Apple announcements into a sentence and omits Microsoft; importance recall is not independently established. No claim of solved factual reliability. The prompt reduces observed overlength failures, not uncertain transport outcomes. All exact sources, outputs and receipts are local.

