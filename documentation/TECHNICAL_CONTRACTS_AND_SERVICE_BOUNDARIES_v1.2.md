# Distilled.news — Technical Contracts and Service Boundaries v1

**Status:** Frozen technical-contract baseline  
**Version:** 1.2  
**Depends on:** `ARCHITECTURE_BASELINE_v1.md`  
**Next artifact:** `IMPLEMENTATION_PLAN_v1.1.md`

**v1.1 change:** Adds feed-template, source-subscription, and canonical upstream-resource contracts while preserving all downstream frozen boundaries.

**v1.2 change:** Adds PWA/Web Push delivery contracts, notification preferences, push-subscription lifecycle, delivery jobs, deep-link semantics, and service-worker/client boundaries.

---

## 1. Purpose

This document defines the implementation contracts for Distilled.news.

It does **not** redefine the product or conceptual architecture.

It answers:

1. Which logical component owns each canonical object?
2. What object contracts cross component boundaries?
3. How does data move through the system?
4. What state is authoritative?
5. What must be versioned or immutable?
6. What are the checkpoint, queue, idempotency, provenance, and evaluation semantics?

### Architecture change policy

Once frozen, changes to these boundaries require a documented implementation, evaluation, reliability, scalability, security, or cost finding showing why the current contract is insufficient.

Implementation choices inside the boundaries do **not** require architectural review.

Examples of implementation-only changes:

- switching model vendor;
- replacing a queue implementation;
- changing an embedding model;
- changing a database index;
- tuning thresholds;
- changing a WebFetch provider.

---

# 2. Logical Services and Ownership

The following are **logical ownership boundaries**.

They do **not** imply independently deployed microservices.

A sensible FYP implementation may place them in one backend codebase with asynchronous workers where useful.

```text
distilled-backend/
├── feed_config/
├── source_feed/
├── connectors/
├── candidate_intake/
├── acquisition/
├── evidence/
├── intelligence/
├── personalization/
├── briefing/
├── delivery/
├── web_intelligence/
├── resource_control/
├── messaging/
├── storage/
└── evaluation/
```

---

## 3. Final Implementation Flow

```text
USER INTENT
        ↓
Intent Parsing
        ↓
Template Matcher
        ↓
FeedTemplate / Source Recommendation
        ↓
UserFeedSpec
        ↓
Source Subscription Resolver
        ↓
SourceSubscription
        ↓
UpstreamResource
        ↓
DISCOVERY CONNECTORS
RSS • GDELT • Web • Telegram • X • News APIs • Web Search
        ↓
CandidateProposal
        ↓
┌─────────────────────────────────┐
│ CANDIDATE INTAKE                │
│ canonicalize URL / source ID    │
│ cheap candidate dedup           │
│ candidate eligibility gate      │
└──────────────┬──────────────────┘
               ↓
          CandidateItem
               ↓
┌─────────────────────────────────┐
│ ACQUISITION                     │
│ adaptive route selection        │
│ supplied content                │
│ direct HTTP                     │
│ WebFetch provider               │
│ Zyte HTTP                       │
│ browser last resort             │
└──────────────┬──────────────────┘
               ↓
         AcquiredContent
               ↓
┌─────────────────────────────────┐
│ EVIDENCE                        │
│ normalize + provenance          │
│ content-hash exact dedup        │
│ EvidenceRoleDecision            │
│ semantic near-dedup             │
└──────────────┬──────────────────┘
               ↓
     NormalizedEvidenceItem
               ↓
┌─────────────────────────────────┐
│ NEWS INTELLIGENCE               │
│ EventMembership                 │
│ Event                           │
│ StorylineVersion                │
│ EventSalienceAssessment         │
│ corroboration                   │
│ change detection                │
└──────────────┬──────────────────┘
               ↓
      SharedWorldState(scope)
               ↓
┌─────────────────────────────────┐
│ PERSONALIZATION                 │
│ UserRelevance                   │
│ WindowScore                     │
│ event/storyline ranking         │
│ diversity / MMR                 │
│ briefing-budget constraints     │
└──────────────┬──────────────────┘
               ↓
       BriefingCandidate[]
               ↓
┌─────────────────────────────────┐
│ BOUNDED BRIEFING AGENT          │
│ inspect evidence / changes      │
│ coverage evaluation             │
│ optional Web Intelligence       │
│ grounded synthesis              │
└──────────────┬──────────────────┘
               ↓
        BriefingEdition
               ↓
┌─────────────────────────────────┐
│ DELIVERY                        │
│ in-app availability             │
│ notification policy             │
│ Web Push                        │
│ deep links                      │
└──────────────┬──────────────────┘
               ↓
             DELIVERY
```

Cross-cutting:

```text
Web Intelligence
Resource + Model Controller
SourceCheckpoint
Queue / idempotency semantics
Telemetry / evaluation
```

---

# 4. Canonical Ownership Rule

A component may read another component's canonical objects, but only the owning component may mutate canonical state.

| Object | Canonical owner |
|---|---|
| `FeedTemplate` | Feed Configuration / Source-Feed |
| `FeedTemplateVersion` | Feed Configuration / Source-Feed |
| `TemplateMatch` | Feed Configuration / Source-Feed |
| `UserFeedSpec` | Source / Feed |
| `SourceDefinition` | Source / Feed |
| `SourceSubscription` | Source / Connector infrastructure |
| `UpstreamResource` | Source / Connector infrastructure |
| `SourceCheckpoint` | Source / Connector infrastructure |
| `CandidateProposal` | Transient connector output |
| `CandidateItem` | Candidate Intake |
| `CandidateEligibilityDecision` | Candidate Intake |
| `AcquiredContent` | Acquisition |
| `AcquisitionRouteStats` | Resource / Acquisition telemetry |
| `NormalizedEvidenceItem` | Evidence |
| `EvidenceRoleDecision` | Evidence |
| `SemanticDuplicateDecision` | Evidence |
| `EventMembership` | News Intelligence |
| `Event` | News Intelligence |
| `StorylineVersion` | News Intelligence |
| `EventSalienceAssessment` | News Intelligence |
| `UserRelevance` | Personalization |
| `WindowScore` | Personalization |
| `BriefingCandidate` | Personalization |
| `CoverageGap` | Briefing / Coverage Evaluator |
| `BriefingEdition` | Briefing |
| `NotificationPreference` | Delivery |
| `PushSubscription` | Delivery |
| `DeliveryPolicyDecision` | Delivery |
| `DeliveryJob` | Delivery |
| `DeliveryAttempt` | Delivery / Messaging telemetry |
| `ModelExecutionRecord` | Resource / Model Controller |
| `PipelineMessage` metadata | Messaging infrastructure |

Only the owner writes canonical state.

---

# 5. Feed Configuration and Reuse Contracts

The feed-configuration layer is upstream of `CandidateProposal`.

It is responsible for reusing common feed configurations and resolving many user/feed references onto canonical source resources.

## 5.1 FeedTemplate

A `FeedTemplate` is a reusable starting configuration.

It is **not** the authoritative state of a user's feed and does **not** own ingestion.

```ts
interface FeedTemplate {
  id: string;

  name: string;
  visibility:
    | "public"
    | "organization"
    | "private";

  accessScope: string;

  currentVersion: number;

  createdAt: string;
  updatedAt: string;
}
```

## 5.2 FeedTemplateVersion

Template content is versioned.

```ts
interface FeedTemplateVersion {
  templateId: string;
  version: number;

  interests: FeedInterest[];
  geography?: string[];

  defaultSourceIds: string[];
  desiredSourceCategories?: string[];

  discoveryPolicy?: DiscoveryPolicy;

  supportedEvidenceLanguages?: string[];

  createdAt: string;
}
```

A new template version must not silently mutate existing `UserFeedSpec` objects.

## 5.3 TemplateMatch

Template matching is primarily retrieval/ranking, not necessarily agentic reasoning.

```ts
interface TemplateMatch {
  id: string;

  requestFingerprint: string;
  templateId: string;
  templateVersion: number;

  similarityScore: number;

  topicMatch?: number;
  geographyMatch?: number;
  languageCompatibility?: number;

  method:
    | "structured"
    | "embedding"
    | "hybrid";

  createdAt: string;
}
```

A user request with no adequate match proceeds to ordinary feed construction and, where useful, bounded source recommendation.

## 5.4 UserFeedSpec

`UserFeedSpec` is the authoritative user-owned configuration.

```ts
interface UserFeedSpec {
  id: string;
  userId: string;

  baseTemplateId?: string;
  baseTemplateVersion?: number;

  interests: FeedInterest[];

  addedSourceIds: string[];
  excludedSourceIds: string[];

  evidenceLanguages?: string[];
  outputLanguage: string;

  briefingFrequency:
    | "30m"
    | "hourly"
    | "daily"
    | "weekly";

  personalization: UserFeedPreferences;

  createdAt: string;
  updatedAt: string;
}
```

Important:

```text
outputLanguage = "en"
```

does **not** imply:

```text
evidenceLanguages = ["en"]
```

unless the user explicitly requests that evidence-language restriction.

## 5.5 SourceSubscription

`SourceSubscription` represents a feed/user request to follow a canonical source resource.

It is separate from the resource that is actually polled or fetched.

```ts
interface SourceSubscription {
  id: string;

  userFeedId: string;
  sourceId: string;
  upstreamResourceId: string;

  accessScope: string;

  enabled: boolean;

  createdAt: string;
  updatedAt: string;
}
```

Many `SourceSubscription` objects may reference the same public `UpstreamResource`.

## 5.6 UpstreamResource

`UpstreamResource` is the canonical technical resource actually monitored by a connector.

Examples:

- one RSS URL;
- one Telegram channel;
- one X account;
- one website section;
- one API/query resource.

```ts
interface UpstreamResource {
  id: string;

  sourceId: string;
  connectorType: string;

  canonicalLocator: string;

  accessScope: string;

  credentialScopeId?: string;

  active: boolean;

  createdAt: string;
  updatedAt: string;
}
```

Key invariant:

> Public source acquisition is deduplicated by canonical upstream-resource identity and access scope, regardless of how many templates or user feeds reference the source.

For private/customer-authorized resources, sharing is allowed only inside the same authorization scope.

## 5.7 Source Subscription Resolver

Conceptual responsibility:

```text
UserFeedSpec
      ↓
source references / defaults / overrides
      ↓
Source Subscription Resolver
      ↓
SourceSubscription[]
      ↓
resolve/reuse UpstreamResource
      ↓
connector scheduling
```

The resolver must not create duplicate public polling jobs merely because multiple users independently created similar feeds.

## 5.8 Source Recommendation Agent

The Source Recommendation Agent is bounded and optional.

It is most useful when no suitable template exists or when an existing feed lacks useful source categories.

Allowed behavior:

1. inspect known source catalog;
2. inspect current template/feed coverage;
3. identify missing source roles/categories;
4. search the web if necessary;
5. propose concrete source URLs/accounts/channels;
6. pass them through deterministic verification;
7. return verified recommendations to the user.

Invariant:

```text
AI recommends
→ Distilled verifies
→ user chooses
```

Template promotion must be scope-aware. Private user source configurations may not be promoted into public templates unless independently eligible for public reuse.

---

# 6. CandidateProposal

A connector does not create canonical candidates directly.

It emits a transient proposal.

```ts
interface CandidateProposal {
  connectorType: string;
  sourceId: string;

  upstreamId?: string;
  url?: string;

  titleHint?: string;
  publishedAtHint?: string;
  languageHint?: string;

  // Only if available without another fetch.
  payloadHash?: string;

  discoveredAt: string;

  discovery: {
    provider: string;
    runId: string;
    queryId?: string;
  };
}
```

Examples:

```text
RSS connector sees a new feed entry
→ CandidateProposal

GDELT returns a URL
→ CandidateProposal

Telegram sees message_id=4512
→ CandidateProposal

X connector sees a post
→ CandidateProposal

Web Intelligence finds a new URL
→ CandidateProposal
```

---

# 7. Candidate Intake

Candidate Intake turns connector output into canonical accepted candidates.

Processing:

```text
CandidateProposal
      ↓
validate
      ↓
canonicalize URL / source identity
      ↓
cheap candidate dedup
      ↓
candidate eligibility gate
      ↓
CandidateItem
```

---

## 7.1 Cheap candidate deduplication

Use only information already available without another fetch:

- canonical URL;
- upstream/platform ID;
- feed/API identifier;
- payload/upstream hash when already supplied.

Purpose:

> Do not spend acquisition cost on something already known.

---

## 7.2 Candidate Eligibility Gate

The gate answers:

> **Is this candidate worth acquiring?**

It does **not** answer:

- Is the claim true?
- Is this event confirmed?
- Should this appear in the final briefing?

Those belong downstream.

### Explicit followed sources

Policy is permissive.

Typical checks:

```text
valid?
fresh?
supported?
duplicate?
→ usually acquire
```

### Automatic discovery

Policy is stricter.

Typical checks:

```text
topic match?
entity match?
geography match?
language match?
fresh enough?
confidence sufficient?
→ acquire only if worthwhile
```

### Preferred decision cascade

```text
deterministic rules
→ metadata/entity matching
→ embedding / lightweight classifier
→ small LLM only when ambiguous
```

A large expensive model should not be the default candidate gate.

---

# 8. CandidateEligibilityDecision

Eligibility should be explicit and auditable.

```ts
interface CandidateEligibilityDecision {
  id: string;
  proposalFingerprint: string;

  accepted: boolean;
  reasonCodes: string[];

  policyVersion: string;

  method:
    | "rules"
    | "metadata_match"
    | "embedding"
    | "classifier"
    | "llm";

  confidence?: number;

  modelVersion?: string;

  decidedAt: string;
}
```

---

# 9. CandidateItem

Canonical accepted candidate.

```ts
interface CandidateItem {
  id: string;
  accessScope: string;

  connectorType: string;
  sourceId: string;

  upstreamId?: string;
  canonicalCandidateUrl?: string;

  titleHint?: string;
  publishedAtHint?: string;
  languageHint?: string;

  payloadHash?: string;

  discoveredAt: string;

  eligibilityDecisionId: string;

  discovery: {
    provider: string;
    runId: string;
    queryId?: string;
  };
}
```

---

# 10. Acquisition Router

The Acquisition Router receives a known candidate and chooses how to obtain usable content.

It should not permanently hard-code a universal fallback chain after direct HTTP.

Possible routes:

```text
supplied_payload
platform_api
direct_http
web_fetch
zyte_http
browser
future managed extractor
```

Routing inputs may include:

- domain/source;
- recent route success;
- extraction completeness;
- latency;
- cost;
- deadline;
- source priority;
- resource pressure;
- provider availability;
- provider limits.

The router asks:

> **What is the cheapest sufficiently reliable acquisition route for this candidate right now?**

Browser rendering remains the expensive last resort.

---

# 11. AcquisitionRouteStats

Adaptive routing must use measured telemetry.

```ts
interface AcquisitionRouteStats {
  domainOrSourceId: string;

  route:
    | "supplied_payload"
    | "platform_api"
    | "direct_http"
    | "web_fetch"
    | "zyte_http"
    | "browser";

  successRate: number;
  completenessRate: number;

  p50LatencyMs: number;
  p95LatencyMs: number;

  estimatedCostPerRequest: number;

  sampleCount: number;
  updatedAt: string;
}
```

A transport-level HTTP 200 does not necessarily mean successful acquisition.

Success should distinguish:

```text
transport success
extraction success
content completeness
freshness
latency
cost
```

---

# 12. AcquiredContent

Represents a successful acquisition result.

```ts
interface AcquiredContent {
  id: string;
  candidateId: string;

  resolvedUrl?: string;

  title?: string;
  text?: string;

  publishedAt?: string;
  author?: string;

  acquisitionMethod:
    | "supplied_payload"
    | "platform_api"
    | "direct_http"
    | "web_fetch"
    | "zyte_http"
    | "browser";

  acquisitionProvider?: string;

  rawPayloadRef?: string;

  acquiredAt: string;

  quality: {
    transportSuccess: boolean;
    extractionSuccess: boolean;
    extractionComplete: boolean;
    confidence?: number;
  };
}
```

### Mandatory source/provider distinction

Example:

```text
publisher/source       = Reuters
acquisitionMethod      = web_fetch
acquisitionProvider    = Anthropic
```

Anthropic retrieved Reuters.

Anthropic did not become the evidence source.

---

# 13. NormalizedEvidenceItem

Canonical normalized evidence.

```ts
interface NormalizedEvidenceItem {
  id: string;

  sourceId: string;
  canonicalUrl?: string;

  title: string;
  body: string;

  language: string;

  publishedAt?: string;
  firstSeenAt: string;

  contentHash: string;

  provenance: {
    candidateId: string;
    acquiredContentId: string;

    originalUrl?: string;

    acquisitionMethod: string;
    acquisitionProvider?: string;
  };

  accessScope: string;
}
```

Processing:

```text
AcquiredContent
      ↓
normalize + provenance
      ↓
content-hash exact dedup
      ↓
EvidenceRoleDecision
      ↓
semantic near-duplicate detection
      ↓
eligible evidence
```

---

# 14. Exact vs Semantic Deduplication

### Before acquisition

Cheap identity dedup:

```text
canonical URL
upstream/platform ID
feed/API identifier
available payload hash
```

### After acquisition

Exact normalized body identity:

```text
normalized content hash
```

### Later

Semantic near-duplicate detection handles:

- syndicated variants;
- slightly modified titles;
- formatting differences;
- minor body edits;
- republishing.

### Critical invariant

Duplicate article ≠ same event.

Example:

```text
Reuters article
BBC article
Al Jazeera article
        ↓
three evidence items
        ↓
one inferred event
```

Independent evidence must remain separate for corroboration.

---

# 15. SemanticDuplicateDecision

Semantic dedup decisions should be auditable.

```ts
interface SemanticDuplicateDecision {
  id: string;

  evidenceId: string;
  comparedEvidenceId: string;

  isDuplicate: boolean;
  confidence: number;

  method:
    | "embedding"
    | "hybrid"
    | "classifier"
    | "llm_adjudication";

  modelVersion?: string;
  policyVersion: string;

  createdAt: string;
}
```

---

# 16. Evidence Roles

Do not use a simple boolean `news=true/false`.

```ts
type EvidenceRole =
  | "PRIMARY_DEVELOPMENT"
  | "REPORTED_DEVELOPMENT"
  | "OFFICIAL_STATEMENT"
  | "INVESTIGATIVE_REPORT"
  | "ANALYSIS"
  | "OPINION"
  | "PROMOTION"
  | "UNVERIFIED_LEAD"
  | "NOISE";
```

Typical routing:

```text
PRIMARY_DEVELOPMENT
REPORTED_DEVELOPMENT
OFFICIAL_STATEMENT
INVESTIGATIVE_REPORT
        ↓
potentially event eligible

ANALYSIS / OPINION
        ↓
usually contextual evidence

UNVERIFIED_LEAD
        ↓
may trigger corroboration/discovery
but is not presented as established fact

PROMOTION / NOISE
        ↓
normally excluded
```

---

# 17. EvidenceRoleDecision

Role is versioned/auditable rather than destructively overwritten.

```ts
interface EvidenceRoleDecision {
  id: string;
  evidenceId: string;

  role: EvidenceRole;
  confidence: number;

  modelVersion: string;
  policyVersion: string;

  createdAt: string;
}
```

This allows:

```text
classifier v1 → ANALYSIS
classifier v3 → INVESTIGATIVE_REPORT
```

without losing the earlier decision.

---

# 18. EventMembership

The evidence-to-event relation is canonical in `EventMembership`.

Do **not** duplicate the same relationship canonically inside `Event.evidenceIds`.

```ts
interface EventMembership {
  id: string;

  evidenceId: string;
  eventId: string;

  confidence: number;

  decision:
    | "attached"
    | "new_event"
    | "reassigned";

  algorithmVersion: string;

  createdAt: string;
}
```

Relationship:

```text
NormalizedEvidenceItem
        ↑
 EventMembership
        ↓
       Event
```

Derived/materialized counts are allowed for performance, but they are not canonical.

---

# 19. Event

Represents one relatively bounded inferred real-world development.

Examples:

- government approves a budget;
- earthquake occurs;
- company announces acquisition;
- ceasefire proposal accepted.

```ts
interface Event {
  id: string;
  accessScope: string;

  entities: string[];
  eventType?: string;

  currentState: string;

  firstObservedAt: string;
  lastUpdatedAt: string;

  corroboration: {
    independentSourceCount: number;
    confidence: number;
  };
}
```

---

# 20. Corroboration

Corroboration must operate on independent evidence/source identity.

Do not count:

```text
same Reuters article via RSS
+
same Reuters article via GDELT
```

as two sources.

Do count distinct independent evidence such as:

```text
Reuters
BBC
official ministry statement
```

when appropriate.

---

# 21. Event ≠ Storyline

Event:

```text
A bounded development
```

Storyline:

```text
A longer-lived evolving sequence of related events
```

Example:

```text
Event 1: negotiations begin
        ↓
Event 2: proposal rejected
        ↓
Event 3: talks collapse
        ↓
Event 4: revised proposal
        ↓
Event 5: agreement reached
        ↓
ONE STORYLINE
```

Never collapse Event and Storyline into one object.

---

# 22. StorylineVersion

Storyline state is immutable/versioned.

```ts
interface StorylineVersion {
  storylineId: string;
  version: number;

  accessScope: string;
  algorithmVersion: string;

  eventIds: string[];

  entities: string[];

  chronology: TimelineEntry[];

  supportedFacts: SupportedFact[];

  previousState?: string;
  currentState: string;

  turningPoints: TurningPoint[];

  confidence: number;

  createdAt: string;
}
```

Update behavior:

```text
Storyline 42 v17
       ↓
new evidence
       ↓
re-evaluation
       ↓
Storyline 42 v18
```

Never destructively overwrite v17.

---

# 23. SharedWorldState(scope)

Use:

```text
SharedWorldState(accessScope)
```

not one unrestricted global namespace.

Examples:

```text
public Reuters evidence
      ↓
PUBLIC scope
      ↓
shared across eligible users
```

versus:

```text
private enterprise feed
      ↓
CUSTOMER_X
      ↓
shared only within CUSTOMER_X
```

The purpose is to share expensive intelligence safely.

---

# 24. EventSalienceAssessment

Do not store a mutable final salience value directly inside Event.

```ts
interface EventSalienceAssessment {
  id: string;
  eventId: string;

  impact: number;
  novelty: number;
  changeMagnitude: number;
  institutionalSignificance: number;
  corroboration: number;
  persistence: number;
  recency: number;

  modelVersion: string;
  featureVersion: string;

  assessedAt: string;
}
```

The effective current salience is the latest valid assessment under the active policy/model.

---

# 25. IntelligenceTarget

Personalization must support both events and storylines.

```ts
type IntelligenceTarget =
  | {
      type: "event";
      id: string;
    }
  | {
      type: "storyline";
      id: string;
      version?: number;
    };
```

Typical behavior:

```text
30m
→ mostly events/recent changes

daily
→ events + active storylines

weekly
→ mostly storyline evolution
```

---

# 26. UserRelevance

Per-user only.

```ts
interface UserRelevance {
  id: string;

  userId: string;
  target: IntelligenceTarget;

  topicMatch: number;
  geographyMatch: number;
  entityMatch: number;
  sourcePreference: number;
  languageFit: number;

  modelVersion?: string;
  featureVersion?: string;

  assessedAt: string;
}
```

No user-specific features belong in shared event salience.

---

# 27. WindowScore

Window-specific reasoning.

```ts
interface WindowScore {
  id: string;

  target: IntelligenceTarget;

  window:
    | "30m"
    | "hourly"
    | "daily"
    | "weekly";

  score: number;
  reasons: string[];

  policyVersion: string;

  assessedAt: string;
}
```

Reasoning objectives:

```text
30m
→ What meaningfully changed?

hourly
→ What new developments require attention?

daily
→ What actually mattered today?

weekly
→ Which important storylines evolved and what were the turning points?
```

Weekly is not daily multiplied by seven.

---

# 28. BriefingCandidate

Represents an event/storyline that survived ranking into the briefing candidate set.

```ts
interface BriefingCandidate {
  id: string;

  userId: string;
  feedId: string;

  target: IntelligenceTarget;

  salienceAssessmentId?: string;
  userRelevanceId: string;
  windowScoreId: string;

  initialScore: number;

  rankingReasons: string[];

  createdAt: string;
}
```

---

# 29. Briefing Selection

Final selection is **not** a single permanent arithmetic score.

Use:

```text
rank(
  EventSalience,
  UserRelevance,
  WindowScore
)
      ↓
diversity / MMR reranking
      ↓
briefing-budget constraints
      ↓
selected candidates
```

Possible constraints:

- max stories;
- target reading time;
- topic diversity;
- storyline diversity;
- source diversity;
- max evidence inspections;
- max Web Intelligence calls;
- max tokens;
- max monetary cost;
- publication deadline.

---

# 30. CoverageGap

Coverage triggers must be explicit and measurable.

```ts
interface CoverageGap {
  id: string;

  feedId?: string;

  targetFacet: string;

  type:
    | "COVERAGE_GAP"
    | "CORROBORATION_GAP"
    | "SOURCE_HEALTH_GAP";

  reasonCode: string;
  confidence: number;

  windowStart: string;
  windowEnd: string;

  createdAt: string;
}
```

Examples:

```text
targetFacet:
"Lebanon healthcare"

reasonCode:
"healthy_sources_but_no_qualifying_evidence"
```

or:

```text
reasonCode:
"three_expected_sources_stale"
```

Web Intelligence should not trigger merely because an agent “feels the briefing is empty.”

---

# 31. BriefingEdition

A published briefing must be reproducible enough for evaluation and debugging.

```ts
interface BriefingEdition {
  id: string;

  userId: string;
  feedId: string;

  windowStart: string;
  windowEnd: string;

  language: string;

  selectedCandidates: string[];

  storylineVersions: {
    storylineId: string;
    version: number;
  }[];

  evidenceIds: string[];

  stories: BriefingStory[];

  generation: {
    model: string;
    promptVersion: string;
    routerVersion: string;

    tokensIn: number;
    tokensOut: number;

    cost: number;
    latencyMs: number;

    webIntelligenceCalls: number;
  };

  createdAt: string;
}
```

The system should later answer:

> Why did briefing B42 include X but omit Y?

---

# 32. PWA / Delivery Contracts

The primary client is a responsive installable PWA with Web Push support.

The delivery subsystem begins **after** canonical briefing generation.

```text
BriefingEdition
      ↓
DeliveryPolicyDecision
      ↓
DeliveryJob
      ├── in_app
      └── web_push
              ↓
        PushSubscription
              ↓
          user device
```

Push delivery is not canonical content. A failed push must not affect the existence or correctness of the underlying `BriefingEdition`.

## 32.1 NotificationPreference

```ts
interface NotificationPreference {
  id: string;

  userId: string;
  feedId?: string;

  briefingReady: boolean;
  meaningfulChanges: boolean;

  quietHours?: {
    start: string;
    end: string;
  };

  timezone: string;

  createdAt: string;
  updatedAt: string;
}
```

Rules:

- `briefingReady` controls scheduled briefing-ready pushes.
- `meaningfulChanges` is opt-in and may be feed-specific.
- Notification preferences are user-owned settings.
- Quiet-hour evaluation uses the user's configured timezone.

## 32.2 PushSubscription

Browser-generated Web Push subscription state.

```ts
interface PushSubscription {
  id: string;

  userId: string;

  endpoint: string;
  p256dh: string;
  auth: string;

  userAgent?: string;

  createdAt: string;
  lastSeenAt?: string;

  enabled: boolean;
}
```

The push endpoint and encryption material are sensitive capability data and must be stored securely.

A user may have multiple active push subscriptions across devices/browsers.

## 32.3 DeliveryPolicyDecision

Determines whether a canonical product event should result in a user-facing notification.

```ts
interface DeliveryPolicyDecision {
  id: string;

  userId: string;
  feedId?: string;

  triggerType:
    | "BRIEFING_READY"
    | "MEANINGFUL_CHANGE";

  briefingEditionId?: string;
  intelligenceTarget?: IntelligenceTarget;

  shouldNotify: boolean;
  reasonCodes: string[];

  policyVersion: string;

  decidedAt: string;
}
```

The policy must never equate:

```text
new article/post
=
push notification
```

The initial notification unit is:

```text
scheduled briefing
or
meaningful development
```

## 32.4 DeliveryJob

```ts
interface DeliveryJob {
  id: string;

  userId: string;

  briefingEditionId?: string;
  intelligenceTarget?: IntelligenceTarget;

  channel:
    | "in_app"
    | "web_push";

  deepLink: string;

  scheduledAt: string;

  status:
    | "pending"
    | "sent"
    | "failed"
    | "cancelled";

  attempts: number;

  idempotencyKey: string;

  createdAt: string;
  updatedAt: string;
}
```

Example idempotency keys:

```text
push:briefing:{userId}:{briefingEditionId}
push:meaningful-change:{userId}:{targetId}:{changeVersion}
```

## 32.5 DeliveryAttempt

```ts
interface DeliveryAttempt {
  id: string;
  deliveryJobId: string;

  provider: string;

  attemptedAt: string;

  success: boolean;
  statusCode?: number;
  errorCode?: string;

  latencyMs?: number;
}
```

Expired/invalid subscriptions should be disabled after provider-confirmed terminal errors.

## 32.6 Service Worker Boundary

The service worker is a client/runtime boundary, not a source of canonical product state.

Responsibilities:

```text
receive Web Push
display notification
handle notification click
open/focus PWA
deep-link to intended route
```

It does not:

```text
generate briefings
decide event truth
mutate event/storyline state
own user preferences
```

## 32.7 PWA Installability Contract

The web client should provide:

```text
Web App Manifest
stable app identity
standalone display mode where supported
icons
service worker
HTTPS deployment
```

Installation prompting is a UX concern and should be contextual rather than immediate.

## 32.8 Notification Permission Rule

The client must request notification permission only after explicit user intent, for example:

```text
user enables "Notify me when briefing is ready"
or
user accepts a contextual notification prompt after creating a feed
```

Do not request notification permission on first anonymous page load.

## 32.9 Deep-Link Semantics

Scheduled briefing:

```text
BRIEFING_READY
→ /briefings/{briefingEditionId}
```

Meaningful change:

```text
MEANINGFUL_CHANGE
→ relevant feed/storyline/briefing route
```

If the exact resource cannot be opened, fall back to the relevant feed/home state without losing the notification context.

## 32.10 Delivery Reliability

Delivery uses the same general messaging rule:

```text
at-least-once execution
+
idempotent delivery jobs
```

Retry only transient failures.

Permanent push-subscription failures should disable the affected subscription.

A failed push must not block briefing publication.

---

# 33. Web Intelligence Contracts

Web Intelligence has two distinct boundaries.

---

## 33.1 Discovery

```ts
interface WebDiscoveryProvider {
  search(
    query: DiscoveryQuery,
    limits: DiscoveryLimits
  ): Promise<DiscoveryCandidate[]>;
}
```

Used for:

- coverage gaps;
- corroboration gaps;
- source discovery.

Flow:

```text
Web search
   ↓
new URL / source
   ↓
CandidateProposal
   ↓
Candidate Intake
```

---

## 33.2 Fetch fallback

```ts
interface WebFetchProvider {
  fetchUrl(
    url: string,
    options: FetchOptions
  ): Promise<AcquiredContent>;
}
```

Used when:

```text
CandidateItem already exists
+
ordinary extraction failed / is inefficient
```

Flow:

```text
CandidateItem
   ↓
Acquisition Router
   ↓
WebFetchProvider
   ↓
AcquiredContent
```

No loop back to CandidateProposal.

Providers implement only capabilities they actually support.

---

# 34. SourceCheckpoint

Incremental connectors need first-class durable checkpoint state.

```ts
interface SourceCheckpoint {
  sourceId: string;
  connectorType: string;

  cursorType:
    | "message_id"
    | "post_id"
    | "etag"
    | "last_modified"
    | "provider_cursor"
    | "watermark";

  cursorValue: string;

  committedAt: string;
  connectorVersion: string;
}
```

Critical invariant:

```text
fetch
↓
persist accepted work
↓
durable commit
↓
advance checkpoint
```

Never:

```text
fetch
↓
advance checkpoint
↓
persistence fails
```

Otherwise Distilled can silently lose news.

---

# 35. Queue Semantics

Use:

> **durable at-least-once delivery + idempotent consumers**

Do not attempt to guarantee magical exactly-once transport.

```ts
interface PipelineMessage<T> {
  messageId: string;
  idempotencyKey: string;

  type: string;
  payload: T;

  attempt: number;

  correlationId: string;
  createdAt: string;
}
```

Example idempotency keys:

```text
candidate:{candidateId}
acquire:{candidateId}:{policyVersion}
evidence:{acquiredContentId}
event-update:{evidenceId}:{algorithmVersion}
briefing:{userId}:{feedId}:{windowEnd}
```

---

# 36. Logical Queue Topology

Pipeline:

```text
candidate.proposed
        ↓
candidate.accepted
        ↓
acquisition.requested
        ↓
content.acquired
        ↓
evidence.normalized
        ↓
evidence.ready
        ↓
event.update.requested
        ↓
event.updated
        ↓
storyline.updated
```

Briefing:

```text
briefing.requested
        ↓
candidate.selection
        ↓
coverage.evaluation
        ↓
optional Web Intelligence
        ↓
briefing.synthesis
        ↓
briefing.ready
```

Failures:

```text
*.retry
*.dead_letter
```

Queue technology is an implementation decision.

Possible FYP choices:

- Redis Streams;
- RabbitMQ;
- database-backed queue;
- SQS-equivalent.

The contracts matter more than the broker brand.

---

# 37. Source / Connector Responsibilities

Every connector must conceptually support:

```text
fetch since checkpoint
emit CandidateProposal
record health/telemetry
persist accepted work
advance checkpoint after durable commit
handle retries / rate limits
```

Platform-specific connectors remain specialized.

Examples:

### Telegram

```text
MTProto / Telethon
message ID cursor
edits/deletions handled explicitly
```

### X

```text
provider abstraction
upstream post ID/cursor
provider-specific implementation hidden
```

### RSS

```text
GUID
ETag
Last-Modified
feed URL
```

### Website

```text
URL/hash + watermark
```

---

# 38. Model Capability Contracts

Freeze capabilities, not vendor names.

```text
EmbeddingModel
EvidenceRoleClassifier
SemanticDuplicateModel
EventAssignmentModel
StorylineUpdateModel
SalienceEstimator
RelevanceModel
BriefingSynthesisModel
WebDiscoveryProvider
WebFetchProvider
```

The Resource/Model Router chooses:

```text
task
+
difficulty
+
budget
+
deadline
        ↓
implementation
```

Implementation may be:

- deterministic;
- OpenAI;
- Anthropic;
- self-hosted;
- another provider;
- fine-tuned/local model.

---

# 39. ModelExecutionRecord

Every model execution used in important pipeline decisions should be observable.

```ts
interface ModelExecutionRecord {
  id: string;

  taskType: string;
  modelProvider: string;
  modelName: string;
  modelVersion?: string;

  promptVersion?: string;

  tokensIn?: number;
  tokensOut?: number;

  estimatedCost?: number;
  latencyMs: number;

  inputObjectIds: string[];
  outputObjectIds: string[];

  correlationId: string;

  executedAt: string;
}
```

---

# 40. Resource + Model Controller

Cross-cutting responsibility.

Inputs:

```text
API spend
model spend
queue depth
provider limits
acquisition route stats
cache hit rate
deadline proximity
CPU/GPU load
```

Outputs may include:

```text
model route
acquisition route
polling cadence
Web Intelligence budget
browser permission
briefing budget
```

Initial controller should be deterministic/rule-based.

Example:

```text
if queue depth high:
    reduce optional discovery

if spend threshold exceeded:
    lower Web Intelligence budget

if domain direct-HTTP success < threshold:
    choose alternative route

if deadline near:
    freeze optional exploration
    protect synthesis capacity
```

---

# 41. Storage Baseline

Keep the initial architecture deliberately simple.

```text
PostgreSQL
├ users
├ feeds
├ source_definitions
├ source_checkpoints
├ candidates
├ acquired_content_metadata
├ normalized_evidence
├ evidence_role_decisions
├ semantic_duplicate_decisions
├ event_memberships
├ events
├ storyline_versions
├ event_salience_assessments
├ user_relevance
├ window_scores
├ briefing_candidates
├ coverage_gaps
├ briefing_editions
├ notification_preferences
├ push_subscriptions
├ delivery_policy_decisions
├ delivery_jobs
├ delivery_attempts
├ provider_usage
├ acquisition_route_stats
├ model_execution_records
└ evaluation_metadata
```

Object storage:

```text
raw HTML
raw API responses
raw Telegram/X payloads
large artifacts/media
```

Vector capability:

```text
PostgreSQL + pgvector initially
```

Use for:

- evidence embeddings;
- semantic duplicate search;
- event-assignment retrieval;
- storyline retrieval.

Do not begin with unnecessary infrastructure sprawl.

---

# 42. Raw Payload Retention

Persisting canonical evidence does not require retaining every raw payload forever.

Possible policy categories:

```text
raw HTML/API payload
→ configurable TTL

normalized evidence
→ durable as needed

storyline versions
→ durable for reproducibility

briefing provenance
→ durable enough for evaluation

embeddings/cache
→ rebuildable/replaceable
```

Exact TTL values are implementation configuration.

---

# 43. Evaluation Interfaces

Before sophisticated AI implementation, create a frozen replay/evaluation corpus.

At minimum include:

```text
exact duplicate / non-duplicate pairs
semantic near-duplicates
same-event / different-event pairs
gold event clusters
storyline memberships
evidence-role labels
turning points
daily important-event labels
weekly important-storyline labels
supporting evidence
```

Every significant algorithm/model change should run against the same benchmark.

---

# 44. Required Provenance for AI Decisions

Important intermediate decisions should remain auditable.

### Candidate eligibility

```text
policy version
method
reason codes
confidence
model version if used
```

### Evidence role

```text
role
confidence
model version
policy version
```

### Semantic duplicate decision

```text
comparison target
confidence
method
model/policy version
```

### Event membership

```text
event ID
confidence
decision
algorithm version
```

### Salience

```text
feature values
model version
feature version
```

### Storyline update

```text
previous version
new version
event IDs
algorithm version
```

### Briefing selection

```text
candidate rank
reasons
diversity action
budget action
selected/omitted
```

---

# 45. Service Boundary ≠ Microservice

This document defines:

- canonical ownership;
- data contracts;
- responsibility boundaries.

It does **not** require:

```text
one service = one deployment
```

A practical FYP implementation may use one backend with modular packages and a small number of worker processes.

The project should avoid distributed-systems complexity until the news intelligence works and measurements justify additional separation.

---

# 46. Parallel Workstreams

The contracts are designed so work can proceed independently.

### Feed Configuration / Source Reuse

```text
FeedTemplate
FeedTemplateVersion
TemplateMatch
UserFeedSpec
SourceSubscription
UpstreamResource
Source Subscription Resolver
Source Recommendation Agent
```

### Acquisition

```text
connectors
CandidateProposal
CandidateItem
AcquiredContent
SourceCheckpoint
AcquisitionRouteStats
```

### Evidence + Intelligence

```text
NormalizedEvidenceItem
EvidenceRoleDecision
SemanticDuplicateDecision
EventMembership
Event
StorylineVersion
EventSalienceAssessment
```

### Personalization + Briefing

```text
UserRelevance
WindowScore
BriefingCandidate
CoverageGap
BriefingEdition
bounded briefing agent
```

### Delivery / PWA

```text
NotificationPreference
PushSubscription
DeliveryPolicyDecision
DeliveryJob
DeliveryAttempt
service worker
manifest/installability
deep-link behavior
```

### Frontend

Consumes stable briefing/feed/storyline APIs without depending on connector implementation.

### Evaluation / resource

```text
frozen corpus
metrics
cost telemetry
model execution
load tests
resource-controller policy
```

---

# 47. Contract Invariants

These are non-negotiable unless a concrete finding justifies change.

0. The primary client is a responsive installable PWA.
0. Web Push is opt-in and uses explicit notification preferences.
0. Scheduled briefing-ready pushes and explicitly enabled meaningful-change alerts are the initial notification types.
0. Raw evidence arrival never directly implies a push notification.
0. Push delivery failure never blocks or invalidates canonical briefing publication.
0. Service-worker state is not canonical product state.
0. Delivery jobs are idempotent and retry only transient failures.
0. `FeedTemplate` is reusable starting configuration; `UserFeedSpec` is authoritative user-owned configuration.
0. Template versions do not silently mutate existing user feeds.
0. Output language and evidence-language constraints are separate.
0. `SourceSubscription` and `UpstreamResource` are distinct; many subscriptions may reference one canonical public upstream resource.
0. Public acquisition is shared by canonical upstream-resource identity within the permitted access scope, independent of template reuse.
0. Private/customer-authorized resources are never promoted or shared outside their authorization scope.
1. Connectors emit `CandidateProposal`; Candidate Intake owns canonical `CandidateItem`.
2. Candidate eligibility happens before expensive acquisition.
3. Candidate eligibility asks “worth fetching?”, not “is this true?”.
4. Cheap candidate deduplication happens before acquisition.
5. `CandidateItem` and `AcquiredContent` are distinct.
6. Provider-mediated fetch of an existing URL returns `AcquiredContent`.
7. Newly discovered Web Intelligence URLs enter as `CandidateProposal`.
8. Source identity and acquisition provider are distinct.
9. Content-hash dedup occurs after acquisition/normalization.
10. Semantic near-dedup is distinct from event clustering.
11. Independent evidence about the same event is preserved.
12. `EventMembership` is the canonical evidence-to-event relation.
13. Evidence role decisions are versioned/auditable.
14. Event salience assessments are versioned/auditable.
15. Storyline state is immutable/versioned.
16. Shared state is access-scoped.
17. User relevance is separate from global salience.
18. Window reasoning may target either events or storylines.
19. Final briefing selection applies diversity and budget constraints after ranking.
20. `CoverageGap` must have explicit reason codes.
21. Source checkpoints advance only after durable persistence.
22. Messaging assumes at-least-once delivery with idempotent consumers.
23. AI decisions retain model/policy/version provenance.
24. Briefing editions retain enough provenance for later explanation.
25. Logical service boundaries do not imply microservices.
26. Provider-specific implementations remain replaceable.
27. Evaluation data exists before sophisticated AI optimization.

---

# 48. Architecture / Contract Governance

Any future proposal to change:

```text
object boundaries
canonical ownership
pipeline ordering
Web Intelligence boundaries
shared-vs-user-specific state
checkpoint semantics
queue/idempotency semantics
```

must document:

```text
Observed problem:
Evidence:
Affected invariant:
Proposed change:
Alternatives considered:
Migration impact:
Evaluation showing improvement:
```

Implementation choices within the frozen boundaries do not require contract redesign.

---

# 49. Freeze Status

With the above definitions, this document is ready to freeze as:

**`TECHNICAL_CONTRACTS_AND_SERVICE_BOUNDARIES_v1.md`**

The next artifact is:

**`IMPLEMENTATION_PLAN_v1.md`**

Implementation should begin with:

```text
Milestone 0
Frozen replay/evaluation dataset

then

CandidateProposal
→ Candidate Intake
→ CandidateItem
→ first vertical slice
```

The design process should now shift from paper refinement to measured implementation evidence.