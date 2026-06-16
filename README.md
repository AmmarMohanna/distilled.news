# LowNoise.news

LowNoise.news is a Cloudflare-first, self-hostable personal news briefing filter.

V1 ingests public Telegram channel URLs, filters noisy posts against an interest profile, merges repeated updates, and publishes a calm monospace briefing with expandable evidence links. It does not include chatbot or Q&A behavior.

## What V1 Does

- Private-by-default admin and feed.
- Multiple self-hosted briefings with plain-language interest profiles.
- Telegram source setup by public `https://t.me/...` channel URL.
- Rule-first filtering with optional OpenAI summaries through Cloudflare AI Gateway.
- Expandable evidence for each briefing item.
- Search over retained published briefing items and their evidence only.
- 15-day default retention for active news/media context.
- Per-feed pause/resume and language selection.

## Stack

- Cloudflare Workers for API, scheduled source refresh, queue consumer, and web asset serving.
- Cloudflare D1 for app data.
- Cloudflare R2 for raw Telegram payload archives.
- Cloudflare Queues for processing jobs.
- Cloudflare Vectorize indexes published briefing items when AI Gateway embedding secrets are configured.
- Cloudflare AI Gateway routing to OpenAI for production summaries.
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
npx pnpm@10.12.1 --filter @lownoise/worker db:migrate
npx pnpm@10.12.1 dev
```

For deployment:

```sh
npx pnpm@10.12.1 setup
npx pnpm@10.12.1 deploy
```

Update `apps/worker/wrangler.toml` with real Cloudflare resource IDs before production deploy. Public Telegram sources are refreshed by the Worker cron trigger.

## Required External Values

See `.env.example` for descriptions.

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_AI_GATEWAY_ID`
- `OPENAI_API_KEY`
- `ADMIN_SESSION_SECRET`
- `ADMIN_SETUP_TOKEN`

`CLOUDFLARE_ZONE_ID` is only needed for custom-domain routing.

## First Self-Hosted Setup

1. Deploy the Worker.
2. Open the admin page.
3. Use `ADMIN_SETUP_TOKEN` once to create an admin password.
4. Add public Telegram channel URLs such as `https://t.me/LebUpdate`.
5. Write the interest profile and save.
6. Use `fetch latest` once to validate ingestion.
7. Keep the feed private or explicitly enable public feed.

## Routes

- `GET /api/admin/briefings`
- `POST /api/admin/briefings`
- `GET /api/admin/sources`
- `POST /api/admin/sources`
- `POST /api/admin/sources/refresh`
- `DELETE /api/admin/sources/:sourceId`
- `GET /api/admin/health`
- `GET /api/feed/:briefingSlug`
- `GET /api/feed/:briefingSlug/search?q=...`

There is intentionally no `/api/ask` endpoint.

## Example Configs

See `examples/` for starting interest profiles:

- `personal-news.json`
- `tech-news.json`
- `local-community.json`

These are examples only; V1 keeps configuration simple in the admin UI.
