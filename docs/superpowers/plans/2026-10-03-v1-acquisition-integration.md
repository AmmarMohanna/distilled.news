# V1 acquisition execution

The user authorizes inline execution and continued downstream milestones. Appendix C remains authoritative; no connector wire changes.

- [x] Persist immutable fetched results independently of evidence acceptance.
- [x] Claim exact observation jobs with bounded leases, fencing and typed failures.
- [x] Reuse the existing source acquisition orchestrator after supplied payload; never commit collection checkpoints here.
- [x] Resume persisted results after crash without fetching again; atomically fence evidence acceptance.
- [x] Exercise real D1 races, redelivery, restart, stale ordering and terminal failures.
- [x] Bind bounded canary execution to the existing worker/queue.
- [ ] Confirm the existing dev deployment target before remote migration/deployment; question pending.
- [x] Verify and independently review execution milestone; fix revocation retry/configuration findings.
- [ ] Continue intelligence and publication integration, including product scope lifecycle and native/browser composition.

Verification: complete worker suite 267 passed; existing acquisition mechanism suites
11 passed; shared contracts 44 passed; all seven workspace typechecks passed, with
worker typecheck repeated after runtime review fixes. No remote migration/deploy yet.

Production proof requires an actual approved-source handoff and retained grounded edition. Fixture transport alone is synthetic proof.
