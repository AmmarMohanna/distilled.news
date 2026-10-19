# Multi-source activation for Joud

Checked 2026-10-19 against the repository configuration, deployed secret names,
and parsed local credential presence. The intended product remains multi-source:
RSS/Atom, Google News, Telegram, X, LinkedIn, and public websites.

| Source | Existing implementation | Current Joud blocker | Activation evidence required |
| --- | --- | --- | --- |
| RSS/Atom | Native HTTP feed provider, discovery, assessment | Publisher availability and topical evidence vary | A readable feed, accepted relevance assessment, and an ingested item |
| Google News | Google RSS plus Apify fallback adapter | Cloudflare RSS requests receive Google's automation block; Apify token is empty and budgets are zero | Approved capped Apify trial, matching results, verification integration, then separately authorized recurring collection |
| Telegram | Telethon/public provider and verified channel identity | No private execution service binding/configuration or local Telegram credentials | Execution service, authorized Telegram session, channel resolution and collected messages |
| X | TwitterAPI.io and Apify adapters | No provider credentials; both provider budgets are zero | An authorized provider, explicit budget, account/search evidence, and ingested items |
| LinkedIn | Apify company/profile adapters | No Apify credential; LinkedIn budget is zero | An authorized provider and budget, supported company/profile evidence, and ingested items |
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
The prepared script refuses to start until a non-empty `APIFY_API_TOKEN` is set.
No journal was created and no paid request was sent by the failed attempt.
The existing approval can be used once the credential is available; do not ask
for the same trial approval again. See `GOOGLE_NEWS_ALTERNATIVE_REVIEW.md`.

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
