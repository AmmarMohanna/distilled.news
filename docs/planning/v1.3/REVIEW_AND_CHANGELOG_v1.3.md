# Distilled.news — review and change log v1.3

**Review date:** 2026-09-20  
**Inputs:** The four user-supplied v1.2 Markdown files, the supplied project direction, the visible conversation and the explicit clarification that the VPS is for testing APIs and scrapers.  
**Result:** Four revised planning documents plus an index/decision register. Original files remain untouched. No application code, cloud resources or provider accounts were changed in this review.

## Review finding

The v1.2 documents were useful and detailed, but not fully aligned with the stated product/platform direction or the latest UI/artwork request. They also contained inconsistent versions, missing contracts and several benchmark assumptions that needed correction. The replacement documents remain a forward-looking plan; they do not shrink the roadmap to today's backend.

The documents cannot establish unseen agreements. Where a choice was not explicit in the supplied context, the revision marks it as an inherited target, proposed engineering detail or open decision rather than asserting that it was agreed.

## What stayed in the target

- CandidateProposal → Candidate Intake → CandidateItem → AcquiredContent → normalized evidence → dedup/roles → events → storylines → salience/relevance/window reasoning → bounded briefing synthesis.
- Separate article deduplication from event clustering and preserve independent evidence/corroboration.
- Immutable/versioned storyline and edition provenance within an explicit retention horizon.
- Feed-template reuse, canonical source acquisition reuse and shared intelligence as three distinct mechanisms.
- Bounded source recommendation and Web Intelligence; provider-neutral adapters; rule-based resource controls before learned routing.
- Frozen replay datasets, measurable quality/cost/latency/reliability evaluation and incremental vertical slices.
- The target 30-minute/hourly/daily/weekly reasoning windows, GDELT discovery, installable PWA and opt-in briefing-ready/meaningful-change notifications.
- The VPS test harness for APIs/scrapers, website/platform/discovery comparisons, raw capture, offline extraction, pilot, fault tests and seven-day benchmark design as proposed experimental defaults.
- The $400–500/month at 1,000 active users hypothesis remains a hypothesis, not a validated price or guarantee.

## Confirmed-direction corrections

| Topic | v1.2 issue | v1.3 change |
|---|---|---|
| Document purpose | “Frozen” text could be mistaken for authority over newer decisions or a claim of implementation | Explicit target status, decision provenance and user-request precedence |
| Platform | PostgreSQL/pgvector baseline and alternative queue defaults | Cloudflare Workers, D1, R2, Queues, Email Service, AI Gateway; optional Apify/image adapter; no assumed Vectorize |
| VPS | Runbook suggested the VPS could become production/staging acquisition hosting | VPS remains the API/scraper test environment, as clarified by the user; production adoption needs a separate portability gate |
| Public product | Accounts, multiple feeds, public URLs and stars under-specified | Public accounts; multiple owner-managed feeds; username-scoped public feed/edition URLs; aliases; stars/explore; basic retained search |
| Private scope | Public/organization/private template examples implied additional product tiers | Public product scope; internal scope/provenance checks retained; private-feed toggles not introduced; private-source expansion requires a later product decision |
| Source families | LinkedIn excluded; Apify treated only as an old X comparator | LinkedIn company/profile and Apify-backed adapters included; Google News explicit; GDELT retained |
| Landing | Latest layout absent | Centered brand, exact headline and subtitle, Create feed CTA, authentication continuation; preserve existing colors/fonts |
| Navigation | Mandatory Library tab conflicted with established UI direction | Home/Explore/Settings-Profile baseline; saved-content capability retained with placement open |
| Artwork | Feed-inspired pencil sketches absent | Dedicated image service contract, saved description input, optional edition-input extension, cached public image reads, fallback, usage and cleanup |
| Languages | Mainly English/Arabic | French included in baseline output and tests; UI language, output language and evidence filters kept separate |
| Search/chat | Boundaries implicit | Basic retained published-feed search; no public chatbot/Q&A; internal semantic reasoning does not require a public semantic-search service |

## Changes by document

### Architecture baseline

- Replaced the product section with the current public-product requirements and latest landing structure.
- Reconciled storage/runtime and queue selection with Cloudflare while retaining modular, replaceable capabilities.
- Preserved evidence, event, storyline, temporal scoring, bounded synthesis and evaluation ambitions.
- Kept Telegram public-channel acquisition as a baseline and Telethon as a measured alternative; no automatic Python/VPS production requirement.
- Added pencil-illustration boundaries and honest self-host/admin health requirements.
- Clarified that immutable records are not a promise of infinite retention.
- Fixed inherited subsection numbering and companion-document references.

### Technical contracts and service boundaries

- Added feed username/slug/title/revision/publication fields and public DTO rules.
- Scoped UserRelevance by feed revision, not just user, so two feeds from one user can differ correctly.
- Added actual window bounds/as-of time to WindowScore.
- Keyed checkpoints by canonical upstream resource/scope/version rather than publisher alone.
- Preserved supplied payload references across intake so an already-acquired RSS/API body does not disappear between boundaries.
- Made shared-acquisition eligibility aware of the union of active feed demands.
- Made acquisition method provider-neutral; provider-specific route variants remain in telemetry.
- Passed CandidateItem into fetch-fallback contracts so candidate linkage is explicit.
- Added D1/outbox/Queues commit and crash-recovery semantics without assuming a distributed transaction with R2.
- Added atomic claims and budget reservations for concurrent generation/retries, revision handling and correction/retraction requirements.
- Added per-device push idempotency, expiry and provider-acceptance semantics; no false receipt guarantee.
- Added account/public API, illustration, self-host configuration and contract-completeness sections. New endpoints/schemas are target proposals, not claims that today's routes already implement them.

### Implementation plan

- Retained M0–M15 identifiers and the intelligence build order for traceability.
- Added P0 for public accounts/feed identity, Cloudflare setup, canonical source identity/reuse, outbox, usage and retention foundations.
- Corrected the dependency inversion where shared-acquisition cost evaluation preceded the source-reuse milestone. Template matching stays later; canonical source reuse starts early.
- Included all confirmed source families and pencil imagery in acceptance coverage; retained GDELT and all four target windows.
- Added image failure, stale-result, concurrency, cost and ownership tests.
- Clarified PWA/push and UI integration targets without marking unimplemented features complete.
- Added a dependency/acceptance table and migration-oriented reuse of the professor's backend where it satisfies the target.

### Acquisition benchmark runbook

- Preserved VPS setup/harness instructions and explicitly limited their role to testing APIs/scrapers.
- Added LinkedIn/Apify company/profile tests and asynchronous actor-run failure/completion checks.
- Removed the unverified hardcoded Anthropic model/tool/fallback recipe; enabled contenders must pin verified current official schemas, model IDs and pricing at execution time.
- Distinguished raw HTTP bytes, rendered DOM and provider text; offline extraction avoids another fetch but is not compute-free.
- Corrected AcquiredContent export to use canonical intake IDs, not gold-label IDs.
- Made scoring exhaustive: every extraction has one outcome; high F1 with some missing anchors no longer falls through the rules.
- Separated human gold labels, automated gold scoring and weak live proxy signals; no snippet-based claim of full article completeness.
- Corrected repeated-sample statistics: repeated requests to one article are not independent samples for a naive Wilson interval.
- Added ordered-text checks, short-item anchor handling, unknown-date semantics and reviewed canonical identity.
- Changed the curl JavaScript check from “proof” to a diagnostic requiring corroboration.
- Removed guaranteed storage/cost assumptions; unknown cost remains unknown and paid routes start disabled until configured.
- Fixed contradictory 429 retry guidance, made controlled X deletions observable at the selected polling cadence, and clarified Telegram pagination/edit/deletion/ID-gap limitations.
- Added runtime portability, shared domain scheduling, DNS/network enforcement, budget validation and backup-retention gates.
- Preserved numerical benchmark defaults as proposed values to freeze after the pilot, not measured results or authorized spending.

## Deliberately not frozen

The exact image provider, automatic-generation policy, image quota, retention periods, successful acquisition providers, Telethon adoption, optional external runtime, numerical quality gates and workload economics remain open or proposed. The prior code's Workers AI/FLUX adapter and five-attempt quota are useful starting points, not evidence that these product choices were explicitly agreed.

No production credentials were tested or copied into this pack. The earlier local missing-key audit is not treated as permanent configuration truth; the plan instead specifies capability checks and required credentials for enabled services.

## Verification of this document pack

The pack is checked for readable UTF-8, balanced fenced blocks, valid relative Markdown links, consistent v1.3 companion filenames, removal of stale model/production-VPS defaults, inclusion of agreed features and preservation of the key target milestones. Original-file hashes and generated-file hashes are in `DOCUMENT_MANIFEST.json`. These are document checks, not implementation or live-provider tests.
