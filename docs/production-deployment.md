# Production deployment

Production is deployed separately at https://distilled-news-production.distillednews-platform.workers.dev. This does not move the canonical domain or change staging routing.

## Deployment configuration

The checked-in staging and production configurations explicitly enable `CUTOFF_EDITIONS_ENABLED`. Preserve that setting when reproducing their cutoff-based scheduling. The private source-execution helper has its own release and version. A Worker rollout alone does not update or verify the helper.

Run from the repository root, after installing dependencies and building the web application:

```powershell
node apps/worker/node_modules/wrangler/bin/wrangler.js d1 migrations apply DB --remote --config apps/worker/wrangler.production.jsonc
node apps/worker/node_modules/wrangler/bin/wrangler.js d1 migrations apply EVAL_DB --remote --config evaluation/briefing-quality/worker/wrangler.production.jsonc
node apps/worker/node_modules/wrangler/bin/wrangler.js deploy --config apps/agentops-collector/wrangler.production.jsonc
node apps/worker/node_modules/wrangler/bin/wrangler.js deploy --config evaluation/briefing-quality/worker/wrangler.production.jsonc
node apps/worker/node_modules/wrangler/bin/wrangler.js deploy --config apps/worker/wrangler.production.jsonc
```

Secrets are encrypted Worker secret bindings. They are intentionally the same credentials as staging, copied through an authenticated, encrypted, temporary runtime transfer. No secret values or transfer handlers belong in this repository. Future rotations must update each environment explicitly; there is no ongoing synchronization.

Plain configuration matches the live staging settings at provisioning, except public API/web URLs and production telemetry identity. The main Worker uses the normal entry point, excluding staging mission endpoints. Model spending uses production's own tracking-only configuration row, without staging reservations, receipts, or monetary admission grants.

## Independent resources

| Purpose | Production resource |
| --- | --- |
| Application Worker | `distilled-news-production` |
| Application D1 | `distilled-news-production` / `070dcb92-88e1-463b-bb93-b95b81203810` |
| Application R2 | `distilled-news-production-raw` |
| Evaluator Worker | `distilled-news-production-quality` |
| Evaluator D1 | `distilled-news-production-quality` / `60c4b47e-55cc-4e50-bc81-0a5ef7ecf39e` |
| Evaluator R2 | `distilled-news-production-quality-private` |
| Observer Worker | `distilled-news-production-agentops` (no public route) |
| Queues | `distilled-news-production-{processing,collection,acquisition,v1,quality}` and a separate `-dlq` for each |

Application users, feeds, sessions, retained articles, editions, paid-operation records, and evaluator jobs are not copied. Initial setup therefore requires a new administrator account using the existing setup credential, followed by creating production feeds.

The user explicitly approved reusing the existing private source helper (`SOURCE_EXECUTION_SERVICE`, service `01a1099d-e88a-7c23-a1c5-eeb51471e780`). Its private VPS process and Google/Telegram state remain shared. Provider credentials and provider account quotas are also shared intentionally. These are exceptions to data-store isolation, not new independent provider accounts.

Metrics use `environment="production"`; evaluator resource identity is `distilled-news-production-quality`. Existing staging series keep their original defaults. Production dashboards and notification rules must select production explicitly; provisioning does not repoint existing staging alerts.
