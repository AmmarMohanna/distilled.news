# Joud deployment

This separate deployment uses `apps/worker/wrangler.joud.jsonc` in account
`e32b564514d4f9b9e383b7dd30dbb026`. It does not change the legacy, staging, or
sources QA Workers. Its database, processing queues, and R2 buckets are dedicated
to `distilled-news-joud`.

URL: https://distilled-news-joud.distillednews-platform.workers.dev

From the repository root:

```powershell
corepack pnpm --filter @distilled/web build
corepack pnpm --filter @distilled/worker exec wrangler deploy --config wrangler.joud.jsonc
```

For future database migrations:

```powershell
corepack pnpm --filter @distilled/worker exec wrangler d1 migrations apply DB --remote --config wrangler.joud.jsonc
```

Independent session, setup, and maintenance secrets are saved in the ignored
`apps/worker/.dev.vars.joud` file. They were uploaded during initial deployment.
Keep that file private. Use its `ADMIN_SETUP_TOKEN` for first administrator setup.

AI source recommendations are enabled using the server-side `OPENROUTER_API_KEY`
secret. The key is also stored in the ignored `.dev.vars.joud` file. Recommendations
make one capped model call per click, with up to five public source suggestions;
each user can request AI source recommendations three times per rolling five-hour window. Each click makes one
OpenRouter request with at most 400 output tokens. These direct recommendation
calls are separate from the one-time briefing model allowance described below. Website source rows use
publisher favicons, with a globe fallback when an image cannot load.

The mixed-source backend branch is integrated without frontend-specific backend logic changes.
Product feeds, downstream processing, stored-evidence synthesis through OpenRouter,
and minute-based maintenance are enabled on Joud with explicit owner approval.
Source-provider budgets remain zero. Paid X/LinkedIn collection therefore remains
unavailable until separately authorized and configured. There is no private source
execution service binding or browser container on Joud; sources requiring those
services fail explicitly rather than appearing to collect successfully.
RSS-backed websites can be approved through the backend discovery path.
Selected enabled sources are read back from the backend and displayed with logos
on the owner feed page; public source availability and blocker messages remain
provided by the imported backend. Generated artwork uses the existing image setup.
Existing account data and feeds are not copied from other deployments.

Source connector admission requires `SOURCE_CONNECTORS_ENABLED=true` in addition
to the downstream switch and Cron. Google News publisher resolution is enabled.
Bare publisher names are stored as Google News topic searches, not publisher-only
subscriptions; the Google logo represents that configured search source.

On 2026-10-16 the owner approved one nonrenewing model allowance: $1 total
exposure, one concurrent operation, and only `openai/gpt-4.1-mini`. It expires
on 2026-10-17 at 06:56:23.954 UTC (09:56 Beirut). The authorization was applied
using the existing guarded `authorizeModelSpending` operation; backend logic and
paid source-provider budgets are unchanged. Deployment does not recreate or
renew the allowance. An API key alone does not supply model spending authority.

The briefing reader uses viewport-sized story pages and compact overview pages
on smaller screens. Full stories and source diagnostics open in dialogs.
