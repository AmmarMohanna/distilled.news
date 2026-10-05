# Source providers and fallbacks

This opt-in connector slice extends the RSS implementation on
`codex/rss-source-integration`. It uses the shared contracts and intake port from
Appendix C of `ARCHITECTURE_v1.md`. Benchmark reports remain separate from production
connector code. This does not switch production polling, deploy services, push changes,
or modify the downstream owner's branch.

## Default provider order

| Source | Preferred | First fallback | Second fallback |
|---|---|---|---|
| RSS / Atom | Native XML normalization | Python feedparser | — |
| Google News query | Google News RSS | Tested Apify Google News actor | — |
| Telegram | Authorized Telethon account | Public Telegram page, public channels only | — |
| X profile | TwitterAPI.io | Tested Apify X actor | — |
| X topic / account query | TwitterAPI.io search | Tested Apify X actor | — |
| LinkedIn company | HarvestAPI company-posts actor through Apify | — | — |
| LinkedIn profile | HarvestAPI profile-posts actor through Apify | — | — |
| Website article | Direct HTTP + Trafilatura | Playwright + Trafilatura | Zyte HTML + Trafilatura |
| Explicit custom Apify source | Approved actor and bounded input | — | — |

These are practical preferred defaults, not a claim that one provider is universally
best. Direct HTTP/RSS avoid paid acquisition when usable; Telethon provides Telegram
history and stable peer identity; TwitterAPI.io is the preferred tested X alternative.
The earlier tests do not establish exhaustive search recall or production reliability.
See `testing-evidence/STAGE2_STATUS.md` and the individual comparison summaries.
Bright Data was skipped and official X was excluded from the agreed test scope; neither
is silently introduced as a fallback. LinkedIn has no second qualified alternative yet.
Operators may supply a different ordered list of up to three registered providers.

## Collection and handoff

`createSourceCollector` composes all default providers. `FallbackSourceCollector`:

1. Allocates and durably claims a shared FeedSource fetch sequence before each attempt.
2. Calls the selected provider with bounded source inputs and provider-specific cursors.
3. Stores raw responses and immutable normalized snapshots in scoped R2 objects.
4. Saves one bounded handoff in D1, including observations, coverage and proposals.
5. Calls `handoffConnectorBatch` against the downstream-owned durable intake port.
6. Persists validated receipts before advancing any independently proven cursor by CAS.

The supplied payload and normalized content use the shared, separate hashing helpers.
No fabricated model/tool provenance is added. Invalid or contentless observations remain
visible to intake without an acquisition proposal. Explicit authoritative deletions have
no proposal. A missing entry, empty listing or unavailable channel is never a deletion.

Snapshots can contain up to 10,000 normalized records; each intake batch contains at most
the configured limit (1–500). Snapshot continuation resumes saved content without fetching
again. Earlier snapshot receipts must resolve before subsequent offsets can be processed.
Paid response replay and intake replay preserve their original operation/handoff identities.

Only a provider-proven contiguous cursor is eligible for advancement. Telethon reads oldest
unseen messages first and looks ahead one entry. RSS, Google News, X/LinkedIn listing results
and website extraction do not claim historical collection completeness. Rechecks never
advance polling checkpoints. Ordinary RSS can also use the existing `RssSourceCollector`
when conditional ETag/Last-Modified polling is wanted; that collector has its own persisted
snapshot/validator flow. Do not run both collectors for the same migrated source.

Coverage of collection and completeness of content remain distinct. RSS is an excerpt,
Google News is a listing, social text is of unknown completeness, and a website extractor
declares article representation with unknown completeness. An HTTP 200 cannot prove a
complete article. Intake enforces date/account/publisher restrictions and quarantines
unverifiable fields; a provider query alone is not proof of compliance or exhaustive recall.
Acquisition decides whether a supplied excerpt is sufficient or a linked article is needed.

## Failure, retry and fallback rules

Recoverable transient, challenge, authentication/unavailability or malformed-provider
failures can move to the next applicable provider. Successful fetches do not automatically
trigger a paid second opinion. Failure attempts and failure coverage are durably recorded.
Successful batches preserve request/latency telemetry; unknown provider spend is `null`,
not zero. Provider billing data remains in saved raw responses when supplied.
Request counts cover instrumented HTTP calls (including permitted Playwright requests)
or the Telethon service operation; they do not claim to count every internal MTProto RPC.
Telemetry belongs to the immutable fetch batch; replay is not additional spend and
must be aggregated once per handoff/run rather than once per retry invocation.

- A saved snapshot or uncertain intake response is replayed, never replaced by a fallback.
- HTTP 451 / provider policy refusal stops the chain.
- Uncertain paid submission or exhausted budget stops the chain for reconciliation.
- A continuation stays with its originating provider. Restarting through another provider
  must be an explicit new collection, not reuse of an incompatible cursor.
- Private Telegram never falls back to the public-page adapter.
- Known failed attempts are remembered; replay does not reissue them under the same run.

`D1ProviderPollScheduler` persists jobs, leases, snapshot offsets and provider continuations.
It rechecks source authorization and migration state before executing. It bounds failures
to eight attempts per page and collection continuation to 100 pages by default. Long
Retry-After / Telethon flood waits are persisted and honored. Apify running actors are
polled through continuation, without starting another actor. Uncertain submissions require
operator reconciliation; automatic resubmission could double-charge.

## Backend bindings

`apps/worker/src/source-backend.ts` now provides `createSourceBackend(env, options)`
to compose the provider factory with actual Worker D1/R2 bindings, scoped public HTTP,
provider secrets and the private runtime HTTP client. Pass the downstream-owned durable
`intake` and an `authorize(request)` callback checking persisted approval/configuration
and disabled legacy polling. The returned `collect`, `scheduler`, `payloads` and `paidHttp`
support all registered source families. This module is not yet mounted in the production
Worker entry point. Keep `global_fetch_strictly_public` in the deployment configuration.

Environment bindings: `TWITTERAPI_IO_API_KEY`, `APIFY_API_TOKEN`, `ZYTE_API_KEY`,
`SOURCE_EXECUTION_URL`, `SOURCE_EXECUTION_TOKEN`, and `SOURCE_OPERATION_CEILINGS_JSON`.
The latter accepts numeric `twitterApiIo`, `apify`, and `zyte` ceilings; omitted/zero
ceilings prevent paid dispatch. Provider-wide D1 budgets still require explicit trusted
configuration through `paidHttp.configureLimit`. Setup now copies these fields from the
private environment file. Never put Telegram sessions/API credentials in Worker source
definitions: keep those on the private execution host.

Run `node scripts/source-execution-server.mjs` on the VPS with `SOURCE_EXECUTION_PYTHON`
set to the virtualenv Python, a dedicated random `SOURCE_EXECUTION_TOKEN` of at least 32
characters, and the existing Telegram/browser environment described below. It binds
only `127.0.0.1:8790` (override with `SOURCE_EXECUTION_PORT`). Route
`/v1/source-execution` through a TLS reverse proxy or tunnel, preserve Authorization,
and use that HTTPS URL and the same dedicated token on the Worker. The service limits
concurrent executions, request/output sizes, and subprocess duration; errors omit
third-party exception strings. Host egress controls remain required for browser use.

New-account setup is pending Wrangler authentication and selection of resources in
that account. The checked-in production Wrangler config still names existing lownoise
resources and must not be deployed into the new account unchanged. No remote resource,
migration, scheduled source, credential, or paid call was created by these code changes.

No Worker entry point, queue consumer, HTTP intake endpoint, deployment binding or
production migration was added. Integration uses existing shared ports:

```ts
import {
  sourceSqlFromD1, D1ProviderSourceRepository, R2SourcePayloadStore,
  BoundedFeedHttp, DurableProviderHttp, createSourceCollector, D1ProviderPollScheduler
} from '@distilled/connectors';

const sql = sourceSqlFromD1(DB);
const payloads = new R2SourcePayloadStore(PAYLOADS);
const paidHttp = new DurableProviderHttp(sql, payloads, authorizedProviderFetch);
// Configure these once through trusted administration; never from source input.
await paidHttp.configureLimit('x_twitterapi_io', 20);
await paidHttp.configureLimit('x_apify', 20);
await paidHttp.configureLimit('google_apify', 20);
await paidHttp.configureLimit('linkedin_apify', 20);
await paidHttp.configureLimit('zyte', 20);
// Custom actors require their own explicitly configured apify_actor budget.
const collector = createSourceCollector({
  repository: new D1ProviderSourceRepository(sql), payloads,
  intake: durableIntake, http: new BoundedFeedHttp(authorizedSourceFetch),
  paidHttp, execution: trustedPrivateExecutionPort, secrets: resolvePrivateProviderSecret,
  ceilings: approvedPerOperationCeilings
});
const scheduler = new D1ProviderPollScheduler(sql, collector, sourceStillApprovedAndLegacyPollingDisabled);
```

The SQL constants `SOURCE_STORAGE_SCHEMA`, `PROVIDER_SOURCE_SCHEMA`,
`PROVIDER_BUDGET_SCHEMA` and `PROVIDER_POLL_SCHEMA` are schema proposals to coordinate
with the downstream migration owner, not automatically installed production migrations.
Secrets resolve under `x_twitterapi_io`, `apify`, and `zyte`; none are stored in request
hashes, source configs or logs. Paid HTTP restricts endpoints to the three provider API
hosts, refuses redirects and bounds response size and deadline.

Paid budgets reserve a conservative per-operation ceiling atomically before dispatch.
Uncertain operations remain reserved. Reservations are not actual billing totals and
are not automatically refunded; reconcile with provider billing before trusted budget
reset/release. Apify actor-start ceilings are also sent as `maxTotalChargeUsd`. Leave
headroom for status/dataset operations, whose conservative reservations are $0.000001
each; this is an allowance, not a claim that Apify charges that amount per request.
Other provider ceilings must cover the provider's maximum result count under current
pricing. No local guard can guarantee billing below an incorrectly configured ceiling.

### Private VPS execution

`scripts/source-execution.mjs` supplies a local `SourceExecutionPort` implementation;
`scripts/source-execution.py` performs bounded Python operations. This is an executable
backend binding, not a new public API server. A Worker-to-private-runtime transport and
its authentication/deployment must be connected through the existing trusted service
boundary with the deployment owner before a production switch.

Install the separate production runtime requirements into a private VPS virtualenv:

```sh
python3 -m venv .venv-source
.venv-source/bin/python -m pip install -r scripts/source-execution.requirements.txt
.venv-source/bin/python -m playwright install chromium
```

Then compose the Node/VPS handler:

```js
import { createSourceExecution } from './scripts/source-execution.mjs';
const execution = createSourceExecution({
  python: '/absolute/private/.venv-source/bin/python',
  environment: {
    TELEGRAM_API_ID: privateConfig.telegramApiId,
    TELEGRAM_API_HASH: privateConfig.telegramApiHash,
    TELEGRAM_SESSION_PATH: '/absolute/private/telegram.session',
    SOURCE_BROWSER_EGRESS_CONFIRMED: 'true'
  }
});
```

Telethon uses an already authenticated, authorized session and verified numeric peer ID.
It does not log in, join channels, prompt for codes, or write session contents to Worker
payloads. Keep the session outside the repository with owner-only permissions. Maintain
verified username-to-peer registration for public fallback; a username alone is not a
stable peer identity. Rechecks retrieve specified message IDs; empty responses do not
assert deletion. Other Apify rechecks are explicitly unavailable until an authoritative
source-specific adapter is implemented.

Playwright requires the existing verified host egress firewall (including browser child
processes) before setting the confirmation flag. The runtime also checks public DNS for
requests, blocks service workers and unnecessary media, and does not disable Chromium's
sandbox. Private/loopback access and DNS rebinding protection remain deployment controls.
The bridge limits stdin, stdout and duration and kills its process group on the Linux VPS
when execution fails or times out. Windows child-process cleanup is not a certified browser
deployment route. Extraction uses Trafilatura; the Readability benchmark comparison remains
separate and is not added as an automatic voting stage.

## Validation and remaining integration

Recovery fixes verified on 2026-10-04: Apify actor creation now returns a bounded empty
page containing its actor-run continuation. The collector persists and hands off that
page before any status/dataset read; scheduler retries retain the continuation and resume
the same actor. A crash before that initial snapshot commits still blocks the uncertain
run for operator reconciliation rather than starting another paid actor automatically.
Duplicate source-item identities (including across snapshot slices), colliding observation
keys and DELETE records without authoritative evidence fail before snapshot persistence,
allowing configured fallback. Previously saved malformed snapshots still need operator
repair; this change does not delete or rewrite immutable saved data.

The connector suite now passes 166 tests, including scheduler restart recovery after
synthetic Apify status/dataset HTTP 503 responses with exactly one actor submission,
duplicate-page fallback/replay and unauthoritative-delete fallback. Connector typecheck
also passes. No live provider calls or production deployment were performed.

Tests use synthetic provider responses, fixture intake receipts and private execution
stubs. Python execution tests stub third-party libraries. Miniflare tests use real local
D1/R2 bindings to verify paid-dispatch fencing and restart replay. None are live provider
calls or proof of canonical downstream duplicate prevention.

Verification for this implementation: 162 connector tests, 44 shared-contract tests,
three Node execution-bridge tests and four Python runtime tests pass. All workspace
typechecks pass. Of the connector tests, two use local Miniflare D1/R2 bindings; no test
in this change contacted a live paid provider or used a real Telegram session.

Remaining coordinated production work: install approved migrations/bindings, connect the
real durable intake and authenticated private execution transport, register approved
sources/provider ceilings, disable each source's old poller, and run a bounded live smoke
test through evidence/Event/publication. This slice does not claim a grounded edition was
published. Actor inputs and current provider schemas also need a live smoke test before
enabling each actor; saved benchmark evidence alone cannot certify future provider behavior.
