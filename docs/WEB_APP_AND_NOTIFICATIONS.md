# Web app installation and notifications

The app can be installed from **Settings → Install app (PWA)**. Browsers that expose an installation prompt open it directly; other browsers show their menu instructions. On iPhone, use Safari → Share → Add to Home Screen. Installation and notification delivery depend on browser support. Use HTTPS in production; localhost is supported for development.

**Settings → Notifications** toggles this device's subscription. Permission is requested only after a click. New published briefings in the signed-in account's own feeds trigger a generic notification linking to Home. Existing history is not announced when subscribing. Delivery runs in the existing minute cron, groups pending editions into one device notification, retries failures, and removes expired subscriptions. Push can arrive with the app closed. It is not guaranteed delivery, and device settings can suppress it.

The service worker provides an offline explanation and retry action. It does not cache personal/API responses or provide offline reading. Speech input still uses the browser's speech service; no transcription API key is needed.

## Reader history and retention

The web reader requests `/api/feed/:username/:slug` with `X-Distilled-Reader-Timeline: 1`. API clients can use `?timeline=1` and pass `timelineNextCursor` as `before` to retrieve the next page. Each page presents up to eight published briefings, newest first by publication time, with the edition ID breaking ties. The Worker selects 24 hours for 30- and 60-minute schedules, 48 hours for 120-minute schedules, and 72 hours for 360-minute, 720-minute, daily and slower schedules. Persisted scheduling data takes precedence over the legacy cadence label. The ordinary feed response and retained search keep their established retrieval bounds. Direct edition and evidence reads still require publication and feed access checks.

The timeline seeks the existing publication timestamp indexes and hydrates only a bounded set of editions and citations for each response. This limits D1 result size, optional R2 reads, and browser payload. Measure query rows scanned, response bytes, latency, and database size separately on the target database. [Cloudflare D1 metrics](https://developers.cloudflare.com/d1/observability/metrics-analytics/)

The reader cutoff has no effect on stored editions, citation links, original source evidence, published story history, or the history used to decide novelty and issue corrections. The cutoff also has no effect on financial records or recoverable work. D1 storage continues to grow with retained data. [Cloudflare D1 storage limits](https://developers.cloudflare.com/d1/platform/limits/)

A separate retention review could begin with derived response caches whose durable provider receipts remain available, or already terminal and unreferenced operational payloads. Moving published content or evidence to R2 would first need a verified manifest, bounded fallback reads, a restore test, and reference checks covering search, citations, corrections, novelty, pending recovery, and financial reconciliation. Apply `0104_channel_follows.sql`, `0105_social_push_events.sql`, and `0106_legacy_feed_read_versions.sql` in order. The last migration adds triggers for legacy publication changes and reuses the feed version table. It adds no expiry policy.

## Catch me up

`POST /api/feed/:username/:slug/catch-up` accepts an empty request. A verified account can request a summary of a feed it can read. The Worker selects up to 12 recent published editions and supplies complete briefings within the UTF-8 input budget, keeping their chronological order and retaining correction relationships and source attribution. Daily feeds get three days of evidence. Retained weekly and monthly schedules get up to two periods, capped at 60 days. Empty windows make no model call.

The new `CATCH_UP_ENABLED=true` flag is required in addition to provider credentials and a finite model-spending grant. Reservations must pass that grant’s admission checks even if the provider account is configured for `TRACK_ONLY` on other operations. The flag is unset on the checked-in deployment targets. The old flag and historical receipts do not activate the new endpoint. Migration `0070_unread_summary_cache.sql` already provides the shared cache table. Catch me up uses versioned identities for its results and provider operations. A confirmed refusal and its zero-cost settlement allow a fresh reservation on the next explicit request, up to three attempts for identical evidence. An uncertain operation stays fenced. Historical spending and recovery records keep their original identities. The previous endpoint returns `410`.

Offline fixtures cover selection, cache reuse, limits, authorization, provider holds, and how correction, repetition, and uncertainty reach the model. Each sentence must reference eligible published story IDs, and validation rejects references superseded by a correction. The references support review of factual accuracy. Keep the new flag unset in production until an approved evaluation of generated English, French, and Arabic summaries passes human review for corrections, attribution, uncertainty, and distinct events. [Historical unread summary evaluation](unread-summary.md)

## Local development

For a new checkout, generate the local notification keys and apply the local migration:

```powershell
node scripts/setup-push.mjs
node apps/worker/node_modules/wrangler/bin/wrangler.js d1 migrations apply DB --local --config apps/worker/wrangler.toml
```

The setup script generates a Web Push VAPID key pair in ignored `apps/worker/.dev.vars`, preserving existing keys. These are generated credentials, not paid provider API keys. Never commit that file. Keep a stable key pair; changing it requires browsers to subscribe again.

Local Wrangler does not automatically fire cron events. To test delivery locally, run the Worker with `--test-scheduled` and trigger `http://127.0.0.1:8787/__scheduled` after publishing a new edition. Use real browser permission/subscription for an end-to-end device test; automated tests mock browser permission and the remote delivery service.

## Production deployment prerequisites

Use these prerequisites when enabling notifications on a target deployment:

1. Apply migration `0011_web_push.sql` using your normal remote D1 migration process.
2. Set Worker secrets `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` using Wrangler's interactive secret input. The subject is an operator contact URL or `mailto:` address. Store the private key only on the server.
3. Build/deploy the frontend and Worker together. Keep the existing minute cron enabled.
4. Install the app, enable notifications, publish a new briefing, and verify actual delivery on the target device.

If keys are absent, the settings screen reports that server setup is needed. Subscription routes require an authenticated account, rate-limit registration, validate key formats, and restrict delivery URLs to supported browser push providers. Payloads are encrypted using Web Crypto via `@block65/webcrypto-web-push`.

References: [Browser installation](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Trigger_install_prompt), [Notifications](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/showNotification), [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/).

## V3 headline previews

V3 notifications reuse the first published story headline and, when space permits, show the number of other updates in that edition. This adds no inference call. Long, legacy or unavailable previews use the generic message. Coalesced catch-up delivery previews one eligible edition; it is not a summary of all pending feeds. The existing publication, ownership and public-feed eligibility checks still apply. Preview lookup failures do not block generic delivery. See docs/v3-reader-notification-evaluation.md for the rejected AI-message experiment and local validation; live deployment/device display must be verified separately.

## Maintenance invariants

- Preserve the existing responsive reader, feed editor and public/private controls. Keep Unicode usernames and aliases stable. Localize UI labels and accessibility text without translating readers' own names or feed titles. Arabic layouts mirror directional controls and retain the established action order.
- Use separate artwork for site branding, desktop installation, mobile installation, authentication email, and push icon/badge. The Android launch background matches the white backing of the mobile icon. Installed manifest metadata can outlive a deployment.
- Treat standalone mode, the browser's installation event, and supported related-app detection as installation signals. An accepted prompt or a saved hint can remain stale until the client observes installation. See the [PWA detection code](../apps/web/src/pwa.ts) and [manifest tests](../apps/worker/src/manifest-icons.test.ts).
- Keep the offline illustration and language strings self-contained. Use the saved website language before the browser fallback. Authentication email follows the validated request language. Arabic email content remains RTL and the brand mark stays in its LTR layout. Preserve token lifetimes and send authorization. [Offline worker](../apps/web/public/sw.js) · [Mailer tests](../apps/worker/src/mailer.test.ts)
- Preserve keyboard operation for dropdowns, native time-entry behavior, complete widget rows, and readable content at narrow Arabic, French, and English viewports. Distinguish active collection failures from saved item history. Scope optional health diagnostics so they cannot expose private metadata or interrupt edition delivery. [Operational regression](BRIEFING_QUALITY_FIXES_2026-11-19.md)

### Historical browser and device checks

| Area | Recorded check and remaining scope |
| --- | --- |
| Installation and branding | The installer repair passed 107 frontend and 63 app/manifest tests. Manifest checks verified the Android background and preserved app identity. Physical-device splash rendering remained untested. [Install detection](https://github.com/AmmarMohanna/distilled.news/blob/da584b842e4fe637855b18e91e66c9294da94c5c/docs/joud-install-detection-2026-10-29.md) · [Android launch behavior](https://github.com/AmmarMohanna/distilled.news/blob/da584b842e4fe637855b18e91e66c9294da94c5c/docs/joud-android-launch-background-2026-10-29.md) |
| Offline reading and layout | A local service-worker test followed the saved language in all three locales with networking disabled. Browser fixtures checked layout and overflow at sampled viewports. [Branding and offline checks](https://github.com/AmmarMohanna/distilled.news/blob/da584b842e4fe637855b18e91e66c9294da94c5c/docs/joud-responsive-branding-2026-10-29.md) · [Reader layout checks](https://github.com/AmmarMohanna/distilled.news/blob/da584b842e4fe637855b18e91e66c9294da94c5c/docs/joud-reader-layout-followup-2026-10-29.md) |
| Input, email and health | Local browser checks covered keyboard-accessible menus and localized authentication flows. Four component regressions distinguished saved failure records from active outages. Email checks used local fixtures. [Controls](https://github.com/AmmarMohanna/distilled.news/blob/da584b842e4fe637855b18e91e66c9294da94c5c/docs/joud-feed-dropdowns-2026-10-29.md) · [Localization and email](https://github.com/AmmarMohanna/distilled.news/blob/da584b842e4fe637855b18e91e66c9294da94c5c/docs/joud-reset-language-2026-10-29.md) · [Source health](https://github.com/AmmarMohanna/distilled.news/blob/da584b842e4fe637855b18e91e66c9294da94c5c/docs/joud-source-health-display.md) |
