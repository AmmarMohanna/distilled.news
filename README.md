# Distilled.news

Distilled.news is a Cloudflare-first, self-hostable public news briefing product.

Distilled.news ingests public Telegram channel URLs plus optional RSS, Google News, X, LinkedIn, and Apify-backed sources, filters noisy posts against an interest profile, merges repeated updates, and publishes a calm monospace briefing with expandable evidence links. It does not include chatbot or Q&A behavior.

## What It Does

- Public email signup with verified accounts, password login/reset, and admin oversight.
- User-owned briefings with plain-language interest profiles.
- Username-scoped public feed URLs such as `/ammar-mohanna/my-sports-feed/`.
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
corepack enable
pnpm install --frozen-lockfile
pnpm setup
pnpm test
pnpm build
```

For local Worker development:

```sh
pnpm db:migrate
pnpm dev
```

`pnpm setup` writes `.env` and `apps/worker/.dev.vars`, generates only missing
application secrets, and never calls Cloudflare. The separate doctor is strictly
read-only:

```sh
pnpm doctor -- --environment staging
pnpm doctor -- --environment production --remote
```

Production and staging are explicit named environments in
`apps/worker/wrangler.jsonc`. A bare top-level deploy is intentionally invalid.
Production disables workers.dev and preview URLs. The checked-in staging D1 ID
identifies the dedicated isolated staging database and must never be reused by
production or a self-hosted fork.

`distilled.news` is the canonical production domain. `lownoise.news` and `www.lownoise.news` are kept as legacy routes that redirect to `https://distilled.news`.

See [Self-hosting](docs/SELF-HOSTING.md) for resource creation and secrets,
[Release](docs/RELEASE.md) for migration/deploy gates, and
[Backup and restore](docs/BACKUP-RESTORE.md) before any production change.

## Required External Values

See `.env.example` for descriptions.

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_AI_GATEWAY_ID`
- `OPENAI_API_KEY`
- `OPENAI_PROJECT_ID` for explicit OpenAI project attribution and limit isolation
- `APIFY_API_TOKEN` if using Google News, `x:`, `linkedin:`, or `apify:` sources
- `BRAVE_SEARCH_API_KEY` only for the optional budget-capped secondary news fallback; use a Brave plan that explicitly grants storage rights
- `BRAVE_SEARCH_STORAGE_RIGHTS_CONFIRMED=true` only after confirming that the subscribed Brave plan permits retaining results in published briefs
- `ADMIN_SESSION_SECRET`
- `ADMIN_SETUP_TOKEN`
- `INTERNAL_MAINTENANCE_SECRET`
- `EMAIL_FROM`
- `PUBLIC_WEB_BASE_URL`

`EMAIL_FROM` must use a sender domain that is onboarded in Cloudflare Email
Sending. For public user registration, Cloudflare must also allow sending to
arbitrary recipients; Email Routing-only bindings can send only to verified
destination addresses in the Cloudflare account. Keep registration closed until
the protected preflight is accepted and delivered to a fixed external,
non-verified plus-address stored as `EMAIL_CANARY_RECIPIENT`.

## First Self-Hosted Setup

1. Create dedicated Cloudflare D1, R2, queue, DLQ, email, and route resources.
2. Replace every Distilled-owned name and ID in your named Wrangler environment.
3. Fill required secrets and public URLs in `.env`, then run `pnpm setup`.
4. Run the local and remote doctor plus the release checks.
5. Apply remote migrations and deploy through an explicitly confirmed named environment.
6. Open the admin page and use `ADMIN_SETUP_TOKEN` once to create the first verified admin account.
7. Add sources such as `t: LebUpdate`, `rss: https://example.com/feed.xml`, `news: Lebanon Electricity`, or `x: NASA`.
   The app can also suggest trusted and recent sources from the feed's interest profile.
8. Write the interest profile, validate ingestion, and share the username-scoped public URL.

Default Apify actors:

- Google News primary: `groupoject/google-news-scraper`, build `1.1.1`
- Google News fallback: `solidcode/google-news-scraper`, build `1.0.10`
- X: `xquik/x-tweet-scraper`, build `1.1.3`
- LinkedIn company/profile sources are advanced-only defaults: `harvestapi/linkedin-company-posts` and `harvestapi/linkedin-profile-posts`

Telegram public channels and ordinary RSS feeds are fetched directly by the Worker at no API cost. Google News and X use the single configured Apify account, with bounded per-run and daily collection budgets.

Registration is fail-closed and remains closed for the hosted launch until the
canary and production gates pass. A self-hoster may then set
`REGISTRATION_MODE=open` after email and Turnstile verification. Each email can
have only one account.
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

## Operations and policy

- [Public launch plan](docs/PUBLIC-LAUNCH-PLAN.md)
- [Release and rollback](docs/RELEASE.md)
- [Self-hosting](docs/SELF-HOSTING.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Threat model](docs/THREAT-MODEL.md)
- [Source and model costs](docs/SOURCE-COSTS.md)
- [Retention](docs/DATA-RETENTION.md)
- [Backup and restore](docs/BACKUP-RESTORE.md)
- [Incident response](docs/INCIDENT-RESPONSE.md)
- [Security policy](SECURITY.md)
- [Privacy](docs/legal/PRIVACY.md), [Terms](docs/legal/TERMS.md), and
  [Acceptable Use](docs/legal/ACCEPTABLE-USE.md)

The source is licensed under [Apache-2.0](LICENSE).
