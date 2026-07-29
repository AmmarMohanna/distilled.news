# Staging canary cohort

The launch cohort exists only in the isolated staging environment.

## Shape

- 50 email-verified synthetic accounts with `example.invalid` addresses and
  deliberately invalid password hashes.
- Two public, zero-star, low-intensity feeds per account: one hourly and one daily.
- 97 external RSS source subscriptions across five stable public feeds, one
  public Telegram channel, one Google News source, and one X source: 100 live
  connector sources total.
- Four controlled same-release RSS fixture subscriptions per feed. Together
  with one live connector source per feed, the 500 subscriptions exercise the
  full launch account/feed/source capacity without creating 500 upstream
  scrapes. Unique, bounded staging-only fixture URLs exercise 400 scheduler and
  source-queue paths without sending that load to third-party publishers. One
  fixture on each hourly feed rotates once per UTC hour; the matching fixture
  on each daily feed rotates every four UTC hours. The other three remain
  static capacity probes. This preserves hourly processing and synthesis
  evidence while avoiding model calls that add no daily-feed coverage.
- Canary interest profiles contain only the unique
  `distilledcanarycheckpoint` marker emitted by controlled fixtures. Live
  connector items still exercise fetch, parse, archive, deduplication,
  persistence, and deterministic processing. Worker-side source-provenance
  enforcement disables per-item summary and review adapters for non-fixture
  launch-canary sources, even if an external item copies the public marker.
  Unpredictable publisher volume therefore cannot add per-item model calls or
  escape the controlled LLM envelope.
- The spend ledger, not the legacy `briefings.daily_budget_usd` column, enforces
  model cost. Staging is capped at `$38/day` and `$150/month` for model use,
  `$0.75/day` and `$3/month` per account, and `$154/month` across collection
  and model use. Production remains `$5/day` and `$150/month` globally and
  `$0.10/day` and `$2/month` per account.
- The designed worst case reserves `$0.596204/account/day` and
  `$29.810200/cohort/day`: 36 controlled messages per account, up to one item
  summary, one importance review, and two event-equivalence reviews per
  message, plus 25 editions with both primary and fallback synthesis attempts.
  The `$0.75` and `$38` hard caps therefore retain more than 25% headroom.
  Monthly caps retain the same headroom for four designed canary days, allowing
  a clean rerun after a late critical failure without deleting spend evidence.
- Staging collection is capped at `$0.50/day`; collection and model spending
  combined cannot exceed `$38.50/day`.
- Google News and X use different accounts; each account is also held to the
  hosted collection ceiling of `$0.25/day`. Seeding requires and claims exactly
  two of the four paid-provider account seats; removing the cohort releases
  both.
- The X and Google News probes are attached to different daily feeds, each
  requests one item, and each runs every six hours. X reserves at most
  `$0.08/day`. Google News reserves at most `$0.16/day` even when every primary
  start is followed by a fallback start. Both calculations include the
  enforced `$0.02` minimum per Actor run. A script gate recalculates all three
  Actor-price paths from Wrangler configuration, so primary, fallback, or
  minimum-run drift cannot silently make the window impossible.
- Every ID, email, username, title, and feed is visibly marked as canary data.

Canonical source fanout keeps repeated RSS subscriptions from multiplying
upstream requests. Paid providers still require valid staging credentials and
their configured global/account caps.

Every model request reserves the UTF-8 input upper bound and the API-enforced
output maximum before dispatch. Staging bounds are 2,304 input / 160 output
tokens for item summaries, 2,048 / 80 for importance reviews, 3,072 / 80 for
event-equivalence reviews, and 19,500 / 400 for edition synthesis. Processing
permits at most one item-summary call, one importance-review call, and two
event-equivalence calls per raw message. Edition synthesis permits one primary
and one fallback attempt. Localization uses the same summary bounds and is
limited by the ten-section edition limit; the controlled English fixtures need
no localization call. Exceeding any input or spend bound uses the deterministic
fallback instead of sending an unbudgeted request, and invalidates the canary
when it affects required model synthesis.

Hosted free-source polling is deliberately polite: RSS is due every 15 minutes
and public Telegram every 10 minutes. At the 500-source launch ceiling, worst
free-source demand remains below 50 dispatches/minute; the scheduler cap is 150
and source-queue concurrency is 15. The canary requires at least 80 successful
refreshes for every controlled fixture over 24 hours, plus current freshness,
so a long mid-window scheduler outage cannot be hidden by a final recovery.

## Safety guard

The seed, audit, and removal tools require:

- the named `staging` environment;
- the dedicated checked-in staging D1 ID, distinct from every production or
  restore database;
- Worker, D1, R2, queue, DLQ, and route names distinct from production;
- a non-canonical base URL; and
- an explicit confirmation for mutations.

The tools refuse `distilled.news`, `lownoise.news`, production IDs, and shared
resource names. They never fall back to a default environment. Seeding also
refuses an existing cohort so a prior message cannot satisfy a new release
window; remove the old cohort and its R2 objects first.

## Evidence

`pnpm canary:audit` records:

- observation start and staging release/version;
- account, verification, feed, and source counts;
- route status and latency;
- source attempts, successes, freshness, and failed-attempt classification as
  recovered, pending, late, or exhausted;
- jobs, windows, editions, synthesis mode, model usage, primary queue
  backlog/oldest-message age, primary/fallback/exhausted model outcomes,
  synthesis validation, DLQs, and duplicates;
- spend reservations, settlements, releases, stale unsettled reservations, net
  committed spend, and maximum per-account committed spend; and
- each launch gate's pass/fail result.

Every observation is saved as timestamped JSON and appended to NDJSON under
ignored `.canary-observations/`. `--json` prints the complete observation for
automation. Seed and staging deploy operations restart the observation window.
The `Staging canary heartbeat` workflow runs every 15 minutes in the protected
`staging-canary` GitHub environment, restores evidence only from the prior
completed run of that exact workflow and frozen SHA, records the next
observation, and persists a new artifact. The workflow verifies GitHub's
artifact digest, accepts a ZIP containing only `canary-state.json`, and passes
that file to a bounded allowlist parser. The state bundle is HMAC-authenticated,
contains only `.canary-observations` data, and can never be extracted over the
checked-out audit scripts. Set its protected
`CANARY_RELEASE_SHA` variable to the full staged SHA. The workflow first checks
out protected `main`, then requires that variable, the event SHA, the workflow
definition SHA, and checked-out SHA to be identical before dependency setup.
Manual dispatch is main-only, so an arbitrary ref can never supply audit code.

Unlike reviewed deployment environments, automated `staging-canary` has no
required reviewer: a reviewer gate would prevent the 15-minute schedule from
being evidence. It still allows protected branches only and disables
administrator bypass. Keep only the account ID, existing least-privilege
`CLOUDFLARE_CANARY_READ_TOKEN` (D1 Read, Queues Read, and Workers Scripts Read),
state-only HMAC key, and Ed25519 attestation private key there; never add
deploy, D1-mutation, production, or provider credentials.
Pull-request jobs never receive that environment or its secrets and are not
accepted as evidence producers. Production receives only the public
verification key, so neither its verifier nor the staging state HMAC can mint
a production attestation. Do not use an operator laptop as the evidence
authority. The final
gate requires at least 49 observations, no gap over 45 minutes, one unchanged
Worker version/release SHA/audit checkout, and no earlier critical failure. A
critical route, cohort, exhausted source recovery, freshness, processing,
cadence, publication, model-operation, spend, duplicate, DLQ, or heartbeat
failure is recorded and automatically
starts a new 24-hour window. GitHub scheduling is not guaranteed; the 45-minute
allowance tolerates a delayed tick, while a longer gap correctly invalidates and
restarts the window.

Keep `main` unchanged for the entire window. Because workflow code and evidence
are pinned to `CANARY_RELEASE_SHA`, any merge or replacement staging deploy
creates a different release candidate and restarts the full 24 hours.

Require at least 24 uninterrupted hours on one release. Every feed must have at
least one terminal published-or-empty window, every hourly feed must have at
least 20 terminal hourly windows, every daily feed must close a daily window,
and all 100 feeds must publish at least one non-empty edition from the controlled
fixture. The gate separately requires the exact 97 external RSS, one Telegram,
one Google News, and one X mix, all 100 live connector sources and all 400
fixture sources successful and fresh, and zero stale source work. A failed
attempt may remain as evidence when the same account-scoped canonical source
recovers within its SLA: 15 minutes for controlled fixtures and Telegram, 25
minutes for RSS, 30 minutes for X, and 90 minutes for Google News. A still-open
failure may be pending before the 24-hour mark, but late recovery, an exhausted
SLA, an expired current error, a budget pause, a disabled source, or any
pending/current error at the final audit invalidates the window. This avoids
pretending transients never happen without allowing a last-minute recovery to
hide an outage. Recovered attempts are also bounded to at most 25 in the
window and at most 0.1% of all attempts in the final audit, so repeated
short-lived failures cannot be normalized away.

Persisted `operational_events` must show no source, processing, or edition DLQ
event since the active window began, so an acknowledged or drained DLQ message
cannot disappear from the evidence. External publisher cadence therefore
cannot make the publication gate non-terminating.

All 100 feeds must publish a model-synthesized edition and record a successful
`edition_summary` usage event. Each synthesis records exactly one
release-scoped logical outcome: primary success, fallback recovery, or
exhaustion. Recovered model fallback may be at most 5% of successful outcomes;
exhausted outcomes, invalid synthesis validation, unexpected telemetry, and
deterministic non-empty editions must all be zero. Every fully observed UTC
hour bucket must contain successful edition synthesis for at least 45 of the 50
hourly feeds, with at least 20 complete buckets total. At least 45 AI editions
must also be present in the final two hours. This prevents an initial success
burst from masking a later model outage while allowing a small, measured
primary-model transient that the bounded fallback actually recovers.
For every UTC date touched by the evidence window, net collection spend must
remain at or below `$0.50` for the canary and `$0.25` per account; model spend
must remain at or below `$38` for the canary and `$0.75` per account. The
aggregate window caps are the number of UTC dates touched multiplied by the
daily ceilings: `$0.50` collection, `$38` model, and `$38.50` combined per UTC
date. A 24-hour window crossing midnight therefore touches two independently
budgeted UTC dates and has explicit aggregate caps of `$1`, `$76`, and `$77`;
the model and account monthly caps cover those two dates and retain four
designed canary days of retry runway.

After the final audit passes, the protected workflow signs a compact same-SHA
attestation with Ed25519. Keep the private key only in the protected
`staging-canary` environment, not in Worker vars or production. For a
controlled operator run:

```sh
CANARY_ATTESTATION_PRIVATE_KEY="$CANARY_ATTESTATION_PRIVATE_KEY" pnpm canary:attest
```

Paste the one-line `.canary-observations/production-attestation.txt` value into
the production workflow input. The workflow rejects invalid signatures,
another Worker/audit SHA, a changed audit-code digest, fewer than 24 hours/49
observations, a gap over 45 minutes, missing critical gates, or evidence older
than seven days.

## Removal

The removal tool refuses to delete D1 rows while any canary raw-payload or
source-run archive key is still referenced. Delete those objects from the
staging R2 bucket first, then:

```sh
CONFIRM_CLOUDFLARE_MUTATION=distilled-news:staging:canary-remove pnpm canary:remove
```
