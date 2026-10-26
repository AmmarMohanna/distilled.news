# Unread catch-up summary (not yet enabled)

## Interface

The feed reader has a compact **Summarize unread** action beside search on desktop and below it on phones. A short paragraph opens inline above the briefing timeline. It supports the existing light/dark themes, Arabic RTL, enlarged text, reduced motion, keyboard focus and screen-reader status updates. It does not mark briefings read, publish editions or send notifications. There are no coverage dates or briefing-count labels.

## Behavior

- Signed-in, verified readers only; existing private-feed ownership checks apply.
- Server-owned, published briefing text only. The client supplies read identifiers, never evidence or a reporting cutoff.
- Maximum 24-hour lookback, newest complete briefings within 24,000 UTF-8 input bytes, supplied chronologically. Stop at the first capacity gap so an older account cannot bypass a newer correction. If the newest briefing alone is too large, return an explanation without inference.
- GPT-4.1 mini candidate, one call, 512 output-token limit, requested 40�80 words (shorter for quiet periods). No automatic model retries or repair calls.
- Cache identity includes reader, feed, exact unread evidence, language, model and prompt. Concurrent clicks share one durable claim. Reopening the same result does not invoke inference again.
- Production uses the existing account-spending reservations, provider admission, actual-cost settlement and immutable provider receipts. An uncertain operation is not resent. Historical financial records and holds are untouched.
- The cache is separate from immutable publication evidence; migration `0070_unread_summary_cache.sql` is required.

## Qualification and activation

**Not deployed and not enabled.** Activation requires migration 0070, `BRIEFING_ENGINE=v3`, an OpenRouter key, and explicitly setting `UNREAD_SUMMARY_ENABLED=true`. Keep that flag unset until the real model evaluation passes. Existing V3 editor/verifier prompts, scheduled publication, source collection and notifications are unchanged.

## Evaluation, October 26, 2026

Eight frozen cases were prepared under the user's explicit eight-call/$0.10 authorization: six saved published-news replays and two labelled correction/uncertainty controls, with development and held-out editions separated. The conservative combined maximum reservation was $0.0151288. These are summary-of-briefing tests, not original-article factual audits.

The run stopped before any provider request. First, an attempted cache insert hit the existing feed foreign key; inspecting the real schema also showed publication-document immutability, so catch-up cache state was moved into its own small table. Subsequent checks of the existing evaluation ledger returned D1 CPU-limit/reset and internal errors, including reference `e_PVSMDp_b484321916694b4caba70d4a804f2d03`. No inference retries were made. The original attempt and error evidence are retained.

**Initial remote-ledger attempt: 0 model calls, $0 inference cost; model quality and latency were unmeasured at that point.** See the completed model-only follow-up below for subsequent paid results. Mocked responses establish integration behavior, not model quality. Do not enable the feature based only on these tests. No old grants, reservations, settlements or holds were reset.

Local evidence: `.local-reports/unread-summary/` contains the frozen plan/authorization, exact inputs, preserved attempt/errors, test logs and desktop/mobile screenshots. Nothing sensitive or large from that directory is committed.

## Verification

- Full frontend unit suite: 73 passed.
- Full browser suite: 479 passed, one existing skip (before the final added Arabic accessibility cases).
- Focused browser coverage: 14 passed, including 320px Arabic with enlarged text.
- Focused worker tests: 30 passed across core summary preparation/cache (9), API access and evidence selection (7), real-schema provider accounting (3), and existing V3 spend regressions (11).
- Worker/web/E2E TypeScript checks and the application build (Worker dry run) passed.

Next: restore the evaluation ledger's availability, then run the already-frozen model qualification under a valid authorization. Independently assess important-news retention, faithful corrections/uncertainty, brevity and actual model time/cost before activation. No further prompt search is proposed.

## Completed bounded model-only follow-up

After the remote evaluation database failed even `SELECT 1`, the frozen cases were run using the existing durable local `V3SpendGuard`, under the same eight-call/$0.10 authorization and original expiry. No account guard was removed or historical remote record changed. The Windows persistence path was shortened after SQLite could not open the initial deeply nested path; this happened before inference. No model retries or prompt changes were made.

All eight calls settled: **$0.0031724**, 4,767 input tokens and 791 output tokens. Seven summaries were persisted and read back from the local cache; one was rejected for length. Output word counts were **106, 55, 65, 23, 79, 84, 60, 41**. Six met the requested maximum of 80 words; seven met the application ceiling of 100. For seven retained timings, model latency ranged from **1.089 to 1.731 seconds**, median **1.589 seconds**. The first rejected call's exact latency was not retained. These are saved-briefing replay timings, not live delivery measurements.

**Decision: keep disabled.** Independent AI-assisted input/output review found unsupported distinct-drone identity in Arabic; definite Starshield restoration where evidence only said it appeared normal and testing continued; and loss of preliminary/report attribution in another Arabic case. The political-bias summary omitted important forced-choice/API-only limits. The correction control correctly retained the corrected proposed 10% increase and pending approval in 23 words. The other control retained developing robots and attributed allegations, but its amid wording risks an unsupported connection. Cheap, fast JSON and successful cache persistence do not establish factual reliability.

Exact inputs, outputs, provider usage and item-by-item findings are in `.local-reports/unread-summary/model-results.json`, `model-review.json` and the corresponding provider/input artifacts. Local financial history persists at the repository root in `.local-reports/unread-eval-20261026`. No further paid experiments are authorized by this exhausted eight-call scope. A small, separately authorized instruction comparison could test selective compression and preservation of epistemic qualifiers; do not broaden prompts or enable this candidate based on these results. Live Cloudflare integration remains blocked separately.

A separate process reopened the persisted local database after the run and confirmed **8 settled operations totaling $0.0031724**, **7 ready summaries** and **1 failed summary**, with no outstanding hold in this new evaluation ledger (`independent-readback.json`).

## Length tolerance adjustment

At the user's request, the application now accepts summaries of up to **120 words** while retaining **40?80 words** as the writing target. The recorded 106-word output therefore passes the current length check. Historical evaluation records above retain the original 100-word policy and its actual rejection; no paid operation is retried or retrospectively rewritten. This change does not resolve the independently identified factual failures or enable deployment. Boundary regressions cover 106, 120 and 121 words. No further inference was needed.
