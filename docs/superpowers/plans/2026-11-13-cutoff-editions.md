# Cutoff-based scheduled V3 editions

**Goal:** Freeze evidence ready before each scheduled cutoff, verify and publish that edition independently of unfinished intake, and retain late evidence for subsequent editions.

**Architecture:** New scheduled V3 snapshots persist `cutoffPolicy: READY_AT_CUTOFF_V1`. Admission defers unfinished collection/acquisition/reassessment with explicit incomplete coverage. Selection requires both observation and evidence acceptance before cutoff. Existing frozen snapshots and paid operations keep their original policy. Frozen historical revisions remain usable only while their evidence and source remain authorized; later updates carry into later editions. Final verification, source visibility, financial fencing and publication CAS remain required.

**Stack:** Existing Workers/D1/R2/Queues and V3 editor/verifier; one additive tombstone lookup index; no monetary limit.

- [x] Add red regressions for pending intake at cutoff, accepted-after-cutoff carry, frozen retry/updates, revocation and legacy/manual preservation.
- [x] Implement versioned cutoff admission shared by priority dispatch, canonical dispatch, execution and final commit.
- [x] Freeze eligible evidence and validate authorized historical revisions without changing old paid identities.
- [x] Record deferred work as incomplete coverage; preserve quiet/rejected distinction and all source jobs.
- [x] Run focused V3, coverage, scheduling, source authorization, semantic-operation tests and TypeScript; review.
- [ ] Push and deploy staging; verify actual cutoff-policy publication and state coverage, documenting limitations.

Review found and corrected the deletion/reactivation edge case: immutable revisions predating a retained tombstone cannot regain authority through a later restoration. A delayed first preparation reconstructs the revision accepted before cutoff rather than silently omitting it after a later update.
