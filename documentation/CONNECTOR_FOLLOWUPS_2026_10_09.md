# Connector implementation follow-ups (2026-10-09)

This branch adds public Telegram username verification through the private source-execution service, domain and category RSS discovery, provider-free input normalization, richer retained RSS payload metadata, recent Telegram edit rechecks, and an owner-only connector health endpoint. Tests here are local/synthetic. The October 9 live QA results remain recorded separately in `SOURCES_QA_LIVE_2026_10_09.md`.

Deployment must update the VPS `source-execution.py`, `source-execution.mjs`, and server together with the QA Worker. The new `telegram_resolve` operation is unavailable on an older helper. Deploy the additive connector migrations before enabling polling; coordinate shared staging with the intake owner. No provider credits are required for these code-only tests.

Open validation and interface work:

- Prove Telethon session expiry, reconnect/restart recovery, renamed/unavailable channels, recent edit rechecks, and explicit deletion evidence live. Missing messages remain insufficient proof of deletion. The public Telegram page remains partial coverage.
- Resolve X profiles to stable account IDs at approval with a paid-operation fence, and retain reply/quote/thread context only when verified by the provider. Tweet IDs are already stable across TwitterAPI.io and Apify; author IDs are now preferred when available.
- Test Google News redirect resolution to publisher article URLs under a bounded public-network policy. The feed's publisher/source metadata is retained, but an opaque Google RSS article link is not treated as a proven publisher URL. Cross-source article dedup and EvidenceRevision acceptance belong to intake/downstream.
- Perform bounded full-article acquisition for RSS excerpts when the publisher URL is available. The connector now preserves headline, original excerpt, author, source title and dates in its payload; the existing acquisition schema does not promote all these fields to published evidence.
- Verify LinkedIn incremental recall, Apify recovery, Playwright escalation, Zyte blocked-site fallback, and uncertain paid outcomes with bounded live tests. Do not infer historical completeness from a successful feed or actor run.
- Extend the health view with per-source paid-operation attribution and retained long-term cost/latency trends. The current endpoint reports durable connector jobs, cursors, batch counts, coverage and recorded failures, without exposing raw provider data.
- Confirm source removal/reenabling and historical evidence retention with the intake owner. Shared collection across multiple feeds needs an explicit scope/authorization design; current collection is FeedSource-scoped.

No shared contracts or downstream intelligence schemas were changed in this branch.
