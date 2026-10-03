# Feed-scoped intelligence baseline

Migration 0037 adds the Feed ownership root and feed-scoped canonical documents.
Writes are fenced by both Feed and intake-scope epochs. Concurrent acceptance,
deletion, approval changes and Feed changes invalidate an older transaction.
Feed configuration changes require a revision; deletion retains historical documents
and prevents new intelligence/publication transactions. No shared/global intelligence
store or additional infrastructure is introduced.

The deterministic policy stores immutable role decisions and exact/near-duplicate
decisions for exact EvidenceRevision IDs. Duplicate representatives are already-decided
revisions, serialized within the Feed; timestamp ties cannot create cycles. Long copied
background with a changed development phase is not treated as the same development.
Independent wording remains separate evidence. Copy grouping and Event matching are
separate decisions.

Events have stable roots and immutable EventVersions. EventMembership is the sole
evidence support relation; every relation resolves both exact version references within
the same Feed. Changed evidence removes its prior revision from future current support,
then reassigns/updates the Event. Ordered deletion withdraws future support. Existing
versions and memberships remain intact for historical publication.

Storylines group related developments and retain exact EventVersion IDs, observed
chronology, supported facts and previous/current state. All changes from one evidence
reassessment produce one new version per affected storyline. Proposal-to-approval
reassignment keeps its storyline identity and previous state, rather than publishing an
artificial intermediate empty storyline. Publication time is not asserted to be the
real-world event occurrence time.

The baseline is conservative lexical matching, not a claim of calibrated semantic
understanding. Entities and role confidence are heuristic; geography inference and
ambiguous multilingual matching remain evaluation/model-adapter work. Source lifecycle
integration must trigger cleanup or filter ineligible support before publication.
Scoring counts publisher identities and duplicate representative groups separately.

Tests use real Miniflare/D1 and fresh stores, including concurrent replay, Feed/source
fencing, independent wording, copied releases, false merges across development phases,
reassignment, deletion and immutable history. Transport is synthetic; no production
connector-to-edition proof is claimed by this milestone.
