# Release process

## Local gate

Use Node 24 and a clean install:

```sh
pnpm install --frozen-lockfile
pnpm release:check -- --e2e --audit
```

This checks script syntax/imports, generated Wrangler types, TypeScript, unit
tests, web/Worker builds, clean migrations and a representative migration-24
upgrade fixture, the current Worker's reviewed D1 rollback contract against the
fully migrated schema, named-environment dry runs, E2E tests, dependency
advisories, strict CSP, production route policy, legal files, and configuration
invariants. It does not change Cloudflare.

Before accepting public traffic at scale, run the
[public-edge cost gate](PUBLIC-EDGE.md#cost-aware-staging-load-gate) against
isolated staging and retain its JSON with the release evidence. A latency-only
load test is not sufficient: the gate must show Worker invocation and D1
rows-read/read-query deltas for the exact release.

## Staging

Confirm the checked-in dedicated staging D1 ID, all other staging bindings, and
`staging.distilled.news` remain isolated from production, then use the protected
GitHub release workflow. Staging exposes only its reviewed custom domain;
`workers.dev` and preview URLs stay disabled. Do not use a direct bare Wrangler
deploy.

The first staging deployment is a separate one-time bootstrap because no Worker
version exists to capture as a rollback target. After the dedicated D1, R2,
queues, custom domain, Turnstile site, and protected staging secrets exist,
dispatch `One-time staging bootstrap` from `main` and type `bootstrap staging
once`. The script is hard-coded to staging, requires the Worker to be absent,
deploys only with `REGISTRATION_MODE=closed`, writes the D1 registration switch
false, verifies the live closed SHA and all remote smoke checks, and records a
completion marker. A retry is permitted only for the same in-progress SHA; a
completed bootstrap or an unrelated existing Worker is refused. Every later
staging deployment uses the normal strict pre-mutation baseline workflow.

Seed the 50-account, 100-feed cohort and start a new observation window:

```sh
CONFIRM_CLOUDFLARE_MUTATION=distilled-news:staging:canary-seed pnpm canary:seed
pnpm canary:audit
pnpm canary:audit -- --json
```

Run `pnpm canary:audit` every 15 minutes. Observations are appended under
ignored `.canary-observations/`. Any staging deploy or critical gate failure
restarts the evidence window. Require 24 uninterrupted hours, at least 49
observations, no gap over 45 minutes, the intended provider mix, meaningful
editions, and passing route, freshness, processing, publication, DLQ, spend,
and duplicate gates.

Freeze `main` for the full evidence window. The heartbeat is bound to one exact
`CANARY_RELEASE_SHA`; merging or deploying another commit invalidates the
release candidate and requires a fresh staging deploy and 24-hour window.

Sign the final evidence with the Ed25519 private key held only by the protected
`staging-canary` environment:

```sh
CANARY_ATTESTATION_PRIVATE_KEY="$CANARY_ATTESTATION_PRIVATE_KEY" pnpm canary:attest
```

### Current evidence status

As of 2026-07-29 there is no completed, eligible 24-hour canary evidence run:
the heartbeat workflow is not yet present on the default branch and the
isolated staging Worker has not been bootstrapped. This is a production
transition blocker, not a waivable warning. After bootstrap, record the first
completed run URL, run ID, exact `headSha`, artifact digest, observation count,
maximum gap, and signed attestation in the private release record before
dispatching either production workflow. Never substitute a run from a different
SHA or an in-progress/failed run.

### External legal launch gate

Do not open hosted registration until the operator and qualified counsel have
supplied and approved the service particulars that cannot be derived from this
repository: the legal operator and data-controller identity, a service/contact
address, governing law and jurisdiction, and any required registration, tax, or
other jurisdiction-specific disclosures. The checked-in policies intentionally
do not guess those facts. Record the approval and final particulars in the
private launch record. This is a hard external launch blocker; passing code,
staging, and infrastructure gates does not satisfy it.

The policy channels `privacy@distilled.news`, `legal@distilled.news`,
`abuse@distilled.news`, `security@distilled.news`, and
`conduct@distilled.news` are also hard external launch gates. Configure them to
a monitored private destination, then preserve evidence of an externally sent
message and a human reply for each address. DNS records or a provider dashboard
alone do not prove that a report can be received. GitHub private vulnerability
reporting remains a security channel and must not be presented as a substitute
for private conduct reporting.

The hosted application records independent Terms, Privacy Notice, and Acceptable
Use Policy versions. Existing accounts with missing or stale versions are
limited to policy acceptance, logout, read-only access, and permanent account
deletion until they accept the current versions. A material policy update must
change the relevant Markdown effective date and its matching value in
`packages/core/src/legal-versions.json`; the local legal-parity gate fails when
those values drift.

## Production

As of 2026-07-29, live GitHub checks report that `main` is not branch-protected
and the repository has no `production` environment. Do not dispatch any
Cloudflare mutation workflow in that state. First require reviewed pull
requests, current launch checks, CODEOWNERS approval, dismissal of stale
reviews, last-pusher separation, resolved review threads, linear history, and
admin enforcement on `main`; disable force-pushes, deletion, and merge bypasses.
Create protected `production` and `staging` environments with required
reviewers, self-review prevention, administrator bypass disabled, and
protected-branch-only deployment. `staging-canary` is the one automated
exception: it has no required reviewers because its scheduled heartbeat must
run every 15 minutes, but it still disables administrator bypass and permits
only protected branches. It must contain only the existing least-privilege
Cloudflare read credential (`CLOUDFLARE_CANARY_READ_TOKEN`, limited to D1 Read,
Queues Read, and Workers Scripts Read), the account ID, the canary state HMAC
key, and the Ed25519 attestation private key—never Worker deploy, D1 mutation,
production, or provider credentials. The heartbeat first checks out protected `main` and,
before dependency setup, requires the full `CANARY_RELEASE_SHA`, event SHA,
workflow-definition SHA, and checked-out SHA to be identical. A manual
heartbeat is accepted only from `refs/heads/main`.

Existing API tokens can be reused; do not mint broader replacement tokens for
this setup. Every Cloudflare mutation and canary-evidence job performs a
read-only GitHub API check for protected `main`, the exact environment policy,
administrator-bypass prevention, and protected-branch deployment before using
its protected credentials.

Use the protected production GitHub environment and paste the signed
attestation into its workflow input. Before any mutation, the workflow verifies
the exact release SHA, 24-hour canary evidence, remote runtime secret names,
runs a read-only live Apify check proving the provider's monthly maximum and
remaining headroom cover the configured collection cap and that enabled Actor
builds and plan-tier prices match reviewed configuration, and creates a fresh
production D1 export. It imports that export into a clean local D1,
runs integrity/table checks, encrypts and decrypt-verifies the export with
the 32-byte `BACKUP_ENCRYPTION_KEY`, stores the authenticated AES-256-GCM object
only in the private production backup R2 bucket with a verified 30-day deletion
lifecycle, and uploads only non-sensitive evidence to GitHub. It then captures the single
Worker version receiving 100% of traffic, proves that version and the live
service both have closed registration, proves the D1 registration switch is
false, and uploads that exact rollback baseline. A failed backup or baseline
upload blocks migration.

Before any remote migration, the workflow reads the exact `releaseSha` from
that baseline, loads that commit's Worker repository, core helpers, and
`rollback-schema-contract.test.ts` from Git history, and executes its real D1
read/write paths against a local database built from every migration in the
candidate release. A missing commit, missing contract, or failing old-code
operation blocks the release. This binds the compatibility proof to the
captured N-1 code rather than merely replaying the candidate Worker's tests.

The workflow then applies forward migrations, deploys the reviewed SHA, verifies
the live release/status/CSP/closed-registration state plus D1, R2, all queues,
invokes the authenticated retention endpoint in bounded batches until complete,
and then runs the read-only D1/R2 retention gates. Any R2 deletion failure
preserves the related references and blocks release verification. Normal
production deploys always keep
`REGISTRATION_MODE=closed`.

### One-time legacy-to-hardened transition

The currently deployed legacy production version
`74a97cf8-1361-41c8-bc7d-6d0b87b55151` predates `RELEASE_SHA`,
`REGISTRATION_MODE`, `/api/status`, and `/api/capabilities`, so it cannot pass
the normal rollback-baseline contract. Do not weaken the normal workflow to
accommodate it.

That pinned version also has no trustworthy Git source identity, so no test can
honestly claim to execute its exact repository code. Its one-time rollback is
an explicitly documented operational exception protected by the migration-24
upgrade fixture, closed-registration and paid-feed freeze triggers, encrypted
pre-migration backup, exact immutable Worker version ID, and immediate
post-rollback verification. The first hardened version contains the reviewed
rollback contract; all later normal releases must pass the exact-SHA N-1 gate.

Use the protected `One-time production legacy hardening transition` workflow
from `main` only. Its preflight requires that exact version at 100% traffic,
requires `/api/status` and `/api/capabilities` to retain the pinned legacy 404
fingerprint, requires the reviewed D1
`legacy_registration_freeze_20260729` `BEFORE INSERT` trigger that rejects only
new `role='user'` accounts, and requires the companion
`legacy_paid_feed_freeze_20260729` trigger that prevents a legacy rollback from
unpausing the paid feeds whose canonical keys are migrated. It refuses if the
completion marker already exists.

Store the exact two-account/four-source reconciliation mapping only in the
protected production environment secret `PRODUCTION_PAID_COHORT_MANIFEST`.
The JSON has `schemaVersion`, the reviewed `reviewDigest`, and a
`realAccounts` array whose two entries contain `accountId`, `username`,
`googleNewsSourceId`, and `xSourceId`. Do not commit that file, print it, or
upload it as an artifact. The dispatch requires the pinned review digest
`53cd2818eae085885fc9e37991cdf8babd43ec4e296dc2605c06269a1860c0ae`.
Retained evidence contains counts and SHA-256 digests only.

The protected workflow then:

1. uploads the pinned Worker/freeze preflight and identifier-free paid-cohort
   inventory before any mutation;
2. exports, locally restores, encrypts, and durably uploads production D1;
3. retires the reviewed surplus and synthetic paid source rows to disabled
   inert `apify_actor` records without deleting D1 or R2 payload references;
4. reruns the migration-24 upgrade fixture, applies the backward-compatible
   migrations, and hard-fails unless exactly the two reviewed owners claim no
   more than four seats with at most one Google News and one X source each;
5. sets D1 `registration_enabled=false`, then deploys and smokes the new
   closed-registration SHA;
6. calls the narrow hardened cleanup for the 12 reviewed legacy synthetic
   accounts. That path writes retryable R2 deletion manifests, removes only
   exclusive payloads and public snapshots, retains shared payloads, deletes
   D1 accounts last, and verifies a completion marker;
7. runs the authenticated bounded retention cleanup and verifies D1/R2
   retention before finalization.

Only after the hardened Worker is operational, the synthetic cleanup is
complete, the two-seat invariant holds, and both registration gates verify
closed does finalization record `legacy_transition_completed` and remove both
temporary triggers. It then captures the first normal strict rollback baseline.
Any earlier failure reinstalls/verifies both triggers before explicitly rolling
Worker code back to the pinned legacy version; D1 migrations and safe source
retirements remain in place. A partial synthetic cleanup is retryable: a later
same-SHA transition skips missing accounts and replays each deletion manifest
idempotently. Finalization is idempotent across a runner crash between marker
creation and trigger removal: an explicit same-SHA rerun recognizes the
hardened in-progress state, rechecks both closed gates, and completes only the
missing action. A mismatched SHA/version is refused.
Finalized evidence uploads with `always()` so a later strict-baseline capture
failure cannot hide successful finalization. A completion marker makes the
transition impossible to silently reuse. If finalization completed but later
evidence or baseline upload failed, keep the hardened closed version and use
the normal release workflow rather than attempting a fresh legacy transition.

The freeze is reproducible through the protected `Production legacy
registration freeze` workflow. It idempotently installs and verifies the exact
registration and paid-feed triggers, sets D1 registration false, and retains
evidence. Protect `main`, require production-environment reviewers, and disable
concurrent bypasses; all Cloudflare mutation workflows share the same
`distilled-news-cloudflare-mutation` lock. The freeze refuses every
unrecognized Worker version. Besides the pinned legacy version, it can operate
only on an explicitly supplied hardened SHA whose immutable version metadata
and live endpoints both verify closed; this supports safe transition recovery
without turning the one-time path into a general mutation tool.

## Automatic release rollback

Production releases and production registration controls share one mutation
concurrency group, so registration cannot be opened while a release is using
its captured rollback baseline. Staging uses the same baseline and rollback
sequence against its isolated resources.

Every failure after baseline capture invokes the guarded rollback handler,
including a nonzero Wrangler deploy exit that may have happened after traffic
changed. The handler revalidates the captured target's immutable version
metadata. If the baseline is still current, it only reasserts the closed D1/live
state. If the failed release SHA is current, it sets D1
`registration_enabled=false` and verifies it, and only then runs `wrangler
rollback` with the exact captured version ID. Any third current version makes
the handler refuse instead of guessing. It verifies that the target receives
100% of traffic and that `/api/status` and `/api/capabilities` report the
captured SHA as operational with registration closed. The baseline and any
automatic rollback result are retained as workflow artifacts.

This is deliberately a **code-only rollback**. Cloudflare D1 migrations and
changes to D1, R2, queues, secrets, or other bound resources are not reversed.
Every migration must therefore remain backward-compatible with the captured
code target. The automated contract covers repository SQL and its matching core
helpers on a representative fixture; it does not emulate Cloudflare queue, R2,
email, or external-provider behavior. A failure before the deploy step does not
invoke Worker rollback; investigate the forward migration state and use the
encrypted pre-migration backup for an isolated restore if needed. Never infer a
rollback target from deployment history after a failed deploy.

## Open or close registration

Use the separate protected `Production registration control` workflow on
`main`. It refuses `preflight` and `open` until the current production Worker
has remained closed for at least 24 hours, the exact
`legacy_transition_completed` marker matches its release/version, both
temporary legacy freeze triggers are absent, and the D1 registration switch is
explicitly false.

After the closed observation, put a compact JSON
`PUBLIC_LAUNCH_ATTESTATION` in the protected production environment. The
attestation is valid for at most 72 hours and contains no private evidence:
only its schema version, exact release SHA, production Worker version,
transition marker, issue/expiry times, the supplied canary-attestation hash,
and these hashes or opaque references:

- counsel-approved legal particulars and the policy bundle;
- externally sent messages and human replies for all five policy inboxes;
- the live zone rate-limit ruleset/rule IDs and normalized configuration hash;
- the exact-SHA public-edge workflow run ID, artifact ID, and GitHub digest;
- the encrypted private-R2 backup object/checksum and restore-evidence digest;
- a completed 24-hour closed-production health window and publication-cycle ID;
- explicit operator go/no-go authorization.

The protected workflow re-reads the GitHub artifact, current Cloudflare WAF
rule, private bucket controls and encrypted object checksum before issuing a
preflight receipt. It also binds the observation to the live Worker creation
time. A distinct required environment reviewer supplies the second human
approval. This uses existing Cloudflare and GitHub credentials; it does not
mint, rotate, or broaden an API token. Store private legal, inbox, and
operational records outside the public repository. Missing, stale, malformed,
or different-release evidence fails closed.

Then dispatch `preflight` with a typed `preflight registration`
confirmation. It leaves registration closed while it verifies the exact
same-SHA signed canary, local and remote gates, operational live status,
available 50-account and 10-pending-account capacity with 60-minute hosted
pending leases, the reviewed
2-feed/5-source-per-feed quotas, the shared four-account paid-provider beta
capacity, Workers Paid usage mode, Cloudflare Email
Sending onboarding DNS, a valid Turnstile secret/site-key pair, and acceptance
of a real delivery test to the fixed protected `EMAIL_CANARY_RECIPIENT`. It
also repeats the live, read-only Apify capacity/build/price check with the
protected `APIFY_API_TOKEN`; it never changes the provider billing plan.

That recipient must be an external plus-address which is not a verified
Cloudflare Email Routing destination. Configure the same value as a production
Worker secret and protected GitHub environment secret. The Worker never accepts
the recipient in the preflight request. It generates a random one-time receipt
nonce, places the plaintext only in the email, and persists only its SHA-256
hash, release SHA, recipient fingerprint, and 15-minute expiry. The preflight
response returns the fingerprint and expiry but never the nonce or its hash.
Confirm the message arrived, then store its nonce as the masked
`EMAIL_CANARY_RECEIPT_NONCE` secret in the protected production GitHub
environment and run a separate `open` dispatch with typed `open registration`.
Do not pass the nonce as a workflow input: dispatch inputs are retained in run
metadata. Opening reruns readiness without issuing a replacement nonce and
atomically consumes the exact prior receipt. Wrong, expired, replayed, or
different-release receipts fail closed; a failed open requires a fresh
preflight email and secret rotation. API acceptance alone is not delivery
evidence.

The workflow uploads only a same-SHA version with `REGISTRATION_MODE=open`, then
enables the independent D1 registration switch and verifies
`/api/capabilities`. If any post-open check fails it disables the D1 switch and
rolls back to the recorded same-SHA closed version.

For immediate rollback, dispatch the same workflow with `close` and type
`close registration`. Close is independent of the checked-out main SHA and
does not require the launch attestation, canary, maintenance endpoint, or its
secret. It discovers the live
Worker version and `RELEASE_SHA`, writes and verifies the D1 switch false where
available, and, if the live version is open, rolls back only to a closed version
carrying that same live SHA. Cloudflare version metadata plus D1 remain
authoritative when application endpoints are unavailable; a responding
endpoint that still reports open blocks success. The pinned legacy version
instead requires its exact D1 freeze trigger. Keep
`INTERNAL_MAINTENANCE_SECRET`, `TURNSTILE_SECRET_KEY`,
`EMAIL_CANARY_RECIPIENT`, the current `EMAIL_CANARY_RECEIPT_NONCE`,
`APIFY_API_TOKEN`, optional `APIFY_READINESS_TOKEN`, and the Ed25519 attestation
public key, `CLOUDFLARE_ZONE_ID`, and `PUBLIC_LAUNCH_ATTESTATION` only in the
protected production GitHub environment. The canary state HMAC
and attestation private key exist only in `staging-canary`; production never
receives either signing secret. The email preflight uses a narrow internal
endpoint and never stores an admin session in CI.

Record release SHA, Worker version ID, migration set, backup checksum, config
diff, canary attestation/digest, encrypted artifact ID, operator, start/end
times, remote smoke evidence, and any accepted risk. A full isolated remote
restore rehearsal remains a scheduled operational control; the per-release
local import gate does not replace it.
