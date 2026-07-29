# Incident response

## Severity

- SEV-1: active credential exposure, cross-account data access, destructive
  corruption, uncontrolled paid-provider spend, or broad outage.
- SEV-2: material feature outage, stuck queues, publication failure, provider
  degradation without a safe fallback, or recoverable data inconsistency.
- SEV-3: limited defect or warning with no immediate security, data, or budget impact.

## First response

1. Name an incident commander and start a timestamped private log.
2. State known impact, affected environment, release/version IDs, and uncertainty.
3. Preserve logs and evidence without copying secrets or unnecessary user data.
4. Stop the narrowest harmful action: close registration, disable one provider,
   stop a release, or quarantine a queue. Do not erase evidence.
5. Verify Cloudflare status and direct D1 health before assuming an application bug.
6. Communicate an initial status and next update time.

## Investigation checklist

- Resolve DNS, routes, Worker version, compatibility date, and environment vars.
- Test direct D1 `SELECT 1`; inspect database-backed and static routes separately.
- Review source attempts, canonical refresh leases, processing jobs, publication
  windows, queues, DLQs, R2 growth, and spend reservations/settlements.
- Compare the active release SHA with the last known good release.
- Check provider status, actor build, quota, schema changes, and response errors.
- Determine whether retries are safe under at-least-once delivery and cost caps.

## Common actions

For a Cloudflare D1 incident, avoid code changes until direct D1 and Cloudflare
status establish whether the failure is provider-side. For a provider incident,
use its kill switch and preserve other source paths. For a secret leak, revoke
and rotate the credential, invalidate affected sessions, search history and
logs, and assess data access. For a budget incident, disable the provider before
raising any cap.

Rollback only to a schema-compatible version. If a migration is involved,
restore into a new database rather than improvising a destructive down migration.

For a failed protected release, use the pre-mutation rollback-baseline artifact
from that exact workflow run. Do not select "the previous version" from current
deployment history: another operator action may have changed that ordering.
The release workflow first writes and verifies
`settings.registration_enabled=false`, then rolls Worker code to the captured
100%-traffic version and verifies the captured SHA and closed registration
live. This does not roll back D1 migrations, D1/R2 data, queues, secrets, or
other bindings. If the rollback target is not schema-compatible, keep
registration closed and restore the encrypted pre-migration export into a new
database under the documented restore procedure.

The one-time legacy hardening transition is the sole exception to the normal
baseline contract. Its only permitted legacy target is
`74a97cf8-1361-41c8-bc7d-6d0b87b55151`. Before any rollback to it, verify or
reinstall D1 trigger `legacy_registration_freeze_20260729` so the legacy
registration route cannot create user accounts, and verify
`legacy_paid_feed_freeze_20260729` so account-scoped paid-source keys cannot be
reactivated under legacy code. Do not remove either trigger until the hardened
Worker is live, operational, the reviewed legacy synthetic accounts have been
removed through their R2 deletion manifests, the paid seat invariant passes,
and registration is independently closed by both `REGISTRATION_MODE` and D1.
Forward migrations and payload-safe source retirements are not undone by code
rollback. A partial synthetic cleanup is resumed idempotently; do not restore
deleted payloads into production ad hoc. If `legacy_transition_completed`
exists, the one-time path must not be reused; handle any later rollback through
the normal captured-baseline procedure.

## Recovery and review

Confirm critical routes, account isolation, source freshness, queue and DLQ
state, publication cadence, retention, and spend after mitigation. Keep enhanced
monitoring through at least one full publication cycle.

Within five business days, document timeline, impact, root cause, contributing
conditions, detection gaps, response quality, corrective owners, and due dates.
Share a user-facing summary when users or public availability were materially affected.
