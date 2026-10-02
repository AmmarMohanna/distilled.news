# Web app installation and notifications

The app can be installed from **Settings → Install app (PWA)**. Browsers that expose an installation prompt open it directly; other browsers show their menu instructions. On iPhone, use Safari → Share → Add to Home Screen. Installation and notification delivery depend on browser support. Use HTTPS in production; localhost is supported for development.

**Settings → Notifications** toggles this device's subscription. Permission is requested only after a click. New published briefings in the signed-in account's own feeds trigger a generic notification linking to Home. Existing history is not announced when subscribing. Delivery runs in the existing minute cron, groups pending editions into one device notification, retries failures, and removes expired subscriptions. Push can arrive with the app closed. It is not guaranteed delivery, and device settings can suppress it.

The service worker provides an offline explanation and retry action. It does not cache personal/API responses or provide offline reading. Speech input still uses the browser's speech service; no transcription API key is needed.

## Local development

The local migration and key generation have been applied in this workspace. Restart `node scripts/dev.mjs` to load the new keys, refresh, and enable notifications in Settings.

For a new checkout:

```powershell
node scripts/setup-push.mjs
node apps/worker/node_modules/wrangler/bin/wrangler.js d1 migrations apply DB --local --config apps/worker/wrangler.toml
```

The setup script generates a Web Push VAPID key pair in ignored `apps/worker/.dev.vars`, preserving existing keys. These are generated credentials, not paid provider API keys. Never commit that file. Keep a stable key pair; changing it requires browsers to subscribe again.

Local Wrangler does not automatically fire cron events. To test delivery locally, run the Worker with `--test-scheduled` and trigger `http://127.0.0.1:8787/__scheduled` after publishing a new edition. Use real browser permission/subscription for an end-to-end device test; automated tests mock browser permission and the remote delivery service.

## Production deployment prerequisites

Production has NOT been changed. Before deploying the new Worker:

1. Apply migration `0011_web_push.sql` using your normal remote D1 migration process.
2. Set Worker secrets `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` using Wrangler's interactive secret input. The subject is an operator contact URL or `mailto:` address. Store the private key only on the server.
3. Build/deploy the frontend and Worker together. Keep the existing minute cron enabled.
4. Install the app, enable notifications, publish a new briefing, and verify actual delivery on the target device.

If keys are absent, the settings screen reports that server setup is needed. Subscription routes require an authenticated account, rate-limit registration, validate key formats, and restrict delivery URLs to supported browser push providers. Payloads are encrypted using Web Crypto via `@block65/webcrypto-web-push`.

References: [Browser installation](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Trigger_install_prompt), [Notifications](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/showNotification), [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/).
