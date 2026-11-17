# Distilled.news — target plan v1.5

**Reviewed:** 2026-09-22  
**Purpose:** Plan the product we are building toward; this is not a completion report or a snapshot of the current backend.

## Read the documents

Start with [Project Problem and Validation](PROJECT_PROBLEM_AND_VALIDATION_v1.5.md) for target users, workflow hypotheses, deterministic/human boundaries, success measures and the proposed interview/pilot protocol.

1. [Architecture baseline](ARCHITECTURE_BASELINE_v1.5.md)
2. [Technical contracts and service boundaries](TECHNICAL_CONTRACTS_AND_SERVICE_BOUNDARIES_v1.5.md)
3. [Implementation plan](IMPLEMENTATION_PLAN_v1.5.md)
4. [Acquisition benchmark runbook](ACQUISITION_BENCHMARK_RUNBOOK_v1.5.md)
5. [Agent Runtime and Web Operator architecture](DISTILLED_AGENT_RUNTIME_AND_WEB_OPERATOR_ARCHITECTURE_v1.5.md)
6. [Failure Matrix and threat model](FAILURE_MATRIX_AND_THREAT_MODEL_v1.5.md)
7. [Review and change log](REVIEW_AND_CHANGELOG_v1.5.md)

The v1.5 set supersedes the supplied v1.4 pack as the reconciled target plan. Earlier documents remain historical inputs. Detailed intelligence contracts and evaluation milestones are retained; absence from today's code is not a reason to remove a target requirement.

## Decision provenance

| Status | Meaning |
|---|---|
| Confirmed direction | Cloudflare-first independently deployable/open-source product; public accounts and multiple public feeds; username-scoped URLs; stars/explore; Telegram, RSS, Google News, websites, X, LinkedIn and optional Apify; retained published-feed search; no chatbot/open-ended public Q&A; preserve the visual identity; centered landing; feed-inspired pencil sketches; VPS used for API/scraper experiments. Catch Me Up is a first-class user-triggered action and is **not** restricted to cross-feed synthesis. |
| Retained target | Incremental evidence → events → versioned storylines; evidence roles; three reuse layers; bounded source discovery/Web Intelligence/briefing synthesis; resource controls; evaluation; installable PWA; opt-in Web Push; bounded Web Operator as a high-cost acquisition/discovery capability behind normal contracts. |
| Proposed implementation | Specific schemas, new routes/services, thresholds, quotas, provider choices, model routes and migration sequencing. These remain engineering proposals until accepted by implementation/evaluation evidence. |
| Open decision | A choice requiring product input or measured evidence. It is explicitly marked rather than silently inferred from current code. |

## Conflict rules

- Explicit user decisions take priority over older documents. A document's “frozen” wording does not prevent a requested revision.
- Architecture owns product scope; contracts own object/API semantics; the implementation plan owns dependency order; the runbook owns acquisition experiments; the Web Operator document owns its specialized runtime boundary; the Failure Matrix/threat model owns failure/security evidence tracking.
- `CandidateProposal → Candidate Intake → CandidateItem` is the canonical discovery boundary. Web Intelligence and the Web Operator cannot bypass it.
- Known-candidate fallback acquisition returns `AcquiredContent` and then rejoins the normal normalization/evidence path.
- Public publication never makes passwords, emails, raw payloads, feed prompts, provider credentials, notification subscriptions or internal decision traces public.
- Catch Me Up may operate at Home/account scope or individual-feed scope. It does not require multiple updated feeds and is not withheld solely because a recap is not cross-feed.

## Self-hosting meaning in v1

“Self-hostable” in this plan means an operator can deploy an independent Distilled instance from the open-source codebase into an account they control using the selected Cloudflare-first baseline. Broader infrastructure portability is desirable but is not a v1 acceptance requirement. Provider-specific acquisition/model/image services remain replaceable behind stable interfaces.

## Open decisions retained honestly

- Release sequencing of the retained 30-minute cadence alongside hourly/daily/weekly.
- Exact active-news, raw-evidence, historical-storyline, edition-provenance and benchmark retention periods.
- Image provider, automatic-first-cover versus explicit generation, refresh policy and image budget.
- Which website fallback/discovery providers win, whether Telethon materially improves Telegram coverage, and which production browser executor satisfies the Web Operator port.
- Quantitative quality/latency/cost gates, final reference workload and supported-browser delivery results. The inherited $400–500/month at 1,000 active users remains a hypothesis until measured.
- Saved-story/Library UI beyond the established Home, Explore and Settings/Profile navigation.

## Evaluation rules

- User/problem validation is part of the Path-A/FYP evidence; the general product is not narrowed to a single profession.
- The evaluation corpus is versioned and includes a sealed held-out final test partition.
- Held-out data must not be used for prompt/model/threshold/weight/feature tuning.
- Failures found in benchmarks, adversarial testing, pilots or implementation should become regression tests where feasible.
- The Failure Matrix and threat model are living evidence artifacts, not architecture decorations.

The supplied v1.4 pack already addresses most findings in the pasted review of v1.3. See the change log for retained fixes versus new v1.5 work. The review notes are the basis for course-related planning here; the original course rubric and completed user-study evidence were not supplied for this revision.

Development has separate `train_or_examples` and `validation` partitions; neither is the sealed final test set. Acquisition route selection uses development evidence too. Never tune on final test results and report the same set as a fresh held-out test.

## Cloudflare authorization note

For deployment, authorize only the Cloudflare capabilities actually used by the selected baseline (for example Workers, D1, R2, Queues, AI services and route/domain access when applicable). OAuth login can authenticate local Wrangler without implying that resources, provider accounts, email configuration or application health are already valid. Keep operational capability checks separate from credential presence.
