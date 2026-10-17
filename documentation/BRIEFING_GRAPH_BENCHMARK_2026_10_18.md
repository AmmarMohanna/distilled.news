# Briefing review membership benchmark — 18 October 2026

## Confirmed cause and change

`eventMemberships()` previously called `tx.list('memberships')` and filtered its
entire result for each EventVersion. The SQL list was already cached, but every
call rebuilt a map of every retained membership and overlaid staged writes.
Candidate construction called this twice per Event, and support removal and
Storyline reconstruction called it again. This is repeated CPU/allocation work
proportional to current Events times retained membership history, rather than
additional SQL round trips.

`FeedTransaction.membershipsForVersions()` now builds a transaction-local index
of all retained membership metadata keyed by exact EventVersion ID. Engine
support lookup, review prefetch, and publication graph validation use it. New
staged memberships invalidate the index. Every CAS retry constructs a new
transaction and index. Returned records are cloned so caller mutation cannot
change later lookups or staged immutable support.

This does not prune candidates, change Event identity, remove historical
memberships, expand historical article bodies, or change source authorization,
canonical epochs, leases, paid operation identities, spending, or CAS fencing.
Publication validation still compares the complete exact support set. No database
migration is needed. Initial SQL metadata loading remains proportional to retained
history; batching correction-ledger source lookups and reducing that first load
are separate potential improvements requiring further measurement.

## Reproduce

From the branch checkout:

```powershell
corepack pnpm --filter @distilled/worker exec vitest run src/v1-intelligence/membership-benchmark.test.ts --maxWorkers=1
corepack pnpm --filter @distilled/worker exec vitest run src/v1-intelligence/membership-index.test.ts src/v1-intelligence/store.test.ts src/v1-intelligence/engine.test.ts src/v1-intelligence/review-prefetch.test.ts src/v1-intelligence/selection-support-prefetch.test.ts --maxWorkers=1 --testTimeout=30000 --hookTimeout=30000
corepack pnpm --filter @distilled/worker typecheck
```

The benchmark seeds real local Miniflare/D1 membership records. Each current
EventVersion has one independently checked support; historical versions retain
their metadata. It compares the frozen original production retrieval algorithm
with the new engine helper, alternating their execution order, using seven new
transactions per mode. Seeding and snapshot acquisition are outside the timed
region. Each timed region includes first SQL retrieval, JSON decoding, cache
population, all current-Event membership lookups, and exact support assertions.
Historical article bodies and real model inference are outside this microbenchmark.

Both paths issue exactly one SQL membership list read per sample. Reported list
passes count complete metadata map/list materializations, not SQL reads. There
are no provider requests, simulated provider delays, or provider costs. These are
local graph lookup timings, not complete review or publication timings. Seven
samples provide a coarse p95 (the largest sample); p99 is not meaningfully
estimated. Machine load and D1 transport dominate small fixtures.

## Measurements

The initial pre-change run confirmed the failing performance regression test:
12 full list passes on the small fixture and 100 on the large fixture, with all
exact support assertions passing. It measured small p50/p95 60.68/80.96 ms and
large 775.69/1016.01 ms. The initial long-history fixture did not run because
Miniflare initialization exceeded the default 10-second hook timeout. Fixture
seeding was subsequently batched and hook allowance extended; no production
semantics changed to make the benchmark run.

The same-fixture alternating comparison after implementation measured:

| Fixture | Current Events | Retained memberships | Baseline p50 / p95 (ms) | Indexed p50 / p95 (ms) | Full list passes |
| --- | ---: | ---: | ---: | ---: | ---: |
| Small | 12 | 132 | 63.91 / 193.04 | 74.31 / 190.34 | 12 → 1 |
| Large | 100 | 5,100 | 1167.06 / 1274.77 | 409.88 / 471.72 | 100 → 1 |
| Long retained history | 240 | 12,240 | 6441.14 / 10175.76 | 990.77 / 1431.49 | 240 → 1 |

The large fixture reduces lookup p50 by 64.9% (2.85×), and p95 by 63.0%.
The small fixture does not demonstrate a p50 latency improvement. Local lookup
throughput on the large fixture rises from approximately 86 to 244 Event support
lookups per second at p50; this is not end-to-end review throughput.
The long-history fixture reduces lookup p50 by 84.6% (6.50×), with p95 reduced
by 85.9%. Its p50 lookup throughput rises from approximately 37 to 242 Event
support lookups per second.

## Correctness and verification

New tests first failed against the original implementation on repeated full
list construction and mutation of returned support. They cover exact version
identity, retained older support, distinct memberships sharing evidence,
per-version order, duplicate requested version IDs, missing versions, support
inserted after a cached miss, isolation of returned records, and cache freshness
in a new CAS attempt. Existing real-D1 tests cover source/Feed fencing, immutable
support, review replay and concurrency, support reassignment and withdrawal,
Storyline continuity, historical-body non-expansion, and publication support.

Worker typecheck passed after the membership implementation. An initial focused
run during concurrent local test activity had 23 passes and six timeout failures;
those timeout results are not counted as passing checks. The affected tests were:

- `equal acceptance timestamps do not hide copies; unrelated same-country developments stay separate`
- `changed evidence reassigns support without mutating old versions; ordered deletion withdraws future support`
- `long copied background cannot merge distinct proposal and approval developments`
- `prepared matcher decisions separate similar developments without overriding exact support`
- `prefetches 240 current supports in bounded queries, with no individual graph reads`
- `retained membership history does not implicitly preload unrelated historical article bodies`

The first four hit the default 5-second test timeout; the two prefetch fixtures hit
30-second and 5-second limits respectively. Prefetch fixture seeding was batched
with identical records and assertions, and an isolated rerun uses a 30-second
default test/hook allowance. That isolated rerun passed all 15 tests across
`engine.test.ts` (10), `review-prefetch.test.ts` (3), and
`membership-index.test.ts` (2), with no assertion failures. The 240-support
prefetch test then completed in 3.95 seconds, including its fixture setup.

The paired benchmark completed all three fixtures, with every exact support
assertion passing. Both new membership-index behavior tests passed. All ten
existing store regression tests and the selection-support test passed in the
initial focused run. Thus all 29 distinct tests in these six files passed across
the focused runs. This is not a claim about the full Worker suite or real staging
briefing publication. `git diff --check` also passed after implementation.
