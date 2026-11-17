# Distilled Agent Runtime and Web Operator Architecture v1.5

Status: specialized target architecture; implementation status is tracked separately  
Original design date: 2026-09-10  
Reconciled with Distilled planning pack: 2026-09-22  
Original Distilled revision inspected: `37eb30e16426`  
Decision scope: the highest-cost, browser-native acquisition fallback and the runtime needed to operate it safely

## Version 1.5 authority and reconciliation

Read this document with `ARCHITECTURE_BASELINE_v1.5.md`, `TECHNICAL_CONTRACTS_AND_SERVICE_BOUNDARIES_v1.5.md`, `IMPLEMENTATION_PLAN_v1.5.md`, `ACQUISITION_BENCHMARK_RUNBOOK_v1.5.md`, and `FAILURE_MATRIX_AND_THREAT_MODEL_v1.5.md`. This document is a specialized architecture subordinate to the main Distilled acquisition and evidence contracts; it does not redefine the product pipeline.

The design originated from an inspection of revision `37eb30e16426`, so sections describing the code state observed on 2026-09-10 are historical evidence rather than a statement about the current repository. Current implementation status must be established from the repository/branch under review, not inferred from this target document.

The retained target is the **bounded Web Operator capability** itself. The concrete production browser executor remains a deployment choice behind `BrowserExecutorPort` (for example Cloudflare Browser Rendering, a dedicated internal service, or another controlled provider) and must be selected by measured isolation, fidelity, duration, cost, policy and operational evidence.

## 1. Executive summary

Distilled should build a small, durable, server-side agent runtime around the acquisition contracts it already specifies. The Web Operator is not a new ingestion pipeline and is not a general coding agent. It is a bounded `AcquisitionStrategy` used only when cheaper strategies cannot obtain or discover content. For a known `CandidateItem`, it returns `AcquiredContent` to the existing normalization boundary. In discovery mode it returns `CandidateProposal` objects to Candidate Intake. It must never directly create `NormalizedEvidenceItem`, advance source checkpoints, set source health, publish content, or promote its own adapter.

The runtime should use an explicit, queue-driven state machine. Every model call and tool call has a durable identity. State changes are append-audited, calls are validated and policy-checked outside the model, observations are treated as untrusted data, and completion is accepted only by a deterministic goal-specific verifier. Delivery is at least once; correctness comes from leases with fencing tokens, idempotency keys, append-before-effect intent records, atomic accepted-output/checkpoint updates, and honest `effect_unknown` recovery rather than a false exactly-once promise.

The v1 browser surface has two complementary typed interfaces over the same isolated Chromium context: **Structured Browser Use** for DOM/accessibility/state-grounded navigation and extraction, and **Visual Computer Use** for screenshots and bounded coordinate/keyboard interaction when semantic grounding is insufficient. Structured access is preferred; visual interaction is a metered fallback, not the default. Neither surface exposes arbitrary JavaScript, `page.evaluate`, or shell access, and both pass every proposed action through the same external `PolicyEngine`.

Every external result enters context through a first-class `ObservationEnvelope`. The immutable raw observation is stored separately from the bounded, sanitized model-facing representation; provenance, hashes, transformation metadata, and truncation are durable. A `Tenant -> AgentRun -> BrowserSession -> BrowserContext` chain is pinned to one `UpstreamResource`, policy snapshot, and `AuthCapability`/`BrowserProfile` version. Secret browser state is encrypted and broker-injected; cookies, tokens, storage state, passwords, and MFA material never enter prompts, logs, or ordinary events.

Each model call resolves a logical `ModelRole` through a policy- and budget-aware `ModelRouter`; a run is not pinned to one LLM. `ModelRole -> configured primary/fallback chain -> ModelGateway` is the contract. `DISTILLED_LLM_MODE=api|self_hosted|hybrid` selects hosted API, internal OpenAI-compatible inference, or per-target coexistence without changing the agent loop. OpenRouter remains the default hosted gateway, while Distilled retains logical routing authority instead of delegating it to an opaque automatic router. Capability, tenant/source privacy policy, provider eligibility, remaining budget, quality, cost, latency, and availability all constrain selection, and routing provenance is durable.

The long-term self-healing unit should be a versioned, declarative `AdapterDefinition`: bounded HTTP and browser steps, selectors, pagination rules, field mappings, transforms, termination rules, and validation expectations. An agent may propose a candidate; a separate validator tests fixtures and a live canary; a promotion controller, not the agent, activates it. Working adapters are never rewritten after a lone transient failure. Repair begins only after classified, repeated structural failures and is bounded by cooldown and budget.

The first implementation slice should prove the boundaries on a local hostile fixture site: explicit feature-flagged invocation, durable run, scripted model, configurable `ModelRole`, real Chromium in an isolated context, one structured action, one visual action, `ObservationEnvelope`, external policy denial, typed challenge classification, deterministic watermark completion, exactly one accepted `AcquiredContent`, a complete audit trace, and the four dangerous crash/resume cases without duplicate evidence. It deliberately excludes live credentials, real CAPTCHA/MFA handling, automatic escalation, and generated adapter promotion.

## 2. Distilled architecture and original implementation context

### 2.1 The target architecture already defines the right acquisition objects

The normative design separates a user-facing `SourceSubscription` from a shared `UpstreamResource` (`TECHNICAL_CONTRACTS_AND_SERVICE_BOUNDARIES_v1.5.md`, `SourceSubscription`, `UpstreamResource`; `SOURCE_CONNECTOR_SPEC.md`, the same symbols). Scheduling and acquisition are resource-scoped; results fan out idempotently to subscriptions. This matters because an agent run should be attached to the resource/acquisition attempt, not duplicated per briefing subscriber.

The existing conceptual flow is:

```text
Source detection / connector
        -> CandidateProposal (only for newly discovered URLs)
        -> Candidate Intake
        -> CandidateItem
        -> Acquisition Router
        -> selected AcquisitionStrategy
        -> AcquiredContent
        -> normalization
        -> NormalizedEvidenceItem
        -> downstream briefing pipeline
```

`TECHNICAL_CONTRACTS_AND_SERVICE_BOUNDARIES_v1.5.md` makes this distinction explicit in `CandidateItem`, the “Acquisition Router” section, `AcquiredContent`, and `NormalizedEvidenceItem`. Its “Web Intelligence Contracts” section distinguishes discovery from fallback acquisition and explicitly prevents fallback output from looping back through candidate discovery.

Other constraints the runtime must preserve:

- `SourceCheckpoint` advances only after accepted work is persisted.
- Queue delivery is durable at least once and consumers are idempotent.
- `AcquisitionRouteStats` separates route reliability and quality.
- `ModelCapability` and `ModelExecutionRecord` already provide the conceptual model-routing/accounting boundary.
- `SourcePolicy` and `DeploymentComplianceProfile` govern allowed methods, retention, jurisdictions, and provider terms.
- Resource health and subscription display state are projections; individual execution attempts must not invent a competing health state.
- Credentials are encrypted or held in a secrets service and are not returned through source APIs.

### 2.2 Original inspected code state on 2026-09-10 (historical)

The worker currently has a briefing-scoped `SourceRecord` and three providers (`telegram`, `rss`, `apify`) in `apps/worker/src/types.ts`, rather than the target `UpstreamResource`/`SourceSubscription` split. `apps/worker/src/sources.ts` dispatches in `refreshSource`, persists raw payloads/messages in `persistMessages`, creates `ProcessingJobRecord`, and enqueues processing. Apify alone has a persisted `SourceRunRecord` lifecycle. `apps/worker/src/index.ts` supplies at-least-once queue handling, a five-attempt quarantine decision, scheduled polling, and stale-job rescue. `apps/worker/src/processor.ts` applies deterministic processing first and treats model review as advisory.

Migrations `apps/worker/migrations/0001_initial.sql` through `0010_briefing_editions.sql` contain sources, raw messages, processing jobs, source runs, evidence/briefing items, model usage, accounts, and editions. They do not yet contain the target resource/subscription/candidate/acquired-content objects or agent runtime records.

There is no production Playwright/CDP integration. Playwright is test infrastructure only. Therefore the Web Operator should be designed against the target contracts (originally v1.2; reconciled here to v1.5) while entering implementation through a temporary compatibility adapter to today's worker; it must not harden the current briefing-scoped `SourceRecord` as the future ownership boundary.

### 2.3 Existing patterns to reuse

- Queue consumer classification, delayed retry, and quarantine in `apps/worker/src/index.ts`.
- R2 storage of raw acquisition material before downstream processing in `apps/worker/src/sources.ts`.
- Deterministic-first, model-advisory behavior in `apps/worker/src/processor.ts`.
- Deterministic URL/text/event deduplication in `packages/core/src/events.ts`.
- Existing model gateway configuration and usage recording in `apps/worker/src/ai.ts`, upgraded to strict schema validation and durable call records for agent use.
- Existing resource/subscription, policy, route-statistics, checkpoint, and model-capability contracts rather than parallel replacements.

The current `persistMessages` sequence is not a sufficient durability template for the agent runtime: raw save, processing-job creation, and queue send are separate operations. The new runtime requires a transactional state/outbox boundary before external effects.

## 3. Exact agent-runtime integration point

### 3.1 Known-candidate mode

Register `web_operator` as an `AcquisitionStrategy` behind the existing `AcquisitionRouter`. The operator never selects or invokes itself. The controller combines typed route failure/history with `BudgetController`, source/tenant policy, and a feature flag to decide whether an operator run may be admitted. In the first slice invocation is test-only/manual behind `DISTILLED_WEB_OPERATOR_ENABLED`; automatic escalation remains disabled until route failures are reliably classified.

Input is a durable `CandidateItem` plus resolved `UpstreamResource`, `SourcePolicy`, route history, and an optional `AuthCapabilityRef`. Output is one of:

- `AcquiredContent` with publisher identity, acquisition provider `web_operator`, raw-object references, final URL, timestamps, content basis, and trace/run identifiers;
- a typed no-content outcome such as watermark reached, unavailable, policy-blocked, or human assistance required;
- a classified `AgentFailure`.

Normalization remains the only path from `AcquiredContent` to `NormalizedEvidenceItem`.

### 3.2 Discovery mode

When the Web Intelligence budget controller intentionally invokes discovery, the operator emits `CandidateProposal` records with observed URLs and provenance. Candidate Intake canonicalizes, validates, deduplicates, and creates `CandidateItem`. The operator cannot bypass intake or claim that page text is normalized evidence.

### 3.3 Ownership boundary

| Agent runtime owns | Acquisition/connector platform retains |
|---|---|
| Bounded run/turn/model/tool orchestration | Source/resource scheduling and refresh cadence |
| Browser-session lease for one run | `UpstreamResource` and `SourceSubscription` lifecycle |
| Context assembly and untrusted-observation envelopes | Candidate canonicalization and deduplication |
| Tool validation, policy request, and dispatch | Acquisition-route selection and route statistics |
| Run-local retries, budgets, cancellation, checkpoints | `SourcePolicy` resolution and compliance truth |
| Candidate adapter proposal and validation request | Adapter registry, canary, promotion, rollback |
| Run events and artifacts | Resource health and subscription display-state projection |
| Execute a versioned deterministic completion verifier over persisted facts | Own completion-contract selection/versioning, accepted output persistence, and checkpoint advance |

The Policy Engine is shared infrastructure: acquisition resolves the applicable policy and gives the runtime a compiled, immutable capability envelope; the runtime enforces it on every action. The agent may not broaden it.

Future automatic escalation is an acquisition-control transition, never a model tool. It requires a typed prior route outcome such as `STRUCTURAL_EXTRACTION_FAILURE`, `TEMPORARY_NETWORK_FAILURE`, `SOURCE_OUTAGE`, `POLICY_BLOCK`, `CAPTCHA_REQUIRED`, `SESSION_EXPIRED`, `SITE_REDESIGN`, `EXTRACTION_QUALITY_FAILURE`, or `PERMANENT_SOURCE_UNAVAILABLE`. Transient failures do not justify an immediate expensive fallback, and challenge/policy failures may require a different legal route or suspension rather than a Web Operator retry.

## 4. Reference repositories inspected

The local reference lab was inspected by code path, not treated as a collection of independent votes. Reconstructed Claude repositories that describe the same release family are one evidence family.

| Repository/family | Revision observed | Role in this investigation | Evidence confidence |
|---|---:|---|---|
| `openai-codex` | `946973…` | Primary mature runtime: session/turn loop, tools, persistence, protocol, approvals | High; source implementation |
| `anthropic-claude-code-official` | `e62465d…` | Official changelog, plugins, hooks and settings; not the full runtime | High for exposed behavior only |
| `claude-code-source` | `c8cd253…` | Reconstructed full runtime implementation | Medium-high; implementation is reconstructed |
| `claude-code-public-package-extract` | `4e5426b…` | Corroborating extraction and architecture map of the same Claude family | Medium; not independent evidence |
| `claude-architecture-notes` | `ecf897e…` | Navigation/interpretation aid | Low as proof; never used alone |
| `claude-harness-rewrite` | `9ade3a7…` | Independent typed rewrite showing reducible runtime boundaries | Medium; behavior-inspired rewrite |
| `claw-code` | `08106b0…` | Rust parity implementation, permissions and harness tests | Medium; derivative |
| `lazycodex` | `10f955…` | Extension/hook loop guards and context-injection budgeting | Medium for its own plugin behavior |
| `opencode` | `b3f1a96…` | Simpler runtime plus newer durable V2 session work | High; source implementation, with noted TODOs |
| `browser-use` | `50f2055…` | Browser-specific observations, sessions, actions, recovery, history | High; source implementation |
| `browser-harness` | `afbcc381…` | Persistent CDP lane, helpers, recordings, domain skills, auth | High; source implementation |
| `browsercode` | `4b22baba…` | OpenCode integration with an in-process persistent CDP tool | High; source implementation |
| `workflow-use` | `main` snapshot inspected 2026-09-10 | Recording/history conversion, typed semantic workflows, deterministic execution, locator fallbacks, validation and proposed repair | Medium-high for implemented code; repository explicitly labels itself early-development |

Workflow Use was inspected by its executable paths, including recorder services, schemas, deterministic conversion, execution, verification, and validation/correction. Marketing claims were not treated as implemented behavior: the code and roadmap show important gaps in automatic agent fallback and failure-driven self-healing.

## 5. Important Codex findings

### 5.1 Loop and lifecycle

`codex-rs/core/src/session/session.rs` (`Session`, `SessionConfiguration`, `Session::new`) holds durable identity/configuration separately from the active turn, pending input, services, and cancellation. `codex-rs/core/src/session/turn.rs` (`run_turn`) captures step context once, persists user input/hooks before sampling, drains queued input at safe boundaries, and loops only when tool results or new input require another model request. An assistant response with neither condition ends the model loop, while stop hooks may still block completion.

`run_sampling_request` reuses a model-client session within a turn but reconstructs the prompt from recorded history for retries. It clears a prior response identifier on retry so new calls are not falsely attributed to a failed response. `try_run_sampling_request` treats a stream that closes before completion as an error, associates completed output items with ordered tool futures, and drains in-flight tool results into history.

Distilled lesson: adopt the explicit lifecycle and stable per-attempt snapshots, but remove interactive steering from v1 scheduled acquisition. Each provider attempt must be reconstructable from durable input, not a mutable in-memory transcript.

### 5.2 Tool system and concurrency

`codex-rs/core/src/tools/router.rs` (`ToolRouter`, `ToolCall`, `build_tool_call`) normalizes function/custom/deferred calls and turns recoverable malformed requests into model-visible errors. `codex-rs/core/src/tools/registry.rs` (`ToolRegistry`, `dispatch_any_with_terminal_outcome`) detects registration collisions, validates payload/runtime shape, runs pre/post hooks, counts calls, and uses a terminal-outcome guard to prevent duplicate finishes. Unknown tools are telemetry events plus recoverable results, not runtime crashes.

`codex-rs/core/src/tools/parallel.rs` (`ToolCallRuntime`) uses a read/write lock: declared parallel-safe tools share a read lock; unsafe tools take exclusive access. Cancellation aborts the task and synthesizes a completed aborted result. `codex-rs/tools/src/tool_executor.rs` separates tool exposure from execution and defaults to non-parallel. `tool_output.rs` explicitly separates lossy diagnostic text from the authoritative model result.

Distilled lesson: adopt typed registry/dispatch/outcome guards and conservative concurrency. Browser mutation is a single exclusive lane per session. Diagnostic logs and authoritative evidence are different records.

### 5.3 Context and recovery

`codex-rs/core/src/context_manager/history.rs` normalizes call/result pairs and truncates tool outputs. `codex-rs/core/src/compact.rs` preserves canonical context and retained user evidence around compaction, with a bounded old-user-message budget. This prevents summaries from becoming the sole authority for active instructions.

`codex-rs/thread-store/src/store.rs` (`ThreadStore`) provides storage-neutral create/resume/append/flush/load boundaries. `codex-rs/rollout/src/recorder.rs` (`RolloutRecorder`) writes append-only JSONL through a background command stream and remembers terminal writer failure. `codex-rs/core/src/state/turn.rs` separates active tasks/cancellation from persisted history. `thread_manager.rs` flushes a parent before a fork and can resume from rollout history.

Codex subagents reuse the same thread/session machinery rather than a second loop. `codex-rs/core/src/thread_manager.rs` (`spawn_subagent`) flushes the parent's persisted rollout before deriving child history; agent control tracks parent/child identity, cancellation, result collection, concurrency and shared rollout limits. This is sound containment, but it is capacity and context complexity that Distilled does not need for a single-source v1 run.

Distilled lesson: use a storage-neutral runtime interface and append-audited events, but persist authoritative state transactionally in D1 rather than replaying a UI transcript. Compaction is a projection for model context, never deletion of raw observations/evidence.

### 5.4 Retry, policy, protocol and observability

`codex-rs/core/src/responses_retry.rs` distinguishes connection retries from request retries, honors `Retry-After`, applies bounded backoff, and can fall back transport only after exhausting the appropriate category. `codex-rs/core/src/tools/approvals.rs` and `tools/sandboxing.rs` enforce approvals and isolation in runtime code. Approval state is cached by a bounded key; network approval does not imply filesystem or command authority.

`codex-rs/protocol/src/protocol.rs` (`Op`, `EventMsg`) makes the runtime a protocol server independent of terminal/app/IDE clients. Turn, token, approval, tool, error, and completion events are stable interface objects. `tool_dispatch_trace.rs` and `turn_timing.rs` provide tool and timing telemetry.

Distilled lesson: strongly adopt runtime/client separation, typed events, outside-model policy, retry classification, and cancellation. Reject coding-specific shell sandbox, Git/worktree, patch/review, IDE, and subagent UI machinery.

### 5.5 Model, Browser Use, and Computer Use configuration

Codex separates provider description from model metadata: `openai-codex/codex-rs/model-provider-info/src/lib.rs` (`ModelProviderInfo`, `WireApi`, `merge_configured_model_providers`) supplies configurable provider/wire details, while `codex-rs/models-manager/src/model_info.rs` (`with_config_overrides`, `model_info_from_slug`) supplies model-specific context/instruction metadata. Its app protocol also models Browser Use and Computer Use independently: `codex-rs/app-server-protocol/src/protocol/v2/browser_use_config.rs` (`BrowserUseConfig`, `BrowserUseOriginPolicyConfig`) applies origin/download/upload/full-CDP requirements; `computer_use_config.rs` (`ComputerUseConfig`) applies application access requirements. `core/src/mcp_tool_call.rs` independently applies confirmation policies for `browser_use` and `computer_use`.

Distilled lesson: **ADAPT**, not clone. Keep logical role routing, concrete provider/gateway resolution, and capability metadata separate. Likewise expose structured and visual browser surfaces independently, but intersect both with the same immutable run policy; technical availability never grants authority.

## 6. Important Claude findings

### 6.1 QueryEngine and query loop

`claude-code-source/source/src/QueryEngine.ts` (`QueryEngineConfig`, `QueryEngine`, `submitMessage`) is the conversation boundary. It persists user input to the transcript before entering the query loop, explicitly so a process killed before the first API response remains resumable. The config centralizes tools, MCP, agents, permissions, model/fallback, maximum turns, dollar/task budgets, output schema, and abort control.

`claude-code-source/source/src/query.ts` (`query`, `queryLoop`) is an explicit state machine. Each iteration assembles projected context, calls the model, streams tool-use blocks, executes tools, normalizes results, then continues only if tool use or a guarded hook/budget continuation requires it. It snapshots feature/config state at loop entry while carrying a small explicit mutable `State` across transitions.

Distilled lesson: adopt append-before-work admission and explicit transition reasons. Do not adopt the enormous interactive configuration surface.

### 6.2 Reliability mechanisms

The same `queryLoop` contains several non-obvious safeguards:

- On model fallback it tombstones orphan partial messages, discards the failed streaming executor, and creates a fresh executor so tool results cannot attach to old tool-use IDs.
- On thrown model/runtime error it emits missing tool-result blocks for already-seen tool uses, then surfaces the real error instead of a false user interruption.
- On cancellation it drains the streaming executor so every emitted tool use receives a synthetic aborted result.
- Prompt-too-long recovery drains cheap staged collapses first, then performs reactive compaction once. Guards prevent repeated compaction loops.
- API errors skip stop hooks; otherwise an error -> blocking hook -> retry cycle can become a cost-amplifying death spiral.
- Maximum-output-token recovery is bounded: one larger-cap retry followed by a limited continuation path.
- Tool-result replacement, snipping, micro-compaction, context collapse, and full compaction are layered rather than conflated.

`source/src/services/api/withRetry.ts` (`withRetry`) classifies retryable errors, honors retry headers, separates foreground from non-foreground capacity behavior to avoid retry amplification, and caps delay. `source/src/services/tools/toolOrchestration.ts` (`runTools`, `partitionToolCalls`) executes only declared concurrency-safe batches in parallel. `StreamingToolExecutor` preserves ordering around non-concurrent calls and manufactures errors for unknown/malformed/aborted calls.

Distilled lesson: adopt fresh attempt identity, paired call/result invariants, bounded single-shot recovery stages, and no hooks on invalid model responses. Scheduled acquisition should fail faster than foreground UI work during provider-wide incidents.

### 6.3 Tools, permissions, persistence and extensions

`source/src/Tool.ts` (`Tool`, `ToolUseContext`, `ValidationResult`, `buildTool`) places schema validation before permission checks and tool execution; tools declare concurrency, interruption behavior, result mapping, and output persistence limits. `source/src/services/tools/toolExecution.ts` (`runToolUse`, `checkPermissionsAndCallTool`) runs validation, pre-tool hooks/classifiers, permission resolution, input modification, execution, result mapping, and telemetry as distinct phases.

`source/src/utils/sessionStorage.ts` serializes transcript appends, filters ephemeral progress from the causal chain, persists agent metadata, and supports resume. The official `anthropic-claude-code-official/CHANGELOG.md` corroborates production pressure around interrupted-tool resumption, stable prompt prefixes/tool descriptions, stale permission modes, retry storms, and matching tool results after process death. The public-package extraction points to the same `QueryEngine`/`queryLoop` center; it is corroboration, not a second implementation.

Claude hooks, skills, plugins, MCP, background tasks, and agent teams all wrap the same loop. LazyCodex adds useful extension-level guards: its ultrawork loop caps automatic resumes without ledger movement and bounds spawn fan-out. These are relevant as loop-progress patterns, not as reasons to add a plugin ecosystem in v1.

Claude's agent/task path persists subagent metadata separately in `source/src/utils/sessionStorage.ts` and carries agent-scoped transcript paths, budgets, abort state, and task notifications back through the primary `queryLoop`. The key lesson is bounded child identity and cancellation propagation. The large coordination, teammate, background-shell, and resumable-sidechain surface is coding-product baggage for Distilled v1.

Distilled lesson: keep the v1 registry closed and versioned. Extension failures should be contained as tool failures, but dynamic third-party plugins, shell hooks, skills, MCP, teams, and arbitrary background tasks are deferred.

### 6.4 Visual Computer Use and model capabilities

The reconstructed Claude runtime exposes an actual visual execution boundary in `claude-code-source/source/src/utils/computerUse/executor.ts` (`createCliExecutor`), including `screenshot`, `key`, `type`, `moveMouse`, `click`, and `drag`. `utils/computerUse/wrapper.tsx` (`runPermissionDialog`) wraps calls with a separate permission decision. Model metadata is independently cached and resolved in `utils/model/modelCapabilities.ts` (`ModelCapability`, `getModelCapability`, `refreshModelCapabilities`). No inspected path establishes a general CAPTCHA bypass contract.

Distilled lesson: normal screenshot/coordinate interaction is a legitimate fallback capability, but permission, challenge handling, and spend escalation remain external runtime decisions. A challenge page is state to classify, not an instruction to keep clicking.

## 7. OpenCode findings

The legacy runtime is compact and readable. `packages/opencode/src/session/prompt.ts` coordinates message loading, tool construction, compaction, permissions, and repeated processing. `session/processor.ts` (`SessionProcessor`) pre-captures a filesystem snapshot, streams one provider call, records parts incrementally, asks permission on detected doom loops, computes patches, and retries with `SessionRetry.policy`. `session/retry.ts` supplies bounded exponential backoff with jitter and retry-header parsing. `permission/index.ts` uses ordered wildcard rules with last-match resolution, publishes ask/reply events, and maintains session approvals.

The newer V2 core is more relevant to Distilled:

- `packages/core/src/session/input.ts` (`admit`, `promoteSteers`, `promoteNextQueued`) durably admits input before advisory execution wake-up and distinguishes steer from queued delivery.
- `packages/core/src/session/sql.ts` persists `session_input`, messages, parts, and context epochs with per-session sequence uniqueness.
- `packages/core/src/session/runner/llm.ts` records each tool call before side effects and reloads projected history for continuation.
- `packages/core/src/session/runner/publish-llm-event.ts` rejects duplicate/misordered tool starts, calls, results, and errors and can fail every unsettled tool.
- `packages/core/src/session/run-coordinator.ts` coalesces same-session wakes while allowing separate sessions concurrently.
- `packages/core/src/session/context-epoch.ts` and `history.ts` make context projection a persisted session-owned concern.

OpenCode's own `AGENTS.md` is candid that V2 local drains are process-local, have no durable drain identity/transcript boundary, and need a separate design for post-crash continuation. `runner/llm.ts` also lists unfinished work for durable status, bounded provider retries/repeated calls, full tool resolution, and incremental snapshot/retry persistence.

OpenCode also separates agent role configuration from provider/model lookup. `packages/opencode/src/agent/agent.ts` (`Info`, `Service`) attaches optional provider/model selection and permissions to a logical agent, while `packages/opencode/src/provider/provider.ts` (`ProviderCapabilities`, `Model`, `Info`) records modalities, tool calling, reasoning, cost, context/output limits, status, and provider source. Custom loaders resolve many provider APIs behind one interface.

Distilled lesson: V2's admission, sequence, projector, and call-event invariants are simpler and highly reusable. Do not copy its currently incomplete crash semantics. A Distilled `AgentRunAttempt` and fenced lease must be durable from the start. **ADAPT** the role/provider separation and capability registry, but make each call's route, policy filters, fallback, usage, and cost durable.

## 8. Browser Use findings

`browser_use/agent/service.py` (`Agent`, `step`, `run`, `multi_act`) provides a browser-aware loop with step/LLM timeouts, maximum steps, maximum consecutive failures, optional final-response attempt, bounded actions per step, history, and structured output. It re-checks pause/stop before committing model output, resets consecutive failures after success, and makes the last permitted step expose only the `done` action. Empty model actions receive one clarification retry and then a safe no-op. Its final state distinguishes done, success, errors, and usage.

`browser_use/browser/session.py` (`BrowserSession`) manages a CDP session, target focus, tabs, cloud/local connections, storage state, and a resilient event bus. Watchdogs separately handle security, DOM, screenshots, permissions, downloads, popups, storage state, CAPTCHA, and browser lifecycle. Navigation waits for loader-specific lifecycle events and treats same-document navigation separately. `security_watchdog.py` enforces allowed/prohibited domains before navigation and reacts to redirects after navigation.

Browser observations combine a pruned DOM/accessibility representation, optional screenshots/vision, current URL/tab state, and action results. The library caps history, tool-result size, actions per step, and large-page representation; Pydantic models validate tool I/O and structured final output. Saved history supports replay with element matching and redundant-retry detection, but a replay is not equivalent to a production adapter contract.

The implementation also demonstrates the structured/visual split: `browser_use/actor/mouse.py` (`Mouse.click`, `Mouse.move`, scroll/drag paths) performs coordinate input, while the DOM/session machinery supplies semantic state. `browser_use/browser/session.py` (`BrowserSession`) explicitly separates reusable `BrowserProfile` configuration from session identity, and supports model-facing screenshot resizing. `browser_use/browser/profile.py` (`BrowserProfile`, `BrowserNewContextArgs`) includes domain constraints and storage-state inputs. Its `browser/watchdogs/captcha_watchdog.py` (`CaptchaWatchdog`, `wait_if_captcha_solving`) proves CAPTCHA deserves explicit bounded state, but its optional solver-specific behavior is not a Distilled authorization or bypass pattern.

Distilled lesson: adopt typed browser state, independent lifecycle/security/challenge watchers, explicit page-ready semantics, bounded multi-action behavior, and history useful for diagnosis. Adapt its agent completion: `ActionResult.is_done` is still model/tool-driven and must be followed by a Distilled verifier. Keep `BrowserProfile`, `BrowserSession`, and the run-bound isolated context as separate objects. Avoid treating CAPTCHA/cloud stealth as authorization to bypass restrictions.

## 9. Browser Harness findings

`src/browser_harness/daemon.py` (`Daemon`) maintains one persistent CDP transport/current target, serializes session replacement with a lock, enables required CDP domains on every fresh attachment, and reattaches after stale sessions or closed tabs. Named daemons create dedicated tabs because simultaneous agents sharing one mutable current tab race; normal local use deliberately shares and serializes one lane.

`src/browser_harness/run.py` auto-starts the daemon, injects a small helper environment, captures bounded output tails, and makes cloud startup opt-in rather than inferring consent from an available API key. `src/browser_harness/auth.py` isolates OAuth/device authorization, validates state/PKCE, stores auth separately, and exposes a compact “authenticated/missing” status rather than credentials. `src/mcp_server.py` exposes the harness to an agent protocol without moving browser mechanics into the agent loop.

The project stores reusable helper scripts in `agent-workspace/agent_helpers.py`, domain-specific procedures under `agent-workspace/domain-skills/`, and traces/recordings separately. Its `SKILL.md` explicitly says direct HTTP is preferred for public content, one local browser is a serialized lane, stale daemons should be diagnosed/reattached before replacement, and login walls require human assistance except already-established SSO.

Mapping to Distilled: the persistent browser lane, reusable helper artifact, diagnostic/reattach path, and “HTTP first” rule directly match discovery -> deterministic adapter -> reuse -> repair. What does not map directly is storing executable, agent-editable Python as the production adapter: Distilled needs a validated, versioned DSL and promotion boundary.

## 10. Browsercode findings

Browsercode is an OpenCode fork; its general agent loop, permissions, context, providers, and sessions come from OpenCode. Its browser-specific layer is isolated mainly in `packages/bcode-browser` plus a thin OpenCode tool adapter.

`packages/opencode/src/tool/browser-execute.ts` (`BrowserExecuteTool`) registers one permission-gated tool, obtains the per-project workspace, streams bounded progress, and converts captured screenshots to model attachments. Substantive logic lives in `packages/bcode-browser/src/browser-execute.ts` (`make`, `execute`): a model supplies an arbitrary asynchronous JavaScript snippet with a persistent CDP `Session` and scoped console, subject to a 60-second default/10-minute maximum timeout. Screenshots are intercepted from successful CDP calls. After a timeout, an async-local execution flag prevents orphaned code from issuing later CDP commands while the underlying browser connection remains usable by a subsequent call.

`packages/bcode-browser/src/session-store.ts` keys a persistent CDP session by OpenCode session ID. `src/cdp/session.ts` (`Session`) multiplexes a flat CDP WebSocket, rejects pending requests on connection replacement/close, auto-injects the active target session ID, validates old `waitFor` call shapes loudly, and restores execution scope for asynchronous event callbacks. `UPSTREAM.md` documents the extension boundary: browser code is an owned package/thin tool rather than deep changes to OpenCode.

Distilled lesson: strongly adopt the thin adapter around an isolated browser service, per-run session identity, scoped timeout invalidation, explicit target attachment, and screenshot side channel. Reject arbitrary JavaScript in the model-facing tool and process-lifetime-only session storage. Distilled needs typed actions, durable leases/checkpoints, tenant isolation, domain/network policy, and an adapter artifact that runs without model-authored code at execution time.

## 11. Workflow Use findings

Workflow Use has two concrete capture paths. `recorder/service.py` accepts extension events through a temporary FastAPI endpoint and queues typed workflow updates until recording completion; `recorder/recorder.py` normalizes navigation, click, input, select, radio, checkbox, and button events, adds semantic/container/position hints, and merges short-lived label/focus noise. Its generation path runs Browser Use once and converts `AgentHistoryList` actions plus interacted-element/DOM evidence into workflow steps. `DeterministicWorkflowConverter.convert_history_to_steps` performs that action-to-step mapping without an LLM for step creation; optional variable identification/enrichment is separate. The converter also reads agent memory/thought as descriptive context. Distilled adopts the evidence-to-step boundary but explicitly excludes hidden reasoning from capture and provenance.

The stored representation is a Pydantic-validated `WorkflowDefinitionSchema` with typed deterministic and explicit agentic step variants, typed input definitions, `{name}` placeholders, output context keys, optional expected outcomes/verification checks, semantic `target_text` plus container/position hints, and ordered `selectorStrategies`; loaders accept serialized workflow files and storage maintains metadata plus individual workflow JSON. Execution validates inputs, resolves placeholders, runs deterministic steps through `WorkflowController`, and can use `SemanticWorkflowExecutor` to rebuild page mappings and try bounded locator alternatives. The semantic executor has step/global/verification failure limits and optional per-step verification. This confirms that a recorded workflow should be compiled into typed operations and replayed through the ordinary controller, not replayed as raw clicks or model-authored code.

The limitations matter. Although `Workflow` exposes `fallback_to_agent` and logs an attempted fallback, the deterministic-failure-to-agent implementation is commented out/disabled in the inspected execution path; explicit `agent` steps do run, but are not safe repair. `StepVerifier` offers deterministic, AI-assisted, and hybrid checks, yet executor verification is disabled by default and some checks degrade by assuming success. `WorkflowValidator` can return an LLM-corrected schema and generation performs schema/quality checks, but automatic failure-triggered repair and workflow-file update are roadmap items, not a completed self-healing lifecycle. The project also describes itself as early development and not production-ready.

Distilled therefore makes one bounded refinement: introduce a typed `WorkflowCaptureBundle -> WorkflowCandidateCompiler` boundary containing normalized action records, pre/post `ObservationEnvelope` references, element evidence, result/effect certainty, and timing; compile it deterministically into a `CANDIDATE` with ordered locator candidates and attempt telemetry before any optional model enrichment. This improves reproducibility and repair evidence but does not change the selected architecture: immutable versions, verifier-owned completion, separate validation and promotion, `VALIDATED != ACTIVE`, cohort-triggered quarantined repair, canarying, and rollback remain mandatory.

## 12. Cross-reference capability matrix

Labels used below:

- **ADOPT** — reference pattern worth adopting.
- **ADAPT** — reference pattern worth adapting to Distilled.
- **NOT NEEDED** — reference pattern not needed for Distilled.
- **AVOID** — reference pattern we should avoid.

| Capability | Codex | Claude family | OpenCode | Browser systems | Distilled decision |
|---|---|---|---|---|---|
| Run/session lifecycle | Session plus active turn/task | QueryEngine plus loop state/transcript | V2 durable session/input plus local drain | Agent run plus browser session/daemon | **ADAPT:** durable `AgentRun` distinct from ephemeral browser lease and worker attempt |
| Turns | Explicit turn with stable step context | Explicit loop iteration/transition | Explicit provider turn in V2 runner | Browser step | **ADOPT:** durable turn rows with monotonic sequence and immutable input snapshot |
| Model calls | Streamed sampling attempt reconstructed from history | Streamed call with fallback/tombstoning | One explicit `llm.stream` per provider turn | Agent calls browser-specialized model | **ADOPT:** each call resolves a logical `ModelRole`; record route, concrete model/provider/gateway, attempt, usage, and fallback |
| Provider abstraction | Configurable `ModelProviderInfo` and wire API | Provider and model-capability helpers | Provider loaders plus `Model` capability/cost/limit schema | Multiple LLM adapters including OpenRouter | **ADAPT:** `ModelGateway`; OpenRouter default, OpenAI-compatible alternative, direct providers later; Distilled owns logical routing |
| Model escalation | Model/config may change across turns | Primary/fallback and capability checks | Per-agent optional model | Fast/extraction/fallback models | **ADAPT:** external `ModelEscalationPolicy` can escalate and de-escalate within one run; the model cannot authorize stronger spend |
| Streaming | Valid completion required; partial close is error | Partial messages tombstoned on fallback | Incremental event projector | Actions may stream through agent loop | **ADAPT:** stream for latency/telemetry, but commit only schema-valid terminal output |
| Structured tool calls | Function/custom/deferred call normalization | Typed `Tool` plus Pydantic-like schemas | Tool registry and typed parts/events | Typed actions in Browser Use; JS snippet in Browsercode | **ADOPT** typed calls; **AVOID** arbitrary JS as model-facing v1 tool |
| Tool registry | Collision-aware, exposure-aware | Tool definitions plus dynamic MCP/plugins | Central registry and location-scoped tools | Controller/registry or one browser tool | **ADAPT:** closed, versioned server registry with no runtime plugin loading in v1 |
| Tool dispatch | Immutable invocation, hooks, terminal guard | Validation -> hooks/policy -> execution -> mapping | Call recorded before effect in V2 | Action/controller or direct CDP | **ADOPT:** strict phase pipeline and one terminal outcome per call |
| Tool results | Authoritative response separate from diagnostics | Call/result pairing and synthetic abort results | Typed success/error/provider outcome | `ActionResult`, screenshots/history | **ADOPT:** durable typed result; large body in R2; bounded model projection |
| Malformed calls | Recoverable model-visible result | Streaming executor emits errors | Publisher rejects invalid order/duplicates | Browser Use validates schemas | **ADOPT:** never dispatch; record `invalid_tool_call`; allow bounded model correction |
| Unknown tools | Telemetry plus model-visible error | Synthetic “no such tool” result | Registry failure | Registry/controller failure | **ADOPT:** recoverable once; repeated unknown call contributes to loop detector |
| Retries | Separate connection/request counters and transport fallback | Context-aware bounded retry, foreground/capacity distinction | Jittered exponential policy | Step/failure retry and reconnect | **ADAPT:** retry by failure class and operation safety; scheduled runs fail fast on outages |
| Failure classification | Retryable/fatal/tool/model distinctions | Real model error vs interrupt; typed API cases | Typed Effect failures/TODO gaps | Navigation, browser, CAPTCHA, element failures | **ADOPT:** stable taxonomy plus first-class `ChallengeState` in section 35 drives exactly one bounded recovery action |
| Timeout | Cancellation-aware sampling/tools | LLM/step/tool timeouts | Effect timeouts/retry schedule | CDP waits, page/step timeout, orphan guard | **ADOPT:** hierarchical run/turn/model/tool/navigation deadlines |
| Cancellation | Token propagates to sampling/tasks/tools | Abort controller and synthetic results | Fiber interruption/local coordinator | Pause/stop/session close | **ADOPT:** durable cancellation request plus cooperative tokens; settle in-flight calls |
| Context assembly | Canonical context + history projection | Layered prompt/attachments/memory/skills | Session history/context epochs | DOM/screenshot/current state | **ADAPT:** immutable objective/policy plus `ObservationEnvelope` references and bounded untrusted representations |
| Compaction | Summary with canonical reinjection | Snip, replacement, micro/collapse/full compaction | Summary/tail and pruning | Max history/large-page pruning | **ADAPT:** structured state projection first; optional summary later; raw artifacts never deleted |
| Large observations | Tool-output truncation with authoritative storage distinction | Aggregate tool-result budget and persisted replacement | Tool-output store | Pruned DOM, screenshots, chunked extraction | **ADOPT:** immutable raw artifact separated from sanitized/truncated model representation by `ObservationEnvelope` |
| Budgets | Tokens/tool calls/concurrency tracked | Turns, USD/task/token budgets; loop guards | Max steps and token/cost accounting evolving | Steps/actions/failures/history limits | **ADOPT:** multidimensional, atomic, outside-model counters including model/strong/vision calls and challenge retries |
| Permissions | Approval modes and sandbox policy | Rules, classifiers/hooks, prompt or deny | Ordered wildcard rule evaluation | Domain security watchdog; tool permission | **ADAPT:** non-interactive compiled capabilities; human approval only at explicit suspended states |
| Sandboxing | OS/process/network sandbox for coding tools | Filesystem/shell permission enforcement | Workspace/tool rules | Browser/process or cloud isolation | **ADAPT:** browser-container/profile/network isolation; coding filesystem sandbox not needed |
| Secret handling | Host/runtime metadata outside model result | Permission/context separates runtime data | Integration credentials resolved by services | Profile/storage state and OAuth module | **ADOPT:** opaque capability references; secret injection only inside brokered session |
| State | Session history plus active turn state | Transcript plus explicit loop state | Event projection + database V2 | Browser history/session state | **ADOPT:** normalized authoritative rows plus append event audit; ephemeral handles excluded |
| Events | Protocol `EventMsg` decouples clients | Yielded messages/hooks/telemetry | Durable EventV2/projector | Resilient browser event bus | **ADAPT:** domain events, not UI transcript; transactional outbox |
| Checkpointing | Persist/flush boundaries and rollout | Input persisted before query; transcript append | Input admission/context sequence | History/recording, daemon current target | **ADOPT:** checkpoint after every accepted tool result/output and before queue acknowledgement |
| Resumability | New/resume/fork from persisted rollout | Resume transcript and interrupted tool pairing | V2 admission strong; post-crash drain incomplete | Reattach/replay but mostly process-local | **ADAPT:** reconstruct from DB/R2; never depend on live model stream or CDP handle |
| Idempotency | Stable call IDs/history pairing | Tool-use IDs and discarded stale executors | Unique sequence/call lifecycle events | Redundant replay detection | **ADOPT:** run/turn/call IDs, effect idempotency keys, evidence uniqueness, fenced leases |
| Concurrency | Parallel-safe read vs exclusive write lock | Contiguous safe batches; ordered unsafe calls | Same-session wake coalescing | One mutable browser lane; isolated remote browsers for parallel work | **ADOPT:** one exclusive action lane per browser session; runs parallel only across isolated leases |
| Subagents | Managed graph, budgets/cancellation | Agent teams/tasks/background agents | Task agents | Multiple isolated browser sessions | **NOT NEEDED** in v1; one run is enough. Consider bounded specialist calls only with evidence later |
| Extension systems | Dynamic/external tools | Hooks, skills, plugins, MCP | Plugins/providers/tools | Helpers/domain skills/MCP | **AVOID** untrusted dynamic extensions in v1; versioned internal strategy ports only |
| Browser state | Browser Use and Computer Use configured separately | Visual executor has screenshots/pointer/keys plus permissions | Browsercode extension | First-class targets, URL, DOM, screenshots, storage | **ADOPT:** `Tenant -> AgentRun -> BrowserSession -> BrowserContext`; one run-bound isolated context and serial action lane |
| Browser observations | Image/tool outputs | Computer-use attachments | Screenshot file parts | DOM/AX/screenshot/action result | **ADAPT:** Structured Browser Use first, Visual Computer Use fallback; both produce untrusted `ObservationEnvelope` records |
| Authentication profiles | Host capabilities | Permission/session integrations | Provider integration services | `BrowserProfile`, `BrowserSession`, storage-state/cloud auth | **ADOPT:** opaque tenant-owned, versioned `BrowserProfile` + scoped `AuthCapability`; broker injects secrets into isolated context |
| Challenge handling | Policy/approval state around browser tools | No general bypass contract found | Not central | CAPTCHA watchdogs and login states | **ADAPT:** typed challenge classifier, dedicated budget, checkpoint/suspend/switch; never unbounded retry or assumed CAPTCHA bypass |
| Deterministic workflows | Not a primary goal | Commands/skills are not safe adapters | Tools/plugins | Workflow Use has typed parameterized steps and controller/semantic execution; other systems have history/helper/script replay | **ADAPT:** bounded `WorkflowDefinition`/BrowserWorkflow DSL executed through the controller; no raw replay, arbitrary JS, or shell |
| Workflow generation | Coding/artifact generation | Skill/plugin generation possible | Agent can write tools | Workflow Use deterministically maps action history plus element evidence to semantic steps, with separate optional enrichment | **ADAPT:** compile a typed capture bundle into a candidate first; optional model enrichment may propose changes, while validator owns acceptance |
| Workflow repair | General coding loop | Hook/agent loop | Agent editing | Workflow Use has optional validation/correction and locator retries, but automatic fallback/update is disabled or roadmap | **ADAPT:** record ordered locator attempts; classified cohort structural failures trigger quarantined repair and never overwrite the active version |
| Tracing | Tool dispatch trace, timings, model events | Extensive telemetry and lifecycle messages | EventV2 and Effect tracing | Event bus, recordings, histories | **ADOPT:** immutable event sequence plus trace/span IDs and redacted artifact references |
| Testing | Protocol/tool/session unit and integration tests | Fixture/VCR/harness behavior | Extensive state-machine tests and recorded LLM tests | Browser fixtures, CDP smoke, replay tests | **ADOPT:** scripted model + local hostile browser fixture + crash/fault injection; few live smokes |
| Runtime/UI separation | Core protocol vs TUI/app/IDE | QueryEngine under replaceable clients | Core/schema/protocol/server packages | MCP/CLI/tool adapters around browser core | **ADOPT:** headless service API/events; admin UI is only a client |
| Deterministic completion | Turn ends on no follow-up plus hooks | Ends on no tools plus stop hooks | Stop/compact/continue | Model `done`/`is_done` | **ADAPT:** model proposes; typed verifier is sole authority |
| Adapter promotion | Not applicable | Not applicable | Plugin deployment external | Helper/script saved by agent | **AVOID** self-promotion; exact `CANDIDATE -> VALIDATED -> ACTIVE -> SUPERSEDED` lifecycle with independent validation, promotion, canary, and rollback |

### 12.1 Convergence across mature systems

The strongest repeated mechanisms are: explicit turn loops; structured call/result pairing; validation before execution; permissions outside the model; stable call identities; cancellation propagated through every layer; bounded retry keyed to failure class; compacted projections backed by retained authoritative history; exclusive access for mutating tools; events independent of UI; and synthetic terminal results for interrupted calls. These are production necessities, not product-specific ornament.

The main divergence is persistence strength. Codex/Claude transcripts support conversational resume, OpenCode V2 is moving toward durable admission/projected events, and browser projects largely preserve process/session history. Distilled must go further because scheduled, multi-tenant acquisition has no human watching and must survive queue redelivery and worker loss.

## 13. Non-obvious implementation tricks discovered

### 13.1 Evidence ledger

Each entry below states an observed mechanism and the design consequence. Paths are relative to `agent-reference-lab` unless prefixed `distilled.news/`.

**E1 — persist before the first fallible remote operation**

- Repository/file/symbol: `claude-code-source/source/src/QueryEngine.ts`, `QueryEngine.submitMessage`.
- Observed behavior: the user message is appended and optionally flushed before `query(...)` begins.
- Why it exists: process death before the first provider response must not erase admitted work.
- Distilled lesson: **ADOPT**. Create run/input/event/outbox atomically before scheduling execution.

**E2 — retry from recorded history, not partial in-memory response state**

- Repository/file/symbol: `openai-codex/codex-rs/core/src/session/turn.rs`, `run_sampling_request`.
- Observed behavior: every sampling retry rebuilds the prompt from history and clears stale response attribution.
- Why it exists: partial streams and connection retry otherwise contaminate causal identity.
- Distilled lesson: **ADOPT**. A `ModelCallAttempt` is immutable; a retry has a new attempt ID and the same logical call ID.

**E3 — complete every emitted tool call, even during cancellation**

- Repository/file/symbol: Codex `core/src/tools/parallel.rs`, `ToolCallRuntime`; Claude `source/src/query.ts`, abort and `yieldMissingToolResultBlocks` paths; OpenCode `core/src/session/runner/publish-llm-event.ts`, `failUnsettledTools`.
- Observed behavior: interrupted, malformed, or stranded calls receive synthetic terminal results.
- Why it exists: an unmatched tool-use block corrupts future provider context and UI/runtime state.
- Distilled lesson: **ADOPT** as a database invariant: every requested call becomes denied, succeeded, failed, cancelled, or `effect_unknown`.

**E4 — discard stale executors on model fallback**

- Repository/file/symbol: `claude-code-source/source/src/query.ts`, `FallbackTriggeredError` handling.
- Observed behavior: orphan partial assistant messages are tombstoned and the streaming executor is replaced.
- Why it exists: late results must not bind to tool IDs from an abandoned model response.
- Distilled lesson: **ADOPT** generation/fencing tokens on calls and browser leases; late completions are recorded but cannot mutate current state.

**E5 — API errors must not enter completion-hook loops**

- Repository/file/symbol: `claude-code-source/source/src/query.ts`, prompt-too-long/API-error paths.
- Observed behavior: failed model responses skip blocking stop hooks and bounded compaction guards survive retries.
- Why it exists: error -> hook rejection -> larger retry can form an infinite, expensive loop.
- Distilled lesson: **ADOPT**. Completion verification runs only on schema-valid completion proposals, never provider errors.

**E6 — serialize unsafe work, not all work**

- Repository/file/symbol: Codex `core/src/tools/parallel.rs`; Claude `services/tools/toolOrchestration.ts`; Browser Harness `SKILL.md` and `daemon.py`.
- Observed behavior: safe calls may run together, while mutable resources use an exclusive lane; one local browser's current tab is explicitly treated as shared mutable state.
- Why it exists: tab/focus/file races are subtle and nondeterministic.
- Distilled lesson: **ADOPT** one writer per browser lease. V1 can simplify further and run all browser actions serially.

**E7 — prevent timeout orphans from acting later**

- Repository/file/symbol: `browsercode/packages/bcode-browser/src/browser-execute.ts`, `execute`; `src/cdp/session.ts`, `withSessionExecution`, `assertExecutionActive`.
- Observed behavior: timed-out async JavaScript may still exist, but its execution scope is deactivated so later CDP calls fail; the next call can reuse the connection.
- Why it exists: JavaScript cancellation cannot preempt all running code.
- Distilled lesson: **ADAPT** with lease generations and broker-side cancellation. Close/rotate the page or context when effect state is uncertain.

**E8 — pre-capture state before a streaming API can execute tools**

- Repository/file/symbol: `opencode/packages/opencode/src/session/processor.ts`, `SessionProcessor.process`.
- Observed behavior: filesystem snapshot is captured before `llm.stream` because the SDK can execute tools before a start-step event.
- Why it exists: event order from providers/frameworks may be earlier than expected.
- Distilled lesson: **ADAPT**. Persist the observation/context hash and tool intent before dispatch; never rely on a downstream “started” callback as the first checkpoint.

**E9 — durable admission is different from durable execution**

- Repository/file/symbol: `opencode/packages/core/src/session/input.ts`, `admit`; repository `AGENTS.md`, V2 Session Core.
- Observed behavior: input is durably stored before advisory wake, but local drains lack durable identity and post-crash provider recovery is explicitly unfinished.
- Why it exists: accepting a request safely does not prove a worker can resume its external effects.
- Distilled lesson: **ADOPT** admission; add a durable `AgentRunAttempt`, lease, and recovery decision.

**E10 — security checks run both before navigation and after redirect**

- Repository/file/symbol: `browser-use/browser_use/browser/watchdogs/security_watchdog.py`, `on_NavigateToUrlEvent`, navigation/focus handlers, `_is_url_allowed`.
- Observed behavior: requested URLs are checked and disallowed redirect destinations are also detected.
- Why it exists: checking only the model-proposed URL misses redirect and popup escape.
- Distilled lesson: **ADOPT** preflight DNS/domain/SSRF checks plus post-commit target and every subresource/download policy.

**E11 — enable browser domains again after target reattachment**

- Repository/file/symbol: `browser-harness/src/browser_harness/daemon.py`, `attach_first_page`, `_enable_default_domains`.
- Observed behavior: Page/DOM/Runtime/Network domains are enabled for every fresh CDP session, including after tab switch or reattach.
- Why it exists: CDP domain enablement is session-local, not browser-global.
- Distilled lesson: **ADOPT** a browser-session state machine with explicit attach/bootstrap readiness.

**E12 — capability availability is not user intent**

- Repository/file/symbol: `browser-harness/src/browser_harness/run.py`, `_run` cloud bootstrap guard.
- Observed behavior: the presence of an API key does not auto-provision a billable cloud browser; an opt-in flag is required.
- Why it exists: credentials and technical capability do not authorize cost or external action.
- Distilled lesson: **ADOPT**. Profile access, metered execution, and policy permission are separate decisions.

**E13 — active data and diagnostic presentation must be separate**

- Repository/file/symbol: Codex `codex-rs/tools/src/tool_output.rs`, `ToolOutput`.
- Observed behavior: lossy diagnostic log text is explicitly not the authoritative tool response.
- Why it exists: UI truncation/redaction must not change runtime semantics.
- Distilled lesson: **ADOPT** `ToolResult.payloadRef`/evidence as authoritative; logs and model projections are derivatives.

**E14 — do not advance a cursor before accepted work**

- Repository/file/symbol: `distilled.news/TECHNICAL_CONTRACTS_AND_SERVICE_BOUNDARIES_v1.5.md`, `SourceCheckpoint` invariant.
- Observed behavior: accepted work is persisted before checkpoint advancement.
- Why it exists: a crash between cursor advance and content persistence loses news permanently.
- Distilled lesson: **ADOPT** unchanged. Agent completion never advances a source cursor by itself.

**E15 — make source health a projection**

- Repository/file/symbol: `distilled.news/SOURCE_CONNECTOR_SPEC.md`, upstream resource status and computed subscription display state.
- Observed behavior: acquisition/auth/policy health lives on the resource; display state is computed.
- Why it exists: duplicated mutable health signals drift.
- Distilled lesson: **ADOPT**. Agent events feed the existing health projector; they are not a second health model.

**E16 — separate structured browser policy from visual computer policy**

- Repository/file/symbol: `openai-codex/codex-rs/app-server-protocol/src/protocol/v2/browser_use_config.rs`, `BrowserUseConfig`; `computer_use_config.rs`, `ComputerUseConfig`; `core/src/mcp_tool_call.rs`, browser/computer confirmation-policy lookup.
- Observed behavior: browser-origin/download/CDP requirements and application-level computer access are distinct configured surfaces, both subject to runtime confirmation policy.
- Why it exists: semantic browser access and visual OS-style input have different grounding and risk, although neither is self-authorizing.
- Distilled lesson: **ADAPT** two typed surfaces over one run-bound browser context and one `PolicyEngine`; use structured access first and meter visual fallback separately.

**E17 — profile template, session identity, and context isolation are different objects**

- Repository/file/symbol: `browser-use/browser_use/browser/profile.py`, `BrowserProfile`, `BrowserNewContextArgs`; `browser/session.py`, `BrowserSession`.
- Observed behavior: reusable launch/context/storage configuration is separated from browser-session identity; new-context options and allowed-domain controls are explicit.
- Why it exists: reusable authentication/configuration must not imply that concurrent executions share one mutable context.
- Distilled lesson: **ADOPT** a formal `Tenant -> AgentRun -> BrowserSession -> BrowserContext` chain, pinned to `AuthCapability`/`BrowserProfile` version and `UpstreamResource`.

**E18 — visual interaction is a real capability, not a completion or authorization oracle**

- Repository/file/symbol: `claude-code-source/source/src/utils/computerUse/executor.ts`, `createCliExecutor`, `screenshot`, `key`, `type`, `moveMouse`, `click`, `drag`; `utils/computerUse/wrapper.tsx`, `runPermissionDialog`; `browser-use/browser_use/actor/mouse.py`, `Mouse`.
- Observed behavior: screenshot and coordinate/keyboard operations exist behind a separate execution/permission boundary.
- Why it exists: DOM grounding can fail on canvas, visual-only controls, and unusual UI.
- Distilled lesson: **ADAPT** as `VisualComputerUsePort`; coordinate actions remain observation-bound, budgeted, policy-checked, and externally verified.

**E19 — provider selection needs explicit capability and cost metadata**

- Repository/file/symbol: `openai-codex/codex-rs/model-provider-info/src/lib.rs`, `ModelProviderInfo`; `opencode/packages/opencode/src/provider/provider.ts`, `ProviderCapabilities`, `ProviderCost`, `ProviderLimit`, `Model`; `opencode/packages/opencode/src/agent/agent.ts`, `Info`.
- Observed behavior: mature runtimes separate providers, model capabilities/cost/limits, and logical agent configuration.
- Why it exists: a model identifier alone cannot prove tool/vision compatibility, provider eligibility, cost, or context fit.
- Distilled lesson: **ADAPT** the existing Distilled `ModelCapability` into a policy-aware registry and persist every `ModelRole` routing decision; do not hard-code a vendor/model or delegate logical routing to an opaque gateway auto mode.

**E20 — challenge handling must be bounded state**

- Repository/file/symbol: `browser-use/browser_use/browser/watchdogs/captcha_watchdog.py`, `CaptchaWatchdog`, `wait_if_captcha_solving`; `browser_use/agent/judge.py`, CAPTCHA/login outcome checks.
- Observed behavior: CAPTCHA state is detected separately and any wait has a configured timeout; task evaluation distinguishes CAPTCHA/login blockage from success.
- Why it exists: treating a challenge as an ordinary navigation error can create an infinite cost loop and false completion.
- Distilled lesson: **ADAPT** a typed `ChallengeState` and challenge budget. Do not adopt solver or evasion behavior; checkpoint, suspend, switch legal route, or fail truthfully.

**E21 — compile recorded evidence; do not replay gestures blindly**

- Repository/file/symbol: `workflow-use/workflows/workflow_use/recorder/service.py`, `RecordingService`; `recorder/recorder.py`, `EnhancedRecordingService`; `healing/deterministic_converter.py`, `DeterministicWorkflowConverter.convert_history_to_steps`; `workflow/service.py`, `Workflow._run_deterministic_step`.
- Observed behavior: extension events or one Browser Use execution produce typed action/history records; deterministic conversion joins actions to interacted-element evidence and emits parameterized semantic steps, which the workflow executor resolves and dispatches through a controller. Optional model-based variable discovery/validation is a separate phase.
- Why it exists: raw pointer coordinates, transient indices, and literal input values are poor reusable automation artifacts, while typed steps retain intent and can be validated or re-resolved.
- Distilled lesson: **ADAPT** an explicit `WorkflowCaptureBundle -> WorkflowCandidateCompiler` seam using visible actions, pre/post envelopes, result/effect certainty, and ordered locator evidence. Do not ingest hidden reasoning, auto-promote the result, or mutate an active workflow during repair.

## 14. Patterns worth adopting

1. Durable input admission before scheduling or provider calls (E1, E9).
2. Explicit logical calls and immutable attempts, with reconstruction from durable state (E2).
3. Exactly one terminal outcome for every tool call, including synthetic interruption outcomes (E3).
4. Fencing/generation checks that reject stale completions (E4).
5. Strict typed validation before policy and execution.
6. Policy enforcement in the dispatcher/browser broker, never solely in prompts.
7. Retry policies classified by failure and operation idempotency.
8. Conservative exclusive browser lanes and bounded concurrency (E6).
9. Raw authoritative artifacts separate from compact model context and logs (E13).
10. Runtime protocol/events independent of UI.
11. Pre- and post-navigation security enforcement (E10).
12. Transactional accepted output before source checkpoint advancement (E14).
13. Structured browser and visual computer surfaces with one external policy boundary (E16, E18).
14. `BrowserProfile`/`AuthCapability`, session identity, and isolated run context as distinct versioned objects (E17).
15. Logical model roles routed through explicit capabilities, compliance, budget, and provider metadata (E19).
16. Typed, durable, bounded challenge state rather than generic retry (E20).
17. Deterministic compilation of recorded action and observation evidence into a typed workflow candidate (E21).
18. Audit from visible inputs/proposals/decisions/effects/verifiers without hidden chain-of-thought.

## 15. Patterns worth adapting

- Codex/Claude compaction becomes structured context projection: immutable objective/policy, typed progress, a short recent event window, and referenced observations. Natural-language summarization is a later fallback.
- Browser Use's DOM/vision state becomes an `ObservationEnvelope` that separates immutable raw artifacts from bounded, sanitized model presentation with trust/provenance metadata.
- Browser Harness's persistent daemon becomes a server-side `BrowserExecutorPort` with isolated tenant contexts, renewable leases, readiness checks, and reattachment.
- Browsercode's single flexible browser tool becomes structured and visual typed operations behind one policy dispatcher. Its scoped timeout protection becomes broker-side lease generation/fencing.
- OpenCode's durable event projection becomes authoritative relational state plus an append-only audit/outbox; replay can rebuild projections but business reads need not replay the whole log.
- Browser history/helper capture becomes a declarative adapter candidate, never a verbatim blind action replay.

## 16. Patterns inappropriate for Distilled

**REFERENCE PATTERN NOT NEEDED FOR DISTILLED:** Git/worktrees, repository patching, shell/terminal tools, IDE/LSP integration, developer slash commands, code-review modes, arbitrary filesystem access, code indexing, multiple interactive frontends, rich terminal rendering, team agents, and coding-specific instruction trees.

**REFERENCE PATTERN WE SHOULD AVOID:** arbitrary model-authored JavaScript/Python in the browser process; unrestricted dynamic tools/MCP/plugins; raw credentials in prompts/tool parameters; self-approved or self-promoted adapters; browser automation as the default route; blind action-history replay; optimistic exactly-once claims; retrying unknown external side effects; considering model `done` authoritative; one shared mutable browser across concurrent tenants; and using CAPTCHA evasion, paywall bypass, or bot stealth as an acquisition strategy.

## 17. Distilled Agent Runtime v1 architecture

### 17.1 Components

```text
AcquisitionRouter + BudgetController + typed route history
                 | explicit feature flag in first slice
                 v
          Agent Run Service  <---- cancellation/admin API
       (admit + enqueue only)
                 |
          transactional outbox
                 v
        Agent Run Coordinator ---- fenced run lease
                 |
       +---------+------------------+
       |                            |
       v                            v
 Context Manager              Completion Verifier
 (`ObservationEnvelope`)           ^
       |                            |
       v                            |
 ModelRouter -----------------------+
 (`ModelRole` + escalation policy)
       |
       v
 ModelGateway
 DeploymentModelGateway
 API: OpenRouter(default) / self-hosted: OpenAI-compatible
       |
 visible response or structured tool proposal
       v
 Tool Dispatcher -> PolicyEngine -> budget/effect gate
       |
       +---- Browser Controller ---- BrowserSession ---- isolated BrowserContext
       |          |                         |
       |          +-- StructuredBrowserUse-+
       |          +-- VisualComputerUse ---+
       +---- Evidence/AcquiredContent staging
       +---- Adapter candidate staging -> Validator -> PromotionController

Authoritative state: D1
Large/redacted raw artifacts: R2
Wake-ups: Cloudflare Queues + transactional outbox
Audit/telemetry: ordered RunEvent + metrics/traces
```

The coordinator performs one bounded transition per queue delivery or a small safe batch within the Worker deadline. It never assumes process affinity. A browser executor may be Cloudflare Browser Rendering, a dedicated internal service, or a controlled external provider; the port contract keeps that deployment choice outside the agent loop.

### 17.2 Core services

- `AgentRunService`: validates/adopts a request, creates a durable run and budget, emits `run.created`, and schedules the first wake atomically.
- `AgentRunCoordinator`: acquires a fenced lease, chooses the next legal transition, and commits state/event/outbox atomically.
- `ContextManager`: constructs a versioned, hashed model input from immutable authority, structured progress, and bounded model-facing `ObservationEnvelope` representations.
- `ModelRouter`: resolves a logical `ModelRole`, required capabilities, compliance filters, budget, and configured fallback chain for every call; it may externally escalate or de-escalate within a run.
- `ModelEscalationPolicy`: decides whether repeated failure, verifier rejection, structural/visual/context complexity, or missing capability justifies a different role; the model cannot authorize stronger spend.
- `ModelGateway`: executes a concrete route. `DeploymentModelGateway` delegates a durable API or self-hosted target to `OpenRouterGateway` or `OpenAICompatibleGateway`; the agent loop is deployment-independent. Provider-specific `DirectProviderGateway` implementations are optional later.
- `ToolRegistry`: closed registry of versioned definitions and schemas.
- `ToolDispatcher`: records intent, compiles a policy decision, executes through a capability port, stores the result, and settles the call once.
- `PolicyEngine`: evaluates deployment/source/profile/domain/action/budget constraints with deny-overrides.
- `BrowserController`: leases a tenant- and run-bound `BrowserSession`/isolated `BrowserContext`, resolves opaque authentication, classifies challenges, and exposes structured-first plus visual-fallback typed operations.
- `ObservationProjector`: stores the immutable raw observation and constructs the bounded, sanitized, provenance-rich representation seen by a model.
- `CompletionVerifier`: evaluates a goal-specific deterministic predicate over persisted facts.
- `AdapterValidator`: runs deterministic fixtures, saved snapshots, assertions, termination checks, duplicate/watermark checks, and optional live canaries; validation never activates a version.
- `AdapterPromotionController`: performs the separately authorized active-pointer change and rollback; the proposing agent has no access to it.
- `AgentEventStore`: appends monotonic run events and writes outbox records in the same transaction as state changes.

### 17.3 Invariants

1. One active fenced coordinator lease per `AgentRun`; stale workers cannot commit.
2. A run has one immutable objective version. A repair or changed objective is a new run.
3. Every model/tool call has one logical ID and one or more immutable attempt IDs.
4. Every tool call has exactly one terminal status.
5. No external tool effect begins before its intent and idempotency key are durable.
6. Model output and webpage content have no authority until schema and policy checks pass.
7. Browser actions are serial within one session lease.
8. Budgets are atomically reserved before work and reconciled after work.
9. Completion is set only by `CompletionVerifier` in the same transaction that records accepted output/outbox.
10. Source checkpoints advance only in the acquisition layer after outputs are accepted.
11. A run may use several configured models; each `ModelCall` has exactly one durable role/routing decision and concrete execution route.
12. Every external tool/browser result reaches model context only through an `ObservationEnvelope`; raw content never gains instruction authority.
13. Every browser context is tenant-bound, run-bound, resource-bound, domain/policy constrained, separately audited, revocable, and pinned to an auth/profile version.
14. Structured and visual actions share the same `PolicyEngine`, call lifecycle, durable identities, budgets, and effect-certainty rules.
15. `VALIDATED` never implies `ACTIVE`; adapter validation and promotion are distinct authorized operations.

## 18. Core data model

Names are proposed additions. Existing target contracts (`UpstreamResource`, `SourceSubscription`, `CandidateItem`, `AcquiredContent`, `SourceCheckpoint`, `ModelExecutionRecord`, `SourcePolicy`) are referenced, not duplicated.

### 18.1 Authoritative D1 records

| Record | Essential fields | Notes |
|---|---|---|
| `AgentRun` | `id`, `tenantId`/`accountId`, `upstreamResourceId`, optional `sourceSubscriptionId`, `candidateItemId`/`discoveryScopeId`, `refreshRunId`, `mode`, `objectiveType`, `objectiveJson`, `policySnapshotId`, `authCapabilityId`/version, `state`, `phase`, `leaseGeneration`, `nextWakeAt`, timestamps, terminal reason | Tenant/resource ownership and current projection; no fixed-model field |
| `AgentRunAttempt` | `id`, `runId`, `generation`, `workerId`, `leaseExpiresAt`, `startedAt`, `endedAt`, outcome | Durable drain identity missing from simpler references |
| `AgentTurn` | `id`, `runId`, `seq`, `state`, `contextManifestId`, `completionProposalJson`, timestamps | One provider-turn boundary |
| `AgentModelCall` / `ModelExecutionRecord` | `id`, `runId`, `turnId`, `logicalCallKey`, `modelRole`, `routingReason`, required capabilities, configured primary/fallback chain, applied policy constraints, gateway, actual model/provider, request/visible-response refs/hashes, optional short rationale ref, schema version, state, token/cost/latency totals | One-to-one extension or subtype of existing record; single billing/routing truth, never hidden chain-of-thought |
| `AgentModelCallAttempt` | `id`, `modelCallId`, attempt number, provider request ID, state, failure code, retry timing | New identity on retry |
| `AgentToolCall` | `id`, `turnId`, model call ID, ordinal, tool/version, arguments hash/ref, idempotency key, policy decision ID, state, effect certainty, timestamps | Durable `ToolCall` identity; unique `(turnId, ordinal)` |
| `AgentToolIntent` | `id`, `toolCallId`, `executionAttempt`, normalized action/target, idempotency key, browser lease generation, budget reservation, committedAt, dispatch state | Durable append-before-effect record; one or more attempts only when replay is demonstrably safe |
| `AgentToolResult` | `id`, `toolCallId`, intent/attempt ID, status, structured result/ref/hash, observation IDs, failure code, effect certainty, redaction metadata, timestamps | Durable `ToolResult`; exactly one terminal projection per logical call |
| `AgentCheckpoint` | `id`, `runId`, `seq`, run/turn positions, structured progress, evidence IDs, browser resume hint, budget snapshot, context summary ref, createdAt | Resume input, not a live handle |
| `AgentRunBudget` | limits and consumed/reserved counters for every dimension; version | Updated atomically |
| `AgentPolicyDecision` | action, normalized target, effective policy inputs/versions, allow/deny, reason codes, redacted metadata | Auditable; no secret values |
| `BrowserSession` | `id`, `tenantId`, `runId`, `upstreamResourceId`, executor, opaque remote-session ref ciphertext, generation/fencing token, state, challenge state, expiry, timestamps | Durable identity for an ephemeral browser allocation; one active session generation per run |
| `BrowserContext` | `id`, `browserSessionId`, `runId`, `tenantId`, auth capability/profile IDs and versions, exact-domain/network/action policy snapshot, state, target/viewport metadata, created/closedAt | Isolated run-bound security boundary; never shared across tenants or concurrent runs |
| `ObservationEnvelope` | `observationId`, `runId`, `turnId`, `toolCallId`, source type, origin/final URL/domain, retrievedAt, content type, trust classification, representation type, truncation flag, original/presented size, raw object ref/hash, snapshot ref/hash, model-facing representation ref/hash, sanitization/transformation metadata/version | `trustClassification=UNTRUSTED_EXTERNAL`; immutable raw and bounded presentation are different artifacts |
| `ChallengeRecord` | `id`, `runId`, `browserSessionId`, `observationId`, state/classifier version/confidence, first/last detectedAt, attempt counters, disposition, resume/human-assistance refs | First-class durable challenge state, not a generic navigation error |
| `AgentRunEvent` | `runId`, monotonic `seq`, type/version, timestamp, actor, correlation IDs, payload | Append-only audit and replay feed |
| `AgentOutbox` | event/action type, aggregate ID/version, payload, delivery state, attempts, next attempt | Transactional queue boundary |
| `AdapterDefinition` / `WorkflowDefinition` | `id`, scope, kind, immutable version, DSL/schema version, definition ref/hash, parent/previous version, originating run, source/resource, repair reason, lifecycle state | State is `CANDIDATE`, `VALIDATED`, `ACTIVE`, `SUPERSEDED`, `REJECTED`, `INVALID`, or `ROLLED_BACK`; definition is immutable |
| `AdapterValidation` | adapter version, fixture/live target, validator version, result, metrics, evidence refs, failure codes | Reproducible acceptance record |
| `BrowserProfile` | opaque ID, tenant/principal, immutable version, encrypted secret object ref/key version, status, created/validated/expired/revoked timestamps | Cookies/tokens/localStorage/IndexedDB and persisted auth state are encrypted secret material, never ordinary record payloads |
| `AuthCapability` | opaque ID/alias, tenant/owner, upstream resource, profile ID/version, allowed domains/actions, source policy ID, status, issued/expiry/revocation/refresh metadata | Authorization to broker a specific profile version into a context; model sees only alias and non-secret status/scope |

### 18.2 R2 artifacts

Store full model request/visible-response envelopes after redaction, immutable raw DOM/AX snapshots, screenshots, downloads, response bodies, bounded model-facing observation representations, extraction traces, workflow definitions, fixture captures, and large tool results. D1 stores hashes, sizes, media types, retention class, encryption key reference, transformation provenance, and object keys. Content-address where useful, but scope keys by tenant and retention policy so deduplication never leaks cross-tenant existence. Browser authentication secrets use a separate encrypted secret store/key policy, not the ordinary observation bucket.

### 18.3 Ephemeral memory

Provider stream buffers, AbortControllers, CDP WebSockets, page handles, executor process IDs, in-flight promises, and decompressed observations are ephemeral. None is required to resume. A checkpoint may store a URL, target hint, and profile reference, but never serializes a live browser object.

## 19. Run/turn state machine

### 19.1 Run states

```text
created -> queued -> acquiring_lease -> running
                                    |        |
                                    |        +-> waiting_retry -> queued
                                    |        +-> challenge_detected -> waiting_human | route_switch_requested | failed
                                    |        +-> waiting_human -> queued (explicit resume)
                                    |        +-> recovering -> queued/running
                                    |        +-> completion_pending -> completed
                                    |        +-> completion_rejected -> running
                                    |
                                    +-> failed | cancelled | budget_exhausted | policy_blocked
```

`running` has an explicit phase: `assemble_context`, `route_model`, `call_model`, `validate_model_output`, `dispatch_tool`, `observe_result`, `classify_challenge`, `verify_completion`, or `checkpoint`. `waiting_human` is non-terminal and normally releases the coordinator lease while preserving or intentionally sealing the browser session according to expiry/security policy; it records the exact assistance type (`login`, `mfa`, `consent`, `account_choice`, CAPTCHA, or policy review), resume token, and expiry.

### 19.2 Turn states and transition rules

An `AgentTurn` is `created -> model_pending -> model_streaming -> response_validating -> tools_pending -> tools_running -> results_recorded -> continuation_pending | completion_proposed -> completed`. It may end `failed`, `cancelled`, or `effect_unknown`.

- A valid response with tool calls goes through tools in declared order. V1 permits only one browser-affecting call at a time.
- A valid completion proposal goes to the verifier; the model cannot write `AgentRun.state=completed`.
- A response containing both a completion proposal and tools is invalid in v1.
- A response with neither tools nor completion is `invalid_model_response`, eligible for one corrective model call within budget.
- A denied tool returns a typed denial result to the next turn only when the denial is recoverable; terminal policy blocks stop safely.
- Repeated equivalent calls without progress trip the loop detector.

### 19.3 Progress fingerprint

After every turn compute a fingerprint of normalized URL, adapter/version, goal counters, watermark state, accepted evidence IDs, and material observation hash. Repeating the same fingerprint with equivalent requested actions increments `stagnantTurns`; reset only on material state movement. At three stagnant turns, inject one structured recovery hint; at five, stop as `loop_detected`. Limits are configurable downward but not by the model.

## 20. Model-call lifecycle

An `AgentRun` is not bound to one LLM. Every `AgentModelCall` resolves a logical `ModelRole`; the initial v1 role set is `NAVIGATION_FAST`, `EXTRACTION_FAST`, `VISION_FAST`, `REASONING_STANDARD`, `REASONING_STRONG`, `VISION_STRONG`, `ADAPTER_REPAIR`, and `SEMANTIC_VERIFIER`. This taxonomy is configuration data and may evolve without changing provider code. The important contract is `logical role -> configured primary model and ordered compatible fallback chain`.

Routing sequence:

```text
task type + complexity + required capabilities + tool-use quality + context/vision needs
  -> capability filter
  -> tenant + SourcePolicy + DeploymentComplianceProfile + privacy filter
  -> remaining RunBudget filter
  -> configured role primary/fallback candidates
  -> quality + estimated cost + latency target + provider-availability selection
  -> concrete gateway/model/provider route
```

Extend the existing Distilled `ModelCapability`; do not create a parallel catalog. Its versioned entries cover `tool_calling`, `vision`, `structured_output`, `reasoning_class`, `context_window`, `max_output`, `streaming`, Computer Use compatibility, input/output cost metadata, latency class, provider, data residency, retention/privacy and zero-data-retention eligibility, status, and reliability. A vision-required call cannot select a non-vision model. Provider candidates are filtered by tenant policy, `SourcePolicy`, `DeploymentComplianceProfile`, authenticated-content sensitivity, residency, retention, and ZDR requirements before cost/quality ranking.

`ModelGateway` is the provider-wire abstraction:

- `DeploymentModelGateway` selects the gateway implementation from the already-resolved durable route; deployment-mode branches do not appear in the coordinator or agent loop.
- `OpenRouterGateway` is the default hosted/API gateway selected by `DISTILLED_LLM_API_GATEWAY=openrouter`.
- `OpenAICompatibleGateway` supports an internal endpoint without depending on vLLM, SGLang, llama.cpp, or another serving engine.
- `DirectProviderGateway` is an optional later adapter when a provider-specific contract is justified.

The canonical configuration contract is:

```rust
struct ModelRoutingConfig {
    mode: LlmDeploymentMode, // api | self_hosted | hybrid
    api_gateway: GatewayId, // openrouter by default
    self_hosted_gateway: GatewayId, // openai_compatible
    roles: BTreeMap<ModelRole, ModelRoleRoute>,
}

struct ModelRoleRoute {
    primary: ModelTarget,
    fallbacks: Vec<ModelTarget>, // ordered, first attempted first
}

struct ModelTarget {
    deployment: ModelDeployment, // api | self_hosted
    model: ModelRef,
}
```

Its canonical serialized form is structured configuration; this JSON example is equivalent to the implementation contract:

```json
{
  "mode": "hybrid",
  "apiGateway": "openrouter",
  "selfHostedGateway": "openai_compatible",
  "roles": {
    "NAVIGATION_FAST": {
      "primary": { "deployment": "self_hosted", "model": "local/navigation" },
      "fallbacks": [
        { "deployment": "self_hosted", "model": "local/navigation-fallback" },
        { "deployment": "api", "model": "provider/hosted-fallback" }
      ]
    }
  }
}
```

Deployment selection, model-role mapping, endpoints, credentials, and fallback chains are separate. `DISTILLED_LLM_MODE` is `api`, `self_hosted`, or `hybrid`; `DISTILLED_LLM_API_GATEWAY=openrouter` selects the hosted boundary; `OPENROUTER_API_KEY` is the hosted credential; and `DISTILLED_SELF_HOSTED_BASE_URL` plus optional `DISTILLED_SELF_HOSTED_API_KEY` configure internal OpenAI-compatible inference. Per role, `DISTILLED_MODEL_ROLE_<ROLE>_PRIMARY`, `DISTILLED_MODEL_ROLE_<ROLE>_PRIMARY_DEPLOYMENT`, and `DISTILLED_MODEL_ROLE_<ROLE>_FALLBACKS_JSON` replace only their corresponding fields. The canonical fallback value is an ordered JSON array such as `[{"deployment":"self_hosted","model":"local/fallback"},{"deployment":"api","model":"provider/fallback"}]`. Missing primary values, malformed targets, mode-incompatible targets, empty entries, or duplicate deployment/model identities fail configuration validation at startup. Secrets and endpoint URLs are gateway construction data and are not persisted in the run's role map.

In `api` mode every target is hosted/API; in `self_hosted` mode every target uses the internal OpenAI-compatible endpoint; in `hybrid` mode individual role targets and ordered fallbacks may use either. `ModelRef` values are configuration strings, not runtime constants. At each `ModelCall`, `ModelRouter` reads the immutable configuration snapshot for the requested role, capability/policy/budget-filters the primary followed by fallbacks without reordering them, and records the configured target chain plus chosen deployment/gateway/model/provider route. Distilled—not `openrouter/auto`—owns logical routing. The gateway may perform only provider failover that Distilled explicitly configured and can record.

`ModelEscalationPolicy` may move `FAST -> STANDARD -> STRONG` after typed repeated failures, verifier rejection, structural ambiguity, required capability absence, adapter repair classification, vision/context complexity, or task classification, subject to remaining budget and policy. It de-escalates back to a fast role when routine work resumes. A model may report difficulty but cannot select a stronger role or increase budget. `max_strong_model_calls` and `max_vision_calls` are hard gates.

Call lifecycle:

1. Derive required capabilities and requested `ModelRole` from the current phase; run the external routing/escalation policy.
2. Atomically reserve one model call plus estimated input/output/cost and strong/vision counters where applicable.
3. Create `AgentModelCall`/`ModelExecutionRecord` and attempt 1 with context-manifest hash and the entire routing decision: role/reason, required capabilities, configured primary/fallback chain, applied policy constraints, selected gateway/model/provider.
4. Assemble the request from the recorded manifest and bounded `ObservationEnvelope` representations; place the redacted request artifact in R2.
5. Start one cancellation-aware stream. Emit coarse lifecycle events; text deltas are optional telemetry, not authoritative state.
6. Require a normal provider terminal frame. Premature close is `model_stream_incomplete`.
7. Parse the narrow response envelope and validate JSON Schema. Persist the visible response, structured proposed tool call or completion proposal, and an optional explicit short rationale only when requested. Never require or persist hidden chain-of-thought.
8. Persist actual model/provider, fallback/retry reason, usage, cost, and latency; reconcile the reservation and settle the attempt.
9. If retryable, route a new immutable attempt from the same manifest after backoff. Never reuse partial assistant content or tool calls from the failed attempt.
10. On valid output, transactionally create tool intents or `MODEL_CLAIMS_COMPLETE`; only the verifier can produce `COMPLETION_VERIFIER_ACCEPTED`.

The provider receives only tools permitted for this run. Structured output is mandatory; tolerant JSON repair may parse superficial syntax only while preserving the original visible response. Semantic schema errors go back to a model at most once before typed fallback/failure.

## 21. Tool-call lifecycle

```text
requested
   -> arguments_validated
   -> policy_evaluated -> denied
   -> budget_reserved
   -> intent_committed
   -> dispatched
   -> succeeded | failed | cancelled | effect_unknown
   -> result_projected_for_model
```

Detailed rules:

- The call identity is derived from run/turn/model-call/ordinal; retries keep the logical ID but create an execution attempt.
- Schema validation precedes policy. Invalid calls have no capability handle and cannot reach an executor.
- Policy normalizes URL, domain, semantic handle or coordinate target, element/action semantics, download type, auth/profile scope, and observation binding. Redirect/subresource policy continues inside the broker.
- The dispatcher atomically persists intent, budget reservation, and `tool.requested`/policy events before dispatch.
- Pure observations may be retried with the same idempotency key. Navigation is retryable only from a known checkpoint. Any action with uncertain external mutation is not automatically repeated.
- The executor returns structured output plus artifacts. The dispatcher verifies hashes/size, persists the terminal result/checkpoint/event/outbox, then acknowledges the queue message.
- A stale lease generation cannot settle current state. Its late result is stored as an orphan diagnostic and the current call remains governed by recovery policy.
- Tool failures are normally model-visible data; invariant/storage/policy-engine failures are runtime-fatal.

V1 tools use two surfaces. Structured Browser Use is preferred whenever DOM/accessibility/page state can ground the action. Visual Computer Use is selected only when a persisted observation demonstrates insufficient semantic grounding or the fixture explicitly tests visual-only UI. Both have the same call lifecycle and `PolicyEngine`.

| Tool | Purpose | Policy shape |
|---|---|---|
| `browser.navigate@1` | Structured: open an allowed seed/link URL | Exact URL/domain, redirect and network guards |
| `browser.inspect_dom@1` | Structured: bounded semantic DOM | Read-only; pruning, size, redaction, origin limits |
| `browser.inspect_accessibility_tree@1` | Structured: bounded AX representation | Read-only; frame/origin and size limits |
| `browser.follow_link@1` | Structured: follow link from prior observation by stable handle | Handle bound to observation hash; safe-link semantics |
| `browser.scroll@1` | Structured: bounded viewport/container scroll | Direction/count/pixel cap; no arbitrary JS |
| `browser.extract@1` | Structured: extract fields/listings | Typed schema, max items/bytes, provenance per field |
| `browser.wait@1` | Structured: wait for bounded lifecycle/state predicate | Allowlisted predicate, deadline, no arbitrary expression |
| `browser.query_page_state@1` | Structured: URL/title/controls/navigation/challenge state | Read-only and bounded |
| `browser.download_document@1` | Structured: retrieve allowed document | Policy/MIME/domain/virus/content checks |
| `computer.screenshot@1` | Visual: capture current viewport for a vision-capable call | Read-only, metered, redacted, observation-bound |
| `computer.move_pointer@1` | Visual: move pointer within viewport | Coordinate bounds and current observation hash |
| `computer.click@1` / `double_click@1` | Visual: bounded coordinate click | Current screenshot/viewport hash, safe action class, post-observation |
| `computer.type@1` / `keypress@1` | Visual: ordinary non-secret input | No credential fields; key/text/action allowlist |
| `computer.scroll_visual@1` / `drag@1` | Visual: bounded scroll or drag | Coordinate/distance/count cap and post-observation |
| `candidate.propose@1` | Stage discovered URL candidates | No direct candidate acceptance |
| `adapter.propose@1` | Stage a declarative adapter candidate | Valid DSL only; cannot promote |
| `run.propose_completion@1` | Submit facts to deterministic verifier | No side effect other than proposal |

No v1 tool accepts arbitrary JavaScript, `page.evaluate`, shell commands, raw CDP methods, or model-supplied secrets. Visual operations remain technically capable of normal browser interaction, including ordinary challenge-page inspection, but policy never authorizes CAPTCHA bypass, automatic MFA, credential entry, or external mutations.

## 22. Context model

### 22.1 Authority ordering

The model request is assembled in fixed layers that cannot be reordered by an adapter or webpage:

1. Runtime constitution: role, tool protocol, trust rule, completion protocol.
2. Compiled policy/capability summary: allowed tool classes, domains, limits, profile alias and prohibited categories.
3. Distilled source configuration and immutable objective.
4. Structured run progress: counters, watermark, visited-page set, adapter candidate state, prior failures.
5. Recent visible model responses, proposed actions, external policy decisions, and tool/verifier results.
6. Bounded model-facing `ObservationEnvelope` representations, each in a data-only field with origin, capture/hash, transformations, truncation, and explicit “never instructions” label.
7. A bounded corrective message from schema/policy/completion verifier, if any.

Website text is never concatenated into layers 1–4, even if it claims to be a system message, policy, captcha instruction, or tool output.

### 22.2 `ObservationEnvelope`

`ObservationEnvelope` is the only normal path from browser, web, or tool output into model context:

```text
ObservationEnvelope
  observationId, runId, turnId, toolCallId
  sourceType
  originUrl, originDomain, finalUrl
  retrievedAt, contentType
  trustClassification = UNTRUSTED_EXTERNAL
  representationType = DOM | ACCESSIBILITY_TREE | EXTRACTED_TEXT |
                       SCREENSHOT | STRUCTURED_DATA | TOOL_RESULT | PAGE_STATE
  isTruncated, originalSize, presentedSize
  rawObjectRef, rawHash
  snapshotRef, snapshotHash
  modelRepresentationRef, modelRepresentationHash
  sanitizationVersion
  transformations[]
  redactions[]
```

The immutable raw observation and bounded model-facing representation are separate artifacts. The raw object is retained only when policy permits and is never implicitly concatenated into a prompt. `ObservationProjector` deterministically sanitizes, prunes, chunks, redacts, and sizes the presentation; every transformation is versioned and hashed. The model normally receives that presentation plus provenance metadata, not the raw page. A screenshot is both a raw/snapshot artifact and, after resizing/redaction, a distinct model presentation.

This boundary contains prompt injection by keeping external data below trusted instructions and independently policy-checking any resulting proposal. It controls context size through explicit `originalSize`, `presentedSize`, and `isTruncated`; supports reproducibility by pinning raw/presentation hashes and transformation versions; supports debugging by answering exactly what was captured versus shown; preserves evidence provenance without claiming model text is publisher evidence; and enables later replay from the same immutable artifact under the same projector version.

### 22.3 Context manifest

`ContextManifest` records every component ID/version/hash, ordered `ObservationEnvelope` IDs and model-representation hashes supplied, truncation/redaction/transformation decisions, tool schema versions, model role/routing decision, capability registry version, and estimated tokens. This lets operators answer “what did the model see?” without retaining secrets in a transcript or requiring hidden reasoning.

### 22.4 Large-page strategy

1. Capture metadata and AX/semantic DOM; exclude scripts, styles, hidden text, repetitive navigation, and raw attributes by default.
2. Chunk by semantic region and select regions using deterministic relevance to the goal and visible/link structure.
3. Keep stable element handles scoped to the observation hash; stale handles fail instead of selecting a new element accidentally.
4. Store the full permitted immutable snapshot in R2. Put only capped `ObservationEnvelope.modelRepresentation` chunks in context.
5. Add a screenshot only when visual layout, canvas, or missing semantic content requires it.
6. Extraction produces a structured result with source nodes/URLs, not a giant page dump.

Compaction in v1 is deterministic: retain immutable authority, current goal state, last N visible call/result pairs, failures still influencing policy, and references to accepted evidence. Older successful observations become a structured digest of envelope IDs/hashes with R2 references. Natural-language summarization is deferred until measurements show it is necessary. Hidden chain-of-thought is neither requested nor persisted and is never a recovery, compliance, debugging, or observability dependency.

## 23. Budget model

`RunBudget` is a hard multidimensional envelope enforced transactionally outside the model. Defaults vary by objective/source risk; policy may only lower them.

| Dimension | Enforcement point | Suggested v1 default ceiling |
|---|---|---:|
| Model calls | Reserve before provider attempt | 12 |
| Input tokens | Estimate/reserve, reconcile from usage | 120,000 total |
| Output tokens | Provider limit and reconcile | 16,000 total |
| Model spend | Existing model pricing/accounting | deployment-defined hard amount |
| Strong-model calls | Reserve after external route decision | 2 |
| Vision-model calls | Reserve before screenshot-bearing call | 3 |
| Wall clock | Coordinator deadline | 10 minutes scheduled; 20 minutes repair |
| Browser actions | Before dispatcher intent | 40 |
| Navigations | Before navigate/follow | 15 |
| Unique pages observed | Observation commit | 20 |
| Extracted documents | Acceptance stage | 100 or objective-specific lower N |
| Tool retries | Retry scheduler | 2 per safe call, 8 total |
| Model retries | Model lifecycle | 2 transient attempts per logical call |
| Challenge detections/retries | Challenge classifier/coordinator | 2 classifications, 0 CAPTCHA solve retries, 1 resumable auth check |
| Concurrent pages | Browser broker | 1 in v1 |
| Download bytes/count | Network broker | 20 MiB / 5 documents |
| Adapter candidates | Candidate staging | 2 |
| Child agents | Registry | 0 in v1 |
| Stagnant turns | Progress detector | warn 3, stop 5 |

Reservation prevents duplicate workers from both passing a remaining-budget check. Reconciliation never returns more than the reserved amount without an atomic counter update. Budget exhaustion is terminal for the run but not automatically a source-health failure; the acquisition controller decides whether another strategy is viable.

The schema names are `maxModelCalls`, `maxInputTokens`, `maxOutputTokens`, `maxModelCostUsd`, `maxStrongModelCalls`, `maxVisionCalls`, `maxBrowserActions`, `maxNavigations`, `maxDownloads`/bytes, `maxRetries`, `maxChallengeTransitions`, `maxChildAgents`, `maxConcurrentPages`, and `maxWallClock`. The runtime and `ModelRouter`, never the model, enforce them. The first slice sets `maxChildAgents=0` and `maxConcurrentPages=1`.

## 24. Retry model

Retry decisions use `(failure class, operation, effect certainty, attempt, source policy, remaining budget)`.

- Provider connection reset/429/5xx: bounded exponential backoff with jitter and `Retry-After`; scheduled work uses a circuit breaker and avoids herd amplification.
- Invalid model schema: one corrective call with validation details; repeated failure is terminal for that model call and may route to a compatible fallback model once.
- Read-only browser observation failure: retry once after checking session health.
- Navigation timeout: inspect current URL/loader; if no commit, retry once; if commit is uncertain, observe before deciding.
- Browser/tab crash: recreate isolated context, restore profile capability, navigate to checkpoint URL, observe, and continue. Never assume DOM handles survive.
- Stale element: re-observe and let the model choose a new handle; do not blindly replay coordinates.
- Challenge states (`PASSIVE_BROWSER_CHALLENGE`, `LOGIN_REQUIRED`, `SESSION_EXPIRED`, `MFA_REQUIRED`, `CAPTCHA_REQUIRED`, `AUTOMATION_BLOCKED`, `ACCESS_DENIED`, `CHALLENGE_LOOP`): never enter the generic navigation retry path. Persist the classification/envelope, consume the dedicated challenge budget once, checkpoint, then preserve/seal the session, suspend for authorized human assistance, request an external route switch, or fail according to policy. `CAPTCHA_REQUIRED` has zero automatic solve retries in v1.
- Adapter structural failure: switch route or begin a separately authorized repair run after threshold; never retry the same selector indefinitely.
- Storage/invariant failure: fail safely and leave the queue unacknowledged only when replay is demonstrably idempotent.

Every retry has a reason event, scheduled time, maximum, and new attempt identity. Backoff state is durable. Provider fallback cannot reuse partial streamed tool calls.

## 25. Cancellation model

Cancellation is a durable `cancel_requested_at`, actor, and reason on `AgentRun`, plus a process-local token propagated to model streams, dispatcher, browser broker, waits, and downloads.

The coordinator checks cancellation before acquiring a lease, before every reserved effect, after every awaited external call, and before committing continuation. On cancellation:

1. Stop accepting new calls.
2. Abort provider/network waits.
3. Ask the browser broker to cancel the active generation and close the page/context if necessary.
4. Settle requested/in-flight tools as `cancelled` if no effect occurred, otherwise `effect_unknown`.
5. Persist a final checkpoint/event and reconcile reservations.
6. Release leases and stop all future outbox wakes.

Cancellation is idempotent. A late executor result cannot turn a cancelled run back into running or completed. Shutdown uses the same path with a short grace period; unfinished work resumes from durable state on another worker.

## 26. Checkpoint/recovery model

### 26.1 Checkpoint contents

A checkpoint stores the objective/version, state-machine position, last settled `ModelCall`/`ToolCall`/`ToolIntent`/`ToolResult` IDs, `ObservationEnvelope` IDs/hashes, visited canonical URLs, current/final URL, pagination/watermark facts, challenge state, accepted output/evidence/completion-acceptance IDs, adapter candidate/version, classified failures, budget counters, context manifest/digest, model routing decision, policy/auth/profile versions, and browser lease generation. It does not store cookies, tokens, browser storage, a CDP socket, DOM object IDs, hidden reasoning, or uncommitted model text.

### 26.2 Commit boundaries

Create a checkpoint after each terminal tool result, accepted candidate/evidence batch, completion rejection, human suspension, and retry scheduling. State row, event, outbox, budget, and checkpoint update occur in one D1 transaction. Large R2 artifacts are uploaded first under an immutable temporary key/hash, then referenced by the transaction; a later sweeper removes unreferenced objects.

### 26.3 Recovery algorithm

1. Queue wake acquires `AgentRun` by compare-and-swap on lease expiry/generation.
2. Reconcile calls in non-terminal states using executor/provider idempotency metadata.
3. If intent was recorded but dispatch did not occur, dispatch only if the operation is safe/idempotent and the same intent/idempotency identity remains current.
4. If dispatch may have occurred but result persistence is absent, prove the resulting page/effect from a fresh observation before replay. If proof is impossible, persist `effect_unknown`; never manufacture a failed/no-effect result. Visual clicks receive the same treatment even when the intended policy class was read-only.
5. Rehydrate `BrowserProfile` by capability reference and acquire a new browser lease if needed.
6. Reopen the checkpoint URL, rebuild an observation, invalidate stale element handles, and compare progress facts.
7. Continue with a new turn/attempt and emit `run.resumed` with recovery reason.

The mandatory crash matrix is:

| Case | Crash boundary | Required recovery |
|---|---|---|
| A | `ToolIntent` committed, process dies before execution | Same logical intent is safely dispatched/replayed exactly when its operation is idempotent and lease generation is current |
| B | Browser action executes, process dies before `ToolResult` persistence | Fresh observation proves effect and reconciles the result, or the call becomes explicit `effect_unknown`; unsafe replay is forbidden |
| C | `AcquiredContent` is accepted, process dies before `AgentRun` advances | Deterministic acceptance key returns the existing acceptance; state advances without a second accepted output |
| D | Run completion/output acceptance commits, worker dies before queue acknowledgement | Redelivery observes the durable completion-acceptance ID and exits without another browser/model/evidence effect |

Durable identities exist for `AgentRun`, `AgentTurn`, `ModelCall`, `ToolCall`, `ToolIntent`, `ToolResult`, every `ObservationEnvelope`, `AcquiredContent`/evidence acceptance, and completion acceptance. This provides at-least-once execution with idempotent projections/effects where possible, not exactly once. Duplicate queue deliveries join/exit behind the fenced lease. Accepted output uses deterministic uniqueness keys such as `(upstreamResourceId, canonicalPublisherItemId/contentHash)` so replay cannot duplicate evidence.

## 27. Permission/policy model

### 27.1 Compiled capability

At run creation, the acquisition controller resolves `DeploymentComplianceProfile`, applicable `SourcePolicy`, tenant policy, route, objective, and optional auth capability into an immutable `RunCapabilitySnapshot`. Every tool request is intersected with it; deny wins. Policy versions and reasons are recorded.

### 27.2 Action classes

| Class | Examples | Default news-acquisition policy |
|---|---|---|
| Passive read | inspect DOM/AX, screenshot, query page state/response metadata | Allow within domain, observation, privacy, and data limits |
| Navigational read | navigate, follow safe link, pagination, structured or visual scroll | Allow within scoped domains and budget |
| Local view mutation | semantic or coordinate click/drag to set a non-persistent filter/sort or expand disclosure | Allow only observation-bound typed safe controls with post-observation; visual path has separate budget |
| Document retrieval | download public/permitted PDF/document | Allow by MIME, size, URL and retention policy |
| Authentication continuation | use already-bound session/SSO | Allow only through opaque named capability; no secret values or model-driven secret entry |
| External mutation | submit form, comment, message, publish, like, subscribe | Deny in v1 |
| Account/security mutation | profile, password, MFA, permissions, delete, billing, purchase | Deny structurally |
| Arbitrary execution | JavaScript, shell, extension install, upload | Deny structurally |

A structured “safe click” references an element in the last DOM/AX envelope. A visual safe click references coordinates in the latest screenshot envelope plus viewport/hash, a model-declared bounded purpose, and any deterministic visual/DOM target evidence available; it is allowed only for the same local-read action classes (navigation, pagination, filter/sort, disclosure). Stale coordinates fail closed. Elements or regions whose label, role, form ancestry, page state, or declared purpose imply submit, buy, send, save, delete, follow, consent, credential entry, or account change are denied. The browser broker also monitors resulting network methods, downloads, popup targets, and redirects.

### 27.3 Human decisions

Scheduled runs never wait synchronously for approval. A request needing login, MFA, consent, ambiguous account choice, new domain, paid provider, expanded retention, or high-impact adapter promotion enters `waiting_human` with a typed request. Approval creates a new policy/capability version and an explicit resume event; it does not edit past decisions.

## 28. Browser architecture

### 28.1 Ports and isolation

The ownership chain is explicit:

```text
Tenant
  -> UpstreamResource
  -> AgentRun
  -> BrowserSession (ephemeral allocation with durable ID + fencing generation)
  -> BrowserContext (isolated security boundary)
  -> one active Page/Target in v1

AuthCapability(version) -> BrowserProfile(version) --broker injection--> BrowserContext
RunCapabilitySnapshot -----------------------------------------------> BrowserContext
```

Each `AgentRun` gets a new browser context that is tenant-bound, run-bound, associated with one `UpstreamResource`, pinned to a specific auth/profile version, exact-domain constrained, network/action-policy constrained, revocable, and separately auditable. A browser process may technically host several contexts only if the executor proves context isolation; no context, target, storage partition, download path, artifact namespace, or handle is shared between tenants or concurrent runs. One run has one active page in v1.

`BrowserExecutorPort` exposes allocation/health/cancellation/release, while `StructuredBrowserUsePort` and `VisualComputerUsePort` expose their respective typed actions. Implementations run outside ordinary Worker memory and return stable IDs/artifact refs. `BrowserController` is the single policy-aware adapter used by both tool surfaces. It resolves stable observation handles or screenshot-relative coordinates, applies deadlines/budgets, emits events, builds `ObservationEnvelope` records, and never exposes raw CDP to the model.

### 28.2 Session lifecycle

```text
requested -> provisioning -> context_created -> auth_injected -> ready -> active
                        |                  |                       |
                        |                  v                       v
                        |             auth_invalid          challenge_detected
                        |                  |                 /       |        \
                        |                  v                v        v         v
                        |             waiting_human   route_switch  suspended  failed
                        v
                     degraded -> recovering -> ready
                        |
                        +-> expired | revoked | closed | failed
```

Readiness includes browser connection, isolated context creation, policy/network enforcement, brokered profile application, target creation/attachment, required CDP domain enablement, download interception, and an initial `about:blank` envelope. A session has TTL and generation. Renewal and every action recheck tenant/run/context ownership, capability status/version, domain scope, and policy version. Revocation cancels the generation and destroys the context.

### 28.3 Observations and interactions

- Prefer Structured Browser Use—DOM, accessibility tree, semantic handles, loader/network and page state—to screenshots and coordinates.
- Escalate to Visual Computer Use only for canvas/visual-only UI, unreliable semantic grounding, unusual JS/modal/menu behavior, or explicit diagnostic need; capture a fresh screenshot envelope first and bind coordinates to its viewport/hash.
- Include current URL, final redirect URL, title, tab/frame tree summary, viewport, navigation state, salient links/controls, extracted metadata, challenge state, and prior-action outcome in `ObservationEnvelope` representations.
- Treat iframes by explicit origin/frame IDs; cross-origin interaction requires policy approval for that origin.
- Bind element handles to `(sessionGeneration, targetId, frameId, observationHash, backendNodeId/semantic locator)`.
- Bind visual coordinates to `(sessionGeneration, targetId, screenshotObservationId/hash, viewport dimensions, device scale)`; stale/resized screenshots fail closed.
- Wait on loader/lifecycle predicates with bounded quiet periods; do not use fixed sleeps as success criteria.
- Detect popup/new-tab creation and keep it quarantined until domain policy accepts it.
- Route every request/redirect/download through SSRF, DNS-rebinding, IP-range, scheme, host, port, method, MIME, and byte limits.
- Close/recreate context after crash, suspected hostile state, or uncertain timeout; profile state remains separately controlled.

### 28.4 Challenge state model

`ChallengeClassifier` deterministically combines response status/headers, URL/redirect patterns, DOM/AX signals, visible screenshot classifications, session validation, and bounded model assistance where policy permits. It emits exactly one of:

```text
NO_CHALLENGE
PASSIVE_BROWSER_CHALLENGE
LOGIN_REQUIRED
SESSION_EXPIRED
MFA_REQUIRED
CAPTCHA_REQUIRED
AUTOMATION_BLOCKED
ACCESS_DENIED
CHALLENGE_LOOP
```

Every non-`NO_CHALLENGE` result is persisted with the triggering observation, classifier version/confidence, counts, and disposition. `PASSIVE_BROWSER_CHALLENGE` may be observed once within the challenge budget if the site is naturally progressing. Login/session/MFA states checkpoint and request capability refresh or authorized human setup; CAPTCHA never triggers automatic solving in v1; automation/access blocks request an external legal-route decision or fail. Repeated or cycling classifications become `CHALLENGE_LOOP`. The coordinator stops issuing ordinary retry actions at the challenge budget, so `CAPTCHA -> retry forever -> consume model/browser budget` is impossible by construction.

## 29. Trust/prompt-injection boundary

```text
Trusted authority
  runtime constitution
  compiled Distilled/source policy
  immutable objective
  deterministic verifier
            |
============ trust boundary ============
  webpage text, DOM, metadata, JS-rendered content,
  links, downloads, screenshots, OCR, robots/terms text
            |
  immutable raw observation -> bounded ObservationEnvelope representation
            |
  model output / proposed action (also untrusted)
            |
============ policy boundary ===========
  Tool Dispatcher + Policy Engine
  Browser/Profile/Network brokers
  Evidence and adapter validators
```

Controls:

1. Page/tool data is placed only in typed `ObservationEnvelope` user/data fields, never system/developer instruction fields; raw artifacts are not prompt components.
2. The model is told that page instructions cannot change objective, policy, tools, identity, or completion.
3. The bounded presentation removes script/style and marks quoted content, origin, capture time, raw/presentation hashes, transformation version, truncation, and redactions.
4. The model never receives raw secrets, cookie values, authorization headers, storage state, internal network addresses, or cross-tenant identifiers.
5. Tool schemas do not accept secret strings or arbitrary code. Domain and action policy is rechecked outside the model.
6. Network egress prevents exfiltration to unapproved hosts even if the model follows malicious page text.
7. Downloads are quarantined, typed, size-limited, and never executed.
8. Suspicious text detection can add telemetry or force stricter mode, but is not the security boundary; deterministic policy remains authoritative.
9. Evidence preserves exact publisher content/provenance but does not elevate it to instructions.
10. Completion verifier ignores page claims such as “task complete” unless required objective facts were independently observed and persisted.
11. Auditability rests on objective, envelopes shown, visible response/action proposal, policy decision, effect/result, verifier outcome, usage/cost, and state transitions—not on hidden chain-of-thought.

## 30. Authentication capability model

### 30.1 Objects

`BrowserProfile` is a versioned template owned by one tenant/principal. Its secret payload includes cookies, bearer/session tokens, localStorage, sessionStorage, IndexedDB where supported, persisted browser authentication state, and any other browser credential material; non-secret metadata includes user-agent/locale/proxy constraints, creation time, last validation, status, and key version. Passwords and MFA secrets/codes are never stored as model-accessible profile fields. Secret payloads are envelope-encrypted at rest with tenant-scoped keys, separated from ordinary D1 reads and observation artifacts, and redacted from logs, events, traces, prompts, errors, and screenshots where detectable.

`AuthCapability` authorizes one runtime purpose to attach exactly one approved `BrowserProfile` version to a new isolated `BrowserContext`. It includes opaque ID/alias (for example `publisher-account-37`), tenant/owner, profile ID/version, exact allowed domains, `UpstreamResource`/source scope, permitted read actions, issued/expiry/revocation times, refresh policy, maximum concurrent sessions, and applicable `SourcePolicy`. The model sees only the alias, status (`ready`, `expired`, `assistance_required`, `revoked`), and a non-secret domain/action summary. It never receives decryption handles or secret values.

### 30.2 Lifecycle

1. If eventually required, a user initiates one-time interactive login in a dedicated isolated context through a trusted UI; this is not the agent's browser context.
2. Runtime captures permitted session state into a new immutable encrypted profile version after explicit confirmation; passwords and MFA responses are never sent to or entered by the agent model.
3. A validator checks exact-domain session readiness with a harmless read and stores a versioned capability.
4. A run requests the capability; broker verifies `Tenant -> UpstreamResource -> AgentRun`, policy, exact domains, expiry, revocation, version, concurrency, and executor region before decrypting directly into that run's isolated context.
5. Refreshable tokens rotate in the credential service. Session refresh or newly captured cookies create/revalidate a new immutable profile/capability version; in-flight runs remain pinned unless a controlled recovery transition explicitly adopts the new version.
6. `LOGIN_REQUIRED`, `SESSION_EXPIRED`, `MFA_REQUIRED`, consent, or account ambiguity checkpoints and suspends the run for capability refresh or human assistance. The model may receive a redacted envelope describing the blocker but cannot enter or retrieve secrets.
7. Revocation immediately denies new leases and cancels active generations. Logs/events contain only capability/profile IDs and redacted domain metadata.

Multi-tenant isolation requires tenant-scoped encryption/envelope keys, separate browser contexts, tenant-prefixed artifact storage, non-reusable context/download namespaces, and authorization checks on every profile lookup, context creation, action, refresh, and artifact read. Profile export is never a model tool. If safe refresh fails or capability expires/revokes, the context is destroyed or sealed according to policy and recovery never falls back to exposing credentials.

## 31. Evidence/provenance model

The agent does not create a competing `EvidenceRecord`; it stages acquisition results that conform to existing `AcquiredContent`, after which the normalizer creates `NormalizedEvidenceItem`.

For every extracted field/item preserve:

- publisher and canonical URL plus final acquired URL;
- `CandidateItem` and `UpstreamResource` IDs;
- acquisition route/provider (`web_operator`) and durable `AgentRun`/turn/model/tool/intent/result/`ObservationEnvelope` IDs;
- capture time, page-published/updated time with parsing confidence and original text;
- DOM/AX node/selector or response location, source-frame origin, and observation hash;
- immutable raw HTML/text/screenshot/download refs and hashes plus bounded representation hash, media type, original/presented byte size, truncation, sanitization/transformation versions, and retention class;
- adapter ID/version if deterministic execution contributed;
- model role/routing record, concrete model/provider/gateway and call only when a model inferred a mapping; model output is never the publisher source;
- policy snapshot and auth capability IDs without secret values;
- transformations applied and validation outcomes.

The evidence acceptor validates URL/canonicalization, item schema, non-empty content basis, date sanity, duplicate keys, watermark relation, source policy, and artifact integrity. It writes accepted acquisition output and idempotency keys before any `SourceCheckpoint` advance. Model-generated summaries cannot fill missing publisher text, consistent with existing source contracts.

## 32. Deterministic completion model

Each objective type has a versioned `CompletionContract` with required facts, verifier function, and outcome schema. `run.propose_completion` creates `MODEL_CLAIMS_COMPLETE` and merely submits references/facts. The verifier reads durable state and alone emits `COMPLETION_VERIFIER_ACCEPTED`, `not_satisfied` with machine-readable deficits, or `indeterminate`. Model text such as “done” has no transition authority.

Examples:

| Objective | Required deterministic facts |
|---|---|
| Collect N articles | `requested_count_reached`: at least N unique accepted candidates/acquired items satisfy time/source filters and each has provenance/validation |
| Reach watermark | `watermark_observed` or `validated_listing_boundary_reached`: ordered traversal observes an item at/before supplied watermark, accounts for newer items, and validates page/order assumptions |
| Exhaust pagination | `pagination_exhausted`: a bounded terminal signal—disabled/missing next after stable re-observation or repeated cursor/content fingerprint—passes the contract; hitting a safety maximum is partial, not exhaustion |
| Reach known archive edge | `known_archive_boundary_reached`: configured, versioned boundary/cursor is observed and all in-scope items before it are accounted for |
| Discover feed | `feed_discovered_and_validated`: URL fetched under policy, valid RSS/Atom/JSON parsed, publisher relation validated, freshness/item threshold met |
| Extract article | Required fields meet schema/quality, canonical URL matches policy, raw artifact present, dates and content basis validate |
| Generate adapter | `adapter_validation_passed`: DSL schema, fixtures, mutation/termination assertions, policy lint, duplicate/watermark rules, and any required live canary pass; activation remains separate |
| Repair adapter | `adapter_validation_passed`: prior structural failure reproduced, candidate fixes it, regression corpus passes, optional/required live canary passes, and policy does not expand |

There is deliberately no generic “no newer content exists” verifier. A run can only report the narrower proven condition—such as `watermark_observed`, `pagination_exhausted`, `validated_listing_boundary_reached`, or `known_archive_boundary_reached`—with the contract's scope and coverage. “No newer content observed” without one of those validated boundaries is partial/indeterminate, never universal absence.

A rejected proposal produces structured deficits the next model turn can address. Repeated identical rejected proposals count as no progress. Budget expiry yields a truthful partial/failed result, never a fabricated completion.

## 33. Self-healing adapter/workflow lifecycle

### 33.1 Adapter definition

An `AdapterDefinition` may reference an immutable versioned `WorkflowDefinition` expressed in a future BrowserWorkflow DSL. It is not a prompt, raw action history, or model-authored code. The interpreter is deliberately outside the first slice, but its bounded opcode contract may support:

- exact host/path scope and allowed redirects;
- mode `http` or `browser` and required auth capability class;
- seed URL template with typed parameters;
- `navigate`, `wait_for`, `find`, `click`, `scroll`, `extract`, `paginate`, `transform`, `stop_if`, and `download` from a restricted typed opcode set;
- fallback selector sets using semantic roles/labels, CSS only where necessary, and frame scope;
- pagination strategy with cursor/fingerprint/maximum and termination predicate;
- item-list and article-field mappings;
- pure transforms from a fixed library (trim, URL resolve, date parse with locale, whitespace, allowlisted regex capture);
- watermark/order semantics;
- expected invariants and quality thresholds;
- artifact/retention policy references.

Workflow discovery emits an immutable `WorkflowCaptureBundle`, not a runnable adapter. The bundle contains normalized visible action records, pre/post `ObservationEnvelope` references, interacted-element/locator evidence, action result and effect certainty, page identity, timing, and capture-tool/version provenance. `WorkflowCandidateCompiler` deterministically maps supported records into typed opcodes, parameter candidates, ordered locator candidates, and explicit unsupported gaps. Optional model enrichment may propose parameter names or repair candidates from that bounded visible evidence, but it cannot add authority, consume hidden chain-of-thought, or bypass validation. Every replay records locator strategies attempted and the strategy selected so later structural-failure cohorts have repair evidence.

No arbitrary JavaScript, `page.evaluate`, shell, unapproved network endpoint, dynamic package, secret, or model call is embedded. Every workflow is versioned, auditable, policy checked, resource bounded, deterministic where practical, and validated before promotion. Browser Harness history/helper capture, BrowserCode's flexible CDP execution, and Workflow Use's action/history-to-semantic-step compiler inform discovery/debugging, but recorded action histories are translated into this declarative form rather than replayed blindly. Workflow Use's disabled/commented agent-fallback path, optional default-off verifier, and roadmap-level automatic file update are not adopted. A rare site that truly needs code uses a human-reviewed, signed connector plugin outside the agent-generated path.

### 33.2 Lifecycle

```text
CANDIDATE --validator passes--> VALIDATED --promotion controller approves--> ACTIVE
    |                            |                                      |
    +--> REJECTED               +--> INVALID                            +--> SUPERSEDED
                                                                          |
                                                                          +--> ROLLED_BACK
```

`VALIDATED` does not mean `ACTIVE`. The agent may investigate, generate, and propose a `CANDIDATE` only. `AdapterValidator` is a separate principal that performs schema/policy/static checks; deterministic and saved DOM/snapshot fixtures; expected extraction outputs; structural, pagination, termination, duplicate, and watermark assertions; regression/mutation corpus; and an optional policy-required live canary. It records validator version, fixture hashes, outcomes, and evidence. `AdapterPromotionController` separately authorizes an active registry pointer change. The proposing agent has no promotion capability.

Repair triggers require classified structural evidence across a configured cohort/threshold of distinct runs/pages (for example repeated selector misses with page content present or invariant drift), plus confidence threshold, cooldown, and repair budget. Network errors, provider outages, login/session expiry, CAPTCHA, region blocking, or one empty response cannot trigger repair.

Automatic promotion is deferred from the first slice and must remain independently feature-gated even later. A future policy may allow it only for read-only, no-auth, no-domain-expansion candidates that pass all validators and a configured canary sample. Authenticated adapters, new domains, increased retention, new action classes, ambiguous terms, or reduced evidence quality require human approval. The agent cannot change its validation fixtures, thresholds, promotion policy, or active pointer in the same proposal.

Rollback is a promotion-controller registry pointer change to a previous immutable version; the regressed version becomes `ROLLED_BACK`, while a normal replacement becomes `SUPERSEDED`. Existing runs pin the version they started with; new runs receive the active pointer. Preserve originating `AgentRun`, source/resource, previous version, repair reason, validation results, promoter/controller decision, canary evidence, and rollback reason for every version.

## 34. Event/observability model

### 34.1 Event design

Events are immutable, versioned, tenant-scoped, ordered per run, and redacted. State-changing events and the current state/outbox are committed atomically. Recommended event families:

- `agent.run.created|queued|leased|started|checkpointed|resumed|waiting_human|completed|failed|cancelled|budget_exhausted`
- `agent.turn.started|completed|failed`
- `agent.model.route_selected|escalated|deescalated|requested|stream_started|completed|failed|fallback|retry_scheduled`
- `agent.tool.requested|validated|policy_allowed|policy_denied|started|succeeded|failed|cancelled|effect_unknown`
- `agent.browser.lease_requested|ready|degraded|recovered|released`
- `agent.browser.navigation_started|committed|failed`
- `agent.browser.context_created|auth_injected|observation_created|download_quarantined`
- `agent.challenge.detected|classified|budget_exhausted|waiting_human|route_switch_requested|resolved`
- `agent.candidate.proposed|accepted|rejected`
- `agent.acquired_content.staged|accepted|rejected`
- `agent.completion.proposed|accepted|rejected`
- `agent.adapter.repair_started|candidate_created|validation_completed|promotion_requested|promoted|rolled_back`
- `agent.policy.decision` and `agent.auth.assistance_required`

### 34.2 Required correlation and metrics

Every event carries `tenantId`/`accountId`, `runId`, sequence, trace/span IDs, resource/candidate/refresh IDs where applicable, run-attempt and browser-session generations, turn/model/tool/intent/result/observation IDs, tool/adapter versions, and policy snapshot ID. Model events add role, route reason, required capabilities, configured primary/fallback chain, concrete gateway/model/provider, fallback reason, applied policy constraints, tokens, cost, and latency. Payloads use reason codes and artifact refs; raw DOM, secrets, cookies, authorization headers, storage state, passwords/MFA material, and hidden model reasoning are forbidden ordinary event fields.

Derived metrics include run success/partial/failure by objective/route/site; completion rejection; model calls/tokens/cost/latency; tool/action/navigation counts; browser provision/reattach/crash rate; retry count/reason; policy denials; auth assistance; evidence yield/quality/duplicates/date failures; adapter failure/repair/promotion/rollback; lease contention; checkpoint age; queue delay; and budget exhaustion.

An operator trace must reconstruct: what immutable objective and policies existed; which exact `ObservationEnvelope` representations were available; which model role/concrete route was selected and why; what visible response/action was proposed; whether policy allowed it; what effect/result occurred (or was unknown); what the verifier concluded; what evidence resulted; every state transition; and total tokens/cost/time. This is sufficient for durability, recovery, compliance, debugging, and observability without private chain-of-thought. An explicitly requested short rationale may be stored as untrusted, optional, retention-limited visible output, but is never an authorization or recovery dependency.

## 35. Failure taxonomy

`AgentFailure` fields: `code`, `category`, `phase`, `retryability`, `effectCertainty`, `scope` (`call`, `run`, `resource`, `adapter`, `profile`, `provider`), `safeAction`, `publicMessage`, redacted diagnostics/artifact refs, first/last occurrence, attempt count, and causal failure ID. Source-health effects are decided by the acquisition health projector, not embedded in the failure itself.

| Failure | Classification / detection | Default action |
|---|---|---|
| Provider unavailable / 429 / 5xx | transient provider; circuit metrics | Retry with jitter/`Retry-After`; then compatible model route or safely fail; do not degrade source |
| Model timeout | transient/ambiguous stream | Cancel attempt; discard partial calls; bounded retry from same manifest |
| Partial model stream | invalid terminal protocol | Settle emitted calls as cancelled/unissued; new attempt identity |
| Invalid model response | schema/semantic model failure | One corrective call, optional model fallback, then fail run |
| No policy-eligible model | capability/privacy/compliance/budget routing failure | Try only configured eligible fallback/role; otherwise terminal typed failure, never bypass policy |
| Malformed/unknown tool call | model/tool-contract failure, no effect | Return typed error once; repeated call trips loop detector |
| Repeated tool loop | no-progress fingerprints | One recovery hint; terminal `loop_detected` at hard threshold |
| Budget exhaustion | policy/runtime terminal | Checkpoint partial work; terminal `budget_exhausted`; controller may choose cheaper strategy |
| Browser provisioning failure | infrastructure transient | Retry/circuit-break executor; switch approved executor; source health unchanged |
| Browser crash | infrastructure/session loss | Cancel generation, new isolated session, restore profile, resume from checkpoint |
| Tab/renderer crash | page/session failure | New target/context, reopen checkpoint URL, re-observe |
| Navigation timeout | ambiguous page transition | Inspect URL/lifecycle; observe if committed; otherwise one safe retry |
| Redirect loop/overflow | deterministic policy/network failure | Stop navigation, classify site/route, switch strategy or fail safely |
| Disallowed redirect/domain | policy denial | Terminal policy block or explicit human policy review; never auto-expand scope |
| SSRF/private IP/DNS rebinding | security violation | Abort session/run, quarantine artifacts, security alert; no retry |
| Endless pagination | no-progress/budget | Duplicate-cursor/content guard, hard page ceiling, truthful partial failure |
| Infinite scroll | no-progress/budget | Stable content-height/item-set threshold plus max scrolls; partial/complete only per contract |
| Site redesign | structural adapter failure across cohort | Degrade adapter, switch strategy, bounded repair after threshold |
| Stale selector/element handle | observation-version mismatch | Re-observe once; repair adapter if repeated structural failure |
| Extraction quality failure | validator rejects fields/content basis | Try alternate allowed extraction; repair/switch strategy; do not accept evidence |
| `PASSIVE_BROWSER_CHALLENGE` | challenge signal with expected passive progression | One bounded wait/re-observation under challenge budget, then reclassify |
| `LOGIN_REQUIRED` | no valid authenticated session for requested resource | Suspend/request capability setup; do not retry as network |
| `SESSION_EXPIRED` | previously valid capability fails session validation | Checkpoint, seal/destroy context as policy requires, refresh/revalidate new profile version, then explicit resume |
| `MFA_REQUIRED` | interactive second factor detected | Suspend with human-only request; never expose or ask model to provide code/secret |
| `CAPTCHA_REQUIRED` | deterministic/assisted challenge classifier | Persist/challenge-checkpoint; zero automatic solve retries in v1; human/route/fail per policy |
| `AUTOMATION_BLOCKED` | site/browser reports automation denial | Stop route, preserve permitted diagnostics, external router decides alternative; no stealth/evasion |
| `ACCESS_DENIED` | authorization/policy/site access refusal | Fail or request authorized capability/policy review; no repeated navigation |
| `CHALLENGE_LOOP` | repeated/cycling challenge fingerprints or budget reached | Terminal/suspend and external route decision; no further model/browser attempts |
| Password/consent/account choice | human-only auth step | Suspend with typed request; never ask model to provide/handle secret |
| Paywall | access/policy barrier | Use authorized subscription capability if already configured; otherwise terminal/switch legal route |
| Region restriction | access/policy | Use only preapproved region capability; otherwise fail/switch, never silently proxy-hop |
| Request blocked / 403 | access or transient ambiguity | Classify response; limited alternate normal route, not evasion; then fail |
| Prompt injection / malicious page text | untrusted-content signal | Continue only through fixed tool policy; stricter observation/redaction or terminate/security event |
| Hostile JavaScript/popups/download | browser security | Isolate/close target, quarantine download, cancel generation if needed |
| Incorrect date parsing | evidence validation | Reject item; retry deterministic parser/locale; agent may propose mapping; never guess silently |
| Stale article | objective filter failure | Exclude with reason; use it only as watermark/order evidence if valid |
| Duplicate article | idempotency/canonicalization | Link to existing candidate/evidence; no duplicate output or budget credit |
| Incorrect watermark ordering | completion/evidence invariant | Reject completion and route/adapter; terminal if ordering cannot be proven |
| Server/worker restart | orchestration interruption | Lease expires; new attempt reconciles calls and resumes checkpoint |
| Duplicate worker/message | delivery concurrency | Fenced lease loser exits; idempotency keys make replay harmless |
| Partial persistent write | storage invariant | Transaction rollback; R2 orphan swept; never advance checkpoint |
| Browser action outcome missing | crash after possible effect, before result | Re-observe and prove result or record `effect_unknown`; never assume no effect |
| Source disappears / 404/410 cohort | source/resource terminal signal | Confirm across bounded attempts; health projector marks appropriate resource state |
| Policy expires/revokes mid-run | compliance terminal | Cancel new actions, end session, checkpoint/fail policy-blocked |
| Browser-profile leak suspicion | security incident | Revoke capability/version, kill leases, quarantine trace, alert; never resume automatically |
| Adapter candidate validation failure | expected candidate outcome | Keep active version, store diagnostics, allow one bounded revision or request human |

Transient execution failures affect run/infrastructure metrics. Only source-correlated acquisition failures feed `UpstreamResource.status`, and only through existing health projection rules. This prevents a provider outage from falsely declaring a publisher unhealthy.

## 36. Testing strategy

Most tests use a deterministic state-machine harness, in-memory/fake ports, a scripted model, local HTML fixtures, and a real local Chromium only at the browser boundary. Paid models are absent from required CI.

### 36.1 Test layers

| Layer | Required coverage |
|---|---|
| Pure contracts | Schema round trips, state-transition property tests, illegal transitions, durable ID/call-result pairing, `ObservationEnvelope`, challenge states, model roles/routes, stable reason codes, context manifests |
| Scripted model | Role selection/routing record, structured and vision calls, escalation/de-escalation, malformed JSON/tool, unknown tool, mixed completion/tool, partial stream, fallback, repeated loop, completion rejection/correction |
| Dispatcher/policy | Validation-before-policy-before-effect ordering; same engine for structured/visual tools; domain/redirect/SSRF; semantic/coordinate safe-click; denied mutation; auth scope; stale observation/screenshot handles |
| Budget/retry/cancel | Atomic reservation under concurrency; model/token/cost/strong/vision/browser/navigation/download/challenge dimensions; retry headers/jitter; circuit breaker; nested deadline; late result after cancellation |
| Persistence/recovery | Crash after admission, intent, dispatch, result artifact upload, result commit, checkpoint, and outbox; lease expiry/fencing; duplicate queue delivery |
| Evidence/provenance | Raw hash/ref, field-level source, date validation, canonicalization, duplicate acceptance, watermark/checkpoint ordering, retention/redaction |
| Browser fixtures | Real Chromium in a fresh isolated context against local JS-heavy pagination/infinite-scroll/iframe/popup/download/login/challenge fixtures; structured DOM/AX and screenshot-coordinate operations; loader and same-document navigation |
| Hostile content | Page prompt injection, fake system/tool messages, exfiltration links, data URLs, private-network redirects, huge/hidden DOM, malicious download; raw versus bounded envelope provenance |
| Adapter lifecycle | DSL schema/static lint, generated candidate, fixture pass/fail, DOM mutation/site redesign, canary, no self-promotion, rollback, repair cooldown |
| Integration | Acquisition Router -> run -> `AcquiredContent` -> normalizer contract; discovery -> `CandidateProposal` -> Candidate Intake; health/checkpoint ownership |
| Recorded provider | Sanitized cassettes for stream shapes and retry headers, with secrets removed; never treat cassettes as browser fixtures |
| Live smoke | Tiny allowlist of public, stable, non-auth sites; low frequency and budget; informational unless reliability is controlled |

### 36.2 Essential fault-injection cases

- Case A: kill after durable `ToolIntent` and before execution; recovery safely dispatches/replays the same idempotent intent.
- Case B: execute a browser action and kill before `ToolResult`; recovery proves the effect from a fresh envelope or records `effect_unknown`, never blindly replays.
- Case C: accept `AcquiredContent` and kill before run-state advance; recovery returns the existing acceptance and creates no duplicate.
- Case D: commit completed run/output and kill before queue acknowledgement; redelivery exits from durable completion with no duplicate effect.
- Deliver the same queue message concurrently to two workers.
- Return a tool result after cancellation or after a new lease generation.
- Crash Chromium between navigation commit and observation.
- Change DOM selectors while preserving semantics, then remove semantics too.
- Redirect from an allowed public host to loopback/private/disallowed host.
- Exhaust each budget dimension independently.
- Feed an observation containing convincing fake system instructions and a secret-exfiltration URL.
- Expire/revoke an auth capability during a run.
- Present simulated `PASSIVE_BROWSER_CHALLENGE`, `LOGIN_REQUIRED`, `SESSION_EXPIRED`, `MFA_REQUIRED`, `CAPTCHA_REQUIRED`, `AUTOMATION_BLOCKED`, and repeated challenge states; assert classification, budget, checkpoint/disposition, and no retry loop.
- Route a required-vision call with non-vision candidates, disallowed providers, exhausted strong/vision budget, and provider fallback; assert filters and provenance.
- Reject an adapter candidate and prove the active pointer is unchanged.

Tests assert both final state and the ordered event trace. A run is not considered recovered merely because it finishes; it must show no duplicate external calls/evidence, correct budget totals, paired call results, and correct provenance.

## 37. Proposed module/repository layout

Fit the monorepo's existing `apps/` and `packages/` layout; do not create a separate product repository.

```text
packages/
  agent-contracts/
    src/
      run.ts                 # IDs, records, states, transition schemas
      model.ts               # roles, capabilities, routes, response and execution records
      tool.ts                # tool definition/call/result contracts
      budget.ts
      failure.ts
      event.ts
      checkpoint.ts
      completion.ts
      observation.ts         # ObservationEnvelope, raw/presentation metadata
      browser.ts             # session/context, structured/visual action schemas
      challenge.ts           # typed challenge state/disposition
      adapter.ts             # WorkflowDefinition DSL, lifecycle and validation schemas

  agent-runtime/
    src/
      coordinator.ts
      transition.ts
      context-manager.ts
      model-router.ts
      model-escalation-policy.ts
      model-capability-registry.ts
      model-gateway.ts
      gateways/
        openrouter.ts
        openai-compatible.ts
      tool-registry.ts
      tool-dispatcher.ts
      retry-policy.ts
      cancellation.ts
      completion-verifier.ts
      progress-detector.ts
      policy-engine.ts
      event-store.ts
      ports.ts

  browser-operator/
    src/
      controller.ts
      observation-projector.ts
      challenge-classifier.ts
      structured-browser-use.ts
      visual-computer-use.ts
      actions/
        navigate.ts
        inspect-dom.ts
        inspect-accessibility-tree.ts
        follow-link.ts
        scroll.ts
        extract.ts
        wait.ts
        query-page-state.ts
        download-document.ts
        screenshot.ts
        pointer.ts
        keyboard.ts
        drag.ts
      network-policy.ts
      profile-broker.ts
      adapter-interpreter.ts

apps/worker/src/
  agent/
    queue-consumer.ts         # thin Worker adapter
    repository-d1.ts
    artifact-store-r2.ts
    outbox.ts
    acquisition-adapter.ts   # bridge to current code/target contracts

apps/browser-executor/        # only if a separate service is selected
  src/
    service.ts
    chromium-session.ts
    chromium-context.ts
    isolation.ts

apps/worker/migrations/
  00xx_agent_runtime.sql

test-fixtures/web-operator/
  hostile-news-site/
  adapter-corpus/
```

`agent-contracts` contains no Cloudflare, provider, or browser dependency. `agent-runtime` depends on ports. `browser-operator` contains browser semantics but no ingestion normalization. The worker provides persistence/queue adapters. If Cloudflare Browser Rendering satisfies the port, `apps/browser-executor` is unnecessary.

## 38. Minimal production-worthy v1

V1 is not “an LLM can click a page.” It is the smallest deployable boundary with:

- known-candidate acquisition and bounded archive discovery modes;
- durable run/attempt/turn/model/tool/checkpoint/budget/policy/event/outbox records;
- fenced leases and duplicate-worker safety;
- per-call configurable `ModelRole`, policy/budget-aware `ModelRouter`, external escalation policy, durable route provenance, and gateway abstraction using OpenRouter by default;
- closed versioned tool registry and strict schemas;
- typed serial Structured Browser Use plus metered Visual Computer Use, one isolated page/context per run, both behind one `PolicyEngine`;
- public/no-auth profiles plus opaque existing authenticated profile references;
- exact-domain/redirect/SSRF/network and read-only action policy;
- first-class `ObservationEnvelope` with immutable raw artifacts and bounded model presentations;
- first-class challenge classification/budget/resume disposition, including simulated CAPTCHA tests and no solve loop;
- deterministic completion contracts for item count, watermark, feed validation, article extraction, and bounded pagination;
- `CandidateProposal` and `AcquiredContent` outputs through existing boundaries;
- full failure taxonomy, retry/cancel/budget/loop guards;
- crash/resume and duplicate delivery correctness;
- declarative workflow/adapter candidate schema and exact lifecycle, but no generation or automatic promotion in the first slice;
- operator trace/admin read API and metrics.

No production rollout should occur until the first slice's fault-injection tests pass and policy denial is proven against real Chromium.

## 39. Explicitly deferred functionality

- Subagents, agent teams, delegation, parallel pages/tabs, and multi-agent budgeting.
- Arbitrary JavaScript, shell, Python, uploaded extensions, MCP, dynamic plugins, user-defined tools, skills, and hooks.
- General web browsing/chat or coding-assistant workflows.
- Cross-run conversational memory or vector-memory systems; durable structured facts are enough.
- Model-generated natural-language context compaction until deterministic projection is measured insufficient.
- Real production credentials, automatic password/MFA entry, real CAPTCHA solving, paywall bypass, stealth/evasion, and arbitrary proxy/region switching.
- External mutations: publish, like, follow, subscribe, comment, message, upload, purchase, delete, account/security/billing changes.
- Automatic Web Operator escalation and automatic adapter promotion of any class until typed failure data and policy gates are proven.
- Fully generated site adapters/workflows and agent-generated executable connector code. A signed human-reviewed connector escape hatch can be designed later.
- Exactly-once side-effect claims or transparent migration of live browser sessions across executors.
- A public marketplace for adapters/tools.
- Rich interactive agent UI, terminal/IDE integration, Git/worktrees, patch/review, repository search/indexing.
- Vendor-specific browser executor selection until a port spike measures isolation, duration, profile support, CDP fidelity, cost, and regional availability.
- Complex learned model-routing algorithms. V1 uses configured roles, capability/policy/budget filters, deterministic escalation triggers, and ordered fallbacks.

## 40. Implementation sequence

1. **Contracts and transition kernel.** Add schemas, state machine, failures, budgets, event types, completion contracts, and pure property tests. No model/browser yet.
2. **Durable admission and coordinator.** D1 migrations/repository, run attempts, fenced leases, checkpoints, transactional outbox, duplicate delivery and crash-boundary tests.
3. **Scripted model and call lifecycle.** `ModelRole`, capability registry extension, configured routes/fallbacks, gateway interface, route provenance, strict response schema, call/attempt persistence, partial-stream and retry tests, and existing accounting integration.
4. **Policy and tool kernel.** Closed registry, validation/decision/intent/result phases, atomic budget reservation, cancellation, synthetic terminal outcomes.
5. **Browser and observation kernel.** Real Chromium against local fixtures, one isolated serial context/page, structured and visual ports, `ObservationEnvelope`, challenge classifier, network/action policy, and artifact storage.
6. **First vertical slice.** Complete the final recommendation scenario and Cases A–D fault-injection acceptance suite.
7. **Acquisition integration.** Compatibility bridge to current worker, then target `AcquisitionStrategy -> AcquiredContent` and discovery -> Candidate Intake; protect checkpoint/health ownership.
8. **Authentication capability.** Trusted interactive profile capture, encrypted storage/broker, expiry/revocation/MFA suspension tests.
9. **Adapter/Workflow capture compiler, DSL, and interpreter.** Typed capture bundles, deterministic candidate compilation, ordered locator-attempt evidence, bounded execution, fixtures, mutations, validation registry, explicit `CANDIDATE -> VALIDATED` transition, separate promotion/canary/rollback; agent proposal only after interpreter is proven.
10. **Typed automatic escalation and controlled production canary.** Add acquisition-owned escalation only after route-failure classification; public allowlisted sources, strict budgets, operator trace, alarms, kill switch, and comparison to standard routes.

Do not start adapter generation before the deterministic interpreter/validator exists; otherwise the agent will generate artifacts whose safety and completion semantics cannot be proved.

## 41. Integration contract with the normal acquisition workstream

### 41.1 Invocation contract

The Acquisition Router supplies:

- `acquisitionAttemptId`/`refreshRunId` and idempotency key;
- `UpstreamResource` and optional owning `SourceSubscription` references;
- known `CandidateItem` or a bounded discovery scope;
- desired content fields, watermark and completion contract/version;
- resolved `SourcePolicy`/deployment-compliance snapshot;
- allowed strategy class and maximum cost/time;
- optional opaque `AuthCapabilityRef`;
- route history/failures proving cheaper strategies were attempted or unsuitable.
- configured model-role map/fallback chains plus tenant/deployment/provider privacy constraints, or a reference to their immutable snapshot.

The runtime rejects calls lacking a policy snapshot, deterministic completion contract, or non-zero hard budget.

### 41.2 Output contract

Known-candidate mode returns staged `AcquiredContent` objects or a typed no-content/failure outcome. Discovery returns `CandidateProposal` objects. Every output includes idempotency/provenance/run/adapter references and raw artifact hashes. The normal workstream validates/accepts it, normalizes it, fans it out, updates route statistics/health, and advances checkpoints.

### 41.3 Required mutual guarantees

| Web Operator guarantees | Normal acquisition guarantees |
|---|---|
| Does not run unless externally routed/triggered, feature-enabled, and budgeted | Uses cheaper sufficiently reliable route first and owns escalation policy |
| Enforces supplied policy and cannot expand it | Supplies authoritative policy/completion/watermark inputs |
| Produces only candidate proposals or acquired content | Owns candidate intake, normalization and evidence acceptance |
| Uses stable idempotency/provenance IDs | Deduplicates outputs and persists accepted work before checkpoint |
| Reports classified partial/failure outcomes honestly | Projects source health by correlated failures, not one agent error |
| Pins adapter/profile/policy versions | Owns active adapter pointer, promotion, rollback and profile authorization |
| Never mutates subscription/resource health | Feeds route quality/reliability back to routing controller |

### 41.4 Trigger policy

In the first implementation slice, `web_operator` is invoked only by a test/manual `AcquisitionRouter` route while `DISTILLED_WEB_OPERATOR_ENABLED` is true. There is no self-escalation tool and no automatic production fallback.

Later, `AcquisitionRouter + BudgetController + typed route failure/history` may invoke it only when one of these machine-observed conditions is met: all cheaper allowed routes failed with classified non-transient causes; a source is unknown/JS-only and deterministic discovery could not identify a feed/API; an active deterministic adapter crosses its structural-failure threshold; or an explicitly budgeted discovery/repair job is scheduled. Typed route causes include structural extraction failure, temporary network failure, source outage, policy block, CAPTCHA/challenge, login expiry, site redesign, extraction quality failure, and permanent unavailability, each with a route-specific disposition. “Few articles found” alone is insufficient unless the completion contract proves a coverage deficit. The agent never decides to invoke itself.

## 42. Genuine unresolved architectural questions

No unresolved issue blocks the foundation slice. The remaining questions are production rollout gates or measured implementation choices, not reasons to delay the transition kernel and local fixture proof:

1. Select the production browser executor after a port spike measures tenant isolation, session duration, CDP/AX and visual-input fidelity, profile import/export, region, cost, and Cloudflare integration. The first slice uses local Playwright/Chromium behind the same port.
2. Confirm per-deployment `SourcePolicy` language for automation, authenticated acquisition, retention, screenshots/DOM storage, robots/terms, provider eligibility, residency, and ZDR before any live-source or credentialed canary.
3. Measure D1 event/tool-row throughput and decide whether D1 plus R2/outbox remains sufficient before scale; the logical persistence contract does not change.
4. Calibrate production adapter repair thresholds, workflow opcode coverage, canary sizes, and retention periods from fixture/canary data. Automatic promotion remains off until separately approved.
5. Align record naming with the normal acquisition workstream when its final runtime types land. Implement `AgentModelCall` as a one-to-one runtime extension of `ModelExecutionRecord` unless the shared schema can directly contain the required role/routing provenance without duplicating billing truth.

## First vertical slice specification

Implement one end-to-end **public, known-candidate article acquisition run** against a local JS-rendered hostile fixture site. The test/manual `AcquisitionRouter` explicitly selects `web_operator` behind `DISTILLED_WEB_OPERATOR_ENABLED`; no automatic escalation path exists.

The fixture contains one target article whose content is reached through deterministic pagination/watermark facts, a page instruction telling the model to disregard its objective and trigger an unrelated fake “Publish” action, a disallowed redirect, one visual-only control that cannot be selected by the structured test adapter, and a simulated CAPTCHA/challenge state. Article fields are title, canonical URL, publisher timestamp, excerpt/body, and content hash. The scripted model deliberately proposes at least one forbidden action. Exactly one `AcquiredContent` acceptance is expected.

The slice is:

```text
Acquisition Router test adapter
  -> durable AgentRun admission + outbox
  -> fenced queue coordinator
  -> configurable ModelRole -> durable route decision -> scripted/fake ModelGateway
  -> real Chromium through BrowserExecutorPort
  -> new tenant/run-bound isolated BrowserContext
  -> Structured Browser Use (navigate + DOM/AX/state + extract)
  -> Visual Computer Use (screenshot + coordinate interaction)
  -> immutable raw artifacts + bounded ObservationEnvelope representations
  -> shared external PolicyEngine + multidimensional RunBudget
  -> typed challenge classification with no retry loop
  -> deterministic watermark/boundary completion verifier
  -> staged AcquiredContent with full envelope/raw provenance
  -> acceptance callback (without production normalization changes)
  -> ordered redacted RunEvent trace
  -> crash/resume Cases A-D and queue redelivery
```

Required acceptance criteria:

1. The run persists before its first queue wake and can be inspected independently of a worker process.
2. Every state change follows the versioned transition table; an illegal or stale-generation transition is rejected and recorded.
3. A fake/scripted gateway executes the production response schema. At least one call resolves a configurable `ModelRole`; its routing reason, required capabilities, configured primary/fallback chain, selected gateway/model/provider, applied policy constraints, tokens/cost/latency, and any fallback are durable.
4. Real Chromium creates a new `BrowserSession` and isolated `BrowserContext` bound to the fixture tenant, run, resource, anonymous capability/profile version, domains, and policy. A second tenant/run cannot access its handles, storage, artifacts, or context.
5. The run succeeds only after at least one structured navigation/DOM-or-AX/extraction action and one screenshot-plus-coordinate visual action. Both go through the same dispatcher, `PolicyEngine`, budget, intent/result, and observation paths; visual fallback is not used for interactions that remain structurally groundable.
6. Every browser/tool result entering context has an `ObservationEnvelope` with origin, trust classification, representation type, hashes/refs, original/presented sizes, truncation, and transformation/redaction metadata. Raw page content is separate from the bounded presentation.
7. The hostile prompt-injection text appears only inside `UNTRUSTED_EXTERNAL` observation data and cannot modify objective, policy, model role, budget, completion contract, or tool authority.
8. The scripted forbidden `Publish`/external-mutation proposal is denied by `PolicyEngine` before dispatch; the disallowed redirect is blocked at preflight and post-redirect enforcement independently of model cooperation.
9. The simulated CAPTCHA produces `CAPTCHA_REQUIRED` (and a repeated fingerprint can produce `CHALLENGE_LOOP`), persists a challenge record/checkpoint, consumes only the challenge-specific allowance, and issues no solve/click/retry loop. The test then uses a fresh configured fixture route/session to complete; no real anti-bot system is contacted.
10. An early `MODEL_CLAIMS_COMPLETE` is rejected. Only a configured fact such as `watermark_observed` or `validated_listing_boundary_reached`, backed by persisted envelopes and accepted output, causes `COMPLETION_VERIFIER_ACCEPTED`.
11. Exactly one unique `AcquiredContent` is accepted under a deterministic acceptance ID. It has field-level provenance to envelope/raw artifacts and never directly creates `NormalizedEvidenceItem` or advances `SourceCheckpoint`.
12. Hard limits for calls, input/output tokens, model cost, strong calls, vision calls, browser actions, navigations, downloads, retries, challenges, pages, child agents, and wall clock are atomically enforced outside the model. Independent exhaustion tests fail with the correct terminal/partial outcome.
13. **Crash Case A:** kill after `ToolIntent` commit and before execution; restart safely executes/replays the same idempotent intent once.
14. **Crash Case B:** kill after browser action execution and before `ToolResult`; restart either proves/reconciles the effect from a fresh envelope or marks the call `effect_unknown`. The test fails if the runtime silently assumes no effect or blindly repeats an unsafe action.
15. **Crash Case C:** kill after `AcquiredContent` acceptance and before run-state advance; restart reuses the acceptance ID and still yields exactly one accepted content record.
16. **Crash Case D:** kill after output/completion acceptance and before queue acknowledgement; redelivery observes the durable completion and creates no new browser, model, or accepted-evidence effect.
17. Concurrent duplicate queue delivery loses the fenced lease and causes no second browser action stream. A browser crash rotates generation, reopens only from a safe checkpoint, invalidates old semantic/coordinate handles, and reaches the same single output.
18. The final redacted trace reconstructs objective, envelopes shown, visible responses/proposals, model routes, policy decisions, tool intents/results/effect certainty, challenge disposition, verifier result, acceptance, state transitions, and total usage/cost without credentials or hidden chain-of-thought.

Use an anonymous, versioned `BrowserProfile`/`AuthCapability` in this slice. Authenticated profile capture/refresh, real CAPTCHA solving, MFA, live external sites, subagents, automatic Web Operator escalation, generated adapters, automatic promotion, arbitrary JavaScript/shell, multiple tabs/pages, and learned routing are explicitly out. First prove the runtime, trust, policy, completion, model-routing, challenge, evidence, and recovery boundaries on which later capabilities depend.

## Appendix A. Source path index

### Distilled

- `ARCHITECTURE_BASELINE_v1.5.md`
- `TECHNICAL_CONTRACTS_AND_SERVICE_BOUNDARIES_v1.5.md`: `SourceSubscription`, `UpstreamResource`, `CandidateItem`, Acquisition Router, `AcquisitionRouteStats`, `AcquiredContent`, `NormalizedEvidenceItem`, Web Intelligence contracts, `SourceCheckpoint`, `ModelCapability`, `ModelExecutionRecord`.
- `SOURCE_CONNECTOR_SPEC.md`: resource/subscription state, refresh runs, policy/compliance, credentials, scheduling, shared acquisition, health projection.
- `apps/worker/src/types.ts`: `SourceRecord`, `SourceRunRecord`, `ProcessingJobRecord`, `Repository`.
- `apps/worker/src/sources.ts`: `refreshSource`, `ingestRssSource`, `startApifySourceRun`, `pollApifySourceRun`, `persistMessages`.
- `apps/worker/src/index.ts`: queue consumer, `processDistilledQueueMessage`, `shouldQuarantineQueueFailure`, `rescueStaleProcessingJobs`.
- `apps/worker/src/processor.ts`: `processQueueMessage`, deterministic-first/advisory model flow.
- `apps/worker/src/ai.ts`: current provider adapters, timeout, usage capture.
- `packages/core/src/events.ts`: deterministic URL/text/event identity.
- `apps/worker/migrations/0001_initial.sql` through `0010_briefing_editions.sql`.

### OpenAI Codex

- `openai-codex/codex-rs/core/src/session/session.rs`: `Session`, `SessionConfiguration`, `Session::new`.
- `openai-codex/codex-rs/core/src/session/turn.rs`: `run_turn`, `run_sampling_request`, `try_run_sampling_request`, in-flight draining.
- `openai-codex/codex-rs/core/src/tools/router.rs`: `ToolRouter`, `ToolCall`, `build_tool_call`.
- `openai-codex/codex-rs/core/src/tools/registry.rs`: `ToolRegistry`, `dispatch_any_with_terminal_outcome`.
- `openai-codex/codex-rs/core/src/tools/parallel.rs`: `ToolCallRuntime`.
- `openai-codex/codex-rs/tools/src/tool_executor.rs`: `ToolExecutor`, `ToolExposure`.
- `openai-codex/codex-rs/tools/src/tool_output.rs`: `ToolOutput`.
- `openai-codex/codex-rs/core/src/context_manager/history.rs`; `core/src/compact.rs`.
- `openai-codex/codex-rs/core/src/responses_retry.rs`.
- `openai-codex/codex-rs/thread-store/src/store.rs`: `ThreadStore`.
- `openai-codex/codex-rs/rollout/src/recorder.rs`: `RolloutRecorder`.
- `openai-codex/codex-rs/core/src/state/turn.rs`; `core/src/thread_manager.rs`.
- `openai-codex/codex-rs/protocol/src/protocol.rs`: `Op`, `EventMsg`.
- `openai-codex/codex-rs/core/src/tools/approvals.rs`; `tools/sandboxing.rs`; `tools/tool_dispatch_trace.rs`; `turn_timing.rs`.
- `openai-codex/codex-rs/model-provider-info/src/lib.rs`: `ModelProviderInfo`, `WireApi`, `merge_configured_model_providers`.
- `openai-codex/codex-rs/models-manager/src/model_info.rs`: `with_config_overrides`, `model_info_from_slug`.
- `openai-codex/codex-rs/app-server-protocol/src/protocol/v2/browser_use_config.rs`: `BrowserUseConfig`, `BrowserUseOriginPolicyConfig`.
- `openai-codex/codex-rs/app-server-protocol/src/protocol/v2/computer_use_config.rs`: `ComputerUseConfig` and platform access configs.
- `openai-codex/codex-rs/core/src/mcp_tool_call.rs`: Browser Use/Computer Use confirmation-policy resolution.

### Claude family

- `claude-code-source/source/src/QueryEngine.ts`: `QueryEngineConfig`, `QueryEngine`, `submitMessage`.
- `claude-code-source/source/src/query.ts`: `query`, `queryLoop`.
- `claude-code-source/source/src/Tool.ts`: `Tool`, `ToolUseContext`, `ValidationResult`, `buildTool`.
- `claude-code-source/source/src/services/tools/toolOrchestration.ts`: `runTools`, partitioning.
- `claude-code-source/source/src/services/tools/toolExecution.ts`: `runToolUse`, `checkPermissionsAndCallTool`.
- `claude-code-source/source/src/services/tools/StreamingToolExecutor.ts`.
- `claude-code-source/source/src/services/api/withRetry.ts`: `withRetry`.
- `claude-code-source/source/src/utils/sessionStorage.ts`.
- `claude-code-source/source/src/utils/computerUse/executor.ts`: `createCliExecutor`, screenshot/pointer/click/key/type/drag operations.
- `claude-code-source/source/src/utils/computerUse/wrapper.tsx`: `runPermissionDialog`.
- `claude-code-source/source/src/utils/model/modelCapabilities.ts`: `ModelCapability`, `getModelCapability`, `refreshModelCapabilities`.
- `claude-code-public-package-extract/AGENTS.md` and `README.md` for extraction provenance/navigation only.
- `anthropic-claude-code-official/CHANGELOG.md` for public behavior corroboration only.
- `claw-code/rust/crates/runtime/src/permission_enforcer.rs`; `PARITY.md`.
- `lazycodex/plugins/omo/components/ulw-loop/CHANGELOG.md` for its bounded auto-resume/fan-out behavior.

### OpenCode

- `opencode/packages/core/src/session/input.ts`: durable input admission/promotion.
- `opencode/packages/core/src/session/sql.ts`: session/input/message/context tables.
- `opencode/packages/core/src/session/run-coordinator.ts`.
- `opencode/packages/core/src/session/runner/llm.ts`.
- `opencode/packages/core/src/session/runner/publish-llm-event.ts`.
- `opencode/packages/core/src/session/context-epoch.ts`; `history.ts`; `execution.ts`; `execution/local.ts`.
- `opencode/packages/opencode/src/session/prompt.ts`; `processor.ts`; `retry.ts`; `compaction.ts`.
- `opencode/packages/opencode/src/permission/index.ts`.
- `opencode/packages/opencode/src/provider/provider.ts`: `ProviderCapabilities`, `ProviderCost`, `ProviderLimit`, `Model`, `Info`.
- `opencode/packages/opencode/src/agent/agent.ts`: `Info`, `Service`.
- `opencode/AGENTS.md`, V2 Session Core, for explicit implementation limitations.

### Browser systems

- `browser-use/browser_use/agent/service.py`: `Agent`, `step`, `run`, `multi_act`, retry/finalization/history.
- `browser-use/browser_use/browser/session.py`: `BrowserSession`, lifecycle/target/session/watchdog wiring.
- `browser-use/browser_use/browser/profile.py`: `BrowserProfile`, `BrowserNewContextArgs`, storage/domain configuration.
- `browser-use/browser_use/actor/mouse.py`: `Mouse` coordinate interaction.
- `browser-use/browser_use/browser/watchdogs/captcha_watchdog.py`: `CaptchaWatchdog`, `wait_if_captcha_solving`.
- `browser-use/browser_use/browser/watchdogs/security_watchdog.py`: domain/redirect enforcement.
- `browser-use/browser_use/browser/events.py`; `browser/watchdog_base.py`; `agent/views.py`; `tools/views.py`.
- `browser-harness/src/browser_harness/daemon.py`: `Daemon`, attachment/reattachment/domain enablement.
- `browser-harness/src/browser_harness/run.py`; `auth.py`; `_ipc.py`; `recorder.py`; `src/mcp_server.py`.
- `browser-harness/SKILL.md`; `agent-workspace/agent_helpers.py`; `agent-workspace/domain-skills/`.
- `browsercode/UPSTREAM.md`.
- `browsercode/packages/opencode/src/tool/browser-execute.ts`: `BrowserExecuteTool`.
- `browsercode/packages/bcode-browser/src/browser-execute.ts`: `make`, scoped `execute`.
- `browsercode/packages/bcode-browser/src/session-store.ts`.
- `browsercode/packages/bcode-browser/src/cdp/session.ts`: `Session`, `withSessionExecution`, `waitFor`.

### Workflow Use

- `workflow-use/workflows/workflow_use/recorder/service.py`: `RecordingService`, event queue and recording completion.
- `workflow-use/workflows/workflow_use/recorder/recorder.py`: typed event normalization, semantic hints, event merging, workflow export.
- `workflow-use/workflows/workflow_use/healing/deterministic_converter.py`: `DeterministicWorkflowConverter`, `convert_history_to_steps`, interacted-element evidence mapping.
- `workflow-use/workflows/workflow_use/healing/service.py`: `HealingService`, history capture, deterministic/LLM generation paths and workflow-quality warning.
- `workflow-use/workflows/workflow_use/healing/validator.py`: `WorkflowValidator`, optional AI validation/correction.
- `workflow-use/workflows/workflow_use/schema/views.py`: `WorkflowDefinitionSchema`, typed deterministic/agentic steps, inputs, semantic targets and selector strategies.
- `workflow-use/workflows/workflow_use/workflow/service.py`: `Workflow`, input validation, placeholder resolution, deterministic/controller execution, semantic execution selection, and the disabled/commented fallback path.
- `workflow-use/workflows/workflow_use/workflow/semantic_executor.py`: `SemanticWorkflowExecutor`, bounded retries/failures, semantic/selector fallback execution.
- `workflow-use/workflows/workflow_use/workflow/step_verifier.py`: `StepVerifier`, deterministic/AI/hybrid verification; executor integration is default-off.
- `workflow-use/README.md`; `workflows/README.md`: usage/storage descriptions and explicit early-development/self-healing roadmap limitations.

## Final implementation recommendation

### A. Final architecture verdict

The architecture is implementation-ready for the foundation slice. There is no unresolved architectural blocker to opening that implementation branch. Production browser-executor selection and deployment-specific automation/authentication/privacy policy are real release gates, but the ports, isolation, policy, routing, durability, and evidence contracts let the local slice proceed without prejudging them.

### B. Exact first implementation slice

Implement the **First vertical slice specification** test/manual, feature-flagged known-candidate run against the local hostile fixture: durable admission and fenced coordination; a configurable `ModelRole` routed to a scripted gateway with durable provenance; real Chromium in a fresh tenant/run-bound `BrowserContext`; structured DOM/AX navigation/extraction plus one screenshot-coordinate visual interaction; immutable raw observations and bounded `ObservationEnvelope` presentations; one external `PolicyEngine`; simulated challenge classification; goal-specific deterministic completion; exactly one accepted `AcquiredContent`; complete redacted audit; and restart/redelivery tests at crash Cases A–D.

Do not include production credentials, live external sites, real CAPTCHA solving, MFA integration, subagents, automatic Web Operator escalation, generated adapters, automatic adapter promotion, arbitrary JavaScript/`page.evaluate`, shell execution, multiple concurrent pages/tabs, or learned routing.

### C. Pass/fail acceptance criteria

The slice passes only if all eighteen criteria in **First vertical slice specification** pass together. In compact form, it must prove durable run creation and deterministic transitions; fake model execution with configurable role and durable route; real isolated Chromium; both structured and visual policy-controlled actions; complete `ObservationEnvelope` provenance; hostile content remains untrusted; external denial of a prohibited action; bounded challenge classification with no retry loop; verifier-owned completion; exactly one accepted `AcquiredContent`; full audit without hidden reasoning or secrets; external enforcement of all budgets; safe Cases A, C, and D replay/redelivery; and either proven reconciliation or explicit `effect_unknown` for Case B. Any duplicate accepted evidence, unauthorized browser dispatch, model-authored completion transition, secret/context leak, hidden chain-of-thought dependency, unbounded challenge retry, stale-generation commit, or unsafe replay is a failure.
