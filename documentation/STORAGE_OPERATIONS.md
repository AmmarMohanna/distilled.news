# Storage lifecycle and capacity

The paid D1 limit is 10 GB per database. It cannot be disabled. Routine
operation must not require manually clearing a full database. This policy
separates temporary operational data from canonical published records.

## Automatic policy

With `STORAGE_MAINTENANCE_ENABLED=true`, the existing minute Cron runs a bounded
maintenance pass **before** source scheduling. No extra service or credentials
are necessary. The Joud deployment opts in; other deployments retain their
existing policy until they enable it.

| Data | Policy |
| --- | --- |
| New unpaid AI waits | Store operation identity, input references, failure and zero-call usage; omit duplicated model state immediately. |
| Legacy unpaid AI wait payloads | Copy exact JSON to R2, read it back and verify byte equality, then atomically replace SQL with references and a SHA-256 archive pointer. |
| Unpaid wait diagnostics older than 30 days | Archive and verify, then remove the transient SQL diagnostic. Retries still derive identities from canonical inputs. |
| Expired semantic ownership leases | Remove after a full day of expiry, together with their matching release rows. Live renewals remain. |
| Queue delivery diagnostics | Expire after 30 days. Canonical jobs and execution identities remain. |
| Diagnostic R2 archives | Expire after 90 days using a prefix-specific bucket lifecycle rule. |
| Published editions, evidence and supporting canonical records | Excluded from this maintenance policy. |
| Paid intents, settlements, unknown provider outcomes | Excluded; they prevent repeat charges and require their original lifecycle. |
| Feed illustrations | Existing R2 image objects remain unchanged. |

The sweep examines at most 50 waits, 100 expired leases and 200 old delivery
diagnostics per invocation. Five-record pages bound memory even for the
largest supported D1 rows. The sweep stops starting new archive work after
20 seconds so source scheduling does not wait behind a whole recovery batch.
A durable keyset cursor resumes after restart.
Archive failure leaves the original SQL untouched. Conditional replacement
and SQL batching protect against races and rollback on insertion failure.
No trigger is disabled and no paid model call is made by maintenance.
Migration `0060_storage_retention_indexes.sql` adds expiry indexes so cleanup
does not scan all delivery or lease history. Apply it through the existing
remote D1 migration command; archival recovery itself does not require it.

This bounds diagnostic age, not database size regardless of traffic. Its
maximum service rate must remain above incoming diagnostic volume; monitor
the sweep counters and capacity rather than assuming a timer guarantees that.

## Operations

- `GET /api/admin/storage`: existing admin-session authentication; capacity
  and maintenance counters, with private/no-store caching.
- `GET /api/internal/storage/status`: same information using the existing
  `x-distilled-internal` maintenance secret.
- `POST /api/internal/storage/run`: one bounded pass, same secret, enabled
  only with the maintenance flag. Useful for accelerating an existing backlog.
- `GET /api/internal/storage/archive?sha256=<64 lowercase hex digits>`:
  authenticated diagnostic archive retrieval; expired objects return 404.

Capacity uses D1's documented `meta.size_after`. This is allocated database
size, not an exact live-data/free-page measurement. D1 disallows the SQLite
page/freelist pragmas, so the API does not report invented reclaimed capacity.
Offloaded payload bytes are a separate counter and are not claimed as an
equal decrease in physical database size. Warning begins at 75% allocated,
critical at 90%; structured `storage_capacity_pressure` logs accompany the API.

For the Joud bucket, install the diagnostic-only rule while preserving all
existing rules:

```powershell
corepack pnpm --filter @distilled/worker exec wrangler r2 bucket lifecycle add distilled-news-joud-raw semantic-wait-diagnostics-90d operational-archives/semantic-waits/ --expire-days 90 --config wrangler.joud.jsonc --force
```

Never attach this expiration to the whole bucket: it also contains images and
canonical source archives. Never truncate `v1_feed_documents`, delete evidence
by age alone, or discard unknown-cost reservations to make space.

## Growth beyond one database

Automatic diagnostic retention addresses the observed runaway growth. It
does **not** make the current shared database unlimited. Published history and
its provenance are intentionally retained, so those records still grow.

Before onboarding enough accounts to exhaust canonical storage, introduce
account-scoped data partitions: a small control database for account/routing
information, multiple D1 data databases with stable account ownership, and R2
for bulky archival objects. Account-local transactions and feed scope must
stay within one partition. Provision a new partition before an existing one
reaches its capacity threshold; route new accounts there and migrate existing
accounts only with verified, reversible cutover. Auth, usernames and public
feed URLs stay stable. This routing migration is not implemented by the
diagnostic maintenance patch, and capacity warnings are not autoscaling.

Cloudflare documents [D1 limits and horizontal scaling](https://developers.cloudflare.com/d1/platform/limits/),
[query metadata](https://developers.cloudflare.com/d1/worker-api/return-object/),
and [R2 lifecycle rules](https://developers.cloudflare.com/r2/buckets/object-lifecycles/).
