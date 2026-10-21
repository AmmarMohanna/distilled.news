# Multi-source activation for Joud

## October 21 activation update

The user authorized **$5 per day total** across paid collectors, with the day
resetting at midnight in `Asia/Beirut`. This supersedes the historical zero-budget
restriction below. It does not authorize $5 per provider. Atomic D1 admission
reserves a conservative maximum per operation across verification and ingestion;
reservations are not an invoice of actual provider charges. Unknown paid outcomes
remain fenced. Existing paid-operation identities and reservations are retained.

Apify-backed Google News, X, and LinkedIn returned real records and passed live
topic assessments. Website extraction also has a Worker-native public HTML path.
Exact-topic relevance remains mandatory; related industry content is not enough.

The project Telegram account was authorized locally, then its session and API
credentials were explicitly approved for transfer to the project VPS. An isolated
`distilled-source-joud.service` listens on `127.0.0.1:8791`, starts at boot, and
restarts on failure. Its state/configuration live under
`/home/distilled-bench/distilled-source-runtime-joud/`, separate from the existing
collector. The existing egress firewall also permits this loopback port; private
destination restrictions remain intact. The service reuses the installed Node
and Python runtimes. Its private VPC service ID is
`01a15fbb-d418-7871-a5ca-92f1be34925c` on the existing tunnel.

The VPS live test resolved the official public `telegram` channel and read five
posts in 1.82 seconds; unauthenticated execution returned HTTP 401. This proves
the VPS session and execution path, not yet deployed app connectivity. Telegram
assessment now resolves identity and reads up to twenty recent posts through the
authenticated service before checking topic relevance. It never joins a channel
or initiates login. Missing authorization, mismatched identities, unreadable posts,
and rate limits cannot produce an accepted recommendation.

The matching Worker secret and private binding were deployed on October 21. The
live protected assessment endpoint accepted the official channel for Telegram
product updates (4.54 s), rejected it for coconut farming in Australia (5.24 s),
and left a nonexistent channel unverified (3.33 s). The accepted result cited a
real collected post. No test channel was added to a public feed or published.
Worker version: `d74fa844-b7f7-462f-960c-403a09efbf7d`.

The runtime permits eight bounded requests, serializes Telegram session access,
and waits at most fifteen seconds for a session slot before returning retryable
backpressure. Ordinary public collection and downstream article extraction retain
their native Worker path when enabled; background Google/website work cannot use
the Telegram service just because it is configured. One hundred ninety-five
targeted tests passed across the relevant suites (including the subsequent routing
and concurrency regressions), and Worker type checking and deployment dry run passed.

This validates channel assessment and deployed connectivity, not a new live
published Telegram briefing. Existing collector integration tests cover durable
intake and publication with fixtures. Telegram can still rate limit or revoke the
account session; configured availability is not an unconditional health guarantee.
The project session must not be used concurrently on the local PC after moving it to
the VPS. Never commit sessions or runtime environment files. Useful local commands:
`node scripts/telegram-source-login.mjs` for an operator-controlled login, and
`node scripts/telegram-source-check.mjs` for a bounded public-channel check before
moving the session to the VPS.

Private service configuration follows the [Cloudflare VPC service documentation](https://developers.cloudflare.com/workers-vpc/configuration/vpc-services/).

## Historical October 19 assessment (superseded where noted above)

Checked 2026-10-19 against the repository configuration, deployed secret names,
and parsed local credential presence. The intended product remains multi-source:
RSS/Atom, Google News, Telegram, X, LinkedIn, and public websites.

| Source | Existing implementation | Current Joud blocker | Activation evidence required |
| --- | --- | --- | --- |
| RSS/Atom | Native HTTP feed provider, discovery, assessment | Publisher availability and topical evidence vary | A readable feed, accepted relevance assessment, and an ingested item |
| Google News | Google RSS plus Apify fallback adapter | Cloudflare RSS requests receive Google's automation block; Apify is not configured in production and budgets are zero | Approved capped Apify trial, matching results, verification integration, then separately authorized recurring collection |
| Telegram | Telethon/public provider and verified channel identity | No private execution service binding/configuration or authorized Telegram session | Execution service, authorized Telegram session, channel resolution and collected messages |
| X | TwitterAPI.io and Apify adapters | No production provider credentials; both provider budgets are zero | An authorized provider, explicit budget, account/search evidence, and ingested items |
| LinkedIn | Apify company/profile adapters | No production Apify credential; LinkedIn budget is zero | An authorized provider and budget, supported company/profile evidence, and ingested items |
| Public websites | HTTP/browser extraction, optional Zyte | No private execution service; optional paid provider unconfigured | Service binding and authentication, bounded extraction, relevance and successful ingestion |

## Common implementation requirement

Recommendation, approval, and ingestion must agree about the active collector.
It is insufficient to fund a social/Google provider while onboarding still tries
to verify the source exclusively through Cloudflare's direct public HTML/RSS
fetch. Verification must consume fetched evidence from the authorized collector,
under durable owner/feed/source scope, without relaxing relevance or URL safety.
It must distinguish unsupported, unconfigured, blocked, inconclusive, irrelevant,
and accepted sources. A provider being configured is not proof of live health.

Use the existing canonical source identity, provider fallback, D1/R2 evidence,
continuation/checkpoint, and intake contracts. Never replace these with a second
untracked scraper path or store a login session in the browser. Paid verification
needs the same reservation and uncertain-submission safeguards as paid ingestion.

## Immediate authorized work

The user approved **one Apify Google News trial with a $0.10 maximum run charge**.
After supplying the credential, that run succeeded with ten records and reported
`usageTotalUsd: 0.00005`. The one-run approval has been used; do not submit another
billable run under it. See `GOOGLE_NEWS_ALTERNATIVE_REVIEW.md` for the run ID,
relevance limitations, and preserved local journal/dataset.

The local `.env` now has non-empty Apify, Zyte, official X bearer, and Telegram
application ID/hash values. Only Apify was exercised by the approved trial. Other
credential validity is untested, and production secret/binding configuration has
not been changed. An official X bearer token is not a TwitterAPI.io key; the
existing adapters do not use it. Telegram still needs an authorized session and
the private execution service.

That approval does not fund ongoing Google collection, X, LinkedIn, proxy use, or
other paid services. Keep all Joud production provider grants at zero until a
separate recurring limit is agreed. Do not use the sources-QA authorization script
unchanged: it explicitly targets a different Worker and database.

## Completion checks for each activated connector

Demonstrate real evidence retrieval, source assessment, source approval, scheduled
collection, and a published feed item with retained provenance. Test account
isolation, failed/empty providers, retries and continuation without duplicate paid
runs, budget exhaustion, and honest owner health. Keep runtime credentials secret
and retain existing paid-operation journals when revoking authorization.

No connector should be described as operational solely because its adapter exists
or a mock test passes. The acceptance target is a working end-to-end source path.
