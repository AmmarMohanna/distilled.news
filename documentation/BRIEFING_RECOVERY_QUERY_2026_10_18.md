# Provider-recovery selector: measured D1 CPU bottleneck

The cache release exposed an independent database bottleneck during live
acceptance. Even a read-only `SELECT now` intermittently returned D1 error 7429
(CPU limit/reset), and runtime requests reported that the database queue waited
too long. The earlier metadata release also had 27 such overload exceptions;
their presence is not a newly established cache regression.

Database-specific Cloudflare D1 analytics supplied the cause, rather than an
assumption based on those symptoms. In the hour inspected at approximately
13:19 UTC, `recoverPendingProviderGenerations`' candidate selector ran **12 times**,
averaging **32,497.1778 ms**, with **389,966.1336 ms** aggregate SQL time and
**119,581,016 rows read**. It dominated the top-query list; the next query used
9,572.462 ms in total. Query digest:
`077b4a2efefcd01de93e2e7396aa6308584fd1fab5124d72275883389fc14a26`.

The old receipt/reservation join performed correlated global recovery-attempt
scans to find the last attempt and future backoff. As retained reservations,
receipts and attempts grew, it repeatedly scanned the same metadata and reached
the database CPU limit before selecting its three recovery candidates. This can
delay unrelated feeds, acquisition, review and publication through shared D1.

## Change and safety

Commit `8a451ae39f4c319df49d3d5973501a51300c255d` materializes three metadata sets
once in one SQL snapshot: expired unreported reservations, distinct qualifying
feed/reservation receipt identities, and recovery history grouped by reservation.
The final join retains:

- `COALESCE(reported,0)=0`, the exact lease boundary and OpenRouter/handle tests;
- exact receipt feed/reservation matching and global reservation-identity backoff;
- maximum prior attempt time, strict future-backoff comparison, oldest-attempt /
  reservation-created ordering, and the existing limit of three;
- the existing fresh per-operation attempt count, jitter/backoff policy, provider
  metadata GET, receipt/model/token proof, atomic settlement and immutable audit.

No index/migration, new recovery permission, inference retry, financial release,
concurrency increase or provider substitution is introduced. SQL ties without a
specified tie-breaker remain unspecified, as before; no stronger FIFO claim is
made for identical ordering keys. Selection itself does not settle any liability.

## Reproduction and measurements

`provider-recovery-scaling.test.ts` seeds real local D1 with retained reported and
unreported settlements, expired/live leases, duplicate receipts, missing handles,
other providers, three attempts per reservation, a strict backoff boundary and
foreign-feed legacy backoff. It compares complete candidate rows with the frozen
old query and checks the positive missing-history case. No provider is called.

The unchanged selector reproduced the regression: **192,604 row reads**, failing
the less-than-one-fifth read target. The optimized selector returns identical
candidates with **11,570 reads**, approximately 94% fewer. One local SQL pair was
**199 to 6 ms**. The performance assertion uses D1 row reads, not a fragile wall
clock limit. The initial test setup had an extra settlement placeholder; that
fixture error was corrected before observing the actual read-scaling RED failure.

The first focused recovery/financial run passed 30 tests. The final strengthened
provider-recovery/scaling run passed **16/16**. Repository-wide typechecks and the
explicit staging dry run pass. Complete final-code CI is a separate release gate.

That gate subsequently passed: exact commit `8a451ae` CI ran the entire Worker
suite with **1,635 passes / 11 skips**, all workspace tests, typechecks and full
build. The browser job has the same eight existing failures / 373 passes as the
pre-cache code. The query fix deployed with Wrangler exit 0 at 13:44 UTC as
Worker `45f475b8-0d2a-4da3-9b44-bffc113ffdcb`, tag `8a451ae39f4c`, 100% traffic.
Deployed content and all bindings/consumers/assets were independently verified.

Five read-only staging executions of the optimized query completed successfully:
SQL milliseconds **59.0804, 43.9308, 43.8146, 44.9052, 42.9399**; p50 **43.9308**,
p95/p99 **59.0804**. Each read **116,318 rows**, with zero changes/writes and zero
provider calls. The baseline analytics are repeated CPU-limit attempts; these are
not paired successful baseline requests or invented baseline percentiles. Raw
query evidence and result metadata are retained privately. No article text,
prompt, provider payload or credential is included here.

The new query is linear in retained metadata rather than independent of history.
An index or projected immutable relationship may become useful later, but is not
required for the measured fix. The full rollout and bounded application outcome
are recorded in [final validation](BRIEFING_FINAL_VALIDATION_2026_10_18.md).
