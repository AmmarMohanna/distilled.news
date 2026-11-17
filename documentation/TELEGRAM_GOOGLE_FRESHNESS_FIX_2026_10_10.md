# Telegram and Google News QA fixes — 2026-10-10

This updates the failures recorded in `USER_FEED_COLLECTION_CHECK_2026_10_10.md`.
The changes apply to the isolated sources QA Worker and its private VPS helper.
They do not establish exhaustive source recall or a verified live published edition.

## Changes

- Telegram cold starts select the latest bounded message window, ordered by ID,
  instead of beginning at the channel's first-ever post. Bootstrap coverage is
  explicitly partial. After durable intake accepts the complete saved snapshot,
  its cursor advances; subsequent polls retain oldest-unseen ordering to avoid
  skipping a busy channel's new-message backlog. Retained edit/delete rechecks
  remain separate from the new-message cursor.
- Google News uses one bounded private decode batch, with six concurrent decodes,
  a 35-second scheduling deadline and at most 30 fresh decodes per call. It reads
  cached results across up to 500 listing URLs, including later snapshot pages.
  Successful public publisher links are cached for one day, capped at 5,000 rows.
  Subsequent polls therefore spend the decode budget on unresolved links. Cache
  failures do not discard decoded results. Publisher destinations are validated;
  this decoder does not fetch publisher pages. Failed decodes retain listing URLs.
- Multi-source maintenance synchronizes the whole approved source set before
  scheduling requests, preventing enrollment of a later source from invalidating
  the configuration revision already scheduled for an earlier source.
- The token-protected QA probe now exposes bounded saved-snapshot offsets, so a
  diagnostic run can finish its intake slices without repeating the provider call.
  Source approval, family, revision and replay checks still apply.

## Live verification

The owner's feed is `briefing_a863c4eb-f206-4391-85b8-60b7d2a97983`,
“Bitcoin ETF flows and US crypto regulation.”

Telegram accepted Cointelegraph posts 72586–72588 dated 2026-10-10. Finishing the
saved batch advanced the durable cursor to 72588. The next live poll used that
cursor rather than collecting the channel's first posts again. An older retained
edit recheck was also returned; it did not advance the new-message cursor.

Google News accepted publisher-link updates for 12, then 24, then 30 distinct
items across bounded free polls. A read-only audit found that one of the original
30 listings had moved beyond the first page, motivating the later-page fix above.
The final later-page probe accepted its second saved slice without another
provider request. A subsequent read-only audit matched the original 30 item keys
against their latest stored observations: **30/30 now have publisher links**.
The probe's remaining snapshot offset is 60; this bounded check did not drain
every later RSS entry or prove exhaustive Google News recall.

Only this test source's obsolete Telegram cursor `3` was removed to permit the
recent bootstrap. Its old pending backfill job was cancelled with
`SUPERSEDED_RECENT_BOOTSTRAP`. Historical evidence, receipts and initial rejected
stale-revision batches were preserved. No D1 schema migration was required.

## Deployment and validation

- QA Worker version: `b19a7c3e-29c0-4731-8725-36aebbe6f037`.
- Installed Python helper SHA-256:
  `8e994e19244e35b1073c3531e6a4780bc0c8d0412dd46f5f914af902111eacc8`.
- Original helper backup: private VPS directory `backup-freshness-20261010`.
  The service starts a fresh Python child for each call and remains active.
- Connector suite: 198 tests passed. Affected Worker tests: 37 passed.
  Python execution tests: 18 passed. Worker typecheck passed.
- QA homepage and `/api/auth/session` returned HTTP 200.
- Regular cron remains disabled, paid provider limits remain zero, and the
  verification calls reported zero provider cost. Historical paid reservations
  were unchanged. Production was not deployed and no changes were pushed.

Google observations retain `LISTING_RESULT` / `UNKNOWN` completeness even when
their URL resolves: resolving a link does not prove full article acquisition.
Live Telegram edit/deletion behavior still requires a controlled channel. This
turn did not add frontend collection status or verify a new live briefing.

Ignored local evidence: `.review-tmp/freshness-verification.json`,
`.review-tmp/freshness-final.json`, `.review-tmp/google-pages-final.json`,
`.review-tmp/freshness-audit.json`, and the `source-freshness-*-final.log` files.
