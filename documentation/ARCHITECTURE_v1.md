Distilled.news Architecture v1
This file preserves the supplied Distilled_News_Architecture_v1.docx as Markdown and records the subsequent agreed contract clarifications in Appendix C. Appendix C takes precedence where it clarifies or updates the original contracts. This specification does not claim that its contracts are already implemented. Appendix C freezes the shared connector/intake and downstream version contracts so implementation can proceed without further architectural choices at that boundary.
DISTILLED.NEWS
Architecture Specification v1
Frozen end-to-end architecture and shared implementation contracts
Status  Authoritative architecture baseline after the October 2026 simplification decisions. This document defines system boundaries, canonical objects, ownership, data flow, trust boundaries, and invariants. It intentionally does not prescribe implementation milestones or a delivery schedule.


Supersedes conflicting v1.5 assumptions involving feed templates, shared world state, global events/storylines, CoverageGap/CoverageEvaluator, Catch Me Up, acquisition-reuse infrastructure, public-feed cloning, and intelligent meaningful-change notifications.
Contents
1. Architecture goals and design principles
2. Frozen product decisions
3. System context and top-level flow
4. Feed and source architecture
5. Source recommendation and verification
6. Acquisition architecture
7. Candidate intake and acquisition contracts
8. Evidence normalization and provenance
9. Deduplication and evidence roles
10. Feed-scoped event intelligence
11. Storyline architecture
12. Scoring, relevance, and time-window reasoning
13. Briefing selection and bounded synthesis
14. Grounding and publication
15. Public feeds, Follow, Star, and notifications
16. Ownership, lifecycle, and retention
17. Reliability, queues, and idempotency
18. Security and browser trust boundaries
19. Model/provider abstraction
20. Logical modules and infrastructure boundaries
21. Deferred/non-goal architecture
22. Architectural invariants
Appendix A. Canonical object contracts
Appendix B. End-to-end sequence
Appendix C. Frozen shared contracts for parallel implementation
1. Architecture goals and design principles
Distilled is a feed-centric news intelligence system. A user explicitly defines a feed and its sources. Distilled continuously acquires content from those approved sources, removes duplicate/noisy material, infers feed-scoped real-world events and evolving storylines, ranks what matters for the feed and briefing window, and publishes concise evidence-grounded briefings.
Primary architecture rule  A component belongs in the core architecture only when it solves a concrete current product, reliability, security, cost, or evaluation problem. Architectural elegance alone is not sufficient.


- Product simplicity. The user sees Feed, Source, Briefing, Follow, and Star. Internal acquisition and intelligence machinery stays hidden.
- Deterministic first. Use structured connectors, direct HTTP, and deterministic browser workflows before invoking an LLM-controlled browser.
- Model judgment, runtime authority. Models may classify, infer, rank, and synthesize. The runtime owns authorization, persistence, credentials, retries, checkpoints, budgets, and final verification.
- Feed ownership. Evidence, Events, Storylines, scores, candidates, and BriefingEditions are feed-scoped in v1.
- Source boundary. Runtime acquisition processes only sources the user has explicitly selected or approved.
- Evidence grounding. Every factual briefing claim must be traceable to stored evidence from the feed's approved sources.
- Provider neutrality. Freeze capability contracts, not vendor names or model brands.
- Measured evolution. Deferred optimizations such as shared acquisition or global events may be added only after a measured problem justifies them.
2. Frozen product decisions
Decision	v1 architecture
Canonical feed object	Feed. The old UserFeedSpec architectural concept is removed/renamed.
Feed templates	Removed: no FeedTemplate, FeedTemplateVersion, or TemplateMatcher.
Public feed reuse	Follow or Star only. No clone/fork/use-as-template behavior.
Source Recommendation Agent	Retained for Create/Edit Feed only. It may suggest sources; it cannot subscribe on the user's behalf.
Runtime source expansion	Prohibited. No CoverageGap, CoverageEvaluator, or automatic source broadening.
Acquisition reuse	Deferred. No UpstreamResource/shared acquisition layer is required in v1.
Source relationship	FeedSource links a Feed to an approved Source.
Intelligence ownership	Events and Storylines belong to one Feed. No SharedWorldState/global intelligence layer.
Ranking objects	EventSalienceAssessment, UserRelevance, WindowScore, and BriefingCandidate are retained.
Briefing synthesis	Bounded Briefing Agent retained; it can inspect stored feed evidence only and cannot launch external coverage search.
Catch Me Up	Removed entirely from v1.
Notifications	Simple publication notification. No intelligent meaningful-change alert subsystem.
Web Operator	Retained only as a difficult acquisition/discovery/repair fallback for an approved source.


3. System context and top-level flow
USER
  |
CREATE / EDIT FEED
  |
  +--> user adds sources directly
  |
  +--> Source Recommendation Agent --> verify --> USER APPROVES
  |
  v
FEED + FeedSource[]
  |
  v
SourceCheckpoint --> Connector
  |
  v
SourceObservation[] + CollectionCoverage
  |
  v
CandidateProposal
  |
  v
Candidate Intake --> IntakeReceipt --> CandidateItem
  |                         +--> accepted DELETE --> EvidenceTombstone + reassessment
  v
Acquisition Router
  +--> supplied/API
  +--> HTTP extraction
  +--> deterministic browser workflow
  +--> Web Operator fallback (auth/challenge recovery when required)
  |
  v
AcquiredContent
  |
  v
atomic evidence acceptance / ordering recheck
  |
  v
NormalizedEvidenceItem + EvidenceRevision (or replay/stale result)
  |
  v
exact dedup --> EvidenceRoleDecision --> semantic near-dedup
  |
  v
Event + EventVersion + EventMembership [PER FEED]
  |
  v
StorylineVersion [PER FEED]
  |
  +--> EventSalienceAssessment
  +--> UserRelevance
  +--> WindowScore
  |
  v
BriefingCandidate[] --> rank --> diversity/redundancy --> briefing budget
  |
  v
selected candidates
  |
  v
Bounded Briefing Agent --> Grounding Verification --> BriefingEdition
  |
  +--> publish
  +--> notify enabled followers/users

Architectural meaning  The Feed is the unit of intelligence and publication. Source recommendation can help construct a feed, but runtime processing never silently changes the feed's source boundary.


4. Feed and source architecture
4.1 Feed
Feed is the authoritative product configuration and the ownership root for v1 news intelligence. It captures what the owner wants to follow, which sources are approved, the desired output language, and the briefing cadence.
Feed
- id
- ownerId
- title
- description?
- interests[]
- geography[]?
- outputLanguage
- evidenceLanguages[]?        // optional restriction only
- briefingFrequency          // 30m | hourly | daily | weekly
- visibility                 // product publication setting
- paused
- revision
- createdAt / updatedAt

Language invariant  Output language and evidence language are separate. An English briefing may be grounded in Arabic evidence unless the owner explicitly restricts evidence languages.


4.2 Source
Source is the canonical identity of something Distilled can monitor. Source identity is independent from the provider or method used to retrieve content.
Source
- id
- type                     // rss | website | telegram | x | linkedin | google_news_query | api_query ...
- displayName
- canonicalUrl?
- canonicalHandle?
- canonicalIdentifier?
- connectorType
- verificationStatus
- metadata?
- createdAt / updatedAt

4.3 FeedSource
FeedSource is the explicit relationship stating that a Feed is allowed to acquire from a Source. It replaces the earlier SourceSubscription/UpstreamResource chain for v1.
FeedSource
- id
- feedId
- sourceId
- enabled
- addedBy                  // user | recommendation
- createdAt / updatedAt

Source-boundary invariant  A runtime item must be attributable to a FeedSource belonging to the Feed. Recommendation alone is not authorization; user approval creates the FeedSource.


5. Source recommendation and verification
The Source Recommendation Agent is a feed-construction capability, not a runtime coverage subsystem. It is invoked only while the user creates or edits a Feed and asks Distilled to help identify useful sources.
User describes desired feed
        |
        v
Source Recommendation Agent
  - inspect known Source catalog
  - search when needed
  - identify concrete publisher/feed/account/channel/query
        |
        v
Source candidates
        |
        v
Deterministic verification
  - exists?
  - identity matches?
  - relevant?
  - duplicate/mirror?
  - supported connector?
  - accessible/followable?
        |
        v
USER APPROVES
        |
        v
FeedSource created

- Recommendation may discover. It may use web/search tooling because the user explicitly asked for help constructing the feed.
- Verification is mandatory. Recommendations are not trusted solely because a model produced them.
- Approval is mandatory. The agent cannot silently add a source.
- Runtime is closed to expansion. Once active, the feed processes its approved FeedSource set; the briefing system cannot broaden it.
6. Acquisition architecture
6.1 SourceCheckpoint
Each FeedSource maintains durable incremental collection state. Because acquisition reuse is deferred, the checkpoint is feed-source scoped rather than attached to a shared UpstreamResource.
SourceCheckpoint
- feedSourceId
- checkpointVersion
- cursorType                // message_id | post_id | etag | last_modified | provider_cursor | watermark
- cursorValue
- committedAt
- connectorVersion

fetch
  -> persist SourceObservation + CollectionCoverage
  -> durably resolve Candidate Intake through the safe cursor
  -> commit accepted/replayed/ignored/deletion/rejected work and retry state
  -> advance checkpoint

Data-loss rule  A checkpoint advances only past durably resolved intake work. Accepted/replayed items already have durable retry state; terminal rejections may count as resolved; quarantined items remain unresolved. Later extraction, Event, scoring, or briefing failure does not roll the source checkpoint backward.


6.2 Connectors
Connectors understand source-specific pagination, cursors, payload structure, edit/deletion semantics, and rate limits. A connector fetch produces durable SourceObservation records plus one CollectionCoverage record for the fetch run. Valid UPSERT observations are normalized into CandidateProposal records for Candidate Intake. Connectors do not own event intelligence or briefing logic. The exact shared types, revision ordering, acceptance rules, and checkpoint boundary are frozen in Appendix C.
Connector family	Typical incremental identity
RSS	GUID, ETag, Last-Modified
Telegram	message ID plus explicit edit/deletion recheck policy
X	post ID/provider cursor
Website	URL/hash/watermark
API/query	provider cursor/token
Google News query	result/article identity with publisher provenance


6.3 Acquisition Router
The Acquisition Router chooses the lowest-complexity reliable route capable of acquiring the candidate.
1. Supplied payload already available from the connector.
2. Native structured/API retrieval.
3. Direct HTTP/HTML extraction.
4. Known deterministic browser workflow.
5. Web Operator only when ordinary deterministic acquisition is insufficient.
Agent placement  The Web Operator is an acquisition fallback, not the central product architecture. Agentic browser work is reserved for novelty, repair, difficult interaction, authentication, or structural change.


6.4 Web Operator and workflow reuse
deterministic acquisition fails
        |
        v
Web Operator explores boundedly
        |
        v
working acquisition path found
        |
        v
runtime independently verifies content/completion
        |
        v
workflow may be validated and reused deterministically later

- Agent = novelty/repair. The model may navigate and reason when a new or broken source requires it.
- Workflow = repetition. Once the path is known and validated, future acquisition should avoid unnecessary model reasoning.
- Read-only scope. No posting, liking, reposting, messaging, settings mutation, purchases, or unrelated external actions.
- Runtime verification. The agent cannot declare completion without verifier-owned evidence.
6.5 Authentication and challenges
Authenticated source acquisition is handled by the runtime, not by exposing secrets to the model. Challenge handling is a recoverable acquisition state within bounded policy.
browser needs credential
  -> runtime credential broker
  -> secure secret injection
  -> submit
  -> persist encrypted session on success
  -> destroy browser
  -> fresh browser/context
  -> restore session
  -> independently verify authenticated state

challenge detected
  -> classify
  -> normal recovery / configured solver
  -> verify challenge cleared
  -> executor failover if permitted and useful
  -> resume acquisition

owner-only factor unavailable to runtime
  -> human intervention

7. Candidate intake and acquisition contracts
7.1 SourceObservation, CollectionCoverage, and CandidateProposal
SourceObservation is the durable connector-side record of what a fetch observed for one source item. It carries stable item identity, representation/completeness, source revision metadata when available, and the FeedSource-scoped fetch-start sequence. CollectionCoverage records whether the requested collection/window was fully or partially traversed. Their exact implementation-ready contracts are frozen in Appendix C.
CandidateProposal is the transient normalized proposal derived from a valid UPSERT observation. It means a source produced something potentially worth acquiring; it is not canonical evidence.
CandidateProposal
- observationId
- feedId
- feedSourceId
- sourceId
- sourceItemKey
- connectorType
- upstreamId?
- url?
- titleHint?
- publishedAtHint?
- languageHint?
- representation
- contentCompleteness
- suppliedPayloadRef?
- payloadHash?              // only if already available cheaply
- discoveredAt
- discoveryRunId

7.2 Candidate Intake
CandidateProposal
  -> validate identifiers
  -> canonicalize URL/platform identity
  -> cheap pre-acquisition duplicate check
  -> technical eligibility
  -> CandidateItem

Candidate eligibility is deliberately narrow. It asks whether the item is valid and worth acquiring, not whether it is true, important, or briefing-worthy. Importance belongs later in the intelligence pipeline.
7.3 CandidateItem
CandidateItem
- id
- feedId
- feedSourceId
- sourceId
- sourceItemKey
- latestObservationId
- upstreamId?
- canonicalUrl?
- titleHint?
- publishedAtHint?
- languageHint?
- representation
- contentCompleteness
- discoveredAt
- retryState
- intakePolicyVersion

7.4 AcquiredContent
AcquiredContent
- id
- feedId
- candidateId
- sourceId
- resolvedUrl?
- title?
- text?
- author?
- publishedAt?
- acquisitionMethod        // supplied_payload | platform_api | direct_http | browser
- acquisitionProvider?
- rawPayloadRef?
- acquiredAt
- quality.transportSuccess
- quality.extractionSuccess
- representation
- contentCompleteness
- quality.extractionComplete
- quality.confidence?

Source/provider separation  A Reuters article retrieved through a browser provider is still Reuters evidence. Retrieval provider metadata never replaces publisher/source identity.


8. Evidence normalization and provenance
All successfully acquired material is normalized into a common evidence identity so downstream intelligence is independent of connector and retrieval method. Accepted content changes create immutable EvidenceRevision records; published outputs always reference the exact revision used.
NormalizedEvidenceItem
- id                         // stable evidence identity for one FeedSource item
- feedId
- feedSourceId
- sourceId
- sourceItemKey
- state                      // ACTIVE | DELETED
- currentRevisionId?
- currentTombstoneId?
- currentObservationId
- currentFetchStartSequence
- currentSourceRevision?
- firstSeenAt / updatedAt

EvidenceRevision
- id                         // immutable content revision identity
- evidenceId
- revision                   // monotonically increasing per evidenceId
- sourceObservationId
- acquiredContentId
- canonicalUrl?
- title?
- body?
- language?
- publishedAt?
- representation
- contentCompleteness
- contentHash
- sourceRevision?
- fetchStartSequence
- provenance.acquisitionMethod
- provenance.acquisitionProvider?
- provenance.originalUrl?
- acceptedAt

EvidenceTombstone
- id
- evidenceId
- sourceObservationId
- sourceRevision?
- fetchStartSequence
- acceptedAt

EvidenceAcceptanceReceipt
- id
- evidenceId
- sourceObservationId
- acquiredContentId
- decision                   // PROMOTED_NEW_REVISION | REPLAY_CURRENT_CONTENT | IGNORED_STALE_OBSERVATION | QUARANTINED_REVISION_CONFLICT
- conflictId?
- resultingRevisionId?
- decidedAt

- Traceability. Every evidence item can be traced back to its FeedSource, candidate, acquisition record, and original source identity.
- Transport vs extraction. HTTP success alone is insufficient; extraction completeness is tracked separately.
- Ordering recheck. Every acquired result is bound to its exact SourceObservation and must win the C5 ordering check again before it can change current evidence state.
- Replay semantics. Identical content only suppresses a new revision when it matches the current accepted content; historical hash reuse does not collapse an A -> B -> A transition.
- Raw retention. Large/raw payloads may have a shorter TTL than canonical normalized evidence and published briefing provenance.
9. Deduplication and evidence roles
9.1 Three distinct duplicate problems
Layer	Question	Purpose
Candidate identity dedup	Have we already seen this URL/post/GUID/item identity for this feed?	Avoid unnecessary acquisition.
Exact current-content replay	Does a winning UPSERT match the current accepted content?	Advance ordering metadata without creating a new EvidenceRevision or reassessment. Historical A -> B -> A transitions remain distinct revisions.
Semantic near-dedup	Is this effectively the same article/copy despite formatting or light rewriting?	Avoid counting syndicated/copied material as independent evidence.


Critical distinction  Independent reports about the same real-world event are not semantic duplicates. Reuters, BBC, and an official statement may all remain separate evidence attached to one Event.


9.2 EvidenceRoleDecision
Evidence role classifies what kind of contribution an item makes before event reasoning and final synthesis.
EvidenceRoleDecision
- evidenceId
- role
    PRIMARY_DEVELOPMENT
    REPORTED_DEVELOPMENT
    OFFICIAL_STATEMENT
    INVESTIGATIVE_REPORT
    ANALYSIS
    OPINION
    PROMOTION
    UNVERIFIED_LEAD
    NOISE
- confidence
- policyVersion
- computedAt

10. Feed-scoped event intelligence
10.1 Event and EventVersion
An Event is one bounded real-world development inferred from evidence belonging to one Feed. Events are not global in v1. Event is the stable identity; each accepted state change creates an immutable EventVersion.
Event
- id
- feedId
- currentVersionId
- createdAt

EventVersion
- id
- eventId
- feedId
- version
- title?
- type?
- occurredAt?
- entities[]
- geography[]
- state
- confidence
- algorithmVersion
- createdAt

10.2 EventMembership
EventMembership is the canonical evidence-to-event-version relation. The Event/EventVersion objects must not carry a second competing evidence-membership truth.
EventMembership
- id
- eventVersionId
- evidenceRevisionId
- confidence
- algorithmVersion
- createdAt

10.3 Event assignment
new evidence
  -> retrieve recent Events from SAME Feed
  -> compare semantic similarity + entity overlap + time proximity
  -> attach to existing Event OR create new Event
  -> preserve confidence + algorithm version

A stronger model may adjudicate ambiguous cases, but ordinary event matching should not require an autonomous agent loop.
10.4 Corroboration
Corroboration counts independent evidence sources within the Feed's approved source set. Duplicate retrieval paths for the same publisher item must not inflate corroboration. Lack of corroboration never triggers external source expansion in v1.
11. Storyline architecture
A Storyline represents an evolving sequence of related Events. It is longer-lived than an Event and captures chronology, current state, and meaningful turning points within one Feed.
Event 1: reform proposal announced
Event 2: cabinet approves proposal
Event 3: parliament amends bill
Event 4: bill passes
        |
        v
Storyline: Lebanon banking reform

11.1 StorylineVersion
StorylineVersion
- id
- storylineId
- feedId
- version
- eventVersionIds[]
- entities[]
- chronology[]
- supportedFacts[]
- previousState?
- currentState
- turningPoints[]
- confidence
- algorithmVersion
- createdAt

- Immutable versions. New evidence produces a new StorylineVersion rather than overwriting history.
- Evidence-grounded chronology. Chronology and state transitions must be attributable to supporting evidence/events.
- Incremental updates. Storylines update as Events arrive; they are not rebuilt from all raw history at briefing time.
- Per-feed ownership. No SharedWorldState or global storyline ownership is introduced in v1.
12. Scoring, relevance, and time-window reasoning
The explicit ranking layers are retained because they answer different questions and make selection measurable and explainable. Because Events are feed-scoped, none of these layers depend on a global SharedWorldState.
12.1 EventSalienceAssessment
EventSalienceAssessment
- id
- feedId
- targetType               // event | storyline
- targetVersionId
- feedRevision
- impact
- novelty
- changeMagnitude
- institutionalSignificance
- corroboration
- persistence
- recency
- overallScore
- policyVersion
- computedAt

Salience asks how significant the development is within the feed's intelligence context, independently from the final publication budget.
12.2 UserRelevance
UserRelevance
- id
- feedId
- targetType
- targetVersionId
- feedRevision
- topicMatch
- geographyMatch
- entityMatch
- sourcePreference
- languageFit
- overallScore
- policyVersion
- computedAt

Public-feed behavior  UserRelevance is tied to the feed owner/Feed definition, not recalculated per follower. Followers consume the same published BriefingEdition.


12.3 WindowScore
WindowScore is persisted and references the exact EventVersion or StorylineVersion evaluated for one publication window. The concrete fields, reason-code enum, uniqueness key, and publication-window semantics are frozen in Appendix C.
Window	Primary reasoning objective
30 minutes	What just changed and deserves attention now?
Hourly	Which new developments require attention?
Daily	What materially mattered today?
Weekly	Which important storylines evolved, and what were the turning points?


Weekly reasoning is not daily scoring multiplied by seven. Longer windows require stronger temporal compression and storyline-level reasoning.
12.4 Model choice
JEV, a deterministic heuristic, GPT-class models, or hybrids are implementation candidates for these capabilities. The architecture freezes the assessment contracts, not a specific model. Model choice must remain replaceable and measurable.
13. Briefing selection and bounded synthesis
13.1 BriefingCandidate
BriefingCandidate
- id
- feedId
- feedRevision
- targetType               // event | storyline
- targetVersionId
- salienceAssessmentId
- relevanceAssessmentId
- windowScoreId
- initialScore
- reasons[]
- selectionState
- selectionPolicyVersion

13.2 Selection
EventSalienceAssessment
      +
UserRelevance
      +
WindowScore
      |
      v
BriefingCandidate[]
      |
      v
initial ranking
      |
      v
diversity / redundancy control
      |
      v
briefing budget
      |
      v
SELECTED CANDIDATES

- Ranking precedes synthesis. The final LLM does not receive the entire raw-news stream and decide from scratch what matters.
- Diversity is a constraint. Avoid a briefing dominated by many tiny updates from one storyline when other important developments exist.
- Budget is explicit. Selection respects maximum stories, target reading time, source/storyline diversity, token/cost bounds, and publication deadline.
- Reproducibility. Selection records enough provenance to explain why a candidate was selected or omitted under the active policy.
13.3 Bounded Briefing Agent
The Bounded Briefing Agent synthesizes already-selected intelligence. It is not a discovery engine and does not alter the Feed's source boundary.
May	May not
Inspect selected Events/Storylines and their stored supporting evidence.	Search the web for additional coverage.
Inspect previous/current storyline state and turning points.	Create FeedSource records or add sources.
Compare evidence from approved sources.	Trigger CoverageGap/CorroborationGap workflows.
Generate concise source-grounded briefing prose in the configured language.	Bypass ranking, persistence, budgets, or grounding verification.


selected BriefingCandidate[]
+ exact StorylineVersion/EventVersion targets
+ exact EvidenceRevision support
+ supporting evidence
+ Feed configuration
+ output language
+ synthesis budget
        |
        v
Bounded Briefing Agent
        |
        v
draft briefing

14. Grounding and publication
14.1 Grounding invariant
Briefing claim
  -> supporting fact
  -> EventVersion / StorylineVersion
  -> EvidenceRevision
  -> Source

A factual claim that cannot be supported by stored Feed evidence must be revised or omitted. The model cannot make unsupported factual content publishable by assigning itself confidence.
14.2 Grounding Verification
draft briefing
  -> identify/check factual claims
  -> map to cited evidence
  -> verify support/entailment
  -> supported?
       yes -> BriefingEdition
       no  -> revise within budget or remove claim

14.3 BriefingEdition
BriefingEdition
- id
- feedId
- feedRevision
- windowStart / windowEnd
- language
- selectedCandidateIds[]
- eventVersionIds[]
- storylineVersionIds[]
- evidenceRevisionIds[]
- stories[]
- generation.model
- generation.promptVersion
- generation.routerVersion
- generation.tokensIn / tokensOut
- generation.cost
- generation.latencyMs
- selectionPolicyVersion
- createdAt

Published truth  BriefingEdition is the canonical published output. It is sufficiently immutable and provenance-rich to reproduce or explain why a story was included and which evidence supported it.


15. Public feeds, Follow, Star, and notifications
15.1 Follow
Follow creates a relationship to the same public Feed. It does not clone the Feed, copy its sources, duplicate its Events/Storylines, or create a private derivative.
FeedFollow
- userId
- feedId
- createdAt

15.2 Star
Star is a lightweight save/interest signal on the same public Feed. It may later contribute to Explore ranking but has no effect on the feed's acquisition or intelligence state.
FeedStar
- userId
- feedId
- createdAt

15.3 Notifications
Notification logic is intentionally non-intelligent. When a new BriefingEdition/update is published, users/followers with notifications enabled may receive a push notification. No separate meaningful-change classifier or delivery-ranking subsystem is required.
BriefingEdition published
  -> notifications enabled?
       yes -> DeliveryJob -> DeliveryAttempt
       no  -> stop

- Push failure is non-blocking. A failed notification never invalidates or rolls back the published BriefingEdition.
- Operational state only. PushSubscription, NotificationPreference, DeliveryJob, and DeliveryAttempt exist for device registration, retries, and observability—not content intelligence.
16. Ownership, lifecycle, and retention
16.1 Canonical ownership
Object	Canonical owner / scope
Feed	Owner account
Source	Shared source catalog identity
FeedSource	Feed
SourceCheckpoint	FeedSource
SourceObservation	FeedSource
CollectionCoverage	FeedSource fetch run
IntakeReceipt	Candidate Intake
CandidateItem	Feed
AcquiredContent	Feed
NormalizedEvidenceItem	Feed
EvidenceRevision	Feed
EvidenceTombstone	Feed
EvidenceAcceptanceReceipt	Evidence acceptance / Feed
EvidenceRoleDecision	Feed
SemanticDuplicateDecision	Feed
Event	Feed
EventVersion	Feed
EventMembership	Feed
StorylineVersion	Feed
EventSalienceAssessment	Feed
UserRelevance	Feed
WindowScore	Feed
BriefingCandidate	Feed
BriefingEdition	Feed
FeedFollow	Follower relationship
FeedStar	User relationship
PushSubscription	User/device
DeliveryJob / DeliveryAttempt	Delivery subsystem


16.2 Feed deletion
V1 uses retained published snapshots. Deleting a Feed stops all future collection and future intelligence use, but already published BriefingEdition snapshots remain immutable while they remain published. A minimal Feed tombstone may be retained so published links and provenance continue to resolve.
delete Feed
  -> mark Feed deleted / stop scheduling immediately
  -> disable/remove active FeedSource relationships + checkpoints
  -> revoke source auth/session material owned only by that Feed
  -> remove unpublished/transient candidates, acquisition jobs, and drafts per retention policy
  -> retain every published BriefingEdition
  -> retain exact EvidenceRevision / EventVersion / StorylineVersion / assessment / candidate
     snapshots referenced by any retained published edition
  -> remove Follow/Star relationships to the deleted active Feed

Source catalog identities may remain if referenced elsewhere.

A confirmed correction while the Feed is active is represented in a later edition that may link to the earlier edition; earlier published snapshots are not silently rewritten. If an edition or its required support must be removed for policy/legal reasons, the edition must be withdrawn rather than left published without support.
16.3 Retention classes
State class	Retention principle
Raw HTML/API/browser artifacts	Configurable, usually shorter-lived; may be deleted after provenance requirements are met.
Evidence revisions	Exact revisions cited by a published edition are retained for as long as that edition remains published; unreferenced active evidence follows normal feed retention.
EventVersion/StorylineVersion snapshots	Versions referenced by a published edition are retained while that edition remains published.
BriefingEdition + provenance	Retained according to public/product history policy; should remain explainable while published.
Caches/embeddings	Replaceable/rebuildable; not canonical truth.


17. Reliability, queues, and idempotency
Logical asynchronous boundaries may use Cloudflare Queues or another transport, but the architecture assumes at-least-once delivery with idempotent consumers rather than pretending transport is exactly-once.
MAIN PIPELINE
source.poll
  -> source.observed
  -> candidate.proposed
  -> intake.resolved
       +-> accepted deletion -> evidence.tombstoned -> reassessment.requested
       +-> accepted UPSERT   -> acquisition.requested
  -> content.acquired
  -> evidence.acceptance.rechecked
  -> evidence.normalized / replayed / stale-ignored
  -> event.update.requested
  -> event.updated
  -> storyline.updated

BRIEFING
briefing.requested
  -> briefing.scored
  -> briefing.selected
  -> briefing.synthesis
  -> briefing.verified
  -> briefing.ready

DELIVERY
briefing.ready
  -> notification.requested
  -> notification.sent

- At least once. A message may be delivered more than once; consumers must make duplicate execution harmless.
- Idempotency keys. Keys should encode the canonical work identity, e.g., evidence:{acquiredContentId} or briefing:{feedId}:{windowStart}:{windowEnd}.
- Typed failure. Transient failures retry; permanent invalid/unsupported/policy failures do not loop indefinitely.
- Checkpoint safety. A checkpoint may advance after durable intake resolution for all work through the proposed contiguous cursor; it does not wait for extraction, event processing, scoring, or briefing generation. Accepted/replayed items must already have durable retry state; ignored-stale observations and accepted deletions are terminal resolved outcomes; terminal rejections may also count as resolved. Quarantined items remain unresolved and cannot be skipped.
- Publication independence. Notification failure never blocks canonical briefing publication.
18. Security and browser trust boundaries
- Secrets. Passwords, cookies, tokens, authorization headers, and MFA secrets are never exposed to the model or ordinary logs.
- Credential injection. Authorized secrets are injected by a runtime-controlled broker into the browser/provider boundary.
- External content. Page text and connector payloads are untrusted external data; they cannot alter system policy or tool authority.
- Network controls. SSRF, private-network, metadata-endpoint, redirect, and websocket controls remain enforced.
- Browser isolation. Contexts/sessions are isolated by tenant/run as appropriate; stale capabilities cannot act on new browser generations.
- No arbitrary shell/JS. Models do not receive unrestricted shell access or arbitrary JavaScript execution capability.
- Read-only external actions. The Web Operator is limited to acquisition/navigation required to read approved sources.
- Verifier-owned completion. Extraction and browser task completion require runtime evidence, not model assertion.
- Budgets and cancellation. Every agent/model/browser run is bounded by time, calls, cost, and cancellation controls.
- Session handling. Persisted sessions are encrypted and fresh-session restore is independently verified before reuse.
19. Model/provider abstraction
The architecture defines capabilities and typed outputs. Vendor/model names remain runtime configuration and evaluation choices.
Capability	Possible implementations
Semantic duplicate decision	Embeddings + threshold, classifier, LLM adjudication
Event attach/create adjudication	Similarity baseline, small model, LLM only for ambiguity
Storyline state/turning point extraction	Rules + structured model output
EventSalienceAssessment	Deterministic baseline, JEV, GPT-class model, hybrid
UserRelevance	Deterministic features, embedding/model scoring
WindowScore	Window-specific deterministic/model policy
Briefing synthesis	Configured bounded generative model
Grounding verification	Deterministic citation checks + entailment/model verification
Web Operator	Replaceable browser/model executor under the same runtime policy


JEV placement  JEV is a candidate implementation of a scoring/judgment capability, not a required architectural component. It should remain only if evaluation shows value for the chosen task.


20. Logical modules and infrastructure boundaries
20.1 Logical modules
feeds/
sources/
source_recommendation/
connectors/
candidate_intake/
acquisition/
web_operator/
evidence/
intelligence/
scoring/
briefing/
delivery/
evaluation_observability/
storage/
messaging/
shared_runtime/

These are ownership/module boundaries, not a mandate for one deployed microservice per directory. A single backend with modular packages and a small number of workers is acceptable and preferred until measurements justify further distribution.
20.2 Infrastructure baseline
Responsive web/PWA client
        |
        v
Cloudflare Workers / API + orchestration
        |
        +--> D1       canonical structured state
        +--> R2       raw/large acquisition artifacts
        +--> Queues   asynchronous work
        +--> Browser executor/provider for difficult acquisition
        +--> AI Gateway / model providers for intelligence + briefing

Infrastructure rule  Do not add Kafka, Kubernetes, a vector database, a separate global event store, or other specialized infrastructure unless a concrete measured need appears.


21. Deferred and explicitly excluded v1 architecture
The following concepts are intentionally outside the v1 core. Their absence is a design decision, not an omission.
Deferred / removed	Reason
FeedTemplate / FeedTemplateVersion / TemplateMatcher	No current product problem justifies a configuration-template layer.
Public-feed cloning/forking/use-as-template	Follow and Star are sufficient for public-feed consumption.
UpstreamResource/shared acquisition architecture	Potential optimization; duplicate acquisition must first become a measured cost problem.
SharedWorldState/global Events/global Storylines	Would require new ownership, retention, source-policy, and deletion semantics before need is proven.
CoverageGap / CoverageEvaluator	User controls the source set; runtime must not broaden the feed behind the user.
Briefing-agent web search	Synthesis is restricted to stored evidence from approved sources.
Catch Me Up	Not required for the core product.
Meaningful-change notification intelligence	Publication itself is sufficient notification trigger in v1.
Per-follower ranking/personalization of public feeds	Followers consume the same published Feed/BriefingEdition.
General-purpose autonomous browser platform	Web Operator exists only to solve Distilled acquisition problems.
Mandatory vector database	Not needed to define the v1 architecture; retrieval implementation remains replaceable.
Microservice-per-boundary deployment	Unnecessary distributed-system complexity at current scale.


22. Architectural invariants
1. A Feed is the authoritative product configuration and v1 intelligence ownership root.
2. Every runtime news item must originate from a Source explicitly selected or approved for that Feed.
3. The Source Recommendation Agent may recommend; only the user can authorize a FeedSource.
4. No FeedTemplate, TemplateMatcher, feed cloning, or use-as-template workflow exists in v1.
5. Source identity is distinct from acquisition provider identity.
6. Acquisition reuse is not a required v1 architecture; there is no UpstreamResource dependency.
7. SourceCheckpoint is FeedSource-scoped and advances only past durably resolved intake work through a proven contiguous cursor; it does not wait for downstream extraction or intelligence success.
8. Connectors persist SourceObservation/CollectionCoverage and derive CandidateProposal; Candidate Intake owns IntakeReceipt and canonical CandidateItem creation.
9. CandidateItem and AcquiredContent are distinct states.
10. Candidate identity dedup, exact content dedup, semantic near-dedup, and Event clustering are distinct operations.
11. Independent evidence about the same Event remains independent for corroboration.
12. Events and Storylines belong to one Feed in v1; there is no SharedWorldState.
13. EventMembership is the canonical EvidenceRevision-to-EventVersion relationship.
14. Storyline state is versioned and evidence-grounded.
15. EventSalienceAssessment, UserRelevance, and WindowScore remain distinct selection signals.
16. Public-feed followers do not receive separately reranked intelligence; they consume the same BriefingEdition.
17. The final synthesis model receives selected BriefingCandidates, not the entire raw-news stream.
18. The Bounded Briefing Agent may inspect stored Feed evidence but may not expand the source set or search the web for coverage.
19. CoverageGap/CoverageEvaluator do not exist in v1.
20. Every factual briefing claim must be grounded in stored evidence from approved Feed sources.
21. BriefingEdition is the canonical published output.
22. Catch Me Up does not exist in v1.
23. A new published briefing/update may trigger notification when notifications are enabled; no meaningful-change intelligence is required.
24. Web Operator is a bounded acquisition/repair fallback, not a general autonomous research agent.
25. Models provide judgment; the runtime owns authorization, credentials, persistence, retries, budgets, and verification.
26. Logical service boundaries do not imply microservice deployments.
27. New architectural complexity requires a concrete measured problem that the simpler design cannot adequately solve.
Appendix A. Canonical object contracts
Object	Required purpose
Feed	Authoritative feed definition and intelligence/publication ownership root.
Source	Canonical identity of a publisher/feed/account/channel/query that can be followed.
FeedSource	Explicit approval that a Feed may acquire from a Source.
SourceCheckpoint	Durable incremental cursor for one FeedSource.
SourceObservation	Durable connector observation for one source item in one fetch sequence.
CollectionCoverage	Durable record of requested/observed collection bounds, completeness, continuation, and safe progress for one fetch run.
IntakeReceipt	Durable intake decision for one observation; terminal accepted/replay/ignored/deletion/rejected outcomes resolve checkpoint work, quarantine does not.
CandidateProposal	Transient normalized proposal derived from a valid UPSERT SourceObservation.
CandidateItem	Canonical accepted item that deserves acquisition.
AcquiredContent	Result of attempting to retrieve usable source content.
NormalizedEvidenceItem	Stable evidence identity for one FeedSource item.
EvidenceRevision	Immutable accepted content revision with exact source/acquisition provenance.
EvidenceTombstone	Immutable accepted authoritative deletion transition ordered against UPSERT observations.
EvidenceAcceptanceReceipt	Durable post-acquisition decision recording promotion, replay, stale-result suppression, or conflict quarantine.
EvidenceRevisionConflict	Durable unresolved conflict and authoritative-recheck/resolution state.
EvidenceRoleDecision	Auditable classification of the evidence's role.
SemanticDuplicateDecision	Auditable near-duplicate decision distinct from Event membership.
Event	Stable identity of one bounded real-world development within one Feed.
EventVersion	Immutable versioned Event state used by assessments, storylines, and publication.
EventMembership	Canonical EvidenceRevision-to-EventVersion relation.
StorylineVersion	Immutable version of an evolving multi-event storyline within one Feed.
EventSalienceAssessment	Importance signals for an Event/Storyline in feed context.
UserRelevance	Match between Event/Storyline and the feed owner/Feed definition.
WindowScore	Time-window-specific relevance/priority score.
BriefingCandidate	Rankable/selectable Event/Storyline target with selection provenance.
BriefingEdition	Canonical published, grounded briefing for one Feed and time window.
FeedFollow	User consumes the same public Feed.
FeedStar	User saves/signals interest in the same public Feed.
PushSubscription	Per-device push registration.
DeliveryJob / DeliveryAttempt	Reliable notification delivery state.
ModelExecutionRecord	Cross-cutting observability for model, prompt/policy version, tokens, cost, latency, and result status.


Appendix B. End-to-end sequence
1. The owner creates a Feed and directly selects sources or requests source recommendations.
2. The Source Recommendation Agent may discover candidates; Distilled verifies them; the user explicitly approves any recommendation before it becomes a FeedSource.
3. The connector allocates a durable FeedSource-scoped fetch-start sequence, polls from its SourceCheckpoint, persists SourceObservation records plus CollectionCoverage, and derives CandidateProposal records for valid UPSERT observations.
4. Candidate Intake validates identity and query restrictions, canonicalizes, and applies the observation-time ordering check. ACCEPTED/REPLAY observations point to the stable CandidateItem and durable retry state; provably stale observations are terminal IGNORED; authoritative winning DELETE observations create an ordered EvidenceTombstone plus reassessment work without an acquisition candidate; REJECTED observations are resolved; QUARANTINED observations remain unresolved.
5. The SourceCheckpoint may advance to a proven contiguous cursor after those intake outcomes are durably committed; it does not wait for later acquisition, extraction, event, or briefing success.
6. The Acquisition Router retrieves content for accepted UPSERT observations using the lowest-complexity reliable route, escalating to deterministic browser or Web Operator only when required. Every acquisition job is bound to its exact SourceObservation.
7. When acquisition finishes, evidence acceptance atomically reapplies the ordering contract against the latest current item state. A losing stale result is durably ignored; a winning identical-current-content result advances ordering metadata without creating a revision; a winning changed-content result creates the next immutable EvidenceRevision and becomes current. Content may legitimately transition A -> B -> A, producing three accepted revisions.
8. Exact duplicate detection, EvidenceRoleDecision, and semantic near-duplicate handling clean the evidence stream without collapsing independent reporting.
9. A new EvidenceRevision is attached to an existing Event or creates a new Event. Any accepted Event state change creates an immutable EventVersion; EventMembership links exact EvidenceRevision records to that EventVersion.
10. Exact EventVersion records attach to or create feed-scoped storylines. New state produces immutable StorylineVersion records containing exact EventVersion references, chronology, supported facts, previous/current state, and turning points.
11. EventSalienceAssessment, UserRelevance, and WindowScore evaluate Events/Storylines for the active Feed and briefing window.
12. BriefingCandidate records are ranked, diversified, and constrained by the briefing budget; only the selected candidates proceed.
13. The Bounded Briefing Agent inspects stored evidence for selected candidates and writes the concise briefing without external coverage search.
14. Grounding Verification checks factual support and removes/revises unsupported claims.
15. A BriefingEdition is persisted and published with selected-candidate, storyline-version, evidence, model, cost, and latency provenance.
16. Followers consume the same public Feed edition. Users with notifications enabled may receive a simple publication notification.
17. As new source content arrives, the same pipeline repeats incrementally; no global SharedWorldState or automatic source expansion is required.
Architecture change control  Future proposals to introduce shared acquisition, global Events/Storylines, additional autonomous agents, automatic source expansion, or new infrastructure should state the observed problem, evidence that the current design is insufficient, the affected invariant, migration impact, and how the proposed change will be evaluated.


Appendix C. Frozen shared contracts for parallel implementation
This appendix is normative and takes precedence over earlier shorthand object sketches where they differ. It closes the connector/intake/downstream choices needed for two implementation lanes to work independently. The contracts in this appendix are frozen for v1 implementation; changes require an explicit contract revision. It is an architecture contract, not an implementation schedule.
C0. Shared scalar types and conventions
The shared TypeScript package should expose equivalent types to the following wire-level contracts:
type Id = string;
type ISODateTime = string;          // RFC 3339 / ISO-8601 UTC timestamp
type Score01 = number;              // finite number in [0, 1]
type PositiveInt = number;          // integer >= 1 and <= Number.MAX_SAFE_INTEGER

type TargetType = "EVENT" | "STORYLINE";
type RepresentationKind =
  | "FULL_ARTICLE"
  | "ARTICLE_EXCERPT"
  | "TELEGRAM_MESSAGE"
  | "SOCIAL_POST"
  | "LISTING_RESULT"
  | "API_RECORD";

type ContentCompleteness = "COMPLETE" | "PARTIAL" | "UNKNOWN";
type CoverageStatus = "COMPLETE" | "PARTIAL" | "UNKNOWN";
type ObservationOperation = "UPSERT" | "DELETE";
type IntakeDecision =
  | "ACCEPTED"
  | "REPLAY"
  | "IGNORED"
  | "DELETION_ACCEPTED"
  | "REJECTED"
  | "QUARANTINED";
type EvidenceAcceptanceDecision =
  | "PROMOTED_NEW_REVISION"
  | "REPLAY_CURRENT_CONTENT"
  | "IGNORED_STALE_OBSERVATION"
  | "QUARANTINED_REVISION_CONFLICT";
type EvidenceConflictState =
  | "PENDING_AUTHORITATIVE_RECHECK"
  | "RESOLVED_KEEP_CURRENT"
  | "RESOLVED_BY_LATER_OBSERVATION";
type CheckpointResolution = "RESOLVED" | "UNRESOLVED";
IDs are opaque. Timestamps never define source revision ordering by themselves. All persisted assessment and publication references use immutable version IDs, not mutable "current" objects.
C1. Query source authorization and validation
Approving a Google News or API query authorizes only results matching that query and its configured restrictions, potentially from different publishers. Store both the approved query source identity and the original publisher/article identity. Resolving a returned article is permitted; unrelated discovery is outside that authorization. Changing the query or an enforceable restriction increments the Feed revision.
Before intake resolution, enforce configured date, account, publisher, and other machine-checkable restrictions:
- An explicit restriction violation is REJECTED and is a terminal, checkpoint-resolved intake decision.
- Missing/unverifiable fields required to decide a restriction are QUARANTINED and remain checkpoint-unresolved until rechecked or explicitly resolved.
- Topical relevance is separate from enforceable source/query authorization; a provider match does not itself prove topical relevance.
C2. Connector fetch-run contract, coverage, and checkpoint boundary
Each poll/refresh/provider attempt for one FeedSource has a durable fetchRunId and a durable fetchStartSequence. The sequence is allocated from one monotonically increasing FeedSource-scoped allocator before the external fetch starts. Polling, explicit refreshes, and alternative providers for the same FeedSource use the same allocator. A worker-local counter is invalid.
interface CollectionBounds {
  startTime?: ISODateTime;
  endTime?: ISODateTime;
  startCursor?: string;
  endCursor?: string;
}

interface CollectionCoverage {
  id: Id;
  feedId: Id;
  feedSourceId: Id;
  fetchRunId: Id;
  fetchStartSequence: PositiveInt;
  requestedBounds: CollectionBounds;
  observedBounds: CollectionBounds;
  status: CoverageStatus;
  continuationState: "NONE" | "PENDING" | "EXHAUSTED";
  continuationToken?: string;
  safeCheckpointCursor?: string;
  failureReason?:
    | "NONE"
    | "RATE_LIMIT"
    | "TRANSIENT_PROVIDER_FAILURE"
    | "AUTH_REQUIRED"
    | "CHALLENGE"
    | "PARTIAL_PAGE"
    | "UNKNOWN";
  createdAt: ISODateTime;
}
Uniqueness: (feedSourceId, fetchRunId) is unique. fetchStartSequence is unique within a FeedSource.
Item content completeness and collection coverage are separate. A complete article does not prove a complete collection window. Partial collection may expose a safe contiguous checkpoint cursor without claiming the entire requested window was collected.
A checkpoint may advance when all work through the proposed contiguous cursor has durable intake resolution:
- ACCEPTED: resolved only when the CandidateItem (or accepted update identity) and durable downstream retry state exist.
- REPLAY: resolved when the existing canonical item is durably referenced and any winning ordering metadata is durably advanced.
- IGNORED: resolved when intake has durably determined that the observation is stale under the ordering contract.
- DELETION_ACCEPTED: resolved when the authoritative deletion has been ordered, the tombstone is durable, and downstream reassessment work is durable. It does not create an acquisition candidate.
- REJECTED: resolved because intake has made a terminal policy/validation decision.
- QUARANTINED: unresolved; checkpoint advancement must not skip it unless the provider's cursor semantics prove that no unresolved item is bypassed.
Checkpoint advancement does not wait for successful full-content extraction, Event processing, scoring, briefing generation, or notification delivery. If those later stages fail, their durable retry state owns recovery. A revision conflict discovered only after acquisition also does not roll the source checkpoint backward: intake has already durably accepted the observation. The downstream acceptance layer must persist the conflict and its authoritative-recheck state until it is resolved.
The safe sequence is:
fetch
  -> persist SourceObservation(s) + CollectionCoverage
  -> durable Candidate Intake decision(s) and retry state
  -> commit
  -> advance SourceCheckpoint to proven contiguous safe cursor
A crash after durable intake but before checkpoint advancement may cause replay; idempotency must make that harmless.
C3. SourceObservation contract and item representation completeness
Stable source-item identity is separate from an individual observation and from accepted evidence revision identity.
interface SourceRevision {
  scheme: string;                    // e.g. telegram_edit_date, provider_revision
  value: string;
  comparability: "COMPARABLE" | "OPAQUE";
  authority: "ORIGIN" | "PROVIDER";
}

interface SourceObservation {
  id: Id;
  feedId: Id;
  feedSourceId: Id;
  sourceId: Id;
  fetchRunId: Id;
  fetchStartSequence: PositiveInt;

  sourceItemKey: string;             // stable within this FeedSource
  operation: ObservationOperation;

  representation: RepresentationKind;
  contentCompleteness: ContentCompleteness;
  contentHash?: string;              // required for UPSERT when usable content bytes/text exist

  sourceRevision?: SourceRevision;
  authoritativeCurrentState: boolean;

  upstreamId?: string;
  canonicalUrl?: string;
  publisherId?: string;
  titleHint?: string;
  publishedAtHint?: ISODateTime;
  languageHint?: string;
  suppliedPayloadRef?: string;

  observedAt: ISODateTime;
}
Uniqueness: (feedSourceId, fetchStartSequence, sourceItemKey, operation) is unique. Duplicate provider rows inside one fetch collapse to one observation for that key/operation.
authoritativeCurrentState may be true only when the connector/provider contract guarantees that the observation represents the source item's current authoritative state, not merely a cached listing or intermediary snapshot.
Completeness is relative to the representation requested/returned:
- A complete Telegram message or social post is a valid complete representation.
- A valid RSS excerpt or Google News listing may be usable input even though it is not a full article.
- A partial/unknown response must never masquerade as a full article.
- A less complete representation must not overwrite a richer accepted representation for the same source item unless an authoritative source check explicitly establishes that the richer content is no longer valid.
Explicit source deletion requires operation = "DELETE" from an authoritative deletion signal. Disappearance from a listing or absence from a provider response is not deletion evidence.
C4. IntakeReceipt, Candidate identity, and atomic acceptance
Candidate identity is stable per FeedSource item:
interface CandidateProposal {
  observationId: Id;
  feedId: Id;
  feedSourceId: Id;
  sourceId: Id;
  sourceItemKey: string;
  connectorType: string;
  upstreamId?: string;
  url?: string;
  titleHint?: string;
  publishedAtHint?: ISODateTime;
  languageHint?: string;
  representation: RepresentationKind;
  contentCompleteness: ContentCompleteness;
  suppliedPayloadRef?: string;
  payloadHash?: string;
  discoveredAt: ISODateTime;
  discoveryRunId: Id;
}

interface IntakeReceipt {
  id: Id;
  observationId: Id;
  feedId: Id;
  feedSourceId: Id;
  sourceItemKey: string;
  decision: IntakeDecision;
  reasonCode:
    | "ACCEPTED_NEW_ITEM"
    | "ACCEPTED_NEW_OBSERVATION"
    | "REPLAY_IDENTICAL"
    | "IGNORED_STALE_OBSERVATION"
    | "ACCEPTED_DELETION"
    | "REJECT_QUERY_RESTRICTION"
    | "REJECT_INVALID_IDENTITY"
    | "REJECT_UNSUPPORTED"
    | "QUARANTINE_MISSING_VALIDATION_FIELDS"
    | "QUARANTINE_REVISION_CONFLICT";
  checkpointResolution: CheckpointResolution;
  candidateItemId?: Id;
  tombstoneId?: Id;
  decidedAt: ISODateTime;
  intakePolicyVersion: string;
}
Uniqueness: one current IntakeReceipt exists per observationId. QUARANTINED may transition once to a terminal ACCEPTED, REPLAY, IGNORED, DELETION_ACCEPTED, or REJECTED decision; terminal decisions are immutable.
CandidateItem has a uniqueness key (feedSourceId, sourceItemKey). Re-observing or editing the same upstream item does not create a second CandidateItem; it creates a new observation against the same stable item identity. An accepted DELETE does not create a new acquisition candidate; it creates an ordered tombstone and durable downstream reassessment work.
REPLAY_IDENTICAL at intake is used only when equality with current accepted content is already provable from durable supplied content/hash metadata. Otherwise the observation proceeds to acquisition and final replay/stale/promotion is decided by EvidenceAcceptanceReceipt.
Intake applies the ordering contract using the metadata available at observation time. If an observation is already provably stale, record IGNORED_STALE_OBSERVATION and do not schedule acquisition. If an authoritative deletion wins ordering, record ACCEPTED_DELETION, persist the tombstone and current ordering state atomically, and schedule downstream evidence/claim reassessment.
For accepted UPSERT observations that require acquisition, intake persists the CandidateItem/observation binding plus durable retry state. This is not the final content-promotion decision. When acquisition later finishes, the runtime must re-read the latest accepted ordering state and apply the same ordering contract again before changing canonical evidence state.
A higher fetchStartSequence that merely gets allocated or later fails never invalidates an earlier valid accepted observation. Sequence participates in fallback ordering only after an observation/result reaches the relevant durable acceptance point.
C5. Mixed revision metadata and current-content ordering
Ordering and content equality are separate decisions. First determine whether the incoming observation is allowed to advance the canonical ordering state. Only then decide whether that winning observation creates a new content revision, is an identical-content replay, or creates a deletion tombstone.
Source revision ordering follows this exact precedence for observations/results of the same (feedSourceId, sourceItemKey):
1. Both sides have reliable comparable revisions under the same scheme: use the registered scheme comparator. A lower revision loses; a higher revision wins; an equal revision enters the equal-ordering rule below.
2. Only one side has a comparable reliable revision, or the schemes are incomparable: do not replace the current accepted state solely by fetch order. Replacement requires authoritativeCurrentState = true and a connector-specific authoritative-state check that permits the replacement; otherwise retain current state and quarantine/recheck the conflicting observation.
3. Neither side has reliable comparable revision metadata: compare the FeedSource-scoped fetchStartSequence. A lower sequence loses; a higher successfully accepted sequence wins; an equal sequence enters the equal-ordering rule below.
Equal-ordering rule: equal ordering metadata never permits completion time, arrival order, worker identity, or retry order to choose a winner. If the incoming UPSERT is identical to the current accepted content, treat it as a replay. If equal ordering metadata is associated with different content, different operations, or otherwise incompatible state, preserve the current canonical state and durably quarantine the incoming result as a revision conflict. Resolution requires an explicit connector-specific authoritative recheck or a later observation that is strictly ordered under the rules above. The same source revision returning conflicting content is therefore a conflict, not a tie to be broken by fetch sequence or completion order.
After the incoming observation/result wins ordering:
- UPSERT with content identical to the current accepted content: do not create a new EvidenceRevision and do not trigger claim reassessment, but do advance the current accepted ordering metadata to the winning observation. This includes currentObservationId, accepted fetch-start sequence, and any newer reliable source revision metadata. Therefore an identical-content sequence 12 can prevent a delayed sequence 11 from replacing the current content.
- UPSERT with content different from the current accepted content: create a new immutable EvidenceRevision and trigger the required downstream reassessment. A content hash seen in an older historical revision does not make this a replay; A -> B -> A is three accepted states and the return to A creates a new revision.
- DELETE that wins ordering: create a durable EvidenceTombstone, mark the canonical item deleted for future use, advance ordering metadata, and trigger downstream reassessment. Apply the same ordering rules to tombstones so a delayed older UPSERT cannot resurrect deleted content. A genuinely newer authoritative UPSERT may supersede a tombstone under the same ordering contract.
Fetch timestamps and completion times never establish source revision ordering. Content hashes determine whether a winning UPSERT changes content; they do not determine ordering by themselves.
Two-stage ordering rule: intake performs the ordering check before scheduling work, and evidence promotion performs it again when acquisition completes. Every acquisition job is bound to the exact sourceObservationId. A result that was eligible at intake may lose to a newer accepted observation while extraction is running; that losing result is recorded as IGNORED_STALE_OBSERVATION and must not update currentRevisionId or current ordering state. If acquisition reveals a conflict at equal ordering metadata that could not be detected at intake, record QUARANTINED_REVISION_CONFLICT, preserve the current canonical state, persist durable authoritative-recheck state, and do not use completion order as a tiebreaker.
C6. Evidence identity, ordering state, immutable revisions, and tombstones
NormalizedEvidenceItem is the stable feed-scoped identity for one accepted source item. Its current state tracks ordering separately from immutable content revisions. Accepted content transitions create immutable revisions; identical-content winning observations advance ordering metadata without creating a new revision.
interface NormalizedEvidenceItem {
  id: Id;
  feedId: Id;
  feedSourceId: Id;
  sourceId: Id;
  sourceItemKey: string;

  state: "ACTIVE" | "DELETED";
  currentRevisionId?: Id;             // present for ACTIVE content; exact historical revisions remain immutable
  currentTombstoneId?: Id;            // present when DELETED

  currentObservationId: Id;
  currentFetchStartSequence: PositiveInt;
  currentSourceRevision?: SourceRevision;

  firstSeenAt: ISODateTime;
  updatedAt: ISODateTime;
}

interface EvidenceRevision {
  id: Id;
  evidenceId: Id;
  feedId: Id;
  revision: PositiveInt;
  sourceObservationId: Id;
  acquiredContentId: Id;
  canonicalUrl?: string;
  title?: string;
  body?: string;
  language?: string;
  publishedAt?: ISODateTime;
  representation: RepresentationKind;
  contentCompleteness: ContentCompleteness;
  contentHash: string;
  sourceRevision?: SourceRevision;
  fetchStartSequence: PositiveInt;
  acceptedAt: ISODateTime;
}

interface EvidenceTombstone {
  id: Id;
  evidenceId: Id;
  feedId: Id;
  sourceObservationId: Id;
  sourceRevision?: SourceRevision;
  fetchStartSequence: PositiveInt;
  acceptedAt: ISODateTime;
}

interface EvidenceAcceptanceReceipt {
  id: Id;
  evidenceId: Id;
  sourceObservationId: Id;
  acquiredContentId: Id;
  decision: EvidenceAcceptanceDecision;
  resultingRevisionId?: Id;
  conflictId?: Id;
  decidedAt: ISODateTime;
}

interface EvidenceRevisionConflict {
  id: Id;
  evidenceId: Id;
  sourceObservationId: Id;
  acquiredContentId: Id;
  currentRevisionId?: Id;
  currentTombstoneId?: Id;
  incomingContentHash?: string;
  currentContentHash?: string;
  reason:
    | "EQUAL_COMPARABLE_SOURCE_REVISION_DIFFERENT_STATE"
    | "EQUAL_FETCH_SEQUENCE_DIFFERENT_STATE"
    | "INCOMPARABLE_REVISION_REQUIRES_AUTHORITATIVE_CHECK";
  state: EvidenceConflictState;
  resolutionObservationId?: Id;
  createdAt: ISODateTime;
  resolvedAt?: ISODateTime;
}
Uniqueness: (evidenceId, revision) is unique. sourceObservationId is idempotent for evidence-promotion effects. A single unresolved EvidenceRevisionConflict may exist for the same (evidenceId, sourceObservationId, acquiredContentId) acceptance attempt. There is deliberately no uniqueness constraint on (evidenceId, contentHash) because content may legitimately transition A -> B -> A; the return to A is a new accepted revision when B is current.
An UPSERT is an identical-content replay only when its content matches the current accepted ACTIVE content after it wins ordering. Matching any historical revision is insufficient.
Atomic promotion: every acquisition result is bound to its exact sourceObservationId. Before modifying NormalizedEvidenceItem, atomically compare that observation/result against the latest current ordering state using C5. Then:
- if it loses ordering, persist EvidenceAcceptanceReceipt(decision = "IGNORED_STALE_OBSERVATION"); do not change current state;
- if ordering is equal and the result is compatible/identical with current content, persist REPLAY_CURRENT_CONTENT; do not create a new EvidenceRevision or reassessment work;
- if ordering is equal but the result conflicts with current content/state, persist EvidenceAcceptanceReceipt(decision = "QUARANTINED_REVISION_CONFLICT") plus an EvidenceRevisionConflict(state = "PENDING_AUTHORITATIVE_RECHECK"); do not modify currentRevisionId, tombstone state, or current ordering metadata, and enqueue bounded authoritative recheck work;
- if it wins and matches current content, persist REPLAY_CURRENT_CONTENT and advance only the ordering metadata; do not create a new EvidenceRevision or reassessment work;
- if it wins and changes current content, create the next monotonic EvidenceRevision, set currentRevisionId, clear any current tombstone, set state ACTIVE, advance ordering metadata, and enqueue downstream reassessment.
A post-acquisition conflict is downstream of durable intake. It does not invalidate the earlier intake receipt or roll back an already safe SourceCheckpoint. The conflict remains durable until an authoritative recheck resolves it or a later strictly ordered observation supersedes it.
Accepted deletion uses the same current ordering state but bypasses content acquisition: it creates EvidenceTombstone, sets state DELETED, advances ordering metadata, and enqueues downstream reassessment. A deletion whose ordering metadata is equal to conflicting current state is quarantined at intake rather than chosen by arrival/completion order.
Published content never points to mutable NormalizedEvidenceItem.currentRevisionId; it stores exact EvidenceRevision.id values.
C7. Event versions and exact target references
Event is a stable identity; EventVersion is the immutable state used for downstream decisions.
interface EventVersionRef {
  eventId: Id;
  eventVersionId: Id;
  version: PositiveInt;
}

interface StorylineVersionRef {
  storylineId: Id;
  storylineVersionId: Id;
  version: PositiveInt;
}

interface EventVersion {
  id: Id;
  eventId: Id;
  feedId: Id;
  version: PositiveInt;
  title?: string;
  type?: string;
  occurredAt?: ISODateTime;
  entities: string[];
  geography: string[];
  state: string;
  confidence: Score01;
  algorithmVersion: string;
  createdAt: ISODateTime;
}

interface EventMembership {
  id: Id;
  eventVersionId: Id;
  evidenceRevisionId: Id;
  confidence: Score01;
  algorithmVersion: string;
  createdAt: ISODateTime;
}
Uniqueness: (eventId, version) is unique; (eventVersionId, evidenceRevisionId) is unique.
StorylineVersion has its own immutable id in addition to (storylineId, version), and stores exact eventVersionIds, not mutable Event IDs. Briefing selection and publication likewise reference exact EventVersion/StorylineVersion IDs.
C8. Persisted assessments: referenced representation is frozen
V1 uses referenced persisted assessments, not embedded assessment copies inside BriefingCandidate.
Every assessment contains a stable id, exact target version, Feed revision, policy version, and evaluation timestamp. Assessment IDs are immutable once persisted.
interface AssessmentTarget {
  targetType: TargetType;
  targetVersionId: Id;               // EventVersion.id or StorylineVersion.id
}

interface EventSalienceAssessment extends AssessmentTarget {
  id: Id;
  feedId: Id;
  feedRevision: PositiveInt;
  impact: Score01;
  novelty: Score01;
  changeMagnitude: Score01;
  institutionalSignificance: Score01;
  corroboration: Score01;
  persistence: Score01;
  recency: Score01;
  overallScore: Score01;
  policyVersion: string;
  computedAt: ISODateTime;
}

interface UserRelevance extends AssessmentTarget {
  id: Id;
  feedId: Id;
  feedRevision: PositiveInt;
  topicMatch: Score01;
  geographyMatch: Score01;
  entityMatch: Score01;
  sourcePreference: Score01;
  languageFit: Score01;
  overallScore: Score01;
  policyVersion: string;
  computedAt: ISODateTime;
}

type WindowReasonCode =
  | "NEW_DEVELOPMENT"
  | "MAJOR_CHANGE"
  | "HIGH_IMPACT"
  | "HIGH_RELEVANCE"
  | "HIGH_RECENCY"
  | "PERSISTENT_STORYLINE"
  | "TURNING_POINT"
  | "LOW_NOVELTY"
  | "REDUNDANT_UPDATE";

interface WindowScore extends AssessmentTarget {
  id: Id;
  feedId: Id;
  feedRevision: PositiveInt;
  windowStart: ISODateTime;
  windowEnd: ISODateTime;
  windowKind: "30M" | "HOURLY" | "DAILY" | "WEEKLY";
  components: {
    recency: Score01;
    novelty: Score01;
    changeMagnitude: Score01;
    impact: Score01;
    persistence: Score01;
    turningPoint: Score01;
  };
  finalScore: Score01;
  reasonCodes: WindowReasonCode[];
  changeBoundaryVersionId?: Id;
  policyVersion: string;
  computedAt: ISODateTime;
}
Uniqueness: assessments are unique by (feedId, targetVersionId, feedRevision, policyVersion) for EventSalienceAssessment/UserRelevance, and by (feedId, targetVersionId, feedRevision, windowStart, windowEnd, policyVersion) for WindowScore.
WindowScore is computed for the publication window. An ingestion-time score is not permanently valid for later editions.
C9. BriefingCandidate and publication references
interface BriefingCandidate {
  id: Id;
  feedId: Id;
  feedRevision: PositiveInt;
  targetType: TargetType;
  targetVersionId: Id;
  salienceAssessmentId: Id;
  relevanceAssessmentId: Id;
  windowScoreId: Id;
  initialScore: Score01;
  reasons: string[];
  selectionState: "ELIGIBLE" | "SELECTED" | "OMITTED";
  selectionPolicyVersion: string;
}
A candidate must reference assessments for the same feedId, feedRevision, and exact target version. Selection may not silently mix assessments from different target revisions.
BriefingEdition stores exact immutable references:
selectedCandidateIds[]
eventVersionIds[]
storylineVersionIds[]
evidenceRevisionIds[]
No published edition depends on whichever Event/Evidence/Storyline object happens to be "current" later.
C10. Deletion, correction, and retained publication behavior
V1 freezes the following lifecycle:
1. Deleting a Feed immediately stops polling, acquisition, scoring, and future publication for that Feed.
2. Already published BriefingEditions remain immutable historical snapshots while they remain published.
3. Every EvidenceRevision, EventVersion, StorylineVersion, assessment, BriefingCandidate, Source identity, and provenance record referenced by a retained published edition remains retained while that edition remains published.
4. Raw HTML/browser artifacts may expire earlier if the retained EvidenceRevision and provenance remain sufficient to support the published edition.
5. An accepted source update does not rewrite an older edition. Claims affected by changed evidence are reassessed for future editions.
6. A confirmed correction while the Feed is active may appear in a later edition that links to or identifies the earlier edition being corrected.
7. Explicit authoritative deletion that wins C5 ordering creates an EvidenceTombstone, withdraws the affected evidence from future use, and triggers downstream reassessment. It does not by itself erase an already published historical snapshot. A delayed older UPSERT cannot resurrect the item; a genuinely newer UPSERT may supersede the tombstone only under the same ordering contract.
8. If policy/legal requirements require removing support for a published edition, withdraw the edition (or affected published claim) rather than leaving an unsupported edition published.
C11. Shared ownership boundary for parallel work
Connector/source lane owns:
- approved query/upstream identity;
- publisher identity and source-item key;
- enforceable query validation inputs;
- fetchRunId / FeedSource-scoped fetchStartSequence allocation;
- SourceObservation and CollectionCoverage;
- continuation and safe-checkpoint proposals;
- retries and explicit deletion evidence;
- emitting valid CandidateProposal records.
Candidate/downstream lane owns:
- IntakeReceipt resolution and CandidateItem identity;
- intake-time ordering plus post-acquisition atomic ordering recheck;
- EvidenceAcceptanceReceipt, EvidenceRevisionConflict, current ordering state, and EvidenceTombstone;
- AcquiredContent and immutable EvidenceRevision;
- evidence/claim reassessment;
- EventVersion/EventMembership and StorylineVersion;
- persisted assessment references and WindowScore;
- selection, grounding, publication, and retained-support behavior.
Both lanes share the exact contracts and fixtures below. Neither side may redefine revision ordering, checkpoint resolution, or publication retention independently.
C12. Shared acceptance fixtures
Fixture	Required outcome
Identical current content with a newer winning observation	No new EvidenceRevision or claim reassessment; current accepted observation/sequence/source-revision metadata advances so an older delayed observation cannot later win.
Content transition A -> B -> A	The final A creates a new EvidenceRevision because replay is defined against current content, not any historical hash.
Changed content with reliable older comparable source revision	Current newer accepted revision remains current.
Equal reliable comparable source revision with identical current content	Replay; no new EvidenceRevision; completion order is irrelevant.
Equal reliable comparable source revision with conflicting content/state	QUARANTINED_REVISION_CONFLICT; current canonical state is unchanged; durable authoritative recheck is required.
Equal fallback fetch-start sequence with conflicting content/state	QUARANTINED_REVISION_CONFLICT; completion/arrival order cannot choose the winner.
Changed content with no reliable revision on either side	Highest successfully accepted FeedSource fetch-start sequence becomes current; no claim that it proves newest source content.
Current revision is reliable/comparable but incoming observation is unversioned or incomparable	Incoming cannot replace current without an authoritative-current-state check; otherwise quarantine/recheck.
Earlier acquisition finishes after a later observation/result became current	Reapply ordering at evidence promotion; persist IGNORED_STALE_OBSERVATION; earlier result cannot update currentRevisionId or current ordering state.
Revision conflict becomes visible only after acquisition/extraction	Persist EvidenceAcceptanceReceipt(QUARANTINED_REVISION_CONFLICT) plus durable EvidenceRevisionConflict(PENDING_AUTHORITATIVE_RECHECK); current state is unchanged; checkpoint remains advanced if intake was already safely resolved.
Authoritative recheck resolves a quarantined revision conflict	Resolution is explicit and durable; either keep current state or let a later strictly ordered authoritative observation proceed under C5. The original conflicting completion is never selected merely because it finished last.
Higher sequence is allocated but fetch later fails	Earlier valid accepted observation remains current; allocation alone has no content effect.
Poll and refresh or alternative provider run concurrently	All use the same durable FeedSource sequence allocator and atomic acceptance rule.
Valid RSS excerpt / Telegram message / listing result	Accepted according to its declared representation; it is not mislabeled as a full article.
Less complete later representation	Cannot overwrite a richer accepted representation unless authoritative source state permits it.
Missing required query validation fields	QUARANTINED, checkpoint-unresolved.
Explicit query restriction violation	REJECTED, checkpoint-resolved.
Item absent from listing	No inferred deletion.
Explicit authoritative deletion evidence	DELETION_ACCEPTED; ordered tombstone created without an acquisition candidate; evidence withdrawn from future use and reassessment scheduled.
Delayed UPSERT older than current tombstone	IGNORED_STALE_OBSERVATION; item remains DELETED and is not resurrected.
Genuinely newer UPSERT after tombstone	May reactivate the item only if it wins the same C5 ordering contract; a new EvidenceRevision is created.
Failure before durable intake resolution	Checkpoint cannot advance past unresolved work.
Crash after any durable terminal intake outcome but before checkpoint advancement	Retry recovers without duplicate canonical effects or repeated tombstones/reassessments.
Downstream extraction/event/briefing failure after accepted intake	Checkpoint may remain advanced; durable downstream retry state recovers the work.
Partial collection with proven accepted contiguous cursor	Safe cursor progress allowed; continuation remains durable and collection coverage remains PARTIAL.
Published edition followed by accepted content update	Original exact EvidenceRevision/EventVersion/StorylineVersion references remain intact; future claims are reassessed.
Feed deleted after publication	Future collection stops; retained published editions and their exact support graph remain resolvable.


This Markdown file is the frozen v1 architecture baseline and shared contract source of truth for parallel implementation. The final acceptance semantics—including ordering advancement on identical content, A -> B -> A revision transitions, post-acquisition ordering recheck, ordered deletion tombstones, equal-order conflict quarantine, and durable post-acquisition conflict recheck—are normative. Equal ordering metadata is never resolved by completion or arrival order. It does not claim that the fixtures have already been implemented or passed.