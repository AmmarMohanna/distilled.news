# Joud source recommendation validation ? October 24, 2026

**Completed: 20/20 tested feeds have 15?20 accepted, enabled, saved sources (392 total).** All twenty test feeds are paused. Final independent stored-source audit: 2026-10-24T19:21:24.021Z.

Branch: `joud/post-integration-fixes`, based on `origin/integrate-aya-v3-post-integration` at `078e0ca`.
Deployment: https://distilled-news-joud.distillednews-platform.workers.dev
Worker version: `4900fa73-545c-46df-9f68-fc38a6f28212`.

## Final results

All results below use the final deployed version. Diabetes required a transport retry. Coffee's save response disconnected; an independent successful readback exactly matched all twenty requested enabled sources. The original incomplete outcomes remain in the raw reports rather than being rewritten as successful HTTP responses.

| # | Topic | Stored enabled sources | Result |
| --- | --- | --- | --- |
| 1 | Artificial intelligence | 20 | Passed |
| 2 | Cybersecurity | 20 | Passed |
| 3 | Solar energy | 20 | Passed |
| 4 | Lebanon economy | 20 | Passed |
| 5 | Lamine Yamal | 20 | Passed |
| 6 | Space exploration | 20 | Passed |
| 7 | Diabetes research | 20 | Passed after transport retry |
| 8 | Electric vehicles | 20 | Passed |
| 9 | Coffee farming | 20 | Save confirmed by exact readback |
| 10 | Marine conservation | 20 | Passed |
| 11 | Quantum computing | 20 | Passed |
| 12 | Lebanese basketball | 17 | Passed |
| 13 | Fashion industry | 20 | Passed |
| 14 | Video games | 20 | Passed |
| 15 | Ancient Egypt | 20 | Passed |
| 16 | الزراعة في لبنان | 15 | Passed |
| 17 | French cinema | 20 | Passed |
| 18 | Open source software | 20 | Passed |
| 19 | Climate policy | 20 | Passed |
| 20 | Sourdough bread | 20 | Passed |

The final audit checks completion, accepted evidence, exact saved-input matches, active source counts, inappropriate archive selections for contemporary topics, and paused feed status. It reports no outstanding issues. Source relevance is assessed from publisher-owned cited evidence; these checks do not establish universal factual accuracy.

## What changed

- Switched X recommendation verification and runtime defaults to funded TwitterAPI.io routing; disabled Apify X routing.
- Restored dedicated VPS Google News transport after verifying the existing egress firewall and service identity. The operator enabled the configuration flag with a backup; the runtime returned HTTP 200 with 100 items.
- Repaired Telegram cached-identity resolution and immediate approval reuse while preserving provider cooldowns and identity checks.
- Required bounded discovery searches, preserved the original user topic during replacement passes, and added equivalent/local-language publisher lookup when necessary.
- Strengthened publisher-owned evidence and relevance checks. Independently checked archive intent to prevent old sports blogs being accepted for current sports topics; added a verified current Lebanese basketball RSS publisher.
- Added bounded model response deadlines, NDJSON heartbeats, and short-lived exact-context assessment receipts so approval can reuse verified evidence.
- Preserved collector reservations, unknown-outcome fences, and retry identities. No financial reservations were reset to make tests pass.

## Validation and procedure

The matrix harness, `scripts/test-source-recommendation-matrix.mjs`, creates or reuses paused test feeds, calls the authenticated diagnostic route backed by the production recommendation implementation, saves through the ordinary owner API, and reads stored sources back. The public recommendation rate limit remains unchanged. No recurring test collection is enabled.

Final code validation passed: 189 Worker tests across twelve files, one connector provider-error test, Worker TypeScript checking, and whitespace checks. Earlier Telegram/runtime and guarded firewall checks also passed. Frontend files were unchanged.

Ignored local evidence is retained under `.local-reports/source-matrix-20261024/`: `final-v13.json`, `recovered-v13.json`, `coffee-readback-reconciliation-v13.json`, `final-source-audit.json`, `final-source-audit.csv`, `current-feed-counts.json`, and `paused-check.json`. The CSV lists the 392 selected source URLs and evidence references. Earlier failed runs remain available separately.

## Budget and scope

The dedicated app daily reservation ceiling is now $125. Provider routing is configured with TwitterAPI.io 15, Apify X 0, Google Apify 10, and LinkedIn Apify 20. Reservations and configured budgets are ceilings, not confirmed charges or vendor credit top-ups.

The Apify account monthly usage limit was raised from $25 to $50 under the user's authorization, without changing its plan. The last recorded account-wide usage was $36.068799 at 2026-10-24T18:56:51.653Z; this is not a measurement of this test's cost alone.

This validates recommendation, approval, and persistence for these twenty topics. It does not guarantee fifteen sources for every conceivable topic, independently audit every publisher's claims, or test complete briefing generation/publication. V3 editing/verification model routing was preserved. The validated changes are maintained on `joud/post-integration-fixes`.
