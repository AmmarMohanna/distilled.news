# Distilled.news

Distilled.news is a Cloudflare-first, self-hostable personal news briefing filter.

Distilled.news ingests public Telegram channel URLs plus optional RSS, Google News, X, LinkedIn, and Apify-backed sources, filters noisy posts against an interest profile, merges repeated updates, and publishes a calm monospace briefing with expandable evidence links. It does not include chatbot or Q&A behavior.

## What It Does

- Public email signup with verified accounts, password login/reset, and admin oversight.
- User-owned briefings with plain-language interest profiles.
- Username-scoped feed URLs such as `/ammar-mohanna/my-sports-feed/`. Feed settings offer Public (anyone can read) or Private (signed-in owner only). Private feeds are excluded from Explore, and their content, search, evidence, and sketches require the owner's session. Existing visibility values are preserved; new feeds default to Public.
- Source setup by one simple field: `t: channel`, public `https://t.me/...` URLs, `rss: https://...`, `news: query`, or `x: handle`.
- Rule-first filtering with optional OpenAI summaries through Cloudflare AI Gateway.
- Feed intensity toggle for low, medium, or high publishing strictness.
- Expandable evidence for each briefing item.
- Basic search over retained published briefing items and their evidence only.
- 15-day default retention for active news/media context.
- Per-feed pause/resume and language selection.

## Stack

- Cloudflare Workers for API, scheduled source refresh, queue consumer, and web asset serving.
- Cloudflare D1 for app data.
- Cloudflare R2 for raw source payload archives.
- Cloudflare Queues for processing jobs.
- Cloudflare Email Service for account verification and password reset email.
- Cloudflare AI Gateway routing to OpenAI for production summaries.
- Apify Actors for optional X and advanced LinkedIn/source scraping.
- React + Vite for the admin/feed UI.
- Hono for Worker routes.
- Vitest and Playwright for tests.

## Quick Start

```sh
npx pnpm@10.12.1 install
npx pnpm@10.12.1 test
npx pnpm@10.12.1 build
```

For local Worker development:

```sh
cp .env.example .env
npx pnpm@10.12.1 --filter @distilled/worker db:migrate
npx pnpm@10.12.1 dev
```

For the frontend and local API together, run `npm run dev:app` (`npm.cmd run dev:app` in Windows PowerShell).
This checks development ports, rebuilds web assets, applies local D1 migrations, and starts both Vite and the local Worker.
Open **http://127.0.0.1:5173** directly in Edge, Chrome, or another browser and keep the terminal running.
Vite forwards `/api` requests to the Worker at `http://127.0.0.1:8787`. Stop both with Ctrl+C.
Ports 5173 and 8787 must be free; stop earlier development servers before running this command.
The launcher checks both ports before rebuilding so a duplicate launch cannot invalidate the running Worker's asset manifest. If `/` returns 404 while `/sw.js` still loads, stop the existing development terminal with Ctrl+C and restart with `node scripts/dev.mjs`.
The local database is separate from production, so a fresh local installation needs administrator setup.

For deployment:

```sh
npx pnpm@10.12.1 run setup -- --provision-cloudflare --apply-remote-migrations --deploy
```

`npx pnpm@10.12.1 run setup` creates local `.env` and Worker `.dev.vars` files when needed and generates missing app secrets. With `-- --provision-cloudflare`, it also creates or verifies the D1 database, R2 bucket, processing queue, dead-letter queue, writes `apps/worker/wrangler.toml`, uploads Worker secrets, applies migrations when requested, and deploys when requested. Run `npx pnpm@10.12.1 run setup -- --check` to verify Wrangler auth and dry-run deployment.

`distilled.news` is the canonical production domain. `lownoise.news` and `www.lownoise.news` are kept as legacy routes that redirect to `https://distilled.news`.

## Required External Values

See `.env.example` for descriptions.

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_AI_GATEWAY_ID`
- `OPENAI_API_KEY`
- `APIFY_API_TOKEN` if using `x:`, `linkedin:`, `apify:` sources, or the optional Google News fallback
- `ADMIN_SESSION_SECRET`
- `ADMIN_SETUP_TOKEN`
- `EMAIL_FROM`
- `PUBLIC_WEB_BASE_URL`

`EMAIL_FROM` must use a sender domain that is onboarded in Cloudflare Email
Sending. For public user registration, Cloudflare must also allow sending to
arbitrary recipients; Email Routing-only bindings can send only to verified
destination addresses in the Cloudflare account.

## First Self-Hosted Setup

1. Fill `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `PUBLIC_WEB_BASE_URL`, and any optional AI/Apify/email values in `.env`.
2. Run `npx pnpm@10.12.1 run setup -- --provision-cloudflare --apply-remote-migrations --deploy`.
3. Open the admin page.
4. Use `ADMIN_SETUP_TOKEN` once to create the first verified admin account.
5. Add sources such as `t: LebUpdate`, `rss: https://example.com/feed.xml`, `news: Lebanon Electricity`, or `x: NASA`.
6. Write the interest profile and save.
7. Use `fetch latest` once to validate ingestion.
8. Choose Public before sharing the feed URL. Private feeds remain accessible only to their signed-in owner.

Default Apify actors:

- Google News fallback: `groupoject/google-news-scraper`
- X: `kaitoeasyapi/twitter-x-data-tweet-scraper-pay-per-result-cheapest`
- LinkedIn company/profile sources are advanced-only defaults: `harvestapi/linkedin-company-posts` and `harvestapi/linkedin-profile-posts`

RSS and Google News are fetched directly by the Worker first. If Google News RSS returns a retryable Worker-side 429/5xx response and `APIFY_API_TOKEN` is configured, Google News can fall back to a capped Apify actor run.

Public users can sign up after setup. Each email can have only one account.
Usernames are normalized into slugs, can be changed later, and previous
usernames stay reserved as aliases that redirect to the current username.

## Routes

- `POST /api/auth/setup`
- `POST /api/auth/register`
- `POST /api/auth/verify-email`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `POST /api/auth/password/forgot`
- `POST /api/auth/password/reset`
- `GET /api/me/account`
- `PATCH /api/me/account`
- `GET /api/me/briefings`
- `POST /api/me/briefings`
- `DELETE /api/me/briefings/:briefingId`
- `GET /api/me/sources`
- `POST /api/me/sources`
- `POST /api/me/sources/refresh`
- `DELETE /api/me/sources/:sourceId`
- `GET /api/me/health`
- `POST /api/me/processing/retry`
- `GET /api/admin/accounts`
- `PATCH /api/admin/accounts/:accountId`
- `GET /api/admin/briefings`
- `DELETE /api/admin/briefings/:briefingId`
- `GET /api/feed/:username/:briefingSlug`
- `GET /api/feed/:username/:briefingSlug/search?q=...`
- `POST /api/feed/:username/:briefingSlug/star`

Public pages are served at `/:username/:briefingSlug/`. Previous username
aliases redirect to the account's current username. Old `/feed/:slug` routes
return not found. There is intentionally no `/api/ask` endpoint.

## Example Configs

See `examples/` for starting interest profiles:

- `personal-news.json`
- `tech-news.json`
- `local-community.json`

These are examples only; configuration stays simple in the admin UI.

### Feed pencil sketches

The landing page keeps the existing theme and centers the logo, headline, subtitle and Create feed action. Account creation and feed editing continue to use the existing Worker backend.

Saving a feed automatically generates its illustration when Workers AI and R2 are configured. Owner cards also request missing or outdated illustrations through `POST /api/me/briefings/:briefingId/sketch`. This owner-only endpoint uses Workers AI (`@cf/black-forest-labs/flux-1-schnell`) to illustrate the saved title and interest profile, then stores one JPEG per feed in the existing R2 bucket. It does not depict or verify individual news events. Public cards read the saved image through `GET /api/feed/:username/:briefingSlug/sketch`; public browsing never invokes generation. Until a sketch exists, cards use simple pencil-style topic placeholders.

The `[ai] binding = "AI"` configuration is included in both Wrangler and generated setup configs. No separate image provider API key is needed. Workers AI access and quota, Cloudflare authentication for local remote inference, and the existing `RAW_ARCHIVE` R2 binding are required. Image inference may incur Cloudflare charges. This usage is separate from the existing OpenAI text-token budget reporting. Generation reuses an unchanged prompt's image and allows up to five saved illustrations per account per rolling day, with at most five attempts per rolling ten minutes. Failed attempts do not consume the daily saved-image allowance; they may still incur provider charges. Automatic and manual generation share these limits. A 429 response includes a limit code and a conservative `Retry-After` duration (ten minutes for attempts or 24 hours for saved images). Older attempt records stop blocking retries after ten minutes, without deleting local data or applying a migration. Owner cards show generation failures and offer an explicit retry. Changing the saved title or prompt keeps the old image visible until a replacement is saved.

Local configuration audit (September 20, 2026; presence only, no live credential validation): `.env` and `apps/worker/.dev.vars` lack usable `OPENAI_API_KEY`, `APIFY_API_TOKEN`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_AI_GATEWAY_TOKEN`, and `EMAIL_FROM`. The checked-in Wrangler config has an account ID and sender, but blank local overrides should be replaced for local operation. Session/setup/maintenance secrets are present. Turnstile keys are absent and optional. Gateway authentication is needed only when the gateway requires it; Apify is needed for Apify-backed sources. Production secret values and delivery/provider access were not inspected or changed.

Workers AI references: https://developers.cloudflare.com/workers-ai/configuration/bindings/ and https://developers.cloudflare.com/workers-ai/models/flux-1-schnell/
