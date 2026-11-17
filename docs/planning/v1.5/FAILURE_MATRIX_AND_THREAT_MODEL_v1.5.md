# Distilled.news — Failure Matrix and Threat Model v1.5

**Status:** Required engineering/FYP evidence artifact; target controls and test obligations, not a claim that every row currently passes  
**Reviewed:** 2026-09-22  
**Depends on:** `ARCHITECTURE_BASELINE_v1.5.md`, `TECHNICAL_CONTRACTS_AND_SERVICE_BOUNDARIES_v1.5.md`, `IMPLEMENTATION_PLAN_v1.5.md`, `DISTILLED_AGENT_RUNTIME_AND_WEB_OPERATOR_ARCHITECTURE_v1.5.md`

## 1. Purpose

This document makes Distilled's failure and security obligations explicit. It is deliberately separate from the architecture so the project can maintain a living Path-A Failure Matrix, lightweight threat model, test evidence, residual risk and regression status without turning the core architecture into a test log.

A row is not considered closed because a design control exists. Closure requires executable evidence: a test, trace, fault injection, benchmark, review record, or measured production/pilot observation appropriate to the failure.

## 2. Failure Matrix

| ID | Failure | Component / boundary | Detection | Safe default / recovery | User impact | Required evidence | Status |
|---|---|---|---|---|---|---|---|
| F01 | Source timeout / DNS / TLS failure | Connector / Acquisition | Typed transport error | Bounded retry/backoff; isolate source; alternate permitted route only when justified | Delay / missing source | Integration + fault test | Pending evidence |
| F02 | Provider 429 / 5xx / outage | Acquisition or model provider | Status/error taxonomy, circuit metrics | Honor Retry-After; bounded fallback; do not mark publisher unhealthy from provider failure | Delay / degraded coverage | Recorded/fault test | Pending evidence |
| F03 | HTTP 200 but bad/partial extraction | Acquisition | Production validator + completeness signals | Reject as successful content; try measured allowed fallback | Story may be delayed/omitted | Gold extraction benchmark | Pending evidence |
| F04 | Duplicate candidate from multiple discovery paths | Candidate Intake | Canonical URL/upstream ID/payload hash | Reuse canonical CandidateItem; no duplicate acquisition spend | None | Replay/idempotency test | Pending evidence |
| F05 | Same article acquired through multiple providers | Evidence | Normalized content hash / canonical identity | One canonical evidence identity; retain acquisition provenance | None | Dedup regression test | Pending evidence |
| F06 | False semantic duplicate | Evidence | Held-out labeled pairs | Preserve independent evidence; tune/rollback model/policy | Corroboration/coverage error | Held-out dedup evaluation | Pending evidence |
| F07 | False event merge | News intelligence | Held-out event pairs/clusters | Reassign/version membership; preserve audit | Misleading storyline | Held-out clustering evaluation | Pending evidence |
| F08 | False event split | News intelligence | Held-out event pairs/clusters | Merge/reassign with new version | Fragmented briefing | Held-out clustering evaluation | Pending evidence |
| F09 | Incorrect evidence role | Evidence classification | Held-out role labels | Version decision; keep earlier decision; exclude unsafe roles from fact claims | Context/briefing error | Macro-F1 + error review | Pending evidence |
| F10 | Unsupported/unverified source recommendation | Source recommendation | Deterministic identity/relevance/connector verification | Do not activate/follow automatically; return verified options only | Reduced coverage | Contract + adversarial tests | Pending evidence |
| F11 | Source checkpoint advances before durable work | Connector state | Transaction/invariant checks | Never advance until accepted work committed | Permanent missed news | Crash-boundary test | Pending evidence |
| F12 | Duplicate queue delivery | Messaging | Idempotency key / fenced claim | Join/exit behind canonical work; no duplicate canonical effects | None | Concurrent redelivery test | Pending evidence |
| F13 | Worker crash mid-pipeline | Messaging / persistence | Lease expiry / nonterminal state | Resume from durable state; reconcile side effects | Delay | Crash-injection matrix | Pending evidence |
| F14 | Model malformed output | Agent/model boundary | JSON/schema validation | One bounded correction/fallback; never dispatch malformed tool | Delay / typed failure | Scripted-model test | Pending evidence |
| F15 | Model/tool loop | Agent runtime | Progress fingerprint / hard counters | Recovery hint then terminate within budget | Partial result / delay | Loop regression test | Pending evidence |
| F16 | Budget exhaustion | Resource controller / agent | Atomic counters | Stop optional work; publish truthful partial result if allowed; never silently overspend | Reduced coverage | Per-dimension budget tests | Pending evidence |
| F17 | Browser action may have occurred but result was lost | Web Operator | Intent/dispatched state without persisted result | Fresh observation reconciles effect or mark `effect_unknown`; unsafe replay forbidden | Delay / manual review | Crash Case B | Pending evidence |
| F18 | Stale worker writes after takeover | Agent runtime | Lease generation/fencing predicate | Reject late mutation; retain diagnostic only | None | Fencing test | Pending evidence |
| F19 | Browser crash / lost context | Browser runtime | Session/target failure | Rotate generation, rebuild isolated context, resume from safe checkpoint | Delay | Real-browser fault test | Pending evidence |
| F20 | Prompt injection / malicious webpage instructions | Web Operator | Untrusted ObservationEnvelope + policy boundary | Treat as data only; outside-model authorization; block exfiltration/actions | None if controlled | Hostile fixture | Pending evidence |
| F21 | SSRF / private IP / DNS rebinding / redirect escape | Browser/network | URL/DNS/IP/redirect/subresource policy | Block and terminate route; security event | None if controlled | Network adversarial tests | Pending evidence |
| F22 | Download/popup escapes scoped page | Browser/network | Download/new-target hooks and policy | Quarantine/deny unless explicitly permitted | None if controlled | Browser fixture | Pending evidence |
| F23 | Login/session expiry/MFA/CAPTCHA | Browser challenge state | Typed classifier | Checkpoint and suspend/switch/fail; no CAPTCHA solving loop or model-entered secrets | Delayed/partial acquisition | Challenge tests | Pending evidence |
| F24 | Cross-account/tenant access | API/storage/browser | Authz, scope checks, isolated contexts/artifact namespaces | Deny, audit, revoke implicated capability where appropriate | Security incident | Authorization tests | Pending evidence |
| F25 | Secret/profile leakage into prompt/log/artifact | Auth/browser/observability | Redaction + schema restrictions + review | Revoke capability/version, kill leases, quarantine trace | Security incident | Secret-leak tests | Pending evidence |
| F26 | Model/provider privacy route violates policy | Model router | Capability/privacy/residency/ZDR filters | No route if none eligible; typed failure | Reduced functionality | Routing tests | Pending evidence |
| F27 | Stale/obsolete image generation result | Illustration | Feed/input/style revision mismatch | Discard obsolete result; keep fallback/current image | Cosmetic only | Concurrency/staleness test | Pending evidence |
| F28 | Push duplicate / expired subscription | Delivery | Device idempotency + provider terminal status | Suppress duplicate; disable terminal subscription; briefing remains in-app | Notification issue only | Multi-device delivery tests | Pending evidence |
| F29 | Meaningful-change false positive | Personalization/delivery | Evaluation + user feedback | Suppress/tune policy; notifications remain opt-in | Notification noise | Pilot + regression | Pending evidence |
| F30 | Briefing contains unsupported factual claim | Briefing agent | Reference mapping / factual grounding evaluator | Reject/regenerate within budget or omit unsupported statement | Trust error | Held-out grounding evaluation | Pending evidence |
| F31 | Briefing omits important development | Ranking/briefing | Held-out important-event/storyline labels | Adjust retrieval/ranking/coverage policy | Incomplete briefing | Recall@K / pilot evidence | Pending evidence |
| F32 | Catch Me Up scope ambiguity | Frontend/briefing request | Explicit account/Home vs feed scope in request/trace | Show/record active scope; do not silently change it | Confusing recap | UI/contract test | Pending evidence |
| F33 | External acquisition provider violates budget/terms | Acquisition/resource control | Usage ledger + provider status + policy review | Disable route; choose permitted alternative | Degraded coverage | Billing/policy reconciliation | Pending evidence |
| F34 | Retention cleanup removes evidence needed for promised reproducibility | Storage/retention | Retention-policy checks | Make replay horizon explicit; preserve required provenance until declared expiry | Reduced historical replay | Retention test/review | Pending evidence |

## 3. Lightweight Threat Model

### Evidence ownership and held-out discipline

All matrix rows remain **Pending evidence** until a linked artifact supports closure. For each row, the evidence register records: responsible workstream/person, severity and rationale, fixture/test identifier, code and policy revision, artifact reference, execution date, observed result, residual risk, reviewer and next action. Start with unassigned/not-assessed values rather than inventing completed checks; assign owners before enabling the affected capability. Raw traces and security details remain private where necessary.

Detection on a held-out set does not authorize tuning against it. For F06–F09, F29–F31 and other quality failures, preserve the original final result, mark that partition consumed if used to guide fixes, develop changes using development fixtures, and obtain a new sealed partition for new final claims. Routine regression testing uses development/validation material.

This includes checkpoint replay (F11–F13), uncertain browser effects (F17), authorization (F24), image staleness (F27) and all network/prompt-injection cases. A missing test is an open obligation, not evidence of a secure implementation.

### 3.1 Assets

- user accounts, feed definitions and notification preferences;
- public feed integrity and username/slug ownership;
- provider/API credentials and browser authentication capabilities;
- browser profiles, cookies, tokens and session material;
- source checkpoints, canonical evidence, event/storyline state and briefing provenance;
- raw captures and retained artifacts;
- model/API/acquisition budgets;
- queue/outbox state and idempotency identities;
- evaluation corpora and held-out labels;
- published briefing integrity and original-source references.

### 3.2 Trust boundaries

```text
User/browser client
    ↓ authenticated API boundary
Distilled Workers/API
    ↓ queue/outbox + storage boundaries
Connectors / acquisition providers / model providers
    ↓ untrusted external-content boundary
Websites / feeds / public platform content

Web Operator additionally crosses:
model proposal → policy/tool dispatcher → isolated browser/network broker → untrusted ObservationEnvelope
```

### 3.3 Threats and controls

| Threat | Primary assets at risk | Main controls | Residual-risk question / evidence |
|---|---|---|---|
| Prompt injection from publisher/webpage | Objective, tool authority, secrets, integrity | Typed untrusted observations; system/policy separation; external policy engine; closed tools; no raw secrets | Hostile fixture must prove page text cannot expand authority |
| SSRF / metadata/private-network access | Internal network, credentials | Scheme/host/port/DNS/IP checks on every request/redirect/subresource; rebinding defenses | Adversarial redirect/rebinding suite |
| Cross-account data access | Accounts, feeds, artifacts, browser state | Authn/authz, owner checks, scoped IDs, isolated contexts/namespaces | Negative authorization tests |
| Credential exfiltration | Provider/user credentials | Secrets outside prompts; broker injection; encrypted profile store; redaction; domain egress policy | Secret-canary tests and log review |
| Replay/duplicate execution | Budgets, evidence integrity, external effects | Idempotency keys, fenced leases, transactional outbox, effect certainty | Concurrent delivery and crash-boundary tests |
| Malicious download / popup / new origin | Host/runtime integrity | Quarantine; deny-by-default; origin policy; size/MIME limits; no execution | Browser fixtures |
| Unauthorized external mutation | External accounts/services | v1 action classes deny publish/send/like/subscribe/purchase/delete/account changes | Scripted forbidden-action test |
| Provider privacy/retention mismatch | User/source data | Policy-aware model/provider routing; sensitivity/residency/ZDR filters | Route-filter tests and provider configuration review |
| Denial-of-wallet / retry storm | Budget/availability | Atomic reservations, hard multidimensional limits, circuit breakers, challenge budgets, loop detector | Exhaustion/fault tests |
| Model hallucinated completion | Evidence/briefing correctness | Deterministic completion verifier; grounding/reference checks | Early-completion rejection tests |
| Poisoned or mislabeled evaluation data | Quality claims | Versioned annotation guide, double labeling/sample audits, sealed held-out set | Label audit / leakage check |
| Supply-chain or dependency compromise | Runtime integrity | Pinned dependencies, CI scanning, minimal runtime surface, no dynamic untrusted plugins | Dependency/container scan evidence |

## 4. Failure-to-regression rule

Every material failure discovered in implementation, benchmark, pilot, red-team exercise or live operation must produce, where feasible:

```text
reproducible fixture or trace
→ classified failure code
→ root-cause analysis
→ control/change
→ regression test
→ measured re-run
→ residual-risk note
```

Do not close a failure solely because a prompt was changed. Prefer deterministic control, schema/policy enforcement, idempotency, isolation, validation or bounded recovery when the failure can recur outside the model.

## 5. Course evidence checklist

Before final submission, this artifact should link each high-risk row to the corresponding test/trace/report and summarize:

- failures observed rather than only hypothetical failures;
- failures intentionally injected;
- which failures remain accepted residual risk;
- threat-model controls that were actually exercised;
- regression tests created from discovered failures;
- the user-visible degradation behavior for important failures;
- any capability intentionally disabled because safe operation was not demonstrated.
