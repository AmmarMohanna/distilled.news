# Privacy notice

Effective: 29 July 2026

This notice covers the hosted Distilled.news service. A self-hosted operator is
responsible for its own deployment, notices, legal basis, providers, retention,
and user requests.

## What the service processes

- Account data: email address, normalized email, username, password hash,
  verification state, role, account status, and session-security state.
- User configuration: briefing names, public slugs, interests, styles, language,
  cadence, sources, and pause settings.
- Public-source data: public posts, article metadata, links, timestamps, source
  attribution, extracted text, and short-lived raw payload references.
- Generated data: relevance decisions, summaries, editions, evidence links,
  processing status, provider usage, and estimated or actual cost records.
- Security and operations data: IP-derived abuse keys, authentication attempts,
  request and Worker logs, queue metadata, error details, and release metadata.
- Username-retirement data: when a verified or public hosted account is
  permanently deleted, SHA-256 hashes of its current and historical public
  usernames and the time each username was retired. These records contain no
  account or email linkage and are used solely to prevent reassignment of
  historical public URLs.

Passwords are stored as one-way hashes. Provider tokens and application secrets
are stored as Cloudflare secrets and are not intended to enter application data.

## Why data is used

Data is used to create and publish requested briefings, operate accounts and
recovery, prevent abuse, enforce provider and model budgets, diagnose failures,
secure the service, comply with law, and improve reliability.

On the hosted service, an account that has not completed email verification is
a 60-minute pending registration lease. Its account row and verification token
are deleted when that lease expires.

Published feeds are public by design. A username, feed title, slug, summaries,
source attribution, evidence, and publication timestamps may be visible without
login and indexed or copied by others. Do not put private information in an
interest profile, source label, username, or feed title.

## Providers and disclosure

The service uses the providers listed in [Subprocessors](SUBPROCESSORS.md).
Only the data needed for the selected feature is sent. OpenAI receives prompt
and source text when model-backed processing runs. Apify receives source queries
or public identifiers for enabled Apify-backed sources. Cloudflare processes
application, storage, delivery, email, security, and logging data.

Data may also be disclosed when required by law, to protect people or the
service, during a properly structured business transfer, or with the user's
direction. Distilled.news does not sell personal information.

## Retention

Published news context defaults to 15 days. Raw payload objects default to a
30-day R2 lifecycle and may be removed earlier when their database references
expire. Authentication tokens expire according to their purpose. Security,
cost, incident, and backup records may be retained longer when needed for
integrity, fraud prevention, recovery, or legal obligations. See
[Data retention](../DATA-RETENTION.md) for the operational schedule.

Detailed provider/model spend events are kept for up to 90 days after they
settle. They are then reduced to daily provider/category totals without account
or briefing identifiers, plus hashed replay-prevention tombstones, for up to 13
calendar months from the operation date. Account deletion performs this
unlinking immediately. Provider logs, backups, cached copies, and public copies
may remain for their limited retention periods or outside Distilled.news
control.

When a verified or public hosted account is permanently deleted, its current and
historical public usernames are reduced to SHA-256 hashes and retained
permanently solely to prevent another person from taking over the same
username-scoped feed URLs. The retirement table stores only the hash and
retirement time; no account identifier or email linkage remains. Expired
never-verified registrations and failed-signup rollback do not create these
permanent hashes. Because public usernames have low entropy, their hashes are
pseudonymous, not anonymous, and are treated as restricted security data.

## Choices and requests

Users can change account and briefing settings, pause feeds, remove sources, and
request account deletion through available account controls. For access,
correction, export, deletion, restriction, or objection requests not exposed in
the product, contact `privacy@distilled.news`. Identity verification may be
required. Applicable law may provide additional rights and exceptions.

## Security, transfers, and children

The service uses access controls, isolated Cloudflare bindings, encrypted
transport, password hashing, secret storage, rate limits, provider kill
switches, immutable active spend detail, bounded aggregation, and monitored
release gates. No system is perfectly secure.

Providers may process data in countries other than the user's. Their published
terms describe transfer mechanisms and locations. The hosted service is not
directed to children under 16 and should not be used to create an account for a
child without lawful authorization.

Material changes will update the effective date. Existing hosted accounts will
be asked to acknowledge the current notice in the service before making account,
feed, source, or star changes; logout and account deletion remain available.
