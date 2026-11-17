# Distilled.news — Implementation Plan v1.5

**Status:** Implementation baseline v1.5


**Depends on:** `ARCHITECTURE_BASELINE_v1.5.md`, `TECHNICAL_CONTRACTS_AND_SERVICE_BOUNDARIES_v1.5.md`  
**Goal:** Build Distilled as a sequence of measurable vertical slices from `CandidateProposal` to `BriefingEdition`, while acquisition, intelligence, frontend, and evaluation progress in parallel.


## Version 1.5 authority and status

Read [the decision register](README.md) and [the change log](REVIEW_AND_CHANGELOG_v1.5.md) with this document. This is a target plan, not a claim that its services already exist. Confirmed product direction and explicit user requests override older contradictory assumptions; non-conflicting earlier intelligence and delivery ambitions are retained. New schemas, providers, thresholds and schedules are proposed implementation details until accepted through measurement. Commands in this document are future runbook instructions, not authorization to execute them during a document review.


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

Architectural changes require an explicit product decision or a concrete implementation, evaluation, reliability, scalability, security, or cost finding.

---

# 3. Milestone Strategy

The project should be implemented as **vertical slices**, not as isolated infrastructure layers.

The milestone order is:

```text
V0  Problem/user workflow validation + success criteria
P0  Public product/platform foundation + contracts/retention decisions
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
M13 Feed templates + advanced recommendation (source identity/reuse foundation starts in P0/M1)
M14 PWA + Web Push delivery
M15 Final public-product integration + pencil illustrations + FYP evaluation
```

Each milestone must produce:

- working code;
- tests;
- telemetry;
- a measurable evaluation result;
- a reproducible artifact or report.

## V0 — Problem/User Workflow Validation

Use [Project Problem and Validation](PROJECT_PROBLEM_AND_VALIDATION_v1.5.md) as the study protocol and artifact checklist. Select and record the first cohort/profession, separate hypotheses from observed findings, and freeze success measures before the final pilot. No completed interviews or validated pain points are implied by this plan.

Before treating technical performance as product success, ground the Path-A/FYP evaluation in a real information-monitoring workflow. This does not narrow Distilled's general product scope; it defines the evaluation context.

Required work:

- identify representative information-intensive users (for example analysts, researchers, journalists, policy professionals, or similar knowledge workers);
- document the current workflow used to monitor a defined topic/geography/domain across fragmented sources;
- identify repetitive/manual steps, trust concerns, missed-update risk, duplicate-reporting burden and temporal-context problems;
- gather conversations, observation or feedback from a small relevant user sample where feasible;
- define measurable user-facing success criteria before the final pilot.

Pilot evidence should compare the current/manual workflow with Distilled on a bounded monitoring task and may measure task time, important developments found/missed, duplicate reports encountered, sources manually opened, trust in references, perceived workload and briefing usefulness.

Deliverables:

```text
user/problem summary
current-workflow diagram
interview/observation notes
predeclared success criteria
final pilot protocol
```

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
├── development/
│   ├── train_or_examples/
│   │   └── raw/, candidates.jsonl, acquired_content.jsonl, evidence.jsonl, gold/
│   └── validation/
│       └── same record and label schemas; used for development comparisons
├── held_out_test/
│   └── same record and label schemas; inputs and labels sealed from tuning
├── split_manifest.json
├── annotation_guide.md
├── leakage_audit.md
├── final_run_manifest.json
└── README.md
```

The held-out partition must not be used for prompt selection, threshold tuning, model selection, ranking-weight tuning, feature selection or iterative debugging. Final reported quality metrics are computed after development choices are frozen.

Each partition's `gold/` retains duplicate pairs, evidence roles, event pairs/clusters, storyline memberships, turning points, daily/weekly importance and supporting-evidence labels. `train_or_examples` need not train a model: it can hold prompt examples and debugging fixtures.

Apply the split and final-run record contract in Technical Contracts §43. Group duplicates and related event/storyline material to prevent leakage; explicitly distinguish temporal-continuation evaluation from unseen-storyline generalization. Freeze the partition before tuning and isolate final-test inputs/labels. If final results influence debugging or selection, record the set as consumed and obtain a newly sealed set for the next final claim.

## Definition of done

- Dataset is immutable/versioned.
- Labels have documented annotation rules.
- Dataset can be replayed without external APIs.
- Every downstream model test can run from this corpus.
- Baseline metrics script exists.
- Development/validation and held-out partitions are explicit, versioned, and leakage-checked.
- Split manifest, access restrictions, leakage audit and final-run manifest templates exist; final results cannot silently re-enter tuning.

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
2. direct HTTP evaluated from the target Worker runtime;
3. one measured, runtime-compatible fallback route.

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

The retained Web Operator slice is specified in [the companion runtime architecture](DISTILLED_AGENT_RUNTIME_AND_WEB_OPERATOR_ARCHITECTURE_v1.5.md). Prove scripted-model hostile fixtures, isolated browser execution, policy denials, hard budgets, deterministic completion and crash/replay safety before enabling automatic escalation. M2 establishes the known-candidate adapter; M9 establishes bounded discovery through Candidate Intake; M12 measures cost and reliability. The browser executor is selected by evidence, while the bounded capability remains in scope. A raw browser route passing extraction tests is insufficient acceptance evidence for the Web Operator.

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
- Arabic/English/French output consistency;
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
Google News
public Telegram
Website extraction (target extension)
GDELT (retained target discovery connector)
```

### Social

Public Telegram is part of the early core slice. Stage the remaining confirmed families without dropping any target:

```text
X
LinkedIn company/profile
Apify-backed adapters
```

All confirmed source families remain acceptance targets; staged rollout does not remove a family from scope.

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
Worker resource pressure (plus CPU/GPU load for any enabled external model adapter)
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

Add versioned templates, matching and advanced recommendations after the core intelligence slice. Canonical upstream identity and source-subscription reuse begin in P0/M1 and must be working before shared-acquisition cost/load claims in M12.

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
- unsupported private-source configurations are rejected;
- internal user prompts/credentials are not promoted into public templates;
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
Settings / Profile
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
→ /{username}/{feedSlug}/editions/{briefingEditionId}/

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
multiple user feeds and creation action
current briefing
user-triggered Catch Me Up
meaningful changes
source references
```

Catch Me Up is a first-class action. It may summarize Home/account scope or a selected feed depending on where it is invoked; it is **not** conditional on cross-feed synthesis or on multiple feeds having updates. The UI must make the active scope clear.

### Explore

```text
public feeds and stars
topics
verified recommended sources
source discovery
follow action
```

### Settings / Profile and saved content

Account, language, feed management and notification preferences belong in Settings/Profile. Preserve saved/followed-content goals without requiring a new Library top-level tab; placement remains open.

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
7. return later and use “Catch Me Up” for the relevant Home/account or selected-feed scope based on evolving storyline state.

## Final FYP evidence package

Before submission, package the implementation evidence explicitly rather than expecting reviewers to infer it from architecture documents:

```text
problem / target-user / current-workflow evidence
pilot or preliminary user evidence
held-out evaluation results and baselines
AgentOps traces and operational metrics
latency / tokens / cost / task-success results
Failure Matrix
lightweight threat model
adversarial/failure tests and resulting regression tests
known limitations
setup/reproducibility guide
architecture/API documentation
live-demo failure scenarios, not only the happy path
```

The authoritative Failure Matrix/threat-model artifact is `FAILURE_MATRIX_AND_THREAT_MODEL_v1.5.md`. The specialized browser-agent architecture is `DISTILLED_AGENT_RUNTIME_AND_WEB_OPERATOR_ARCHITECTURE_v1.5.md`.

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

Source identity/subscription reuse starts in P0/M1. Template matching and advanced recommendation expand after the core replay/intelligence slice.

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
Settings / Profile
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
Cloudflare Workers + D1 + R2 + Queues
Email Service + AI Gateway
optional Apify and image-generation adapter
no vector-database requirement
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
public accounts / multiple username-scoped public feeds / stars / retained search
RSS / Google News / public Telegram / X / LinkedIn / optional Apify adapters
website extraction
GDELT target discovery connector
canonical upstream source reuse
Candidate eligibility
exact dedup
semantic dedup
evidence roles
events
versioned storylines
salience
relevance/window scoring
30m/hourly/daily/weekly briefing (release sequencing measured, not inferred from current code)
bounded briefing agent
one Web Intelligence implementation
installable PWA
service worker + Web Push
scheduled briefing-ready notifications
opt-in meaningful-change notifications
notification preferences + username-scoped deep links
feed-inspired pencil illustrations with fallback and separate usage accounting
provenance
cost/latency telemetry
```

## Strong second priority

```text
additional measured discovery providers
feed templates / template matching
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

Architecture and contracts are the versioned target; explicit user decisions or measured findings can revise them.

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
change queue adapter internals while preserving the selected Cloudflare deployment
change D1 index
adjust relevance weights
```

These are implementation/evaluation decisions, not architectural changes.

---

# 28. Final Execution Rule

> Build Distilled from a frozen replay dataset outward. Prove each intelligence stage quantitatively before expanding provider breadth. Keep acquisition, intelligence, personalization, and frontend parallel through stable contracts. Treat cost, latency, reliability, and quality as first-class measured outputs from the first working vertical slice.


# 29. P0 — Confirmed Product and Platform Foundation

This is a dependency milestone, not a claim that today's code passes. Reuse the professor's implementation where it satisfies the target; inspect, test and migrate each mismatch rather than rebuilding blindly.

Deliver public accounts, verification/reset, multiple owner-managed feeds, username/slug identity and aliases, stars/explore, public edition reads, basic retained published-content search, and role-protected administration. Preserve existing style/colors. Guest landing has centered brand, exact headline/subtitle, and Create feed returning through authentication to creation. No private-feed setting and no chat/Q&A surface.

Validate the Cloudflare account/resources and remote migrations in a separate environment; generate installation secrets; configure email sender and enabled providers. Introduce honest per-capability health, retention policies, usage ledgers, source identity, subscription resolution and a recoverable outbox before load testing. Runtime-specific resource limits and migration/rollback procedures must be tested, not assumed from a VPS experiment.

Acceptance: a new self-hoster can deploy an independent instance into an account they control using the selected Cloudflare-first baseline; a guest can read a public feed; an owner can create/manage two feeds without cross-account writes; missing providers are clearly reported; username redirects work; source refresh failures do not masquerade as current coverage; retained search excludes expired/private data. Maintain the current implementation-to-target gap list separately from this plan.

# 30. Pencil Illustration Delivery Slice

Implement the section 51 illustration contract after feed identity/auth and budget foundations. Generate a calm pencil cover from a bounded saved feed description; edition-based inputs are an explicit extension. Use replaceable provider adapters, stored assets, revision-aware idempotency and a fallback. Choose automatic-first-generation versus an explicit owner action before shipping; do not turn every public image GET into a paid request.

Tests: owner authorization; missing binding/key; concurrent duplicate requests; prompt/style changes; delayed obsolete result; provider refusal/timeout; budget exhaustion; malformed or oversized image; safe public image projection; deletion/retention cleanup; no effect on briefing publication; image cost appears separately from text/acquisition cost. Evaluate subject fit, pencil style, visual consistency, latency and cost per accepted cover. Artwork is never a grounding reference.

# 31. Milestone Dependency and Acceptance Corrections

| Work | Must precede |
|---|---|
| P0 account/feed identity, source resource keys, outbox and usage foundation | Live multi-feed ingestion and owner-specific generation |
| M0 corpus and annotation rules | Model/threshold comparisons |
| M1–M7 deterministic replay slice | M8 advanced synthesis and M9 agentic discovery |
| Canonical acquisition reuse from P0/M1 | M12 shared-cost and 1,000-user claims |
| Versioned contract fixtures | Parallel frontend/backend implementation |
| M13 template/recommendation expansion | Claiming reliable template/topic-only onboarding |
| Canonical editions and explicit notification preferences | M14 push sending |
| Retention and budget policy | Final production release |

Keep the original M0–M15 identifiers for traceability; they are not an instruction to delay all product work until M15. Build frontend/PWA skeletons against fixtures early. Public accounts, agreed source families, pencil imagery and deployment readiness are real acceptance requirements. Retain events, storylines and push as target requirements even if the current backend lacks them.

Do not label Web Push “delivered” solely because a provider accepts it. Test multi-device jobs, expiry, deduplication, opt-out, quiet hours and notification deep links to retained editions. Denied or unsupported notification permission must leave the in-app product usable.
