You are now responsible for autonomously implementing the new production
semantic intelligence core of Distilled.news against the REAL repository.

Work milestone by milestone until the semantic core described below is fully
integrated, tested, committed, and pushed.

Do not stop after writing a plan.
Do not merely scaffold interfaces.
Implement working behavior.

============================================================
REPOSITORY / BRANCH
============================================================

Repository:
AmmarMohanna/distilled.news

Branch:
codex/v1-downstream-pipeline

Starting checkpoint:
edf7a1493cd7280958c166d7b973b8f3e2a5c806

First:

1. verify branch and HEAD
2. git status must be understood before changes
3. inspect the actual current implementation before editing
4. preserve unrelated local/user changes
5. do not reset/rewrite useful existing history
6. do not merge to another branch
7. push only this branch

============================================================
MISSION
============================================================

Distilled must NOT be an article-by-article summarizer.

The intelligence layer must transform approved-source content into persistent,
grounded editorial understanding:

SourceDocument
↓
ClaimMention
↓
Entity + Proposition / structured state where appropriate
↓
Event
↓
Storyline
↓
communication ledger
↓
high-recall briefing candidates
↓
comparative editorial decision
↓
EditorialPlan
↓
Briefing synthesis
↓
verification
↓
BriefingEdition

The system must answer:

- What actually happened?
- Which source mentions describe the same development?
- What changed?
- What is merely corroboration?
- What contradicts or corrects previous information?
- What Storyline does this belong to?
- What has the reader already been told?
- What does this Feed need to know now?
- What context, disagreement and uncertainty must survive compression?

============================================================
QUALITY PRIORITIES — ORDER MATTERS
============================================================

1. DO NOT LOSE NEW INFORMATION.
2. DO NOT INVENT INFORMATION.
3. DO NOT REPEAT INFORMATION UNNECESSARILY.
4. THEN optimize cost, brevity and latency.

False suppression is especially dangerous.

A cheap semantic decision that might suppress a material update must have a
higher safety bar than a decision that might merely create an extra duplicate.

============================================================
NON-GOALS
============================================================

Do NOT:

- build a global SharedWorldState
- create global Events/Storylines across independent Feeds
- introduce topic-specific editorial rules
- build a huge news ontology
- send every article to a strong LLM
- create many independent agents
- create a free-roaming agent loop
- let the final writer discover which stories matter
- remove or weaken source approval boundaries
- add runtime web search/source expansion
- revive Catch Me Up
- revive Feed templates/cloning
- redesign ingestion/connectors owned elsewhere
- rewrite Appendix C contracts unnecessarily
- weaken grounding or publication guarantees
- relabel failures as QUIET
- perform human annotation, benchmark construction or manual evaluation
- stop implementation to ask for a human benchmark
- deploy production

No human benchmark/evaluation work is part of this milestone.

Engineering tests, deterministic fixtures, replay, typechecks, invariant checks,
cost accounting and regression checks ARE required.

============================================================
EXISTING INFRASTRUCTURE TO PRESERVE
============================================================

Preserve unless a concrete correctness bug requires otherwise:

- v1 intake ordering
- immutable EvidenceRevision semantics
- stale/replay/conflict handling
- tombstones
- feed/source revision and epoch fencing
- CAS/feedTransact model
- EventMembership as publication's authoritative support relation
- publication intent/reservation/settlement/recovery
- unknown-outcome safety
- exact evidence retention
- grounding verification
- preservation verification
- language handling
- scheduling/window logic
- QUIET vs FAILED semantics
- BriefingEdition immutability
- lifecycle/revocation behavior
- existing browser/acquisition fallback behavior
- Appendix C frozen contracts
- deterministic fallback paths
- communicationFingerprint stale-selection fencing
- existing replay/idempotency guarantees

CRITICAL:

The reassessment/feed CAS transaction must continue to make NO model/network
calls.

Every semantic/model operation must follow a two-phase pattern:

PHASE A
outside transaction:
- create durable intent
- perform bounded semantic/model call
- persist result/provenance

PHASE B
inside feed transaction:
- consume persisted result deterministically
- apply state change under CAS/epoch fencing

Reuse the existing durable salience intent/result pattern rather than inventing
a different reliability mechanism.

============================================================
CORE DESIGN PRINCIPLE
============================================================

Hard-code correctness and constraints.

Do NOT hard-code editorial meaning.

Avoid rules like:

- politics = important
- three sources = important
- same title = same Event
- opinion = always irrelevant
- a specific publisher is automatically authoritative
- score > X = briefing inclusion

News is diverse across politics, finance, science, sports, entertainment,
technology, crises, courts, economics, etc.

The semantic system must remain domain-general.

============================================================
SOURCE BOUNDARY
============================================================

Feed intelligence remains per Feed.

A Feed may only derive reader-facing facts/intelligence from evidence from
sources approved for that Feed.

Permitted global/source-intrinsic reuse:

- source-document normalization
- extraction from identical content
- reporting-role judgments
- origin/syndication/dependency judgments
- pairwise entailment/equivalence judgments
- entity normalization
- other judgments dependent only on the source material itself

Origin inference may use knowledge of an unapproved upstream source solely to
determine that two approved documents are not independent.

Example:

Feed approves Site A and Site B.
Both are rewrites of Reuters.
Reuters itself is not approved.

Allowed:
- infer that A and B share one information origin

Not allowed:
- add Reuters claims/facts into the Feed
- use Reuters evidence to enrich Event state
- cite Reuters
- use Reuters as salience/Storyline evidence

The unapproved source may affect DEPENDENCY metadata only.

============================================================
CACHING / CONTENT ADDRESSING
============================================================

Design source-intrinsic work to be reusable.

Examples:

Extraction cache key should be conceptually based on:

contentHash
+ extractorVersion
+ extractionPolicyVersion

Pairwise semantic judgment cache should be based on stable inputs + policy.

Strong construction calls should be content-addressed by the exact approved
evidence state, conceptually:

sorted ClaimMention IDs
+ prior Storyline state version where applicable
+ construction policy version
+ model/provider policy

Two Feeds with identical approved evidence may reuse the result.

If evidence sets differ, reuse must not cross the boundary.

============================================================
CURRENT WEAK SEMANTIC CORE
============================================================

The existing Event/Storyline implementation is useful as a fallback but must
stop being the semantic authority.

Current behavior includes:

- document-level regex role classification
- near-duplicate shingling
- lexical/development-verb Event matching
- keyword/Jaccard-style similarity
- time-gap rules
- simplistic first-match Storyline grouping
- text-concatenated Event/Storyline state
- some roles being prevented from forming Events

Preserve these mechanisms only as:

- fallback behavior
- cheap blocking/retrieval hints
- deterministic offline mode
- resilience when models/providers are unavailable

Do not delete them unless replacement is proven structurally necessary.

============================================================
MILESTONE 1 — EXTRACT MATCHER PORTS
============================================================

Create explicit stable semantic seams.

At minimum:

EventMatcher

StorylineMatcher

Design their contracts around semantic decisions rather than similarity scores.

Example EventMatcher result:

{
  structuralRelation:
    | SAME_EVENT
    | NEW_EVENT_EXISTING_STORYLINE
    | NEW_STORYLINE
    | DEFER,

  eventId?: string,
  storylineId?: string,

  epistemicEffects: [
    CORROBORATES
    | ADDS_DETAIL
    | CHANGES_STATE
    | CHANGES_CERTAINTY
    | CONTRADICTS
    | CORRECTS
    | RETRACTS
  ],

  provenance,
  confidence / judgment metadata
}

Do NOT collapse structural relation and epistemic effect into one enum.

The same Event may both be corroborated and receive a material new fact.

Initially wire the existing lexical implementation behind these ports.

Acceptance:

- current deterministic behavior remains available
- no behavior regression required merely because ports exist
- tests/typechecks green
- logical commit
- push

============================================================
MILESTONE 2 — PERSIST CLAIMMENTION FOUNDATION
============================================================

The article/document is not the atomic semantic unit.

Persist ClaimMentions.

Use the existing generic feed-scoped document store where appropriate rather
than introducing unnecessary bespoke infrastructure.

A ClaimMention should support at least:

- stable/content-addressed ID
- evidenceRevisionId
- exact source span offsets where available
- exact source text
- reportingRole
- attribution?
- certainty / hedge representation
- quantities[]
- qualifiers[]
- reportTime
- eventTime? when supported
- origin/dependency metadata where applicable
- extractorVersion
- extractionPolicyVersion

Reporting roles should be able to distinguish, at minimum:

- NEW_REPORTING
- BACKGROUND_RECAP
- QUOTED_CLAIM
- ANALYSIS_OPINION
- other/uncertain when necessary

Do not assume every sentence is new reporting.

M2 is the persistence FOUNDATION.

Do not pretend extraction quality is solved merely because ClaimMentions are
persisted.

Existing deterministic/sentence-based extraction may be used initially where
needed to preserve behavior.

Model-enriched extraction comes later.

Acceptance:

- existing behavior can still run
- ClaimMentions are durable/idempotent
- replay remains deterministic
- no model call in feed transaction
- logical commit
- push

============================================================
MILESTONE 3 — COMMUNICATION LEDGER
============================================================

Persist what Distilled ACTUALLY communicated.

Do not repeatedly reconstruct reader state from prose/history on every window.

Implement ledger_entries as an idempotent post-publication projection.

Derive ledger entries from immutable published BriefingEdition /
GroundedClaim support.

Where Proposition IDs do not yet exist, support transitional ClaimMention/fact
references and make the design upgradeable.

Ledger state should preserve enough to later represent:

- communicated proposition/semantic fact
- certainty
- attribution
- Event
- Storyline
- supporting EvidenceRevisions
- edition
- communicated timestamp
- edition status/withdrawal state

Do NOT modify the correctness-critical publication transaction just to write
ledger state.

Use a deterministic post-publication projection keyed by edition identity.

Backfill/rebuild must be possible.

WITHDRAWN EDITIONS:

Do not pretend readers never saw them.

Keep their ledger records, mark withdrawal state, and allow them to create
future correction obligations.

Add correction-obligation support for at least:

- CONTRADICTED
- RETRACTED
- SOURCE_REVISED
- SOURCE_DELETED

Acceptance:

- current editions can project ledger entries idempotently
- existing communication logic may use ledger with legacy fallback
- publication remains untouched or minimally coupled
- tests green
- logical commit
- push

============================================================
MILESTONE 4 — SEMANTIC RELATION JUDGMENTS
============================================================

Introduce durable semantic relation intents/results.

Use JEV as the primary cheap semantic judge where the decision is constrained.

JEV supports:
- choice
- yes/no
- score

Do not expose JEV-specific types throughout architecture.

Create domain interfaces such as:

classifyStructuralRelation(...)
classifyEpistemicEffect(...)
assessEntailment(...)
assessMaterialNovelty(...)
scoreShortlistPriority(...)

Inspect the existing JEV integration and extend the provider adapter cleanly for
the modes actually supported by the provider/runtime.

Every call:
- durable intent
- bounded retries
- explicit policy/model version
- cost/latency accounting
- stored result
- no model call inside CAS transaction

JEV should be used for questions like:

STRUCTURAL:
- SAME_EVENT
- NEW_EVENT_EXISTING_STORYLINE
- NEW_STORYLINE

EPISTEMIC:
- CORROBORATES
- ADDS_DETAIL
- CHANGES_STATE
- CHANGES_CERTAINTY
- CONTRADICTS
- CORRECTS
- RETRACTS

YES/NO:
- does A entail B?
- does B entail A?
- does this add materially new information?
- is this a genuine continuity relation?

SCORE:
- cheap shortlist priority / semantic signal

Do not turn a JEV score threshold into the final editor.

============================================================
MILESTONE 5 — STRONG-MODEL ESCALATION POLICY
============================================================

Implement bounded escalation.

Escalate when ANY of these is true:

A. UNCERTAINTY
- JEV confidence/score margin is insufficient
- semantic judgments disagree
- reverse entailment changes the interpretation
- candidate relation cannot be safely resolved

B. CONSEQUENCE IF WRONG
- suppression may hide meaningful information
- CHANGES_STATE
- CHANGES_CERTAINTY
- CONTRADICTS
- CORRECTS
- RETRACTS
- merge
- split
- correction obligation
- high-consequence ambiguity

C. CONSTRUCTION REQUIRED
- create new Event
- create new Storyline
- multi-development evidence needs decomposition
- disagreement needs structuring
- existing intelligence requires repair

The strong model is an editorial construction/reasoning tool.

It is NOT:
- a web-search agent
- a source-expansion agent
- an unrestricted autonomous runtime

Its universe is approved evidence + Distilled memory.

============================================================
DEFER / REMATCH
============================================================

DEFER is legal for low-value ambiguity.

Do NOT leave the blocking REASSESS job pending.

That would prevent the Feed from briefing.

Instead:

DEFER
↓
persist a provisional conservative state
↓
enqueue REMATCH
↓
REMATCH must not block normal briefing dispatch

Later evidence may resolve the ambiguity cheaply.

Implement explicit lifecycle/provenance for provisional decisions.

============================================================
MILESTONE 6 — LIVE SEMANTIC EVENT / STORYLINE CONSTRUCTION
============================================================

Replace lexical Event identity as the preferred semantic path.

Workflow:

new ClaimMentions / candidate batch
↓
cheap candidate retrieval
↓
JEV relation decisions
↓
strong-model escalation where needed
↓
stored semantic judgment
↓
feed transaction consumes judgment
↓
attach/create/update Event
↓
attach/create/update Storyline

Do not perform pairwise comparisons against all historical intelligence.

Candidate retrieval should prefer compact recent/active memory.

Do not require embeddings.

Use available cheap signals such as:

- Entity overlap
- names/aliases
- time
- locations when available
- lexical anchors
- recent Event/Storyline membership
- existing deterministic similarity
- embeddings only if they demonstrably already exist/usefully help

Do not introduce an expensive embedding system merely because it is conventional.

============================================================
ENTITY LAYER
============================================================

Add Entity as a first-class cross-cutting representation.

Minimum shape:

Entity
- internal stable ID
- canonical label
- aliases[]
- optional external ID
- provenance/version metadata

Support multilingual aliases where discovered.

Examples that may resolve to the same entity:

BDL
Banque du Liban
Lebanon's central bank
مصرف لبنان

Do not require an external ID for every entity.

Do not build a global encyclopedic entity graph.

Entity resolution exists to improve:
- Event matching
- Storyline continuity
- retrieval
- state-slot identity
- multilingual normalization

============================================================
PROPOSITION / STATE REPRESENTATION
============================================================

Introduce semantic state AFTER ClaimMention persistence and semantic grouping
infrastructure exist.

Use two representations:

A. opportunistic structured StateSlot
B. free-text semantic Proposition for everything else

StateSlot should conceptually support:

(entity, attribute, value, asOf, certainty, attribution/support)

Use a SMALL controlled cross-domain attribute vocabulary.

Examples:

- count
- role_holder / role_status
- process_status
- decision_outcome
- vote_result
- monetary_amount
- percentage
- date_time
- score_result

Normalize extracted aliases such as:

death_toll
fatalities
fatality_count

onto a stable controlled attribute where possible.

Do NOT build hundreds of domain-specific schemas.

If something does not fit safely:
use a TEXT Proposition.

Certainty and attribution must not be accidentally erased.

A changed value or certainty must be recognized as new state.

Examples:

12 deaths → 40 deaths
must never become "pure repetition"

may sign → signed
must never become "pure repetition"

alleged → officially confirmed
must never become "pure repetition"

============================================================
CLAIM EXTRACTION COST POLICY
============================================================

Do not automatically use the strongest model once per article.

Use tiers.

At minimum:

Every surviving document cheaply:
- syndication/origin fingerprint
- key entities
- obvious quantities/numbers
- quotes/attribution where practical
- report time/dateline
- lead/new-reporting candidate spans

For likely origin clusters:
- choose a representative
- perform fuller semantic extraction where needed

For derivative/corroborating documents:
- focus on DELTAS not already represented

Use strong extraction where:
- new cluster/intelligence is being constructed
- multi-development content is detected
- cheap extraction is insufficient
- high-consequence ambiguity exists

Cache source-intrinsic extraction by content.

============================================================
SYNDICATION / INFORMATION ORIGIN
============================================================

Publisher count is not independence.

Preserve existing duplicate/copy-group machinery and strengthen its inputs.

Distinguish:

Reuters
+ three sites rewriting Reuters

from:

Reuters
+ independent BBC reporting
+ official statement

Use signals such as:
- near-verbatim similarity
- shared unusual quotations
- shared unusual numbers
- explicit attribution chains
- publication timing
- known syndication/copy relationships

Store origin/dependency as provenance.

Do not claim "independent corroboration" merely from distinct outlet domains.

============================================================
STORYLINE MEMORY
============================================================

Storyline state must be structured memory.

Do NOT repeatedly rewrite a prose summary of the previous Storyline summary.

That causes summary-of-summary drift.

Persist/derive compact state from structured records:

- current Proposition/StateSlot IDs
- recent meaningful Event IDs
- open questions
- expected next development/date if known
- last meaningful change
- relevant uncertainty/disagreement
- lifecycle
- version/provenance

Lifecycle:

ACTIVE
- currently receiving meaningful updates

WATCHING
- unresolved issue or known next event/deadline

DORMANT
- no current meaningful activity/open expected next event

CLOSED
- explicitly resolved where appropriate

Do not use a hard "three days then forget" rule.

Memory policy:

HOT:
recent Events, aggressively retrieved

ACTIVE/WATCHING:
compact Storyline state remains retrievable regardless of age

COLD:
old Event/evidence/version history remains stored but is not normally sent to
models

Principle:

LIMIT RETRIEVED CONTEXT,
NOT HOW LONG REALITY IS ALLOWED TO REMAIN CONNECTED.

============================================================
MILESTONE 7 — HIGH-RECALL SHORTLIST
============================================================

The current salience/relevance/window infrastructure remains useful.

Do not delete it.

Use it as:
- candidate signal
- pre-ranking
- prioritization
- fallback selector
- offline/model-unavailable behavior

Current JEV → GPT → deterministic salience path may remain while legacy
selection is still active.

Once comparative selection is authoritative, reconsider whether GPT fallback on
low-confidence salience still earns its cost.

The shortlist must bias toward RECALL.

Do not permanently remove candidates merely because a cheap semantic layer
thinks they are repetitive.

Compact flagged candidates may remain visible to the final editor.

The following MUST bypass ordinary shortlist caps:

- CHANGES_STATE
- CHANGES_CERTAINTY
- CONTRADICTS
- CORRECTS
- RETRACTS
- correction obligations

Pure high-confidence corroboration/already-communicated items may receive very
low priority.

============================================================
MILESTONE 8 — COMPARATIVE EDITORIAL SELECTION
============================================================

Implement one bounded strong-model editorial decision over the shortlist.

This replaces the concept of:

importanceScore > threshold => include

with:

Given:
- Feed intent/editorial brief
- briefing interval/window
- approved evidence only
- current Storyline state
- reader communication ledger
- shortlisted developments
- briefing budget

decide:

- what the reader needs now
- inclusion/omission
- order
- BRIEF / STANDARD / DETAILED treatment
- what changed
- necessary context
- must-include Propositions
- disagreement
- uncertainty
- unresolved questions
- correction obligations

Output a typed EditorialPlan.

The comparative editor MUST NOT:
- search the web
- add sources
- alter evidence
- bypass source boundaries
- invent unsupported claims
- publish directly

============================================================
EDITORIAL PLAN
============================================================

The EditorialPlan should be sufficiently structured that the final writer does
NOT have to rediscover editorial meaning.

For each selected development/story, preserve:

- Event / Storyline identity
- supporting ClaimMentions / Propositions
- previous reader state
- new understanding / delta
- importance rationale
- Feed relevance
- disagreements
- uncertainty
- unresolved issues
- required facts
- treatment
- ordering
- correction obligations
- exact approved evidence references

Persist model/provider/policy provenance.

============================================================
MILESTONE 9 — BRIEFING SYNTHESIS
============================================================

Keep the final writer separate from editorial selection.

The writer receives:

EditorialPlan
+
exact evidence/support
+
output language
+
briefing budget
+
Feed configuration

It does NOT receive an unrestricted raw article pile.

Its job is:

COMMUNICATE,
not decide which news matters.

Preserve adaptive treatment:

BRIEF
STANDARD
DETAILED

No user "writing style" setting is required.

Distilled automatically chooses appropriate depth.

============================================================
MILESTONE 10 — VERIFICATION
============================================================

Strengthen final verification without weakening existing grounding.

Verify:

1. SOURCE FIDELITY
   Extracted semantic state is faithful to source spans.

2. ENTAILMENT
   Each factual briefing statement is supported.

3. COVERAGE
   Every EditorialPlan MUST_INCLUDE fact survived synthesis.

4. ATTRIBUTION FIDELITY
   "X says/alleges/reports" must not silently become fact.

5. CERTAINTY FIDELITY
   may / expected / unconfirmed / confirmed distinctions survive.

6. TEMPORAL FIDELITY
   future/past/ongoing state and relevant dates remain correct.

7. LEDGER NOVELTY
   do not present already-communicated state as newly happening unless context
   legitimately requires restatement.

If verification cannot prove an important sentence:
- repair/retry within bounded policy if allowed
- otherwise fail safely
- never silently publish unsupported prose

============================================================
COST CONTROL
============================================================

The intended hierarchy is:

DETERMINISTIC
↓
JEV
↓
strong editorial reasoning only when it earns its cost
↓
briefing model only when something should actually publish

Specific rules:

- no new meaningful evidence => no semantic construction call
- quiet window => no final writer call
- database retrieval is not an LLM task
- existing memory lookup is deterministic
- source-intrinsic semantic results are cacheable
- strong construction calls are content-addressed
- no model call inside transaction
- all model calls have hard budgets
- persist cost/latency/model provenance
- provider failure must preserve a deterministic fallback path

============================================================
NO HUMAN EVALUATION WORK
============================================================

Do not:

- build a gold dataset
- ask for labels
- create manual review queues
- stop for benchmark design
- ask the owner to classify Events
- block implementation waiting for human judgment

However, you MUST still verify ENGINEERING correctness through:

- unit tests
- typed fixtures
- adversarial deterministic cases
- existing frozen replay
- idempotency checks
- graph invariants
- grounding checks
- source-boundary checks
- CAS/concurrency tests
- model-budget tests
- failure-mode tests
- typechecks

Adversarial fixtures should include deterministic expected behaviors for:

- 12 → 40
- may happen → happened
- allegation → confirmation
- correction/retraction
- same Event reworded
- distinct Event with very similar vocabulary
- background recap mistaken for new reporting
- rewritten syndication
- multilingual aliases when fixtures already support them

These are engineering invariants, not human-quality benchmarks.

============================================================
MIGRATIONS / STORAGE
============================================================

Prefer the existing generic feed document store for new semantic records when
appropriate.

Potential new document kinds include:

- claim_mentions
- entities
- propositions
- event_propositions
- relation_intents
- relation_judgments
- storyline_states
- ledger_entries
- correction_obligations
- editorial_plan_intents
- editorial_plans
- rematch_jobs/state as appropriate

Do not create a migration simply because a conceptual type exists.

If DB-level mutation/index/trigger changes are genuinely needed, add the
smallest additive migration.

Do not rewrite frozen historical migrations.

Preserve immutability rules unless a type is explicitly designed as a mutable
root with immutable/versioned children.

============================================================
AUTONOMOUS EXECUTION LOOP
============================================================

For EACH milestone:

1. inspect relevant current implementation
2. state the concrete defect/need internally
3. implement the smallest production-quality change
4. add focused tests
5. run focused tests
6. run broader relevant suites/typechecks
7. inspect persisted/replayed state where useful
8. self-review against this architecture
9. fix findings
10. git diff
11. git diff --check
12. ensure no secrets/local junk/reports/databases are accidentally staged
13. create a logical commit
14. push branch
15. continue to next milestone

Do not wait for me after each milestone.

Continue autonomously until the semantic core is coherently implemented or a
real external blocker is reached.

============================================================
SELF-REVIEW QUESTIONS
============================================================

Repeatedly ask:

- Did I accidentally hard-code editorial meaning?
- Can a meaningful update still be mislabeled pure corroboration?
- Can a changed number/state/certainty be suppressed?
- Can background recap create a phantom new Event?
- Can one article containing several developments be represented?
- Are unapproved sources leaking editorial facts?
- Does source dependence get mistaken for independent corroboration?
- Can a model call occur inside the CAS transaction?
- Can DEFER block the Feed indefinitely?
- Are Storyline snapshots becoming summaries-of-summaries?
- Can old active Storylines remain connected without loading old raw history?
- Did I create a global world state by accident?
- Did I make JEV/model availability a hard dependency?
- Can deterministic fallback still complete?
- Can a wrong early suppression remove something before the comparative editor
  can see it?
- Are correction/retraction obligations protected from shortlist caps?
- Does the writer receive only the structured editorial plan and allowed
  evidence?
- Can any factual sentence publish without support?
- Did I preserve existing publication/idempotency guarantees?

Fix material findings before moving on.

============================================================
TEST / VERIFICATION FLOOR
============================================================

At appropriate milestones run:

- focused v1 intelligence tests
- editorial tests
- editorial-facts tests
- preservation tests
- publication tests
- runtime tests
- RSS pipeline tests
- contracts suite
- connector tests where touched
- worker typecheck
- workspace typecheck
- broader worker suite where practical
- agent-runtime tests if shared runtime is touched
- git diff --check

Do not weaken:
- assertions
- timeouts
- guards
- security checks

merely to get green.

Preserve known unrelated browser-source guard behavior unless this work actually
touches it.

For flaky timing tests:
- rerun unchanged in isolation
- report honestly
- do not inflate timeouts as a workaround

============================================================
GIT HYGIENE
============================================================

Commit by coherent milestone.

Suggested commit families:

refactor: extract semantic intelligence matcher ports
feat: persist claim mention intelligence records
feat: add durable communication ledger
feat: add durable semantic relation judgments
feat: add bounded semantic escalation and rematch
feat: add entity and proposition state
feat: add structured storyline memory
feat: add comparative editorial planning
feat: integrate editorial plan briefing synthesis
test: cover semantic intelligence invariants

Exact names may differ.

Push after coherent milestones.

Do not squash useful history.

Do not commit:
- credentials
- .env secrets
- local databases
- local canary HTML
- model transcripts
- temporary reports
- screenshots
- generated junk

unless explicitly intended as repository artifacts.

============================================================
DEPLOYMENT
============================================================

Do NOT deploy production.

If a clearly identified development/test environment already exists and no
owner action is required, a bounded dev/test deployment is permitted only after
the relevant milestone is green.

Otherwise stop at pushed code.

Deployment success never substitutes for persisted-state verification.

============================================================
STOP CONDITIONS
============================================================

Do not stop merely because:

- implementation is large
- several files need refactoring
- a model integration needs a durable intent
- tests need updating for intentional architecture changes
- multiple milestones remain

Stop only for a genuine external blocker such as:

- required owner authentication/2FA
- destructive production operation requiring explicit approval
- unavailable external dependency with no safe fallback
- irreconcilable frozen-contract conflict
- missing secret/credential required for a live provider operation

If one optional provider is unavailable:
continue with mocks/fallbacks and the rest of the implementation.

============================================================
FINAL REPORT
============================================================

When complete, report:

1. final branch and HEAD
2. all commits created
3. migrations, if any
4. exact new semantic pipeline
5. what existing infrastructure remained unchanged
6. what old logic was demoted to fallback/hints
7. ClaimMention design
8. Entity/Proposition/StateSlot design
9. Event matching behavior
10. Storyline matching/state/lifecycle behavior
11. JEV choice/yes-no/score usage
12. strong-model escalation rules
13. DEFER/REMATCH behavior
14. origin/syndication handling
15. communication ledger behavior
16. correction obligations
17. shortlist behavior and protected delta classes
18. comparative EditorialPlan behavior
19. final writer integration
20. verification layers
21. deterministic fallback behavior
22. model call/cost controls
23. source-boundary guarantees
24. tests/typechecks/results
25. any known flaky/unrelated failures
26. deployment status
27. remaining genuine limitations

Do not report aspirational features as implemented.

Distinguish clearly between:
- fully implemented
- partially implemented
- fallback-only
- not implemented

============================================================
PRODUCT NORTH STAR
============================================================

Distilled is not trying to answer:

"What did these articles say?"

It is trying to answer:

"What actually happened,
what changed,
what does this reader already know,
and what do they need to know now?"

Build the semantic core around that.