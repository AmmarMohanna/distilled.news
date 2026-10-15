# Independent integration Worker

Branch: `integration/backend-sources-ai-editorial-frontend`.

Integration URL: https://distilled-news-integration.distillednews-platform.workers.dev

Protected staging URL: https://distilled-news-staging.distillednews-platform.workers.dev

## Deployment boundary

`apps/worker/wrangler.integration.jsonc` is a separate configuration targeting only
`distilled-news-integration` in account `e32b564514d4f9b9e383b7dd30dbb026`.
It uses this branch's `src/staging.ts` application entrypoint and its own uploaded
frontend assets. Existing Wrangler files and staging deployment commands are unchanged.

The deployment helper fixes the Worker name and account, rejects named environments,
routes, Cron triggers, and queue consumers, and checks the two required admin secret
names before redeployment. It accepts only `--dry-run` and `--secrets-file`.
It never runs a staging deployment or applies a remote database migration.

This is an independent Worker deployment sharing staging data and infrastructure.
It is not a separately provisioned database or ingestion pipeline.

## Configuration copied from live staging

The live Cloudflare settings, secrets inventory, deployments, schedules, workers.dev
settings, queues, domains, and zone inventory were inspected on 2026-10-15.
The repository staging TOML was also inspected. The live image-account variable,
which is absent from that TOML, is included in the new configuration.

| Setting | Staging | Integration |
| --- | --- | --- |
| Environment variables | 32 live values | 30 identical values; two origin changes below |
| PUBLIC_API_BASE_URL | staging URL above | integration URL above |
| PUBLIC_WEB_BASE_URL | staging URL above | integration URL above |
| Compatibility date | 2026-10-05 | Identical |
| Compatibility flags | nodejs_compat, global_fetch_strictly_public | Identical |
| Usage model | standard | standard (Cloudflare default) |
| Workers.dev | Enabled | Enabled |
| Preview URLs | Disabled | Disabled |
| Observability | Enabled, 100% logs and invocation logs; traces disabled | Identical |
| Placement / Logpush / tail consumers | Default / disabled / none | Identical |
| Custom domains and zone routes | None in this account | None |
| Cron | Every minute | None; staging remains scheduler |
| Queue consumers | Four, detailed below | None; staging retains ownership |
| Secrets | 14 bindings | Two admin bindings; 12 omitted with owner authorization |

The complete non-secret variable names and values are in the integration JSONC.
Financial limits, model settings, source flags, mail transport, sender, and historical
R2 asset prefix retain their live staging values. AI source recommendations remain
`false`, matching staging.

## Resource bindings

| Binding | Resource | Integration behavior |
| --- | --- | --- |
| DB | D1 `distilled-news-staging`, `ab259bfe-6029-4e20-8cb6-eea6b7a67459` | Same database |
| RAW_ARCHIVE | R2 `distilled-news-staging-raw` | Same bucket |
| PROCESSING_QUEUE | `distilled-news-staging-processing` | Same producer binding |
| SOURCE_COLLECTION_QUEUE | `distilled-news-staging-collection` | Same producer binding |
| V1_ACQUISITION_QUEUE | `distilled-news-staging-acquisition` | Same producer binding |
| V1_PROCESSING_QUEUE | `distilled-news-staging-v1` | Same producer binding |
| SOURCE_EXECUTION_SERVICE | VPC service `01a1099d-e88a-7c23-a1c5-eeb51471e780` | Same service |
| ASSETS | Worker static assets | Separate upload of this branch's web build |

Live staging has no KV, Durable Object, ordinary Worker service, browser, or email
binding. None are added from the unrelated default production Wrangler configuration.

Staging's four consumers each use batch size 1, batch timeout 1 second, max retries 5,
and their corresponding `-dlq`; the collection consumer also has max concurrency 8.
Integration registers no consumer and does not alter those settings or DLQs.

Shared-state implications: accounts, feed edits, sessions, archive objects, spend
ledgers, and Outlook token storage are shared through D1/R2. HTTP writes made through
integration affect that shared state. Messages produced by integration are consumed
by staging's existing deployed code. No second scheduler or consumer is installed.
Do not run migrations against the shared database as part of frontend deployment.
Full ingestion isolation requires separately provisioned resources and a new review.

## Secrets and authorized omissions

The owner explicitly approved deploying with missing secrets documented after the
unavailable values were identified. The two available admin secrets come from the
owner-approved local staging backup; no values are printed or committed. Cloudflare
cannot return staging's secret values, so equality with its current encrypted values
cannot be independently checked through the API.

Configured from the approved source:

- ADMIN_SESSION_SECRET
- ADMIN_SETUP_TOKEN

Missing relative to staging:

- APIFY_API_TOKEN
- CLOUDFLARE_IMAGE_API_TOKEN
- OPENROUTER_API_KEY
- OUTLOOK_CLIENT_ID
- OUTLOOK_REFRESH_TOKEN
- OUTLOOK_TOKEN_ENCRYPTION_KEY
- SOURCE_EXECUTION_TOKEN
- TWITTERAPI_IO_API_KEY
- VAPID_PRIVATE_KEY
- VAPID_PUBLIC_KEY
- VAPID_SUBJECT
- ZYTE_API_KEY

The account has no Cloudflare Secrets Store to reuse. No secret values were invented,
rotated, or extracted from staging. The integration configuration requires only the
two supplied admin secrets because the other 12 were explicitly waived for this deployment.

This deployment is not credential-equivalent to staging. Direct integration calls
requiring absent provider credentials, artwork generation, mail, or browser push
remain unavailable or unverified. In particular, Outlook verification/reset emails
cannot be sent by integration with its three Outlook secrets absent. Staging's own
credentials and its asynchronous processing remain unchanged.

## Deploy independently

Run these commands from this branch's checkout/worktree:

~~~powershell
corepack pnpm --filter @distilled/web build
corepack pnpm --filter @distilled/worker run deploy:integration --dry-run
corepack pnpm --filter @distilled/worker run deploy:integration
~~~

The helper always supplies `--config wrangler.integration.jsonc` and
`--name distilled-news-integration` using absolute configuration paths.
The dry run does not check remote secret presence. The real deployment checks the
admin secret names first; Wrangler preserves any previously installed secrets.

For initial installation or replacement of the two admin secrets, use an authorized,
ignored JSON file containing those names and values:

~~~powershell
corepack pnpm --filter @distilled/worker run deploy:integration --secrets-file C:\secure\integration-admin-secrets.json
~~~

To add one of the 12 omitted secrets later, use Wrangler's secure prompt and the
integration configuration explicitly, then redeploy with the helper:

~~~powershell
corepack pnpm --filter @distilled/worker exec wrangler secret put OPENROUTER_API_KEY --config wrangler.integration.jsonc --name distilled-news-integration
~~~

Supply each key's original authorized value. Do not generate a replacement Outlook
DB encryption key against the shared token table. Secret names can be checked with:

~~~powershell
corepack pnpm --filter @distilled/worker exec wrangler secret list --config wrangler.integration.jsonc --name distilled-news-integration
~~~

## Deployment verification record

Successfully deployed on 2026-10-15 at 16:38 UTC from commit `ea44b4a`.
Integration deployment: `fdaf31a4-3625-44f8-a826-e81baec16d00`.
Integration version: `b5ba65bd-b941-4770-9510-04671b9a879e`, serving 100% of traffic.
Cloudflare confirms all eight resource bindings, all 32 variables, and the two
admin secret bindings as `secret_text`. Exactly the 12 secrets listed above are absent.

The before/after Cloudflare comparison confirms that staging settings, deployment
history, active version, secret inventory, Cron schedule, workers.dev settings,
queue settings/consumers, and route/domain inventory are unchanged. No staging
deployment command was run. The protected staging deployment remains
`d5e369d6-7de1-4e24-8511-478129a1abf5`, serving version
`8649bc0f-ec15-45c0-9667-72506c1beb15` at 100%.
Before integration deployment, staging's homepage, session, and Explore endpoints
returned HTTP 200; protected account/admin endpoints correctly returned HTTP 401.

After deployment, both Workers returned HTTP 200 for `/`, `/api/auth/session`, and
`/api/explore/feeds`; `/api/me/health` and `/api/admin/accounts` correctly returned
HTTP 401 without authentication. Integration served `/assets/index-C2cvMOWu.js`
with bytes identical to this branch's local production build. Staging's homepage
SHA-256 and asset path were unchanged.

Local validation passed: four deployment safety tests, Wrangler dry run, and
Wrangler integration binding/runtime type generation. Frontend validation before
deployment also passed: 30 unit tests, 14 responsive browser tests, typecheck,
and production build. Missing provider/mail/push credentials were not exercised
or represented as functional. No remote migrations or mail sends were performed.
