# Distilled.news — Implementation Plan v1

**Status:** Implementation baseline v1.2

**v1.1 change:** Adds feed-template/configuration reuse and canonical source-subscription reuse as a later milestone without changing the core CandidateProposal → BriefingEdition build order.

**v1.2 change:** Adds installable PWA and Web Push delivery as a must-ship product capability, including service-worker, subscription, notification policy, deep-link, and delivery-reliability work.  
**Depends on:** `ARCHITECTURE_BASELINE_v1.2.md`, `TECHNICAL_CONTRACTS_AND_SERVICE_BOUNDARIES_v1.2.md`  
**Goal:** Build Distilled as a sequence of measurable vertical slices from `CandidateProposal` to `BriefingEdition`, while acquisition, intelligence, frontend, and evaluation progress in parallel.

---

## 1. Implementation Principle

The project should now stop redesigning the high-level architecture and move into evidence-driven implementation.

The governing rule is:

> Build the smallest end-to-end slice that exercises the frozen contracts, measure it, then expand source coverage and model sophistication only when the measurements justify it.

The first successful system does **not** require every connector, every provider, every model, or every optimization.

The implementation should prioritize:

1. correctness of contracts and state ownership;
2. reproducibility and provenance;
3. measurable evaluation from day one;
4. one working vertical slice before broad source expansion;
5. provider-neutral interfaces;
6. asynchronous reliability where it materially helps;
7. simple infrastructure until measurements justify more complexity.

---

## 2. Non-Negotiable Frozen Boundaries

The following contracts are assumed frozen for this plan:

```text
CandidateProposal
      ↓
Candidate Intake
      ↓
CandidateItem
      ↓
Acquisition Router
      ↓
AcquiredContent
      ↓
NormalizedEvidenceItem
      ↓
EvidenceRoleDecision
      ↓
Semantic Duplicate Decision
      ↓
EventMembership
      ↓
Event
      ↓
StorylineVersion
      ↓
EventSalienceAssessment
      ↓
SharedWorldState(scope)
      ↓
UserRelevance + WindowScore
      ↓
BriefingCandidate
      ↓
ranking + diversity + budget constraints
      ↓
BriefingEdition
```

Cross-cutting contracts:

```text
SourceCheckpoint
PipelineMessage<T>
CoverageGap
AcquisitionRouteStats
ModelExecutionRecord
WebDiscoveryProvider
WebFetchProvider
Resource + Model Controller
```

Architectural changes require a concrete implementation, evaluation, reliability, scalability, security, or cost finding.

---

# 3. Milestone Strategy

The project should be implemented as **vertical slices**, not as isolated infrastructure layers.

The milestone order is:

```text
M0  Frozen replay/evaluation dataset
M1  Candidate intake + replay connector
M2  Acquisition + normalization + provenance
M3  Exact/semantic dedup + evidence roles
M4  Event inference + membership provenance
M5  Versioned storylines + change state
M6  Salience + personalization + window scoring
M7  Briefing selection + immutable BriefingEdition
M8  Bounded briefing agent
M9  Web Intelligence
M10 Real acquisition connectors
M11 Resource/model controller
M12 Scale/cost/reliability evaluation
M13 Feed configuration + source reuse
M14 PWA + Web Push delivery
M15 Final product integration + FYP evaluation
```

Each milestone must produce:

- working code;
- tests;
- telemetry;
- a measurable evaluation result;
- a reproducible artifact or report.

---

# 4. Milestone 0 — Frozen Replay / Evaluation Dataset

## Objective

Create the evaluation foundation **before** sophisticated AI development.

The team should not implement clustering, salience, or storyline logic without a fixed benchmark.

## Scope

Create a frozen corpus containing realistic news from multiple source types and languages.

Recommended first evaluation domain:

```text
Lebanon
+
regional MENA
+
selected major world events
```

Recommended capture window:

```text
7–14 days initially
```

The corpus should contain enough overlap, updates, commentary, and evolving stories to exercise the full pipeline.

## Required labels

At minimum:

### Candidate / evidence level

```text
duplicate / non-duplicate pairs
exact duplicates
semantic near-duplicates
evidence-role labels
source identity
language
publication time
```

### Event level

```text
same-event / different-event pairs
gold event clusters
independent-source counts
event start/update times
```

### Storyline level

```text
storyline memberships
chronology
turning points
current-state transitions
```

### Briefing level

```text
important events for 30m windows
important daily events
important weekly storylines
supporting evidence
expected omissions/noise
```

## Dataset structure

Suggested:

```text
evaluation/
├── raw/
├── candidates.jsonl
├── acquired_content.jsonl
├── evidence.jsonl
├── gold/
│   ├── duplicate_pairs.jsonl
│   ├── evidence_roles.jsonl
│   ├── event_pairs.jsonl
│   ├── event_clusters.jsonl
│   ├── storyline_memberships.jsonl
│   ├── turning_points.jsonl
│   ├── daily_importance.jsonl
│   └── weekly_importance.jsonl
└── README.md
```

## Definition of done

- Dataset is immutable/versioned.
- Labels have documented annotation rules.
- Dataset can be replayed without external APIs.
- Every downstream model test can run from this corpus.
- Baseline metrics script exists.

## Metrics established

```text
exact duplicate precision/recall
semantic duplicate precision/recall/F1
event same/different F1
event clustering quality
evidence-role macro F1
storyline assignment accuracy
turning-point agreement
important-event recall
```

---

# 5. Milestone 1 — Candidate Intake + Replay Connector

## Objective

Prove the first frozen boundary:

```text
CandidateProposal
→ Candidate Intake
→ CandidateItem
```

without depending on live scraping.

## Implement

### ReplayConnector

Reads saved proposal records and emits `CandidateProposal`.

### Candidate Intake

Implements:

```text
validation
URL normalization
source-ID normalization
access-scope assignment
cheap candidate dedup
candidate eligibility gate
canonical CandidateItem persistence
```

### Candidate Eligibility Gate

Policy differs by origin.

#### Explicit followed source

```text
valid?
fresh?
duplicate?
supported?
→ usually accept
```

#### Automatic discovery

```text
valid?
fresh?
topic/entity/geography/language match?
confidence sufficient?
→ accept only if worthwhile
```

Initial mechanism:

```text
deterministic rules
→ metadata/entity matching
→ embedding/light classifier
→ small LLM only if ambiguous
```

Do not start with a large LLM as the default eligibility method.

## Required persistence

```text
CandidateProposal (optional audit/replay)
CandidateItem
eligibility result
reason codes
policy version
```

## Required tests

- malformed URL rejection;
- duplicate URL across multiple providers;
- duplicate upstream ID;
- payload-hash duplicate;
- explicit-source permissive policy;
- automatic-discovery strict policy;
- idempotent replay;
- access-scope preservation.

## Definition of done

A replay dataset can generate proposals repeatedly without creating duplicate canonical candidates.

---

# 6. Milestone 2 — Acquisition + Normalization + Provenance

## Objective

Prove:

```text
CandidateItem
→ Acquisition Router
→ AcquiredContent
→ NormalizedEvidenceItem
```

## First acquisition routes

Implement only:

1. supplied payload;
2. direct HTTP;
3. one fallback route.

Recommended first fallback:

```text
WebFetch provider OR Zyte HTTP
```

Do not implement all providers at once.

## Acquisition Router v1

Rule-based.

Inputs:

```text
candidate
domain/source
route health
expected cost
deadline
resource state
```

Outputs:

```text
selected route
routing reason
policy version
```

## Acquisition quality

Track separately:

```text
transport_success
extraction_success
completeness
latency
cost
```

HTTP 200 alone is not acquisition success.

## Normalization

Normalize:

```text
canonical URL
title
body
author
published time
language
source identity
content hash
provenance
access scope
```

## Required tests

- supplied RSS/API content path;
- HTTP extraction success;
- HTTP extraction failure + fallback;
- source vs acquisition-provider separation;
- raw payload reference;
- canonical URL redirect handling;
- empty/partial extraction rejection;
- normalization stability;
- identical body → same content hash.

## Definition of done

A replay/live candidate can become a normalized evidence object with complete provenance and measured acquisition-route telemetry.

---

# 7. Milestone 3 — Exact Dedup, Evidence Roles, Semantic Near-Dedup

## Objective

Produce trustworthy eligible evidence before event inference.

## Processing order

```text
NormalizedEvidenceItem
      ↓
content-hash exact dedup
      ↓
EvidenceRoleDecision
      ↓
semantic near-duplicate detection
      ↓
eligible evidence
```

## EvidenceRoleDecision v1

Initial roles:

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

Decision must include:

```text
confidence
model/version
policy version
timestamp
```

## Semantic duplicate model v1

Start simple:

```text
embedding similarity
+
title similarity
+
source/url features
```

Use LLM adjudication only for uncertain evaluation cases if necessary.

## Required tests

- same body / different URL;
- syndication variants;
- same event but independent articles must NOT dedup;
- commentary versus reporting;
- unverified lead routing;
- role-model versioning;
- duplicate-decision provenance.

## Evaluation gate

Target metrics should be established rather than invented as hard promises.

Track:

```text
exact dedup precision/recall
semantic dedup precision/recall/F1
evidence-role macro F1
false duplicate rate on independent evidence
```

## Definition of done

Evidence can be classified and deduplicated reproducibly against the frozen evaluation corpus.

---

# 8. Milestone 4 — Event Inference + EventMembership

## Objective

Convert eligible evidence into bounded inferred developments.

## Implement

### Event

Represents one bounded development.

### EventMembership

Canonical evidence-to-event relationship.

Never use `Event.evidenceIds` as an independent source of truth.

## Event assignment v1

Recommended baseline:

```text
retrieve recent candidate events
        ↓
embedding/entity/time similarity
        ↓
attach vs create-new decision
        ↓
confidence + algorithm version
```

A stronger model may adjudicate ambiguous candidates later.

## Corroboration

Track independent evidence sources.

Do not count:

```text
same Reuters article via RSS + GDELT
```

as two independent sources.

Do count:

```text
Reuters
BBC
official ministry statement
```

as distinct evidence sources when appropriate.

## Required tests

- attach same development;
- create new event;
- false-merge challenge;
- false-split challenge;
- late-arriving evidence;
- reassignment;
- duplicated provider observations do not inflate corroboration;
- access-scope isolation.

## Evaluation

```text
same-event pair F1
cluster purity / completeness
false merge rate
false split rate
assignment latency
assignment cost
```

## Definition of done

New evidence incrementally updates or creates an event with auditable membership and corroboration state.

---

# 9. Milestone 5 — Versioned Storylines + Change State

## Objective

Maintain evolving storylines continuously.

## Implement

```text
Event
↓
candidate storyline retrieval
↓
attach/create storyline
↓
derive chronology
↓
derive current state
↓
detect state change
↓
identify turning point
↓
persist StorylineVersion
```

## StorylineVersion rules

- immutable;
- previous versions retained;
- algorithm version stored;
- event memberships reproducible;
- chronology evidence-grounded;
- current and previous states explicit.

## Initial storyline algorithm

Start with:

```text
entity overlap
semantic similarity
temporal continuity
event-type compatibility
```

Use LLM synthesis only for structured state/turning-point extraction where needed.

## Required tests

- multi-day evolving story;
- unrelated same-entity events;
- storyline split/merge evaluation;
- late evidence;
- version increment;
- old version remains readable;
- current-state changes only when supported.

## Evaluation

```text
storyline membership accuracy
turning-point agreement
state-transition correctness
version reproducibility
```

## Definition of done

A week of replay evidence produces stable, versioned storyline evolution without rebuilding from scratch at briefing time.

---

# 10. Milestone 6 — Salience + User Relevance + Window Scoring

## Objective

Separate shared importance from personalization.

## Implement

### EventSalienceAssessment

Shared signals:

```text
impact
novelty
changeMagnitude
institutionalSignificance
corroboration
persistence
recency
```

Version assessments.

### UserRelevance

Supports:

```text
event target
storyline target
```

Signals:

```text
topicMatch
geographyMatch
entityMatch
sourcePreference
languageFit
```

### WindowScore

Targets event or storyline.

Windows:

```text
30m
hourly
daily
weekly
```

## Baseline scoring

Use explicit deterministic weights first.

Do not hide ranking inside one LLM prompt.

Example:

```text
30m
→ recency + change magnitude + novelty

daily
→ impact + relevance + novelty

weekly
→ impact + persistence + turning points
```

Weights are experiment parameters.

## Required tests

- same event, different user relevance;
- same event, different window score;
- weekly storyline outranks individual low-level event;
- no user-specific fields leak into shared salience;
- salience version changes when model/feature version changes.

## Evaluation

```text
human ranking agreement
important-event recall@K
NDCG / MAP where appropriate
per-window selection quality
```

## Definition of done

The same SharedWorldState can produce materially different candidate rankings for different users and windows without recomputing the underlying event/story intelligence.

---

# 11. Milestone 7 — Briefing Selection + Immutable BriefingEdition

## Objective

Produce a reproducible briefing candidate set before agentic synthesis.

## Pipeline

```text
EventSalience
+
UserRelevance
+
WindowScore
      ↓
initial rank
      ↓
diversity/MMR
      ↓
briefing budget
      ↓
BriefingCandidate[]
      ↓
BriefingEdition draft
```

## Constraints

Example:

```text
max stories
target reading time
topic diversity
storyline diversity
source diversity
deadline
max expected model cost
```

## BriefingEdition provenance

Persist:

```text
selected targets
storyline versions
evidence IDs
ranking reasons
omitted high-ranked candidates
diversity decisions
budget decisions
model/router/prompt versions
latency
cost
```

## Required tests

- same input → deterministic candidate selection under same policy;
- no more than max stories;
- diversity prevents redundant story saturation;
- weekly selects storyline evolution;
- edition references immutable storyline versions;
- edition remains explainable after later storyline changes.

## Evaluation

```text
important-story recall
redundancy
diversity
reading-time compliance
selection stability
```

## Definition of done

The system can generate a fully reproducible briefing selection without requiring an LLM to decide the whole ranking.

---

# 12. Milestone 8 — Bounded Briefing Agent

## Objective

Add agentic synthesis only after ranking and evidence structure are working.

## Agent inputs

```text
BriefingCandidate[]
StorylineVersion[]
evidence references
change state
briefing budget
user language/preferences
```

## Allowed actions

```text
inspect supporting evidence
inspect prior/current state
inspect turning points
request coverage evaluation
request bounded Web Intelligence
synthesize final stories
```

## Explicit limits

Example:

```text
max stories               8
target reading time       4 min
max evidence inspections  30
max web calls              3
max tokens                 configured
max cost                   configured
publication deadline       fixed
```

## Grounding invariant

Every factual briefing statement should be attributable to stored evidence or supported storyline state.

## Required tests

- no evidence-less story output;
- reference mapping;
- budget enforcement;
- deadline enforcement;
- Arabic/English output consistency;
- no uncontrolled web loop;
- same evidence edition is reproducible enough for comparison.

## Evaluation

```text
factual grounding
reference correctness
coverage
redundancy
human preference
latency
token/cost usage
```

## Definition of done

The agent produces grounded briefings from already-selected intelligence under explicit budgets.

---

# 13. Milestone 9 — Web Intelligence

## Objective

Implement the two frozen technical interaction points.

## A. Discovery

```text
CoverageGap
      ↓
WebDiscoveryProvider.search(...)
      ↓
DiscoveryCandidate
      ↓
CandidateProposal
      ↓
Candidate Intake
```

Use for:

```text
coverage gap
corroboration gap
source discovery
```

## B. Fetch fallback

```text
CandidateItem
      ↓
Acquisition Router
      ↓
normal extraction insufficient
      ↓
WebFetchProvider.fetchUrl(...)
      ↓
AcquiredContent
```

No loop back to CandidateProposal.

## CoverageEvaluator

Must produce a typed reason before optional Web Intelligence.

Examples:

```text
COVERAGE_GAP
CORROBORATION_GAP
SOURCE_HEALTH_GAP
```

## Required tests

- new web result enters CandidateProposal;
- fetched known URL enters AcquiredContent directly;
- search provider cannot bypass evidence pipeline;
- max web calls enforced;
- web-result provenance preserved;
- provider failure does not block briefing publication.

## Evaluation

```text
trigger rate
incremental important-event recall
unique useful evidence added
cost per useful discovery
latency impact
false/unnecessary trigger rate
```

## Definition of done

Web Intelligence measurably adds coverage/corroboration without becoming the primary ingestion system.

---

# 14. Milestone 10 — Real Acquisition Connectors

Implement connectors in parallel once the replay vertical slice is stable.

## Priority order

### Core

```text
RSS
Website
GDELT
```

### Social

At least one must be working early:

```text
Telegram
or
X
```

Then add the second.

### Optional/benchmark providers

```text
MediaStack
SearchAPI
NewsData
other providers
```

Only add when there is a concrete evaluation question.

## Connector responsibilities

Each connector must implement:

```text
fetch since checkpoint
emit CandidateProposal
persist accepted work
advance checkpoint after durable commit
record health/telemetry
handle retries/rate limits
```

## SourceCheckpoint invariant

```text
fetch
↓
persist
↓
durable commit
↓
advance checkpoint
```

Never advance the checkpoint before accepted work is durable.

## Definition of done

Live sources can feed the exact same downstream contracts used by ReplayConnector.

---

# 15. Milestone 11 — Resource + Model Controller

## Objective

Make cost/load/deadline control explicit after the core pipeline works.

## Start rule-based

Examples:

```text
if queue depth high:
    reduce optional discovery

if API spend > threshold:
    lower web-search budget

if direct HTTP success for domain < threshold:
    choose alternative route

if browser cost > budget:
    restrict browser to high-priority candidates

if briefing deadline is near:
    freeze optional exploration
    protect synthesis capacity
```

## Inputs

```text
queue depth
API/model spend
provider limits
acquisition route stats
cache hit rate
deadline proximity
CPU/GPU load
```

## Outputs

```text
model route
acquisition route
poll cadence
Web Intelligence budget
browser permission
briefing budget
```

## Evaluation

Compare:

```text
fixed routing
vs
rule-based resource-aware routing
```

Measure:

```text
quality
latency
cost
deadline miss rate
coverage
```

## Definition of done

The system degrades gracefully under constrained load/budget rather than failing abruptly.

---

# 16. Milestone 12 — Reliability, Load, and Cost Evaluation

## Workload ladder

Test:

```text
100
250
500
1,000 active users
```

Define reference workload before running experiments.

At minimum:

```text
briefings/user/day
topics/user
explicit sources/user
evidence/day
web pages/day
X/Telegram volume
browser fallback %
Web Intelligence trigger %
Arabic/English mix
```

## Reliability experiments

Inject:

```text
source timeout
429/rate limit
HTTP 403
bad HTML extraction
provider outage
queue retry
duplicate message
worker crash
checkpoint replay
late evidence
deadline pressure
```

Measure:

```text
data loss
duplicate processing
recovery time
briefing deadline success
source isolation
```

## Cost metrics

```text
$/1K CandidateProposals
$/1K accepted candidates
$/1K acquired pages
$/1K evidence items
$/event update
$/storyline update
$/briefing
$/active user
```

## Quality metrics

```text
important-event recall
duplicate precision/recall
event false merge/split
storyline assignment quality
briefing factual grounding
briefing redundancy
human preference
```

## Systems metrics

```text
p50/p95 latency
throughput
queue depth
cache/shared-state hit rate
browser fallback %
Web Intelligence trigger %
provider-route success/completeness
deadline miss rate
```

## Definition of done

The project can state whether the approximately `$400–500/month` target for the defined 1,000-user reference workload is supported or rejected by measurement.

Either outcome is valid.

---

# 17. Milestone 13 — Feed Configuration + Source Reuse

## Objective

Add reusable feed configuration and shared source-subscription resolution **after** the core intelligence vertical slice is already working.

This milestone improves onboarding and reduces duplicated source configuration without changing downstream evidence contracts.

## Implement

### FeedTemplate / FeedTemplateVersion

Support curated or verified reusable feed configurations representing:

```text
topic/interests
geography
default verified sources
desired source categories
discovery policy
supported evidence languages
visibility/access scope
```

Do not auto-create a global template for every new user request.

Initial template creation should be:

```text
curated/default
or
explicitly promoted after verification
```

Automatic promotion from clusters of similar user feeds is optional/experimental.

### TemplateMatcher

Given user intent, use:

```text
structured topic/geography matching
+
embedding similarity
```

to return suitable template candidates.

Template matching is retrieval/ranking, not a full agent.

### UserFeedSpec

Create the authoritative user-owned configuration from:

```text
matched template
+
user additions
+
user exclusions
+
interests
+
output language
+
briefing cadence
+
personalization preferences
```

Template updates must not silently alter existing user feeds.

### SourceSubscriptionResolver

Resolve many user/feed references onto canonical source resources.

```text
UserFeedSpec
      ↓
SourceSubscription[]
      ↓
canonical UpstreamResource
```

Critical goal:

```text
300 users follow Reuters Lebanon
→ one public upstream acquisition stream per permitted scope
```

regardless of whether those users came from the same template.

### Source Recommendation Agent

Use when no adequate template exists or a feed lacks useful coverage.

```text
user intent
      ↓
known source catalog
      ↓
identify missing source categories
      ↓
optional web discovery
      ↓
source verification
      ↓
recommend
      ↓
user chooses Follow
```

Invariant:

```text
AI recommends
→ Distilled verifies
→ user follows
```

### Language behavior

Keep separate:

```text
evidenceLanguages
vs
outputLanguage
```

An English briefing may still rely on Arabic evidence.

## Required tests

- exact/high-similarity template match;
- no-match path;
- template version pinning;
- template v2 does not silently mutate a user feed initialized from v1;
- user additions/exclusions;
- output-language/evidence-language separation;
- many user feeds referencing the same public source resolve to one upstream resource;
- private resource remains isolated by access scope;
- private source configuration is not promoted into a public template;
- source-recommendation result requires deterministic verification.

## Evaluation

Measure:

```text
template match precision
onboarding steps/time saved
source-configuration reuse rate
upstream subscription dedup ratio
source recommendation acceptance
unique useful source contribution
```

## Definition of done

Distilled can initialize common feeds from reusable templates while preserving user-owned configuration, and repeated public source references collapse onto shared canonical acquisition resources without changing the evidence/intelligence pipeline.

---

# 18. Milestone 14 — PWA + Web Push Delivery

## Objective

Make Distilled installable and fast to reopen on mobile while supporting opt-in Web Push notifications without recreating information overload.

This is a **must-ship product capability**.

## Client / PWA work

Implement:

```text
responsive mobile layout
Web App Manifest
stable app identity
app icons
standalone display mode where supported
Service Worker
HTTPS deployment
installability verification
```

The installed app should open directly into the authenticated Distilled experience.

Primary navigation remains:

```text
Home
Explore
Library
```

## Web Push subscription flow

```text
user enables notifications
      ↓
client requests permission
      ↓
PushManager subscription
      ↓
backend stores PushSubscription
      ↓
Delivery subsystem may send eligible pushes
```

Do not request permission on anonymous first visit.

Prefer contextual timing, for example after:

```text
user creates first feed
or
user explicitly enables "Notify me when ready"
```

## Notification types

Initial must-ship types:

```text
BRIEFING_READY
MEANINGFUL_CHANGE
```

### BRIEFING_READY

Example:

```text
Your Lebanon Politics briefing is ready
5 meaningful developments this morning.
```

Tap:

```text
→ exact BriefingEdition
```

### MEANINGFUL_CHANGE

Optional and explicitly enabled per user/feed.

Example:

```text
A meaningful update in Lebanon Politics
A revised proposal was accepted this afternoon.
```

Tap:

```text
→ relevant feed/storyline context
```

## Anti-noise rule

Do not push on:

```text
every article
every Telegram message
every X post
every CandidateItem
every evidence update
```

The default notification unit is:

```text
briefing
or
meaningful development
```

## Delivery backend

Implement:

```text
NotificationPreference
PushSubscription
DeliveryPolicyDecision
DeliveryJob
DeliveryAttempt
```

Required behavior:

```text
BriefingEdition remains canonical
push is delivery only
push failure does not block publication
transient failures retry
permanent subscription errors disable subscription
delivery jobs are idempotent
```

## Deep links

At minimum:

```text
BRIEFING_READY
→ /briefings/{briefingEditionId}

MEANINGFUL_CHANGE
→ relevant feed/storyline route
```

Notification click handling should:

```text
focus existing PWA window if open
or
open the PWA
then
navigate to the deep link
```

## Required tests

- app manifest valid;
- service worker registered;
- installability on supported desktop/mobile browsers;
- Home Screen / standalone launch behavior where supported;
- notification permission requested only after explicit intent;
- push subscription registration;
- multiple device subscriptions for same user;
- successful push receive/display;
- notification click deep-links correctly;
- briefing-ready push;
- meaningful-change push only when enabled;
- quiet-hour suppression;
- user timezone handling;
- duplicate delivery job does not duplicate user-visible push;
- transient push failure retries;
- terminal subscription failure disables subscription;
- push failure does not affect in-app briefing availability.

## Evaluation

Measure:

```text
install success rate
push opt-in rate
push delivery success
notification open rate
duplicate push rate
delivery latency
briefing-open latency from notification
meaningful-change alert usefulness
notification disable/unsubscribe rate
```

## Definition of done

A user can install Distilled to the mobile Home Screen, open it in an app-like standalone experience, opt into Web Push, receive a scheduled briefing-ready notification or explicitly enabled meaningful-change alert, and tap directly into the relevant Distilled content.

---

# 19. Milestone 15 — Final Product Integration

## Frontend

The frontend should remain minimal and consume stable contracts.

### Home

```text
current briefing
Catch Me Up
meaningful changes
source references
```

### Explore

```text
topics
recommended sources
source discovery
follow action
```

### Library

```text
followed feeds/topics/sources
saved stories
```

## Source Recommendation Agent

Implement only after source catalog/verification works.

Flow:

```text
user interests
      ↓
AI/source recommendation
      ↓
candidate source URL/handle
      ↓
deterministic verification
      ↓
supported connector?
      ↓
user chooses Follow
```

Invariant:

```text
AI recommends
→ Distilled verifies
→ user follows
```

## Final definition of done

A user can:

1. describe interests and optionally start from a matched reusable feed template;
2. create a user-owned feed configuration;
3. choose topics and optional sources;
4. select language and briefing interval;
5. receive an evidence-grounded briefing;
6. inspect numbered original-source references;
7. return later and receive “Catch Me Up” based on evolving storyline state.

---

# 20. Parallel Team Workstreams

## Workstream A — Feed Configuration / Source Reuse

Owns:

```text
FeedTemplate
FeedTemplateVersion
TemplateMatcher
UserFeedSpec
SourceSubscription
UpstreamResource
Source Subscription Resolver
Source Recommendation Agent
```

This workstream becomes active after the core replay/intelligence vertical slice is stable.

## Workstream B — Acquisition

Owns:

```text
connectors
SourceCheckpoint
CandidateProposal
Acquisition Router implementations
AcquisitionRouteStats
```

Deliverable boundary:

```text
CandidateItem / AcquiredContent
```

## Workstream C — Evidence + News Intelligence

Owns:

```text
normalization
exact/semantic dedup
EvidenceRoleDecision
EventMembership
Event
StorylineVersion
EventSalienceAssessment
```

Starts immediately with ReplayDataset.

## Workstream D — Personalization + Briefing AI

Owns:

```text
UserRelevance
WindowScore
BriefingCandidate
ranking
diversity
briefing budgets
BriefingEdition
bounded briefing agent
CoverageEvaluator
```

## Workstream E — Delivery / PWA

Owns:

```text
Web App Manifest
Service Worker
NotificationPreference
PushSubscription
DeliveryPolicyDecision
DeliveryJob
DeliveryAttempt
Web Push sender
notification click/deep links
installability/mobile tests
```

## Workstream F — Frontend

Works against synthetic/frozen API responses from day one.

Owns:

```text
Home
Explore
Library
Catch Me Up
references
source recommendation UX
```

## Workstream G — Evaluation / Resource Control

Owns:

```text
frozen evaluation corpus
metrics
telemetry
cost accounting
model execution records
load tests
resource-controller policy
```

---

# 21. Suggested Repository Structure

Logical ownership does not imply separate deployed microservices.

A sensible FYP backend may be:

```text
distilled/
├── apps/
│   ├── api/
│   └── workers/
│
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
├── evaluation/
├── messaging/
├── storage/
└── shared/
```

Possible infrastructure baseline:

```text
PostgreSQL + pgvector
object storage
one durable queue/job system
```

Add specialized infrastructure only after measurements demonstrate need.

---

# 22. Queue / Job Baseline

Use:

```text
at-least-once delivery
+
idempotent consumers
```

Logical messages:

```text
candidate.proposed
candidate.accepted
acquisition.requested
content.acquired
evidence.normalized
evidence.ready
event.update.requested
event.updated
storyline.updated

briefing.requested
coverage.evaluated
briefing.synthesis.requested
briefing.ready
```

Every message contains:

```text
messageId
idempotencyKey
correlationId
attempt
createdAt
type
payload
```

Failures:

```text
retry with backoff
dead-letter after bounded attempts
```

---

# 23. Observability Required From Day One

Every major pipeline step should record:

```text
run/correlation ID
input object ID
output object ID
component version
model/version if used
start/end time
latency
provider
tokens
cost
decision/confidence
reason codes
retry count
error type
```

This data is required for FYP evaluation, not optional production polish.

---

# 24. Definition of a Successful Vertical Slice

Before broad connector work, the system must support:

```text
Replay CandidateProposal
        ↓
Candidate Intake
        ↓
CandidateItem
        ↓
Acquisition
        ↓
AcquiredContent
        ↓
NormalizedEvidenceItem
        ↓
EvidenceRoleDecision
        ↓
semantic dedup
        ↓
EventMembership + Event
        ↓
StorylineVersion
        ↓
EventSalienceAssessment
        ↓
UserRelevance + WindowScore
        ↓
BriefingCandidate
        ↓
BriefingEdition
```

This should work entirely offline from the frozen replay dataset.

Only after this path works should the project spend heavily on source/provider integration.

---

# 25. Must-Ship vs Experimental Scope

## Must ship

```text
ReplayDataset
RSS
website extraction
GDELT
at least one social connector
Candidate eligibility
exact dedup
semantic dedup
evidence roles
events
versioned storylines
salience
relevance/window scoring
30m/daily/weekly briefing
bounded briefing agent
one Web Intelligence implementation
installable PWA
service worker + Web Push
scheduled briefing-ready notifications
opt-in meaningful-change notifications
notification preferences + deep links
provenance
cost/latency telemetry
```

## Strong second priority

```text
second social connector
feed templates / template matching
source subscription reuse
source recommendation
adaptive acquisition routing
resource controller
multiple model routes
SearchAPI or comparable discovery provider
```

## Experimental / benchmark

```text
MediaStack vs alternatives
NewsData incremental recall
multiple Web Intelligence providers
self-hosted model comparison
parallel multiscraper validation
advanced learned routing
```

The team should not sacrifice the core vertical slice to maximize the number of integrations.

---

# 26. Suggested Weekly Execution Pattern

Each week should produce:

```text
1. one implementation increment
2. one measurable evaluation result
3. one short engineering note
4. all focused tests green
5. no unresolved contract drift
```

Example:

```text
Week goal:
Semantic dedup v1

Deliver:
- implementation
- frozen-dataset metrics
- failure examples
- cost/latency
- decision whether to keep/change threshold
```

Avoid weeks that end only with:

```text
"we researched providers"
```

without executable output or measured evidence.

---

# 27. Change Governance

Architecture and contracts are now frozen.

Any requested change to:

```text
object boundaries
canonical ownership
pipeline ordering
Web Intelligence boundaries
shared-vs-user-specific state
checkpoint semantics
queue semantics
```

must include:

```text
Observed problem:
Evidence:
Affected invariant:
Proposed change:
Alternatives considered:
Migration impact:
Evaluation showing improvement:
```

Implementation choices that remain inside the frozen contracts do **not** require architectural review.

Examples:

```text
switch Anthropic → another WebFetchProvider
change embedding model
change queue implementation
change Postgres index
adjust relevance weights
```

These are implementation/evaluation decisions, not architectural changes.

---

# 28. Final Execution Rule

> Build Distilled from a frozen replay dataset outward. Prove each intelligence stage quantitatively before expanding provider breadth. Keep acquisition, intelligence, personalization, and frontend parallel through stable contracts. Treat cost, latency, reliability, and quality as first-class measured outputs from the first working vertical slice.
