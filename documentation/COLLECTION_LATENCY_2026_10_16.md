# Collection latency recovery — 16 October 2026

Branch: `backend-sources-collection-recovery`. Target: sources QA only.

The first QA live feed exposed an admission convoy. Strict FIFO included messages
sleeping between queue deliveries, so a free turn could remain idle for an older
message. Busy deliveries retried after 30 seconds and eventually fell back to
120-second transport expiry. Article acquisition also held the Feed turn during
network I/O. These compounded into minute-scale waits per item.

Changes:

- Prioritize the oldest recently ready delivery. Keep original waiter age for
  its return, but do not reserve idle capacity for a sleeping delivery. Readiness
  is a one-second scheduling grace, independent of the five-minute waiter TTL.
- Capacity waits rotate only their matching connector dispatch token and resend
  the same work identity with a one-second delay. Stale deliveries cannot release
  a replacement. Send failures retain normal durable recovery. No canonical
  processing attempt, paid operation identity or source checkpoint is reset.
- Acquisition uses short admission phases for claiming and evidence promotion.
  Downloads and durable fetched-result storage use the existing observation
  lease and scope CAS outside the Feed turn. Evidence promotion still uses the
  Feed fence, acquisition token, ordering checks and canonical transactions.
- If evidence admission is busy after a result is stored, release only that
  acquisition lease to PENDING. Preserve fetched bytes and the actual provider
  attempt; remove only the current saved-result resume attempt. Repeated waits
  cannot exhaust recovery or trigger another fetch.

No changes to shared contracts, editorial judgments, spending authorization,
provider caps, active source configuration or teammate intelligence runtime.
No schema or frontend change required.

Local checks: admission, transport generation, acquisition and runtime regressions;
evidence ordering/replay/revocation tests, review continuation, integration safety
and 1,000-feed scheduling tests. Worker typecheck and QA dry-run build passed.
Live deployment measurements are recorded below after rollout; local tests alone
do not prove complete briefing publication or 1,000-feed live throughput.
