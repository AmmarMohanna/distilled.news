# Verification payload cost reduction

**Goal:** Reduce repeated reader text in source-bound verification without dropping claims, evidence, citations or factual checks.

**Architecture:** An optional frozen `verificationInputPolicy: reader-unit-context-v1` replaces a facet's `claim` only when it is exactly its original reader unit, with `claimUnit` pointing to that unit. Headline/body stay complete in `items`; every facet quote, ID, kind, identity binding and response obligation stays intact. Nonidentical claims stay literal. Existing inputs without the marker retain byte-identical requests. No provider calls or cross-operation cache is introduced.

**Constraints:** No paid inference, deployment, merge, model change, claim pruning or historical-response modification. The candidate is off by default. Frozen inputs carry the policy; recovery retains it. The previously qualified release stays at eb9275fd.

**Alternatives considered:** Persistent extraction reuse could save calls but requires evidence/model/policy invalidation and recovery work. Cheaper routing needs paid factual qualification. Removing redundant request text is a smaller, mechanically lossless first step. Expected savings are limited to affected input tokens, not a promised 50% total cost reduction.

## Implementation

- [x] Add failing multilingual round-trip and unchanged-default wire tests, including nonidentical claims and invalid unit associations.
- [x] Add compact inventory serialization and explicit reference instructions; keep internal inventory and response validation unchanged.
- [x] Add an opt-in frozen feed policy, environment gate and legacy/recovery regression.
- [x] Reconcile successful execution stage receipts and measure retained payload reduction offline; report exclusions and uncertainty.
- [x] Run engine tests, relevant worker tests and typechecks; review. Commit and push the completed isolated candidate; no deployment.

## Execution record

Seven compaction tests observed failing before implementation, then passed. Outcome-reporting review P2 reproduced with four failed negative tests and corrected. 534 engine tests passed (normal and two-worker runs); 117 publication/recovery tests and two newly parameterized recovery cases passed. Both typechecks passed. See the cost-reduction report for measured size changes and preserved environmental timeout/wrapper caveats. No paid requests were sent.

## Go criteria

Offline: identical reconstructed facet objects; unchanged complete sources, attached citations, response schema and adverse validation; legacy paid request wire unchanged; all applicable checks pass. Live activation: a separately authorized paired qualification must show no introduced errors, omissions or failures before claiming actual cost/latency savings or enabling the flag. Cold generation, collection and evaluator costs remain separate.
