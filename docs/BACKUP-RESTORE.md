# Backup and restore

## Production export

Production exports are read-only against D1 but contain sensitive account and
content data. Store them encrypted, restrict access, and never commit or attach
them to an issue.

The export script resolves the checked-in production database ID and requires a
target-specific acknowledgement:

```sh
CONFIRM_PRODUCTION_EXPORT=distilled-news:production:export:777782fe-6c8f-45c1-826d-365c40bc1210 \
  pnpm backup:production
```

It writes an ignored timestamped SQL file and SHA-256 checksum under
`backups/production/`. Record the Worker release SHA, latest migration, export
time, checksum, and storage location in the operator log.

Verify that the export imports into a clean local D1 before relying on it:

```sh
pnpm backup:verify -- \
  --file /absolute/path/to/export.sql \
  --evidence /absolute/path/to/restore-verification.json
```

The verifier checks the export SHA-256, imports through Wrangler into disposable
local D1 state, runs `PRAGMA quick_check`, verifies the core tables, emits
non-sensitive JSON evidence, and removes the disposable state.

The protected production release workflow performs both steps before migration.
It uses authenticated AES-256-GCM with the protected
`BACKUP_ENCRYPTION_KEY`, which must be exactly 32 generated random bytes encoded
as 43-character unpadded base64url. It decrypts and byte-compares the result,
stores the encrypted object only in the dedicated private
`distilled-news-production-backups` R2 bucket, downloads and compares it, and
publishes only non-sensitive verification JSON as a GitHub artifact. Plaintext
and the encrypted runner copy are deleted.

The backup bucket is intentionally not a Worker binding. Its `r2.dev` access
must be disabled, it must have no custom domains, and the exact
`production-backup-expiry-30d` lifecycle rule must delete objects under
`pre-migration/` after 2,592,000 seconds. Verify those controls before release:

```sh
pnpm backup:store:verify
```

Create `BACKUP_ENCRYPTION_KEY` with a cryptographically secure generator, keep
an offline recovery copy separate from GitHub and Cloudflare, and install the
same value only as a protected production-environment secret. A missing or
weakly formatted key, failed authenticated decrypt, unsafe/public bucket,
missing lifecycle, failed upload, or failed download comparison blocks
migration. Never upload the encrypted database itself as an artifact in this
public repository.

## Restore rehearsal

Never rehearse against the application staging database. Create a third,
disposable D1 database whose name includes both `staging` and `restore`. Put its
name and ID in `.env.staging`, then run:

```sh
CONFIRM_CLOUDFLARE_MUTATION=distilled-news:staging:restore:distilled-news-staging-restore \
  pnpm restore:rehearse:staging -- \
    --file /absolute/path/to/export.sql \
    --checksum /absolute/path/to/export.sql.sha256 \
    --evidence /absolute/path/to/restore-verification.json
```

Before any remote query or import, the script verifies the SQL against its
SHA-256 checksum and verifies that the supplied evidence came from a successful
`backup:verify` local D1 import of those exact bytes. It then resolves the named
database through Cloudflare and requires the returned name and UUID to match
`STAGING_RESTORE_DATABASE_NAME` and `STAGING_RESTORE_DATABASE_ID`. Only after
those checks does it confirm that the target is empty, recheck the local
artifacts, import the export, run `PRAGMA quick_check`, and verify the core
tables. A missing or mismatched evidence file, modified SQL, checksum mismatch,
or Cloudflare name/UUID mismatch fails closed. Delete the disposable database
through the approved Cloudflare procedure after recording recovery time and
verification.

Run this isolated remote rehearsal on the documented schedule and after a
material schema/recovery change. The per-release local import proves that an
export is structurally restorable; it does not measure remote recovery time.

## Recovery order

1. Stop writes or close registration if corruption or replay is possible.
2. Identify the last trustworthy export and verify its checksum.
3. Create a new database; do not overwrite the only recoverable copy.
4. Restore and verify in isolation.
5. Apply only migrations newer than the export and run application smoke tests.
6. Rebind staging, then production, through a reviewed config change.
7. Deploy the matching release, inspect queues and DLQs, and reopen traffic.
8. Preserve incident evidence and document the recovery point and recovery time.

R2 payloads are short-lived evidence, not the primary system of record. Queue
messages cannot be treated as a backup; after restore, reconcile idempotency and
publication windows before replaying work.
