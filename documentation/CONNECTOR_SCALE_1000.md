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
- Telegram verification is preflighted before saving a feed or changing its
  sources. Helper backpressure returns a retryable 503 rather than leaving a
  partially configured feed after a generic 500. The verified result is reused
  for approval; it is an internal capability, never accepted from client JSON.

## Integration interface and ownership

`v1-intelligence/runtime.ts` is unchanged. `relayConnectorDownstream(scopedEnv)`
calls the existing acquisition/intelligence dispatchers. `connectorDownstreamEnv`
resolves the message's canonical feed and supplies only that feed's currently
approved source IDs. `coalescedProcessingQueue` suppresses repeated sends while
allowing expired deliveries to resume. The existing canonical job leases and
revision rules remain authoritative.

`connector_relay` deliveries execute on the processing queue with their own
renewable, fenced lease. Collection consumers only schedule/deliver those relays;
they do not run the intelligence graph inline. Enrollment metadata reads are
batched, and source authorization reads the product row plus intake fence in one
query. Both changes preserve configuration checks and canonical CAS guards.

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
Intermediate retry/relay ticks now skip source reenrollment until the next
collection boundary. Connector-owned migration `0054_connector_collection_clock.sql`
wakes collection immediately for source/feed configuration edits. Its generation
fence preserves an edit made during a running scheduling pass. Cron does not
replace the token or consume dispatch slots for a currently claimed feed.
Provider Retry-After and helper backpressure delay only affected work. Production
config is unchanged and retains its existing behavior until explicitly switched.

`SOURCE_PER_PROVIDER_BUDGET_USD=15` authorizes **$15 per feed-source for each
provider separately**. X primary and X fallback have separate ledgers. This is
a cumulative reservation allowance, not a daily reset or measured invoice cost.
Aggregate operator authorizations and per-operation reservation ceilings remain
additional checks. None are silently replenished by retries or source inputs.
Queue mode initializes missing grants once, in a batch, and never overwrites an
existing operator grant. Paid dispatch checks both the deployment authorization
and persisted D1 grant in the reservation transaction. Setting the D1 grant to
zero immediately revokes new spending even while old deployment settings remain.
Completed paid results can still replay without another external request. The
API immediately reports exhausted/revoked providers and retains funded fallbacks.

The QA database's aggregate limits differed from its deployed text settings.
Rollout configuration preserves the actual authorized D1 limits and reservations.
Legacy completed operations are attributed by immutable scoped payload paths
when initializing the new ledger. Unattributed uncertain legacy submissions block
new dispatch until reconciled. New operations persist financial source scope.
Primary budget exhaustion can proceed to an independently funded fallback;
uncertain submission and policy refusal cannot initiate a blind replacement call.
An unresolved paid submission also fences later polling windows and other paid
providers for that same FeedSource. The fence is checked atomically with the
reservation; another feed/source retains independent authorization and history.

For a new operator authorization, review then run:

```powershell
node scripts/authorize-source-provider.mjs --provider x_twitterapi_io --aggregate-usd <explicit-total> --operation-ceiling-usd 0.1
# Add --apply only after reviewing the authorization. This edits local config;
# it does not deploy, install credentials or reset existing reservations.
# To explicitly update the persisted QA grant as well as local configuration:
node scripts/authorize-source-provider.mjs --provider x_twitterapi_io --aggregate-usd <explicit-total> --operation-ceiling-usd 0.1 --apply --remote
# Revocation: --aggregate-usd 0 --operation-ceiling-usd 0 --apply --remote
```

## Rollout and rollback

1. Confirm branch, target Worker/account, existing version, assets, secrets by name
   and actual D1 provider authorizations. Do not copy token values into Git.
2. Export a private remote D1 backup before migrations. Exports briefly interrupt
   D1 queries; keep the backup out of Git and shared documents.
3. Run `scripts/prepare-connector-scale-qa.ps1 -Apply` after dependency installation.
   It backs up QA, provisions collection/DLQ queues and applies additive migrations
   `0048_connector_scaling.sql`, `0050_connector_financial_scope.sql` and
   `0051_connector_feed_scope_index.sql`, `0052_connector_relay_lease.sql`, and
   `0053_connector_uncertain_scope_index.sql`, and `0054_connector_collection_clock.sql`. The indexes prevent canonical
   feed snapshots and unresolved paid-operation checks from scanning all deployment sources. Migration
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
Run `node scripts/test-connector-scale.mjs --collect` for the opt-in actual
collection workload: real D1 configuration, claims, R2 payloads, independent
intake receipts and checkpoints across 1,000 feeds with eight queue consumers.
It uses a simulated empty public RSS resource, so it measures collection
transport and sharing, not article extraction, real providers or editorial load.
It retains real cache expiry/backoff and reports phase latency and revalidation.
It also reports database round trips and statement counts by phase. An empty RSS
resource deliberately does not imply article/model throughput or sustained capacity.
Run `node scripts/connector-scale-metrics.mjs --remote` to snapshot the explicitly
named sources QA database. The script passes read-only SQL as a structured
`--command` argument and retains every query's rows plus D1 size metadata in an
ignored private JSON file. Wrangler's `--file` import path returns aggregate query
totals rather than the SELECT rows and is unsuitable for this monitoring check.
Compare backlog, oldest due time, held publication windows, failures, storage,
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

The pre-optimization collection workload timed out after ten minutes: first at
800/1,000 feed handlers with inline downstream dispatch; then, after separating
the relay, at 800/1,000 poll handlers. Those are failed capacity observations,
not passes. Further measurements must include warm repeated polling waves and
compare their drain time to the configured five-minute collection interval.

The subsequent profiled cold run also failed at ten minutes, with only 500 polls
completed. It scheduled all 1,000 feeds in 274,874 ms (p95 2,485 ms), making 19,001
D1 requests containing 30,005 statements in that phase. This is local Miniflare
evidence, not a measurement of Cloudflare production throughput. The collection
clock avoids repeating that enrollment work on every intermediate minute; it
does not, by itself, prove sufficient sustained throughput.

[Cloudflare D1 limits](https://developers.cloudflare.com/d1/platform/limits/)
document per-database serial execution, per-request overhead, and per-invocation
query limits. Batching reduces request overhead; increasing queue concurrency
alone cannot remove a single database bottleneck. Measure real queue age, query
duration, database bytes and service time before choosing concurrency or sharding.
[Queues concurrency](https://developers.cloudflare.com/queues/configuration/consumer-concurrency/)
also distinguishes upstream bottlenecks from queue scaling. The current eight
collection consumers are a measured starting configuration, not a certified
capacity setting for 1,000 mixed-source feeds.

Canonical evidence/connector fetch history does not currently have complete
retention cleanup. At five-minute cadence, 1,000 single-source feeds can produce
288,000 polling windows per day before additional sources/pages/retries. Measure
D1 bytes and retained rows per window before rollout. A retention/archive change
needs coordination under the parallel agreement, must preserve all exact support
for published editions, and must not reset financial reservations or idempotency.

## October 13 rollout record

Commit `1d93a12` was deployed to QA as version
`5673cd0e-476d-46d0-894d-7259d40b4f1f`. Both additive migrations and dedicated
collection/DLQ queues were installed. The private D1 export completed before
migrations; the VPS helper passed article-inventory and Telegram restart checks.
All 16 frontend assets were verified (15 immutable hashes and the dynamic
manifest), and unauthenticated maintenance access returned 404.

The saved QA test account signed in through the normal login API and read its
feed/source health. Its legacy signing secret was outdated; it was not installed
or rotated. Two intentionally nonpublic historical test feeds correctly denied
unauthenticated reads. The mixed-source fixture exposed a Telegram approval
failure after two RSS sources had saved; the preflight fix and regression test
were added as a follow-up. Until that follow-up is deployed and the fixture
completes, these observations do not establish all-source live success.

Cloudflare CLI authentication expired after the first deployment, so final D1
metrics and the follow-up deploy require fresh authorization. Update this record
with the resulting version and actual collection/drain observations; don't
attribute historical accepted batches or editions to the new rollout.

## October 14 pre-rollout observations

After fresh sign-in, the current deployed Worker was still version
`5673cd0e-476d-46d0-894d-7259d40b4f1f`. A real SELECT snapshot found 2,125 pending
provider jobs, the oldest due at 03:48 UTC (snapshot 10:54 UTC), plus nine pending
RSS jobs. Nine historical provider jobs were marked uncertain; no paid operation
was currently missing its response payload. Those are different states and must
be investigated independently before any paid retry. D1 occupied 427,757,568 bytes.

The helper article-classification update is backed up at
`/home/distilled-bench/distilled-source-runtime/backup-article-classification-20261014-retry`.
Its observed service/listener restart and article-versus-listing checks passed.
The first restart check was premature, restored the prior Python file, and was
corrected to wait for actual listener readiness before retrying. Credentials and
Telegram session files were preserved.

The pre-rollout grants/reservations were read, not replenished. Any rollout record
must distinguish the above backlog from the drain results after deployment.

### October 14 rollout and retry investigation

Migrations 0051–0054 were applied after the fresh D1 export
`.review-tmp/qa-before-connector-clock-20261014.sql` (350,953,466 bytes).
Collection-clock rollout version `fb9a7322-0503-4ea6-9355-a2eb116165ea`
was deployed successfully. The mixed-source QA fixture saved successfully;
Telegram accepted three observations, while the other source paths still
required investigation. This is not a complete acquisition/publication pass.

At 11:32 UTC, indexed metrics found 2,153 pending provider jobs (oldest due
04:40 UTC), six pending RSS jobs and 445,894,656 bytes of D1 storage. One
paid operation had an unresolved response. Do not resubmit it or replenish
its reservation without reconciliation. The backlog has not drained.

Sanitized intake diagnostics (`e7ad094`) passed 22 intake regressions and
Worker typecheck. Polling-boundary diagnostics (`9d5b882`) passed 70 provider
and 31 RSS runtime regressions plus connectors typecheck. They log typed
failure codes, not raw exceptions, source content, SQL or credentials.
The diagnostics are deployed as QA version
`4888908a-a73c-48a6-ac41-ac5931fdc850`; rollback version is
`b9f7cc18-2d88-4dee-9958-fd270c5d188a`. No push or production rollout occurred.
The 1,000-feed collection acceptance test remains unproven.

Polling diagnostics confirmed helper `BACKPRESSURE`. Migration 0055 adds
indexes for atomic execution exclusion: only one poll may hold a given
FeedSource checkpoint, and Telegram provider polls share the configured
helper's single session slot across feeds. A waiting claim returns `IDLE`
without consuming an attempt or allocating a provider operation. Other source
families and unrelated checkpoints remain concurrent; expired leases remain
recoverable. This does not serialize account onboarding or independent
authoritative rechecks, so helper backpressure handling is still required.
The provider/RSS regression suites passed 104 tests, including concurrent
claim, unrelated progress and waiting-attempt preservation cases.

The source-claim rollout succeeded as QA version
`bcfc7108-7fda-40b1-8d88-fcb6ce396e0b` after a transient authentication
failure and a verified authenticated retry. At 11:49 UTC the backlog was still
2,155 provider jobs and D1 occupied 453,095,424 bytes; no paid operation was
currently missing its response. Test-account health showed accepted batches
for the six fixture source paths, including Google News and X, but no fixture
edition had published. Partial source coverage is not full-article proof.

The actual 1,000-feed Miniflare run at commit 2991896 FAILED at its drain
deadline: enrollment completed in 322,650 ms with 19,001 database requests;
503 polls completed and 497 remained pending after 582,636 ms. Local timings
include concurrent regression work and are not a remote capacity benchmark.
They still establish that the collection acceptance gate has not passed.
The follow-up optimization removes preliminary enrollment only for a
single-source feed; its scheduling pass still validates current product state
and enrolls before freezing a revision. Multi-source revision synchronization
retains both passes. All 24 Worker connector-runtime regressions passed.
