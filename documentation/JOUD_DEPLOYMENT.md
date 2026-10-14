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
the existing per-account limit is two requests per hour. Website source rows use
publisher favicons, with a globe fallback when an image cannot load.

This deployment has no scheduled collection or browser container. Paid source
budgets are zero. Email delivery, generated artwork, and briefing model processing
still need their own provider configuration before use.
Existing account data and feeds are not copied from other deployments.
