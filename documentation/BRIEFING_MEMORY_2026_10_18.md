# Semantic reuse memory investigation and bounded reads

The staging REASSESS memory-limit observation associated with observation
`000bca592c4744f89038ddfd3b6a51e0c0d2b406ddc53b5d7cc173761f109c13`
exposed a concrete retained-payload amplification in semantic reuse. This change
addresses that allocation pattern. It does not yet prove live OOM recovery or a
new published briefing.

## Evidence

Read-only staging metadata resolved that observation to accepted revision
`371d0fa9-1b68-417a-a930-dcd9dd7cbbee`, promoted on October 16 at 08:42:17.206 UTC.
Its revision JSON is only 787 UTF-8 bytes. The exact existing construction-reuse
predicate for that revision matches **164 immutable intents totaling 54,803,549
UTF-8 bytes**, largest 445,474 bytes. These intents span October 16
08:58:45.370-13:44:55.238 UTC. Their historical state maxima are 106 Events and
100 Storyline memories; these are not the later failing review's current graph
counts.

Previously, the lookup selected and parsed all matching intent JSON at once,
then preloaded all corresponding result/settlement JSON into the permanent
transaction cache. Results and settlements can each repeat the full model input.
The measured 54.8 MB is **intent bytes alone**, not a measured peak heap value or
the total of all three document populations. This establishes substantial
allocation/retention pressure along the failing path; it does not establish
that this was the sole cause of the live memory limit.

The staging queries returned IDs and numeric aggregates only, with zero writes.
Private evidence: `.local-reports/briefing-latency/paid-audit-oom-reuse-20261018.sql`
and `paid-audit-oom-reuse-q0/q1-20261018.json`. The aggregate read 9,979 rows in
456.8 ms; it did not return any intent, prompt, article or provider output.

## Implementation and preservation rules

`semantic-settlement.ts` keeps the same complete evidence/kind/Feed predicate
and consumes the scan's returned order. The initial query returns only IDs,
embedded identity and raw UTF-8 sizes. It neither filters by age nor prunes the
candidate universe. A column/embedded intent identity disagreement fails closed.

Before returning any answer, metadata-only receipt ownership checks cover all
candidate IDs that the previous preload would read. This preserves the old
fail-closed behavior for a foreign result/settlement even beyond an otherwise
reusable first answer. Existing cached values, including cached absence, and
staged values retain the old preload precedence.

Payloads are read in pages of **at most four candidates**, further reduced by a
**2 MiB planned aggregate raw-body budget** for the intent, result and settlement
documents. A candidate larger than that budget is processed completely alone.
Persisted intents are read directly through `store.readMany`, preserving the
previous direct scan's independence from staged/cached intent values.

The new transaction transient reads are restricted to immutable semantic results
and settlements. They use the existing global-ID/Feed ownership checks, honor
staged/cache values, clone returned data, and do not insert newly read historical
payloads into the transaction cache. SQL metadata and payload reads are counted
in transaction query metrics. Normal durable writes still use the existing
transaction/ownership/CAS path.

The inner replay comparisons remain unchanged: saved-result precedence,
settlement token matching, compatibility hashes, exact-question and construction
scope, publication scope, reported rejection/continuation reuse, live contention,
legacy conservative UNKNOWN fences, and durable UNKNOWN-result writes. Spending
settlement and provider recovery are unchanged by this patch.

## Bounds and tradeoffs

The lookup retains lightweight metadata for the complete universe and only the
current payload page, rather than the entire historical graph corpus. Existing
transaction cache entries remain intact; this is a bound on incremental lookup
materialization, not a global transaction heap limit. A returned answer or a
newly staged UNKNOWN result necessarily retains its complete original input.

The byte budget describes metadata observed before payload reads. A receipt
inserted concurrently after metadata inspection can exceed that estimate; the
four-candidate limit still applies. Object parsing, cloning, strings, existing
cached/staged objects and garbage-collector behavior mean raw UTF-8 sizes are
not peak JavaScript heap measurements. Oversized individual records are fully
processed and never truncated to create a misleading bound.

Paging adds SQL round trips: metadata preflight uses batches up to 90 IDs per
receipt kind; each visited payload page reads intents and up to two receipt
groups. This trades eager allocation for bounded incremental reads. No complete
review/publication latency improvement is claimed without a live measurement.

## Verification

Final follow-up: the focused memory/reuse/store run passed 29 tests (four opt-in
replay tests skipped). A subsequently added late-result race test reproduced a
changed snapshot decision before the fix. Metadata preflight now retains only
compact negative identity entries for missing receipts, preserving the old eager
negative snapshot. Historical payloads remain transient. All **nine final memory
tests passed**, including that race and complete processing of an oversized winning
candidate. The final pair of memory/exposure files had 14 passes and one fixture
error in exposure timestamp validation; after correcting that fixture, all 19
exposure/existing-spending/concurrency tests passed. No runtime assertion was
relaxed. Live memory-limit recovery remains unverified until staging deployment.

The regression was written and run before runtime changes. With the eager
implementation, the late reusable answer was correct but a later ordinary read
of the first historical result performed zero new document reads: the full
historical result was still cached. The test expected one and failed at that
assertion. RED: one failed, seven skipped, 7.03 seconds.

After the patch, the complete new test file passed **8/8** in 38.12 seconds,
including a frozen eager-algorithm differential fixture covering nine semantic
branches. Tests protect late replay across 13 historical inputs, conservative
legacy fencing, reported rejection/continuation, UNKNOWN/live intent handling,
settlement token mismatch, cached absence and staged precedence, clone isolation,
persisted intent reads, large-body paging, foreign ownership beyond early return,
and malformed persisted identity rejection.

Private logs: `semantic-reuse-memory-red.log` and
`semantic-reuse-memory-green.log`. A subsequent test-only refinement makes the
winning candidate itself exceed the planned byte budget; final focused regression
verification is pending the root operator's serial CPU slot. The full Worker
suite and live version-tagged verification remain separate release gates.

No deployment, paid request, migration, financial amendment, commit or push was
performed by this memory implementation task. Only `store.ts`,
`semantic-settlement.ts`, the new focused test, and this report changed within
its implementation scope.
