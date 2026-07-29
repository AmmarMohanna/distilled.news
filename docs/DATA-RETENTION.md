# Data retention

Distilled.news minimizes retained news context while preserving enough evidence
for public briefings, security, billing integrity, and recovery.

| Data | Default | Deletion mechanism |
| --- | --- | --- |
| Unverified hosted signup and verification token | 60 minutes | Bounded minute-scheduler cleanup and opportunistic cleanup when the pending queue is full |
| Raw messages, clusters, briefing items, and evidence | 15 days | Expiration timestamps and scheduled D1 cleanup |
| Published editions and publication windows | 15 days by product policy | Scheduled database cleanup using the published/window cutoff |
| Raw R2 payload objects | 30 days maximum by default | D1 reference cleanup followed by R2 lifecycle/deletion |
| Verification and password-reset tokens | Until expiry or consumption | Scheduled cleanup and one-time use |
| Auth-attempt records | Short security window | Scheduled cleanup |
| Queue payloads and DLQ entries | Cloudflare queue policy and incident need | Retry, quarantine review, then removal |
| Spend reservation, settlement, and release detail | 90 days after a terminal event | Scheduled anonymous aggregation and bounded detail deletion |
| Daily provider/category spend aggregates and hashed idempotency tombstones | 13 calendar months from the operation date | Scheduled bounded deletion |
| Current and historical public usernames from deleted verified or public hosted accounts | Permanent | SHA-256 hash and retirement time only; no account or email linkage |
| Backups | 30 days unless an incident hold applies | Encrypted storage lifecycle and inventory review |
| Provider and Worker logs | Provider-configured operational window | Cloudflare/provider retention settings |

User-visible retention is fixed at 15 days in the hosted product. A self-hoster
may choose another lawful schedule but must keep database expiration, R2
lifecycle, notices, and backup deletion aligned.

The retention verifier reports expired D1 rows, editions, windows, and R2
references that remain beyond their cleanup grace. It also reads the actual R2
lifecycle configuration, requires an enabled bucket-wide delete rule of no more
than 30 days, paginates the remote object inventory, and fails on objects older
than 31 days (the lifecycle plus Cloudflare's deletion-processing grace).
`source_runs.archive_key` references are reported, and their objects are covered
by the same full-bucket age scan.

Spend detail is immutable while active. Once an operation has a settlement or
release and is more than 90 days old, the scheduled job rolls its net amount
into a daily provider/category aggregate with no account or briefing identifier,
stores only a SHA-256 idempotency tombstone, and deletes the linked detail.
Aggregates and tombstones expire 13 calendar months after the operation date.

Account deletion applies the same aggregation immediately so account and
briefing identifiers do not remain in the spend ledger. A nonterminal
reservation is conservatively aggregated at its reserved amount before its
detail is removed; this preserves the global budget ceiling even if a provider
result arrives after the account is gone. The tombstone prevents replay without
retaining the original idempotency key.

Permanent deletion of a verified or public hosted account also hashes each
current and historical public username with SHA-256. It stores the hash and
retirement time permanently solely to stop a later registrant from taking over a
historical username-scoped public feed URL. No account identifier or email
linkage remains. Public usernames have low entropy, so these hashes are
pseudonymous, not anonymous, and remain restricted security data. The normal
retention cleanup must not delete them. Expired never-verified registrations and
failed-signup rollback do not create a tombstone. Migration
`0030_retired_username_hashes.sql` creates an empty table and does not create
tombstones for legacy account rows.

```sh
pnpm retention:verify -- --environment staging
```

Production is read-only but requires an explicit target acknowledgement:

```sh
CONFIRM_PRODUCTION_READ=distilled-news:production:retention-read \
  pnpm retention:verify -- --environment production
```

The Cloudflare token used by this command needs D1 read and Workers R2 Storage
Read. It never deletes rows, lifecycle rules, or objects.

Legal or security holds must be narrow, documented, access-controlled, and
removed when the obligation ends. Public copies outside the service cannot be
recalled by the retention job.
