# Distilled.news — Architecture Baseline v1

**Status:** Frozen conceptual architecture  
**Version:** 1.2  
**Purpose:** Technical baseline for implementation, evaluation, and team coordination  
**Change policy:** Reopen this architecture only when implementation or evaluation produces a concrete finding that justifies an architectural change.

**v1.1 change:** Adds an upstream Feed Configuration and Reuse Layer. The frozen evidence, acquisition, intelligence, personalization, and briefing architecture remains unchanged.

**v1.2 change:** Formalizes the client/delivery experience as an installable Progressive Web App (PWA) with opt-in Web Push for scheduled briefings and explicitly enabled meaningful-change alerts.

---

## 1. Project Definition

Distilled.news is a personalized news-intelligence platform that continuously acquires heterogeneous evidence, maintains access-scoped, evidence-grounded and versioned representations of inferred real-world events and evolving storylines, determines what meaningfully matters for each user's interests and requested time window, and delivers concise personalized briefings with references to the original sources.

Distilled is **not** simply a scraper and is **not** an LLM that summarizes articles.

The core engineering pipeline is:

```text
heterogeneous evidence
        ↓
canonicalize + acquire + normalize
        ↓
deduplicate + classify evidence role
        ↓
infer/update events
        ↓
maintain evolving versioned storylines
        ↓
detect meaningful changes
        ↓
score shared event salience
        ↓
apply user relevance + time-window reasoning
        ↓
rank + diversify + constrain by briefing budget
        ↓
bounded grounded synthesis
        ↓
personalized briefing
```

The system is intended to remain open-source/self-hostable. Provider-specific services such as OpenAI, Anthropic, Zyte, Bright Data, GDELT, MediaStack, SearchAPI, NewsData, or future equivalents are replaceable implementations behind stable interfaces rather than hard-coded architectural dependencies.

---

## 2. Product Principle

The user chooses **what they want to follow**.

Distilled decides **how to technically obtain, organize, verify, rank, and summarize it**.

The interface should hide acquisition mechanics such as RSS, GDELT, scraping providers, model routing, retry logic, and storage internals.

The authenticated product centers on:

| Page | Purpose |
|---|---|
| **Home** | Current briefing / “Catch Me Up” |
| **Explore** | Discover topics and recommended sources |
| **Library** | Followed topics/sources and saved stories |

Typical onboarding:

```text
Choose interests
Lebanon • AI • Crypto • Movies • Markets ...

Optional explicit sources
Reuters • website • Telegram channel • X account ...

Choose language
Arabic / English

Choose frequency
30m / Hourly / Daily / Weekly

Done
```


Users may follow explicit sources, topics, or both.

---

## 3. Feed Configuration and Reuse Layer

Distilled may maintain reusable, versioned feed templates for common topic, geography, discovery, and verified-source configurations.

This layer sits **before source discovery and acquisition**. It does not change the downstream evidence pipeline.

```text
USER INTENT
    ↓
Intent Parsing
    ↓
Template Matcher
    ↓
suitable template?
 ┌───────┴────────┐
 ↓                ↓
yes               no
 ↓                ↓
initialize      Source Recommendation Agent
from template        ↓
                 source discovery
                 + verification
        └──────────┬──────────┘
                   ↓
               UserFeedSpec
                   ↓
        Source Subscription Resolver
                   ↓
      canonical source subscriptions
                   ↓
          DISCOVERY CONNECTORS
                   ↓
          CandidateProposal
```

### 3.1 FeedTemplate

A `FeedTemplate` is a reusable **starting configuration**, not a user-owned feed and not a source-ingestion object.

It may represent:

- topic/interests;
- geography;
- default verified sources;
- desired source categories;
- discovery policy;
- supported evidence languages;
- visibility/access scope;
- version.

A template should represent the **intent and coverage pattern** of a good feed, not merely a fixed static list of URLs.

### 3.2 UserFeedSpec

`UserFeedSpec` is the authoritative user-specific feed configuration.

It may start from a template, but user preferences remain separate:

- added sources;
- excluded sources;
- interests;
- output language;
- briefing cadence;
- personalization preferences.

Template updates must not silently mutate an existing user feed. A user feed is initialized from a specific template version unless an explicit update policy is later implemented.

### 3.3 Output language is not evidence language

A user requesting an English briefing does **not** imply that Distilled should ignore Arabic evidence.

```text
evidence language
≠
briefing output language
```

Distilled may ingest Arabic evidence and produce an English briefing.

### 3.4 Three distinct reuse layers

Distilled separates three kinds of reuse:

```text
CONFIGURATION REUSE
FeedTemplate
        ↓

ACQUISITION REUSE
Canonical source subscription / UpstreamResource
        ↓

INTELLIGENCE REUSE
SharedWorldState(scope)
        ↓

PERSONALIZATION
User-specific briefing
```

These are complementary but distinct.

**Configuration reuse** avoids rebuilding common feed/source setups.

**Acquisition reuse** means a public source is monitored once per permitted access scope even when many user feeds reference it.

**Intelligence reuse** means expensive evidence/event/storyline computation is shared through `SharedWorldState(scope)` rather than repeated per user.

### 3.5 Source recommendation and template matching

Template matching should normally be retrieval/ranking based on structured attributes and semantic similarity, not a full agent.

When no adequate template exists, a bounded Source Recommendation Agent may:

1. inspect the known source catalog;
2. identify missing source categories;
3. search the web when needed;
4. discover concrete URLs/accounts/channels;
5. verify identity, relevance, connector support, and access scope;
6. propose sources for the user's `UserFeedSpec`.

The invariant remains:

```text
AI recommends
→ Distilled verifies
→ user chooses
```

### 3.6 Scope-aware template reuse

Templates and source subscriptions must respect access scope.

Typical visibility:

```text
PUBLIC
ORGANIZATION
PRIVATE
```

Private or customer-authorized source configurations must not be promoted into public templates or shared outside their permitted scope.

---

## 4. Coverage Model


Distilled combines two evidence streams.

### 3.1 User-configured sources

Examples:

- publisher or newsroom
- RSS/feed
- website
- public Telegram channel
- X account
- official institution
- specialist source

### 3.2 Automatic discovery

Examples:

- GDELT
- news APIs
- search providers
- bounded Web Intelligence
- future discovery sources

The product promise is:

> Follow exactly what I ask for, while also surfacing important developments I would otherwise miss.

A user interested in “important Lebanese political news” should not need to already know every relevant journalist, institution, publication, Telegram channel, or X account.

---

## 5. Final Frozen Architecture

```text
                    FEED CONFIGURATION
 User intent • FeedTemplate • UserFeedSpec • Source subscriptions
                           │
                           ↓
                    DISCOVERY / SOURCES
 RSS • GDELT • Websites • Telegram • X • News APIs • Web Search
                           │
                           ↓
                     CandidateItem
                           ↓
             candidate URL/ID canonicalization
                           ↓
                CHEAP CANDIDATE DEDUP
       URL • upstream ID • upstream/payload hash
                    when available
                           ↓
                  ACQUISITION ROUTER
          ┌────────────────┼───────────────────┐
          ↓                ↓                   ↓
 supplied content      direct HTTP      provider-mediated
 RSS / API payload     + extraction         retrieval
                                             │
                                  Zyte / WebFetch provider
                                             │
                                   browser if necessary
                           ↓
                    AcquiredContent
                           ↓
              NORMALIZATION + PROVENANCE
                           ↓
                  CONTENT-HASH DEDUP
                           ↓
                 EVIDENCE ROLE CLASSIFY
                           ↓
                  SEMANTIC NEAR-DEDUP
                           ↓
          ┌─────────────────────────────────┐
          │       NEWS INTELLIGENCE         │
          │                                 │
          │ incremental event updates       │
          │ versioned storyline updates     │
          │ corroboration                   │
          │ shared/global salience          │
          │ change-state detection          │
          │ confidence + provenance         │
          └───────────────┬─────────────────┘
                          ↓
             SharedWorldState(scope)
                          ↓
        ┌─────────────────┼──────────────────┐
        ↓                 ↓                  ↓
 EventSalience      UserRelevance      WindowScoring
        └─────────────────┼──────────────────┘
                          ↓
                 BriefingCandidate
                          ↓
                    initial ranking
                          ↓
             diversity / MMR reranking
                          ↓
            briefing-budget constraints
                          ↓
                  BriefingEdition
                          ↓
                     DELIVERY
       in-app • Web Push • deep links
            30m • hourly • daily • weekly


                ↕ WEB INTELLIGENCE ↕

     discovery gap • corroboration gap • fetch fallback


────────────────────────────────────────────────────────
              RESOURCE + MODEL CONTROL PLANE
 cost • load • deadlines • budgets • cache • routing
────────────────────────────────────────────────────────
```

---

## 6. Web Intelligence — Exact Interaction Points

Web Intelligence has bounded, explicit roles. It does not bypass normal evidence handling.

### 5.1 Discovery path

Used when Distilled needs to find something it does not yet know about.

```text
coverage gap
corroboration gap
source discovery
        ↓
WEB INTELLIGENCE SEARCH
        ↓
new URL / source discovered
        ↓
CandidateItem
        ↓
candidate dedup
        ↓
Acquisition Router
        ↓
normal pipeline
```

Examples:

- “We only have one independent source for this important event.”
- “Lebanon healthcare looks suspiciously under-covered.”
- “Find useful sources for this user's new interest.”

### 5.2 Fetch-fallback path

Used when Distilled already knows a candidate URL but ordinary acquisition fails or is inefficient.

```text
CandidateItem already exists
        ↓
Acquisition Router
        ↓
direct extraction fails
        ↓
provider-mediated retrieval
        ↓
AcquiredContent
        ↓
normalization + provenance
        ↓
content-hash dedup
        ↓
normal pipeline
```

### 5.3 Invariant

> New URLs discovered through Web Intelligence enter as `CandidateItem`. Provider-mediated retrieval of an already-known URL returns `AcquiredContent`.

If a provider retrieves a Reuters article:

```text
evidence source       = Reuters
acquisition provider  = provider used to retrieve it
```

The retrieval provider is not the publisher.

---

## 7. Core Object Boundaries

These boundaries are architectural contracts and should be frozen early.

```text
CandidateItem
      ↓
candidate canonicalization + cheap dedup
      ↓
Acquisition Router
      ↓
AcquiredContent
      ↓
NormalizedEvidenceItem
      ↓
EvidenceRole
      ↓
semantic near-dedup
      ↓
Event
      ↓
StorylineVersion
      ↓
SharedWorldState(scope)
      ↓
EventSalience
+
UserRelevance
+
WindowScoring
      ↓
BriefingCandidate
      ↓
diversity + budget-constrained selection
      ↓
BriefingEdition
```

The purpose of the boundary is to allow acquisition, news intelligence, personalization, frontend, and evaluation work to progress independently.

---

## 8. CandidateItem

`CandidateItem` represents something Distilled has discovered. It does **not** imply that full content has been successfully acquired.

Conceptually:

```ts
interface CandidateItem {
  id: string;

  connectorType:
    | "rss"
    | "gdelt"
    | "website"
    | "telegram"
    | "x"
    | "news_api"
    | "web_search";

  sourceId: string;

  upstreamId?: string;
  url?: string;

  titleHint?: string;
  publishedAtHint?: string;
  languageHint?: string;

  payloadHash?: string;

  discoveredAt: string;

  discovery: {
    provider: string;
    runId: string;
    queryId?: string;
  };
}
```

A connector may provide more information than these hints, but the architectural meaning remains: **candidate discovery precedes canonical evidence creation**.

---

## 9. Cheap Candidate Deduplication

Before paying to fetch content, Distilled should use any identity information already available without another external request.

Candidate-level exact deduplication may use:

- canonical URL
- upstream/platform ID
- feed/API identifier
- upstream or payload hash when already supplied

Purpose:

> Do not pay to acquire something the system already knows it has.

This happens before content acquisition.

---

## 10. Acquisition Router

The Acquisition Router is responsible for obtaining usable content for a known candidate.

Possible acquisition strategies include:

- supplied RSS/API/platform payload
- direct HTTP + structured metadata extraction
- article extraction such as Trafilatura or equivalent
- provider-mediated web retrieval/fetch
- Zyte HTTP or equivalent
- browser-assisted extraction when required
- future provider implementations

The architecture does **not** hard-code one universal fallback order beyond preferring cheap, deterministic acquisition and keeping expensive browser rendering rare.

Routing should eventually consider:

- expected extraction success
- extraction completeness
- latency
- cost
- target domain
- freshness requirement
- provider availability/limits
- system pressure
- briefing deadline

Browser rendering remains a last-resort/high-cost path whenever cheaper methods are sufficient.

---

## 11. AcquiredContent

`AcquiredContent` represents the successful output of an acquisition route.

Conceptually:

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
    | "direct_http"
    | "web_fetch"
    | "zyte_http"
    | "browser"
    | "platform_api";

  acquisitionProvider?: string;

  rawPayloadRef?: string;

  acquiredAt: string;

  quality: {
    extractionComplete: boolean;
    confidence: number;
  };
}
```

A successful HTTP status is not sufficient by itself. Acquisition quality should distinguish between:

- transport success
- extraction success
- content completeness
- freshness
- latency
- cost

---

## 12. NormalizedEvidenceItem

After acquisition, Distilled converts source-specific material into canonical evidence.

Conceptually:

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

  evidenceRole: EvidenceRole;

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

The normalized evidence object is the common boundary consumed by downstream news intelligence.

---

## 13. Deduplication Model

Deduplication is deliberately split into multiple stages.

### 12.1 Before acquisition

Cheap candidate identity:

- canonical URL
- upstream ID
- feed/API identifier
- already-supplied payload hash

### 12.2 After acquisition

Exact normalized content identity:

- normalized content hash

Purpose:

> Catch identical content that appears through different URLs or providers.

### 12.3 Semantic near-duplicate detection

Used for essentially the same article with:

- slightly modified title
- minor formatting changes
- republishing
- small body edits
- syndication variants

### 12.4 Event clustering is not deduplication

Different independent evidence may describe the same real-world development.

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

These should remain separate evidence because independent sourcing matters for corroboration.

---

## 14. Evidence Roles

Distilled should not reduce content handling to a simple binary `news/noise`.

Use an explicit evidence role such as:

```text
PRIMARY_DEVELOPMENT
REPORTED_DEVELOPMENT
OFFICIAL_STATEMENT
INVESTIGATIVE_REPORT
ANALYSIS
OPINION
PROMOTION
UNVERIFIED_LEAD
NOISE
```

Routing behavior is policy-driven.

Typical defaults:

| Evidence role | Typical behavior |
|---|---|
| `PRIMARY_DEVELOPMENT` | Event eligible |
| `REPORTED_DEVELOPMENT` | Event eligible |
| `OFFICIAL_STATEMENT` | Often event eligible |
| `INVESTIGATIVE_REPORT` | Event eligible when sufficiently supported |
| `ANALYSIS` | Contextual/supporting evidence |
| `OPINION` | Normally contextual only |
| `UNVERIFIED_LEAD` | May trigger discovery/corroboration; not published as established fact |
| `PROMOTION` | Normally excluded |
| `NOISE` | Excluded |

The purpose is to preserve useful context without allowing promotional, speculative, or irrelevant material to seed events indiscriminately.

---

## 15. Incremental Event Intelligence

Events and storylines are maintained continuously as new evidence arrives.

```text
new evidence
    ↓
dedup + classify
    ↓
existing event?
 ↙            ↘
yes            no
 ↓              ↓
update        create
event         event
    \          /
         ↓
 update storyline
         ↓
 update current state
         ↓
 salience/change signals
         ↓
 persist version
```

A weekly briefing must **not** begin by loading a week of raw articles and clustering from scratch.

Instead:

```text
continuous evidence updates
        ↓
maintained events + storylines
        ↓
briefing queries existing structured state
```

This supports:

- lower briefing latency
- lower repeated inference cost
- temporal consistency
- shared computation
- scalable personalization

---

## 16. Event Membership

Evidence-to-event assignment should remain auditable rather than being hidden as a mutable `eventId` field.

Conceptually:

```ts
interface EventMembership {
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

This enables evaluation of:

- false merges
- false splits
- reassignment
- clustering changes between algorithm versions

---

## 17. Event vs Storyline

These are distinct concepts.

### Event

A relatively bounded development.

Examples:

- government approves a budget
- earthquake occurs
- company announces an acquisition
- revised ceasefire proposal is accepted

### Storyline

A persistent sequence of related events over time.

Example:

```text
negotiations begin
→ proposal rejected
→ talks collapse
→ revised proposal
→ agreement
```

Different briefing windows query the same storyline state differently.

---

## 18. Versioned Storyline State

Storylines should be structured and versioned. Distilled does not treat a single generated summary as the canonical shared intelligence object.

Conceptually:

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

Updates produce new immutable versions:

```text
Storyline 42 v17
        ↓
new evidence
        ↓
Storyline 42 v18
```

Previous versions are preserved for evaluation, reproducibility, and debugging.

---

## 19. Access-Scoped Shared World State

Shared computation is a major scalability principle.

```text
evidence
↓
embedding
↓
event
↓
storyline
↓
facts / chronology / turning points
↓
SharedWorldState(scope)
```

For public evidence, intelligence may be broadly reusable.

For private or customer-authorized evidence, state is shared only inside the authorized scope.

The architecture must not assume that all evidence is globally shareable.

---

## 20. Scoring Layers

Shared event properties, user-specific relevance, and window-specific reasoning remain separate.

### 19.1 EventSalience

Shared/global signals:

```text
EventSalience
├ impact
├ novelty
├ changeMagnitude
├ institutionalSignificance
├ corroboration
├ persistence
└ recency
```

These describe the inferred development/storyline itself.

### 19.2 UserRelevance

Per-user signals:

```text
UserRelevance
├ topicMatch
├ geographyMatch
├ entityMatch
├ sourcePreference
└ languageFit
```

### 19.3 WindowScoring

Different windows optimize for different questions.

| Window | Primary reasoning objective |
|---|---|
| Last 30 minutes | What meaningfully changed? |
| Hourly | What new developments require attention? |
| Daily | What actually mattered today? |
| Weekly | Which important storylines evolved, and what were their turning points? |

Typical emphasis:

```text
30m
→ change + novelty + recency

daily
→ impact + novelty + relevance

weekly
→ impact + persistence + turning points
```

Weekly is not daily multiplied by seven. Longer windows require stronger temporal compression.

---

## 21. Briefing Selection

Briefing selection is not one permanent arithmetic score.

Use:

```text
rank(
  EventSalience,
  UserRelevance,
  WindowScoring
)
        ↓
diversity / MMR reranking
        ↓
briefing-budget constraints
        ↓
selected stories
```

Diversity and resource budgets are treated as reranking/selection constraints, not merely scalar features.

Possible constraints include:

- topic diversity
- source diversity
- storyline diversity
- maximum stories
- reading time
- evidence-inspection budget
- web-search budget
- token budget
- monetary cost
- publication deadline

---

## 22. Bounded Briefing Agent

The briefing agent is intentionally bounded.

Example budget:

```text
max stories               8
target reading time       4 min
max evidence inspections  30
max Web Intelligence      3 calls
max AI cost               bounded
publication deadline      fixed
```

Its problem is:

> Produce the highest-quality evidence-grounded briefing possible within a fixed reading, latency, and resource envelope.

The agent may:

- inspect candidate events/storylines
- inspect supporting evidence
- inspect change history/turning points
- detect coverage or corroboration gaps
- invoke bounded Web Intelligence
- synthesize grounded briefing content

The agent must not:

- invent evidence
- bypass provenance requirements
- own persistence consistency
- directly control connector retries/checkpoints
- perform unlimited web exploration

---

## 23. BriefingEdition

Published briefing editions should be sufficiently immutable and reproducible for later evaluation.

Conceptually:

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

The system should be able to answer:

> Why did this briefing contain story X and omit story Y?

---

## 24. AI-Assisted Source Recommendation

Distilled may use bounded agentic AI to help users discover useful sources.

Example input:

```text
Lebanon
Healthcare
Arabic + English
```

The Source Recommendation Agent may:

1. inspect Distilled's known source catalog
2. identify missing source categories
3. search the web when necessary
4. discover concrete publisher/feed/account/channel URLs
5. inspect relevance, language, geography, uniqueness, and likely usefulness
6. return recommendations for deterministic verification

The invariant is:

```text
AI discovers / recommends
        ↓
Distilled verifies
        ↓
user chooses whether to follow
```

Verification should check that a recommended source:

- exists
- matches the claimed identity
- is relevant
- is not a duplicate/mirror
- has a supported connector
- matches language/geography requirements
- is actually followable

Source recommendations must not imply that users are required to manually choose sources. Topic-only feeds remain supported.

---

## 25. Connector Architecture

All acquisition families sit behind replaceable adapters.

Examples:

```text
RSSConnector
WebsiteConnector
TelegramConnector
XConnector
GDELTConnector
NewsAPIConnector
WebDiscoveryConnector
```

Provider-specific implementations remain replaceable.

Example:

```text
XConnector
├── BrightDataXConnector
├── OfficialXConnector
└── ReplayXConnector
```

Downstream services should not care which implementation produced the candidate or content.

### Telegram

Candidate technical implementation:

```text
Telegram MTProto API + Telethon
```

Expected connector behavior:

```text
resolve channel
↓
retrieve recent history
↓
persist last message ID/cursor
↓
retrieve new messages incrementally
↓
CandidateItem
```

Telegram should remain a specialized platform connector rather than being treated as a generic website.

### X

X should likewise remain behind a specialized connector abstraction with upstream IDs/cursors and replaceable providers.

---

## 26. Incremental Collection and Time Windows

Distilled should collect incrementally in small windows and build longer views from its own stored state.

Example:

```text
12:00–12:05 → collect + persist
12:05–12:10 → collect + persist
12:10–12:15 → collect + persist
...
```

A later daily or weekly briefing should not repeatedly request the same historical range from external providers.

Prefer provider-specific cursors when available:

```text
RSS       → GUID / ETag / Last-Modified
Telegram  → message ID
X         → post ID / cursor
API       → provider cursor/token
Website   → URL/hash + watermark
```

A time watermark with a small overlap is the fallback where no proper cursor exists.

**Cursor advancement occurs only after durable persistence succeeds.**

---

## 27. Retention

“Persist once” does not mean retaining every raw payload forever.

Retention may distinguish:

- canonical evidence/state: durable according to product needs
- briefing provenance: durable enough for reproducibility
- raw HTML/API payloads: configurable TTL
- large media: shorter/optional retention
- derived embeddings/cache entries: replaceable/rebuildable

Exact retention periods are an implementation/configuration decision.

---

## 28. Resource + Model Control Plane

The Resource + Model Control Plane is cross-cutting.

It monitors:

- acquisition/API spend
- model spend
- CPU/GPU load
- queue depth
- provider rate limits
- cache hit rate
- extraction success
- browser-fallback rate
- briefing deadlines

It may control:

- source polling cadence
- acquisition route
- optional discovery
- model selection
- Web Intelligence budget
- browser escalation
- batching/cache reuse
- briefing budget

### Normal conditions

```text
normal polling
normal Web Intelligence
best appropriate model
browser fallback available when justified
```

### Under pressure

```text
poll low-value sources less
reduce optional discovery
reuse shared/cached state
choose cheaper/smaller models
restrict browser extraction
```

### Near deadlines or limits

```text
protect high-value sources
protect imminent briefings
freeze optional candidate exploration
reserve strong model capacity for final synthesis
publish on time
```

The initial controller should be deterministic/rule-based. Learned control policies are optional future experiments.

---

## 29. Queue and Reliability Model

The asynchronous processing pipeline should be explicit.

Example logical events/jobs:

```text
candidate.discovered
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

Briefing path:

```text
briefing.requested
        ↓
candidate selection
        ↓
coverage evaluation
        ↓
optional Web Intelligence
        ↓
briefing synthesis
        ↓
briefing.ready
```

Failure handling should support:

- retries with backoff
- idempotency
- source/provider isolation
- dead-letter handling
- per-source checkpoints/cursors
- backpressure
- publication deadlines

A broken connector or source must not stop unrelated ingestion or briefing delivery.

The exact queue technology is an implementation decision.

---

## 30. Storage Baseline

Avoid unnecessary infrastructure complexity until measurements justify it.

A practical initial baseline may be:

```text
PostgreSQL
├ users / feeds / sources
├ candidates
├ acquired-content metadata
├ normalized evidence metadata
├ events
├ storyline versions
├ briefing editions
└ evaluation metadata

Object storage
├ raw HTML
├ raw API payloads
└ larger artifacts/media

Vector capability
└ embeddings for semantic dedup/retrieval
```

PostgreSQL plus `pgvector` may be sufficient initially.

Do not introduce multiple specialized databases merely for architectural appearance.

---

## 31. Model Boundaries

Define task capabilities before binding them to specific model vendors.

Conceptual interfaces:

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

The router maps:

```text
task + difficulty + budget + deadline
→ implementation/model
```

This preserves provider neutrality and allows local/self-hosted models where appropriate.

---

## 32. Evaluation Baseline

Evaluation begins before sophisticated AI implementation.

Create a frozen replay/evaluation corpus containing labels such as:

```text
duplicate / non-duplicate evidence pairs
same-event / different-event pairs
event clusters
storyline memberships
evidence roles
turning points
daily important events
weekly important storylines
supporting evidence
```

The initial corpus should be representative of the intended deployment domain and source diversity.

Every significant model or algorithm change should be evaluated against the same frozen benchmark where possible.

---

## 33. Required Provenance for AI Decisions

AI-generated intermediate decisions must remain auditable.

Examples:

### Event assignment

- evidence ID
- event ID
- confidence
- algorithm/model version
- decision metadata

### Salience

- feature values
- model/version
- resulting score/reasons

### Storyline update

- previous version
- new version
- evidence/event IDs
- algorithm version

### Briefing selection

- candidates considered
- ranking values
- diversity decisions
- budget constraints
- selected/omitted items
- model/router/prompt versions

This data does not need to appear in the user interface, but it is necessary for debugging and research evaluation.

---

## 34. Cost and Scale Hypothesis

The operating target is an engineering hypothesis, not a promise.

> **Hypothesis:** Distilled can support a defined approximately 1,000-active-user reference workload for roughly $400–500/month while satisfying minimum coverage, latency, and briefing-quality requirements.

Evaluate increasing workloads:

```text
100 → 250 → 500 → 1,000 active users
```

Define workload assumptions before making cost claims:

- briefings/user/day
- stories/briefing
- topics/user
- explicit sources/user
- evidence/day
- X records/day
- web pages/day
- browser-render percentage
- Web Intelligence trigger percentage
- Arabic/English mix

Track at least:

- acquisition cost / 1K evidence items
- AI cost / event update
- cost / storyline update
- cost / briefing
- cost / active user
- p50 / p95 latency
- important-event recall
- duplicate precision/recall
- event false merge/split rate
- browser-fallback percentage
- Web Intelligence trigger percentage
- extraction success/completeness by route
- cache/shared-computation hit rate

Total system cost is separated into:

```text
A. Acquisition APIs/providers
B. AI inference
C. Backend/database/storage
D. Monitoring/operations
```

---

## 35. Four Core FYP Contributions

### 34.1 Heterogeneous reliable acquisition

Reliable ingestion across RSS, websites, Telegram, X, discovery APIs, and Web Intelligence behind stable candidate/evidence contracts, with failure isolation and cost-aware acquisition routing.

### 34.2 News intelligence

Exact and semantic evidence deduplication, evidence-role classification, incremental event inference, versioned storyline maintenance, corroboration, salience, confidence, and meaningful-change detection.

### 34.3 Temporal + bounded agentic distillation

Different reasoning objectives for 30-minute, hourly, daily, and weekly windows; bounded coverage/corroboration discovery; grounded briefing synthesis under reading, latency, and resource constraints.

### 34.4 Resource-aware AI infrastructure

Access-scoped shared computation, structured-state reuse, model routing, adaptive acquisition, bounded Web Intelligence, explicit briefing budgets, and graceful degradation under resource pressure.

---

## 36. Implementation Workstreams

The frozen object boundaries allow independent workstreams.

### Acquisition workstream

```text
RSS
websites
Telegram
X
GDELT/APIs
Web Discovery
      ↓
CandidateItem / AcquiredContent
```

### News intelligence workstream

```text
ReplayDataset
      ↓
NormalizedEvidenceItem
      ↓
exact/semantic dedup
      ↓
evidence role
      ↓
events
      ↓
versioned storylines
      ↓
salience/change
```

### Personalization/briefing workstream

```text
SharedWorldState(scope)
      ↓
UserRelevance
      ↓
WindowScoring
      ↓
BriefingCandidate
      ↓
ranking/diversity/budget
      ↓
BriefingEdition
```

### Frontend workstream

Consumes stable feed/briefing/storyline contracts without depending on connector implementation details.

### Evaluation/resource workstream

Owns benchmark datasets, telemetry, model-routing experiments, cost/load tests, and resource-controller policies.

---

## 37. Recommended Implementation Order

1. Contracts and frozen replay/evaluation dataset
2. Candidate intake, canonicalization, and cheap exact dedup
3. Acquisition Router with at least one real website path
4. Normalized evidence + provenance
5. Evidence-role classification
6. Content-hash and semantic near-dedup
7. Event clustering and membership provenance
8. Versioned storylines
9. Salience and change detection
10. User relevance and window scoring
11. Briefing ranking, diversity, and immutable edition
12. Bounded briefing agent
13. Web Intelligence discovery and fetch-fallback paths
14. Real source connectors in parallel
15. Resource/model controller
16. Load, latency, cost, and quality experiments

---

## 38. Architectural Invariants

The following should be treated as non-negotiable unless a measured implementation finding justifies a change.

0. The primary client is an installable PWA with responsive mobile behavior.
0. Web Push is opt-in and is used for scheduled briefings and explicitly enabled meaningful-change alerts, not every raw article/post.
0. Push delivery failure never removes or invalidates the canonical in-app `BriefingEdition`.
0. Notification actions deep-link to the relevant briefing/feed context.
0. `FeedTemplate` is reusable shared configuration; `UserFeedSpec` is authoritative user-owned configuration.
0. Template reuse, source-ingestion reuse, and intelligence reuse are distinct mechanisms.
0. Canonical public sources are ingested once per permitted access scope regardless of how many feeds or templates reference them.
0. Template changes do not silently mutate existing user feeds.
0. Briefing output language does not restrict evidence language unless the user explicitly requests that constraint.
1. `CandidateItem` and `AcquiredContent` are distinct concepts.
2. Cheap candidate deduplication happens before expensive acquisition.
3. Content-hash deduplication happens after normalization/acquisition.
4. Semantic near-deduplication is distinct from event clustering.
5. Independent evidence about the same event is preserved for corroboration.
6. Events and storylines are updated incrementally, not rebuilt from raw history at briefing time.
7. Storyline state is structured and versioned.
8. Shared intelligence is access-scoped.
9. Event salience is separated from user relevance and time-window scoring.
10. Diversity and briefing budgets are selection constraints, not simply permanent score fields.
11. Web Intelligence discovery creates `CandidateItem`.
12. Web Intelligence fetch fallback creates `AcquiredContent`.
13. Provider-mediated retrieval never changes the identity of the original evidence source.
14. Source recommendations follow: AI recommends → Distilled verifies → user follows.
15. Provider implementations remain replaceable.
16. AI intermediate decisions retain provenance/version information.
17. Briefing editions preserve enough state for later reproducibility.
18. The Resource/Model Controller begins rule-based and measurable.
19. The $400–500/month target remains a hypothesis to test.
20. High-level architecture is closed unless implementation/evaluation evidence requires reopening it.

---

## 39. PWA and Delivery Experience

Distilled's primary client should be a responsive **installable Progressive Web App (PWA)** rather than a desktop-only website.

The product requirement is:

> Distilled must be installable to a mobile Home Screen as a PWA and support opt-in Web Push notifications for scheduled briefings and explicitly enabled meaningful-change alerts.

The client experience should support:

```text
responsive web app
      ↓
install / Add to Home Screen
      ↓
standalone app-like launch
      ↓
Web Push subscription
      ↓
notification tap
      ↓
deep link into exact briefing/feed
```

### 39.1 PWA baseline

The client should include:

```text
Web App Manifest
Service Worker
HTTPS deployment
standalone display mode where supported
app icons
stable start URL / app identity
```

The interface remains the same core product:

```text
Home
Explore
Library
```

The PWA requirement changes delivery/access behavior, not the news-intelligence architecture.

### 39.2 Notification policy

Notifications must reduce information overload rather than recreate it.

Initial notification types:

```text
SCHEDULED_BRIEFING_READY
MEANINGFUL_CHANGE
```

`MEANINGFUL_CHANGE` is opt-in per user/feed.

The system should **not** notify on every new article, Telegram message, X post, or evidence item.

The normal notification unit is:

```text
briefing
or
meaningful development
```

not raw content.

### 39.3 Push vs Catch Me Up

These are separate product actions:

```text
Web Push
= proactive delivery

Catch Me Up
= user returns and asks what meaningfully changed
```

They may use the same underlying shared event/storyline intelligence.

### 39.4 Deep-link invariant

A push notification should open the exact relevant resource where possible:

```text
scheduled briefing
→ BriefingEdition

meaningful-change alert
→ relevant feed/storyline/briefing context
```

Push delivery is not canonical content. If push delivery fails, the briefing or update remains available in-app.

### 39.5 Permission philosophy

Notification permission should be requested only after meaningful user intent, such as after the user creates a feed or explicitly enables notifications.

Installation and notification prompts should be contextual rather than intrusive.

---
## 40. Final Architecture Statement

> **Distilled maintains access-scoped, evidence-grounded and versioned representations of inferred events and evolving storylines. Shared event intelligence is computed incrementally as evidence arrives; user relevance and time-window reasoning are applied downstream, and final briefing selection is constrained by diversity, reading-time, latency and resource budgets. Web Intelligence is bounded and enters at explicit discovery and acquisition-fallback boundaries, while all evidence remains attributable to its original source.**

---

## 41. Final Project Pitch

Distilled.news is a minimal personalized news application backed by a substantial evidence and intelligence pipeline. Users choose topics, optionally follow particular publishers, Telegram channels, X accounts or websites, choose a language and briefing interval, and Distilled handles the underlying acquisition and reasoning. The system continuously acquires heterogeneous evidence, removes duplicate and noisy material, maintains evidence-grounded and versioned representations of inferred events and evolving storylines, detects meaningful change, scores shared event salience, applies user-specific relevance and time-window reasoning, and produces concise source-grounded briefings under explicit reading, latency and cost budgets. Web Intelligence provides bounded discovery, corroboration, source recommendation and acquisition fallback; expensive intelligence is shared within the appropriate access scope; and a Resource + Model Control Plane continuously balances coverage, quality, latency and operating cost.

---

## 42. Next Document

This architecture baseline is frozen.

The next artifact is:

**`TECHNICAL_CONTRACTS_SERVICE_BOUNDARIES_v1.md`**

It should define:

- exact schemas
- service ownership
- API boundaries
- queue/job contracts
- persistence rules
- storage ownership
- model capability interfaces
- idempotency/checkpoint rules
- observability fields
- evaluation hooks
- milestone-by-milestone implementation plan