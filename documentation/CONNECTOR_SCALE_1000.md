# Source execution: indexed scheduling and reliable collection

This work is on `codex/source-execution-backend`, based on `d2f4c5a`.
It does not merge the later full-stack integration branch. The user explicitly
selected the existing `distilled-news-sources-qa` site for this branch's rollout.
The implementation follows Appendix C and existing contracts. Intelligence
runtime ownership remains with the other contributor.

## Implemented behavior

- `connector-scheduling.ts` owns indexed due-feed discovery, durable dispatch
  reservations, feed-scoped authorization, per-feed poll delivery and publication
  collection gates. Cron dispatches up to ten batches of 100 due feeds without
  fetching upstream resources or building a global source allowlist.
- Separate collection and downstream queues isolate source delays from review.
  Each feed receives at most four RSS and four provider poll slots per dispatch.
  A page yields before its continuation; concurrent claims are fenced in D1.
  Expired delivery reservations permit recovery after send failure or crashes.
  Successful continuation pages do not consume the failure retry allowance.
- Provider and RSS leases renew during long work. Saturated VPS execution returns
  retryable backpressure; Telegram uses one client at a time for its existing
  session. Backpressure preserves operation identities and does not invoke a
  paid fallback merely because infrastructure is busy.
- Queue failures are journaled and allowed to reach configured dead-letter
  queues. Canonical durable pending work remains rediscoverable. Delivery
  bookkeeping is cleaned in bounded batches; financial ledgers are retained.
- Source approval, account status, feed pause, immutable configuration and
  revision are rechecked before execution. Previously queued authorization
  cannot grant access after a feed/source is disabled.
- Full-article mode upgrades RSS/Google listing excerpts through the existing
  acquisition router. Website listings emit independent same-origin article
  candidates. Landing-page text is not substituted for an entire publication.
  Missing publication dates remain unknown; no polling time is invented as a
  publisher date. Existing intake owns revisions, identity and provenance.
- Telegram rechecks prioritize pending authoritative conflicts and recent
  accepted message IDs. Independent origin checks require an explicit deletion
  signal; a missing message never proves deletion. Session restart is supported.
- Anonymous public HTTP responses can share a short-lived D1/R2 cache across
  feeds. Validators and representation headers are part of its key. Cookie,
  authentication, private/no-store and unsupported Vary responses bypass reuse.
  Concurrent misses are single-flighted. Approval is checked on cache access and
  after transport. Receipts, cursors, paid results and editorial state remain
  independent per feed. This does not add shared Telegram or paid-provider fetches.
- The feed API/UI reports unavailable or blocked sources explicitly. AVAILABLE
  means configured admission, not evidence of a successful fetch or exhaustive
  collection. Provider keys and raw responses are never exposed.

## Integration interface and ownership

`v1-intelligence/runtime.ts` is unchanged. `relayConnectorDownstream(scopedEnv)`
calls the existing acquisition/intelligence dispatchers. `connectorDownstreamEnv`
resolves the message's canonical feed and supplies only that feed's currently
approved source IDs. `coalescedProcessingQueue` suppresses repeated sends while
allowing expired deliveries to resume. The existing canonical job leases and
revision rules remain authoritative.

Before dispatching `v1_briefing`, collection scheduled before that publication
boundary must finish. Its original `scheduled_at` survives retries. Later
collection windows do not hold an earlier briefing indefinitely. A blocked source
is reported separately; it does not acquire fabricated evidence.

The other contributor should keep the current dispatcher entry points compatible
or agree on replacement signatures. Do not copy scheduler logic into their
runtime or alter contract schemas as part of this merge.

## Cadence and financial authorization

QA opts into a common five-minute source collection interval through
`SOURCE_COLLECTION_INTERVAL_MS=300000`; feed scheduling wakes every minute to
dispatch due work and continue pending downstream jobs. These are distinct clocks.
Provider Retry-After and helper backpressure delay only affected work. Production
config is unchanged and retains its existing behavior until explicitly switched.

`SOURCE_PER_PROVIDER_BUDGET_USD=15` authorizes **$15 per feed-source for each
provider separately**. X primary and X fallback have separate ledgers. This is
a cumulative reservation allowance, not a daily reset or measured invoice cost.
Aggregate operator authorizations and per-operation reservation ceilings remain
additional checks. None are silently replenished by retries or source inputs.

The QA database's aggregate limits differed from its deployed text settings.
Rollout configuration preserves the actual authorized D1 limits and reservations.
Legacy completed operations are attributed by immutable scoped payload paths
when initializing the new ledger. Unattributed uncertain legacy submissions block
new dispatch until reconciled. New operations persist financial source scope.
Primary budget exhaustion can proceed to an independently funded fallback;
uncertain submission and policy refusal cannot initiate a blind replacement call.

For a new operator authorization, review then run:

```powershell
node scripts/authorize-source-provider.mjs --provider x_twitterapi_io --aggregate-usd <explicit-total> --operation-ceiling-usd 0.1
# Add --apply only after reviewing the authorization. This edits local config;
# it does not deploy, install credentials or reset existing reservations.
```

## Rollout and rollback

1. Confirm branch, target Worker/account, existing version, assets, secrets by name
   and actual D1 provider authorizations. Do not copy token values into Git.
2. Export a private remote D1 backup before migrations. Exports briefly interrupt
   D1 queries; keep the backup out of Git and shared documents.
3. Run `scripts/prepare-connector-scale-qa.ps1 -Apply` after dependency installation.
   It backs up QA, provisions collection/DLQ queues and applies additive migrations
   `0048_connector_scaling.sql` and `0050_connector_financial_scope.sql`. Migration
   names are tracked independently; do not replace other contributors' 0048/0049
   migrations with this file just because their numeric prefixes overlap.
4. Back up the VPS helper, atomically replace its three execution files and restart
   the verified service. Preserve runtime.env and Telegram session files. Verify
   extraction, public egress and session recovery; restore helper files if checks fail.
5. Build the web app and upload immutable assets with
   `node scripts/upload-sources-qa-assets.mjs --upload`. Switch STAGING_ASSETS_PREFIX
   only after every object and manifest upload succeeds.
6. Run exact QA dry-run and deploy `apps/worker/wrangler.sources-qa.toml`. Preserve
   existing Outlook refresh/encryption secrets, provider credentials and OpenRouter.
7. Verify authenticated/public API, all asset hashes, Cron dispatch, queue draining,
   source failures, reservations and grounded publication. Do not mistake a dry-run
   or an accepted API request for successful live publication.

Saved pre-rollout Worker version: `9c64b20d-26fc-4baa-a15b-af72e49ac9ab`.
Saved assets: `staging-assets/758837e409f03d248288de04909e981d680abf6a/`.
VPS backup: `/home/distilled-bench/distilled-source-runtime/backup-connector-scale-20261013`.
Rollback to the saved Worker version using Wrangler's rollback command, then
restore the verified helper if required. Keep additive tables/columns in place;
do not restore an old database over new accepted evidence or financial operations.
Database restoration needs an isolated restore-and-compare procedure.

## Evidence and remaining acceptance checks

The local D1 test dispatches 1,000 distinct feeds through indexed batches and
checks recovery after lease expiry, fair per-feed slots, authorization revocation,
publication gating, queue-to-full-article-to-review integration, separate primary
and fallback reservations and one paid dispatch under concurrent replay. Another
test shares one HTTP fetch across 1,000 authorized consumers. These are component
and integration load checks, **not a live 1,000-feed end-to-end soak**.

Run `node scripts/test-connector-scale.mjs` to reproduce the 1,000-feed check.
Use `scripts/connector-scale-metrics.sql` with remote `wrangler d1 execute --file`
to compare backlog, oldest due time, held publication windows, failures, storage,
cache and conservative reservations over time. Pair it with Cloudflare queue
backlog/latency and VPS CPU/memory/concurrency metrics and provider invoices.

Before declaring 1,000-feed production readiness, run a sustained mixed-source
load with unique and shared resources, measure freshness/drain latency and D1
query counts, exercise DLQ replay and bounded retries, and prove real provider
outage/recovery without extra paid submissions. The unchanged intelligence runtime
still has per-feed document scans; its owner must assess those separately. One VPS
session may bottleneck many distinct Telegram channels; backpressure is safe but
does not establish its throughput. Controlled Telegram edit/deletion proof still
requires a channel the tester owns; public-channel rechecks cannot manufacture it.

Full suite and live results must be reported separately from the targeted checks.
No 1,000-feed production-capacity claim follows solely from these tests.
