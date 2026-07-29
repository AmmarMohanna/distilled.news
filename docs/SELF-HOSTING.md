# Self-hosting

Distilled.news requires Node 24, pnpm 10.12.1, and a Cloudflare account with
Workers, D1, R2, Queues, Email Service, and optional AI Gateway.

## 1. Install and initialize locally

```sh
pnpm install --frozen-lockfile
cp .env.example .env
pnpm setup -- --environment production
```

Fill `.env`, then rerun `pnpm setup -- --environment production`. The command
generates the three core application secrets and writes:

- `apps/worker/.dev.vars` for local development.
- `apps/worker/.secrets.production.env` containing only Worker secrets for the
  first named deployment.

Both are ignored and mode `0600`. Setup never calls Cloudflare.

Authenticate with either `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in
your shell, or interactive login:

```sh
cd apps/worker
pnpm exec wrangler login
pnpm exec wrangler whoami
```

The API token needs Workers Scripts, D1, R2, Queues, routes, and Email bindings
appropriate to the commands below. Use a narrower runtime token for AI Gateway.

## 2. Create isolated resources

Choose globally unique lowercase names. These commands create one D1 database,
one private R2 bucket, three work queues, and three DLQs:

```sh
export DISTILLED_PREFIX=example-distilled
export D1_NAME="$DISTILLED_PREFIX"
export R2_BUCKET="$DISTILLED_PREFIX-raw"
export PROCESSING_QUEUE="$DISTILLED_PREFIX-processing"
export SOURCE_QUEUE="$DISTILLED_PREFIX-sources"
export EDITION_QUEUE="$DISTILLED_PREFIX-editions"

pnpm exec wrangler d1 create "$D1_NAME"
pnpm exec wrangler r2 bucket create "$R2_BUCKET"
pnpm exec wrangler queues create "$PROCESSING_QUEUE"
pnpm exec wrangler queues create "$SOURCE_QUEUE"
pnpm exec wrangler queues create "$EDITION_QUEUE"
pnpm exec wrangler queues create "$PROCESSING_QUEUE-dlq"
pnpm exec wrangler queues create "$SOURCE_QUEUE-dlq"
pnpm exec wrangler queues create "$EDITION_QUEUE-dlq"
```

Record the D1 UUID printed by `d1 create`. R2 buckets are private by default;
do not add a public R2 domain.

Apply and verify the 30-day maximum raw-payload lifecycle:

```sh
pnpm exec wrangler r2 bucket lifecycle add "$R2_BUCKET" raw-archive-expiry \
  --expire-days 30 --force
pnpm exec wrangler r2 bucket lifecycle list "$R2_BUCKET"
```

Repeat the resource commands with visibly `-staging` names before using the
checked-in `env.staging`. Never share an application database, bucket, queue,
DLQ, Worker name, or route between environments.

## 3. Replace every checked-in owner value

Edit `apps/worker/wrangler.jsonc`. In `env.production`, replace:

- `name` with your Worker name.
- `vars.ENVIRONMENT` with `self-hosted`.
- `PUBLIC_API_BASE_URL`, `PUBLIC_WEB_BASE_URL`, `CLOUDFLARE_ACCOUNT_ID`,
  `CLOUDFLARE_AI_GATEWAY_ID`, `OPENAI_PROJECT_ID`, `EMAIL_FROM`,
  `TURNSTILE_SITE_KEY`, and `TURNSTILE_EXPECTED_HOSTNAMES`.
- The D1 `database_name` and `database_id`.
- The R2 `bucket_name`.
- All three producer queue names and all six consumer/DLQ names.
- Every route with your own custom domain. Remove all `distilled.news` and
  `lownoise.news` routes.
- Provider switches, model names, cost estimates, and global daily/monthly
  budgets. A budget of `0` is a kill switch.

If you use the included production GitHub workflow, also replace its
`CONFIRM_PRODUCTION_EXPORT` D1 UUID with the same new production database UUID.
Replace `productionBackupBucket` in `scripts/backup/private-store.mjs` with your
own dedicated private backup bucket, configure its exact 30-day lifecycle, and
replace the matching workflow confirmation. The mismatches are intentionally
fail-closed.

Keep `workers_dev=false`, `preview_urls=false`, and
`REGISTRATION_MODE=closed` for the initial production release. Keep the actor
builds pinned. Do not use `latest`, `main`, or another mutable actor tag.

Check that no Distilled-owned production target remains:

```sh
rg '777782fe-6c8f-45c1-826d-365c40bc1210|lownoise|distilled\.news' wrangler.jsonc
```

Expected matches are zero in `env.production`. The deliberately invalid staging
D1 UUID can remain until you provision staging.

## 4. Prepare secrets

The generated `apps/worker/.secrets.production.env` must contain:

```dotenv
ADMIN_SESSION_SECRET=generated-by-setup
ADMIN_SETUP_TOKEN=generated-by-setup
INTERNAL_MAINTENANCE_SECRET=generated-by-setup
OPENAI_API_KEY=required-for-model-use
TURNSTILE_SECRET_KEY=required-for-hosted-auth-controls
APIFY_API_TOKEN=required-if-google-news-x-or-other-apify-is-enabled
```

`OPENAI_PROJECT_ID` is a non-secret Wrangler variable. Set it to the project
that owns the API key so every OpenAI request is explicitly attributed to the
intended project. Use distinct project IDs and AI Gateway IDs for staging and
production. A self-hosted deployment may omit it only when deliberately using
the API key's default project.

Add `CLOUDFLARE_AI_GATEWAY_TOKEN` only when your gateway requires
`cf-aig-authorization`, and add `BRAVE_SEARCH_API_KEY` only after storage rights
are confirmed. The deploy file must not contain the Cloudflare management
token. Never commit it.

`wrangler secret put` deploys a new Worker version immediately. For the first
release, pass the generated secret file to the guarded named deploy so secrets
and reviewed code arrive together.

## 5. Validate, migrate, and deploy

Return to the repository root:

```sh
cd ../..
pnpm doctor -- --ci --environment production
pnpm release:check -- --e2e --audit
```

The deployment-specific doctor also checks existing remote secret names and the
first-deploy secret file:

```sh
WRANGLER_SECRETS_FILE=apps/worker/.secrets.production.env \
  pnpm doctor -- --ci --deployment --environment production
```

Export and locally verify any existing database before a migration. For a new,
empty database, apply migrations with the exact named target confirmation:

```sh
CONFIRM_CLOUDFLARE_MUTATION=distilled-news:production:migrate \
  pnpm db:migrate:production
```

Migration `0030_retired_username_hashes.sql` creates an empty
`retired_username_hashes` table; it does not backfill legacy accounts. After the
migration, permanent deletion of a verified or public account stores a SHA-256
hash and retirement time for each current and historical public username. No
account identifier or email linkage remains. The low-entropy username hashes
are pseudonymous, not anonymous, and are retained solely to prevent someone
else from taking over a historical username-scoped public feed URL. Expired
never-verified registrations and failed-signup rollback must not write this
table. Do not include it in routine retention deletion.

Deploy the full reviewed Git SHA. The top-level Wrangler config is deliberately
non-deployable, so never omit the named environment:

```sh
export RELEASE_SHA="$(git rev-parse HEAD)"
export WRANGLER_SECRETS_FILE="$PWD/apps/worker/.secrets.production.env"
export CONFIRM_CLOUDFLARE_MUTATION=distilled-news:production:deploy
pnpm deploy
```

After the first successful deploy, remove the local deploy-secret file if your
approved secret manager holds the authoritative copy.

Run the remote read-only checks:

```sh
pnpm smoke:remote -- production
CONFIRM_PRODUCTION_READ=distilled-news:production:retention-read \
  pnpm retention:verify -- --environment production
```

## 6. Email, Turnstile, and registration

The `EMAIL` binding is already declared, but the address in `EMAIL_FROM` must
belong to a domain onboarded to Cloudflare Email Service. Confirm the account
uses Workers Paid `standard` usage and can send to the intended public
recipients, not only an operator allowlist. Configure
`EMAIL_CANARY_RECIPIENT` as a fixed secret using an external plus-address that
is not a verified Cloudflare destination. Run the protected registration
preflight and confirm the message arrives before opening registration.

Create a Turnstile widget for every exact public hostname. Put its site key in
Wrangler vars, its secret in the Worker secret file, the comma-separated
hostnames in `TURNSTILE_EXPECTED_HOSTNAMES`, and keep the expected action
`register`. A site key without the matching secret and hostname policy is not
ready.

Registration stays closed through initial production smoke, email delivery,
Turnstile, account recovery, budget denial, backup/restore, retention, provider,
queue, and DLQ verification. Opening it requires a separate reviewed release
process; the current production deploy guard refuses an open mode.

## 7. Legal notices and consent

The checked-in policy Markdown under `docs/legal/` is the canonical source used
by the web legal pages. Hosted Distilled.news policy versions are declared
independently in `packages/core/src/legal-versions.json`. When a material policy
changes, update that document's `Effective:` date and matching version in the
same reviewed change. `pnpm ci:scripts` checks that they stay aligned.

The automatic re-consent gate applies only to the repository's `production` and
`staging` hosted environments. A deployment configured as `self-hosted` must
provide its own operator/controller identity, contact address, jurisdiction,
legal basis, notices, and consent flow as required for that deployment. Do not
reuse Distilled.news contact addresses or policy particulars unless they are
factually correct for the operator.
