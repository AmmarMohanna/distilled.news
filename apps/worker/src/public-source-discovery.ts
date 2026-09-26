import { BrowserUseDiscoveryBackend, BrowserUseTrustedChallengeError, BROWSER_USE_FAILURE_CATEGORIES, BRIDGE_FAILURE_CODES, compileSourceBrowserWorkflowPlan, verifyBrowserUseProposal, DEFAULT_SLICE_BUDGET, makeId, validateSourceBrowserWorkflowPlan, type AcquisitionStageOutcome, type ModelCapability, type ModelRoutingConfig, type PublicBrowserObservation, type SourceAcquisitionRequest, type SourceBrowserDiscoveryEvidence, type SourceBrowserWorkflowPlan, type SourceBrowserWorkflowPort, type WebOperatorDiscovery, type WorkflowCandidate } from "@distilled/agent-runtime";
import { ContainerSourceBrowserPort } from "./container-source-browser-port";
import type { Env } from "./types";
import { D1WorkflowRepository } from "./web-operator-workflow-store";
import { createWorkerContainerPublicWebOperatorLifecycle, executeWorkerSourcePlan } from "./web-operator-runtime";

export interface PublicSourceDiscoveryResult { evidence: SourceBrowserDiscoveryEvidence; plan: SourceBrowserWorkflowPlan; candidateUrl: string; browserOperations: number; discoveryModelCalls?: number }
class PublicSourceDiscoveryStop extends Error { constructor(readonly status: "AUTH_REQUIRED" | "CHALLENGE_REQUIRED" | "POLICY_DENIED", readonly diagnostics?: PublicBrowserObservation["challengeDiagnostics"], readonly originHost?: string, readonly observedPath?: string, readonly observedTitle?: string) { super(status); } }
function challengeStop(observation: PublicBrowserObservation): PublicSourceDiscoveryStop {
  let originHost: string | undefined, observedPath: string | undefined;
  try { const url=new URL(observation.url);originHost = url.hostname.slice(0, 253);observedPath=url.pathname.slice(0, 160); } catch { /* bounded diagnostic only */ }
  return new PublicSourceDiscoveryStop(observation.challengeState === "LOGIN_REQUIRED" ? "AUTH_REQUIRED" : "CHALLENGE_REQUIRED", observation.challengeDiagnostics, originHost, observedPath, observation.title.slice(0, 120));
}

/** Bounded trusted-observation probe; no model or page-realm execution selects article evidence. */
export async function discoverPublicSourceBrowserPlan(
  env: Env,
  input: { request: SourceAcquisitionRequest; tenantId: string; ownerId: string; resourceId: string; runId: string },
  port: SourceBrowserWorkflowPort = new ContainerSourceBrowserPort(env, { tenantId: input.tenantId, ownerId: input.ownerId, resourceId: input.resourceId, runId: input.runId, generation: 1 })
): Promise<PublicSourceDiscoveryResult | undefined> {
  const sourceUrl = input.request.source.canonicalSourceUrl ?? input.request.source.resourceLocator;
  if (!sourceUrl) return undefined;
  const origin = new URL(sourceUrl).origin;
  let operations = 0;
  await port.open({ sourceUrl, allowedOrigins: [origin], request: input.request });
  try {
    const listing = await port.navigateAndObserve(sourceUrl); operations++;
    if (listing.challengeState && listing.challengeState !== "NO_CHALLENGE") throw challengeStop(listing);
    let afterScroll: PublicBrowserObservation | undefined;
    if (port.scrollAndObserve && input.request.limits.maxScrolls > 0) {
      afterScroll = await port.scrollAndObserve(1200); operations++;
      if (afterScroll.challengeState && afterScroll.challengeState !== "NO_CHALLENGE") throw challengeStop(afterScroll);
    }
    const urls = [...new Set([listing, afterScroll].filter((value): value is PublicBrowserObservation => Boolean(value))
      .flatMap((value) => [...(value.listingLinks ?? []), ...value.controls.map((control) => control.destinationUrl)] )
      .filter((value): value is string => Boolean(value && admittedArticleCandidate(value, origin, sourceUrl))))];
    urls.sort((left, right) => articleCandidateScore(right) - articleCandidateScore(left));
    const sampledArticles: PublicBrowserObservation[] = [];
    const maxProbes = Math.min(10, Math.max(0, input.request.limits.maxPhysicalAttempts - operations));
    for (const url of urls.slice(0, maxProbes)) {
      const observed = await port.navigateAndObserve(url); operations++;
      if (observed.challengeState && observed.challengeState !== "NO_CHALLENGE") throw challengeStop(observed);
      if (observed.article?.body && Number.isFinite(Date.parse(observed.article.publisherTimestamp)) && new URL(observed.article.canonicalUrl).origin === origin) sampledArticles.push(observed);
      if (sampledArticles.length >= 2) break;
    }
    const evidence = { sourceUrl, listing, sampledArticles, afterScroll };
    const plan = compileSourceBrowserWorkflowPlan(evidence);
    if (!plan) return undefined;
    return { evidence, plan, candidateUrl: sampledArticles[0].article!.canonicalUrl, browserOperations: operations };
  } finally { await port.close(); }
}

/** Agent supplies navigation hints; a fresh Distilled-owned session verifies every promoted fact. */
export async function discoverBrowserUseSourcePlan(env: Env, input: { request: SourceAcquisitionRequest; tenantId: string; ownerId: string; resourceId: string; runId: string }, ports?: { agent: Pick<ContainerSourceBrowserPort, "open" | "close" | "discoverWithBrowserUse">; verifier: SourceBrowserWorkflowPort }, maxSteps = 12): Promise<PublicSourceDiscoveryResult | undefined> {
  const sourceUrl = input.request.source.canonicalSourceUrl ?? input.request.source.resourceLocator;
  const model = env.DISTILLED_LIVE_OPENROUTER_MODEL?.trim();
  if (!sourceUrl || !model || !env.OPENROUTER_API_KEY) return undefined;
  const origin = new URL(sourceUrl).origin;
  const agentPort = ports?.agent ?? new ContainerSourceBrowserPort(env, { ...input, runId: `${input.runId}_browser_use`, generation: 1 });
  await agentPort.open({ sourceUrl, allowedOrigins: [origin], request: input.request });
  let proposal: Awaited<ReturnType<ContainerSourceBrowserPort["discoverWithBrowserUse"]>>;
  try {
    const backend = new BrowserUseDiscoveryBackend({ discover: () => agentPort.discoverWithBrowserUse(sourceUrl, model, maxSteps) });
    proposal = await backend.propose({ request: input.request, capability: { runId: `${input.runId}_browser_use`, tenantId: input.tenantId, ownerId: input.ownerId, resourceId: input.resourceId, browserGeneration: 1, allowedOrigins: [origin], siteKind: "PUBLIC", readOnly: true, expiresAt: new Date(Date.now() + 120_000).toISOString() } });
  }
  finally { await agentPort.close(); }
  // A model-reported challenge is only a hint; the verification session owns the typed result.
  const verifier = ports?.verifier ?? new ContainerSourceBrowserPort(env, { ...input, runId: `${input.runId}_browser_use_verify`, generation: 1 });
  let trusted: Awaited<ReturnType<typeof verifyBrowserUseProposal>>;
  try { trusted = await verifyBrowserUseProposal({ request: input.request, capability: { runId: proposal.runId, tenantId: input.tenantId, ownerId: input.ownerId, resourceId: input.resourceId, browserGeneration: 1, allowedOrigins: [origin], siteKind: "PUBLIC", readOnly: true, expiresAt: new Date(Date.now() + 120_000).toISOString() }, proposal, port: verifier }); }
  catch (error) { if (error instanceof BrowserUseTrustedChallengeError) throw challengeStop(error.observation); throw error; }
  if (trusted.plan.continuation.kind === "NONE") return undefined;
  return { evidence: { sourceUrl, listing: trusted.listing, sampledArticles: trusted.articles }, plan: trusted.plan, candidateUrl: trusted.articles[0].article!.canonicalUrl, browserOperations: proposal.steps + trusted.articles.length + 1, discoveryModelCalls: proposal.steps };
}

function admittedArticleCandidate(value: string, origin: string, sourceUrl: string): boolean {
  try {
    const url = new URL(value);
    const parts=url.pathname.split("/").filter(Boolean);
    return url.protocol === "https:" && url.origin === origin && url.href !== sourceUrl && parts.length >= 2 &&
      !/[{}]/.test(url.pathname) && !/\.(?:js|mjs|css|json|xml|png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|map)$/i.test(url.pathname);
  } catch { return false; }
}

function articleCandidateScore(value:string):number{
  const parts=new URL(value).pathname.split("/").filter(Boolean);
  const dateIndex=parts.findIndex((part,index)=>/^20\d{2}$/.test(part)&&/^\d{1,2}$/.test(parts[index+1]??"")&&/^\d{1,2}$/.test(parts[index+2]??""));
  const slug=parts.at(-1)??"";
  const unstable=parts.some((part)=>/^(?:live|liveblog|live-updates?|search|tag|author)$/i.test(part));
  return (unstable?-100:0)+(dateIndex>=0?100:0)+Math.min(30,(slug.match(/-/g)?.length??0)*5)+Math.min(20,parts.length);
}

/** Invoked only by SourceAcquisitionOrchestrator after structured/HTTP/ACTIVE have been assessed. */
export async function discoverAndPromotePublicSourceWorkflow(
  env: Env,
  input: { request: SourceAcquisitionRequest; tenantId: string; ownerId: string; resourceId: string; runId: string; idempotencyKey: string }
): Promise<WebOperatorDiscovery | AcquisitionStageOutcome> {
  if (env.DISTILLED_WEB_OPERATOR_ENABLED !== "true") return { stage: "WEB_OPERATOR", status: "UNSUPPORTED", reason: "Web Operator disabled" };
  let probe: PublicSourceDiscoveryResult | undefined;
  try { probe = await discoverPublicSourceBrowserPlan(env, input); }
  catch (error) {
    if (error instanceof PublicSourceDiscoveryStop && error.status === "CHALLENGE_REQUIRED" && env.DISTILLED_LIVE_PUBLIC_ACQUISITION_SMOKE === "true") {
      try { await discoverBrowserUseSourcePlan(env, input, undefined, 4); console.log(JSON.stringify({ event: "browser_use_challenge_probe", state: "completed" })); }
      catch (diagnosticError) { console.log(JSON.stringify({ event: "browser_use_challenge_probe", state: diagnosticError instanceof PublicSourceDiscoveryStop ? diagnosticError.status : "UNAVAILABLE" })); }
    }
    return bridgeStop(error, "TRUSTED_PROBE");
  }
  if (!probe) {
    try { probe = await discoverBrowserUseSourcePlan(env, input); }
    catch (error) { return bridgeStop(error, "BROWSER_USE_DISCOVERY"); }
  }
  if (!probe) return { stage: "WEB_OPERATOR", status: "STRUCTURAL_FAILURE", reason: "trusted source probe did not establish two dated articles" };
  if (probe.plan.continuation.kind === "NONE") return { stage: "WEB_OPERATOR", status: "INSUFFICIENT", reason: "source continuation was not established" };
  const model = env.DISTILLED_LIVE_OPENROUTER_MODEL?.trim();
  const provider = env.DISTILLED_LIVE_OPENROUTER_PROVIDER?.trim();
  if (!model || !provider || !env.OPENROUTER_API_KEY) return { stage: "WEB_OPERATOR", status: "TRANSIENT_FAILURE", reason: "discovery model configuration unavailable" };
  const sourceUrl = input.request.source.canonicalSourceUrl ?? input.request.source.resourceLocator!;
  const origin = new URL(sourceUrl).origin;
  const lifecycle = createWorkerContainerPublicWebOperatorLifecycle(env, { ownerId: input.ownerId, resourceId: input.resourceId, sourceUrl, operationBudget: Math.min(64, 2 + input.request.limits.maxPhysicalAttempts * 2) });
  let outcome: Awaited<ReturnType<typeof lifecycle.acquire>>;
  try {
    outcome = await lifecycle.acquire({
      tenantId: input.tenantId, resourceId: input.resourceId, idempotencyKey: `${input.idempotencyKey}:discovery`,
      objective: `Explore the public source listing at ${sourceUrl}, inspect its read-only article navigation, and acquire the already-observed candidate article ${probe.candidateUrl}. Use only trusted browser observations.`,
      candidate: { candidateId: makeId("source_candidate", probe.candidateUrl), canonicalUrl: probe.candidateUrl, publisherId: new URL(sourceUrl).hostname, acquisitionAttempt: input.idempotencyKey },
      policy: {
        id: makeId("source_public_policy", input.resourceId), allowedOrigins: [origin], allowLoopback: false,
        allowedTools: ["browser.navigate@1", "browser.inspect_dom@1", "browser.inspect_accessibility_tree@1", "browser.query_page_state@1", "browser.scroll@1", "browser.extract@1", "run.propose_completion@1"],
        visualReadPurposes: [],
        modelPolicy: { allowedProviders: [provider], allowedDeployments: ["api"], requiredPrivacyEligibility: ["public"], allowedRetentionClasses: ["zero_data_retention"] }
      },
      modelRouting: liveModelRouting(model), modelCapabilities: [liveModelCapability(model, provider)],
      budgetLimits: { ...DEFAULT_SLICE_BUDGET, modelCalls: 5, browserActions: 15, navigations: 4, pages: 5, wallClockMs: Math.min(90_000, input.request.limits.maxExecutionMs) },
      enabled: true
    }, new Date(input.request.acquisitionAsOf ?? Date.now()));
  } catch (error) { return bridgeStop(error, "WORKFLOW_EXPLORATION"); }
  if (outcome.state !== "acquired_by_agent") return { stage: "WEB_OPERATOR", status: "STRUCTURAL_FAILURE", reason: "Web Operator exploration did not complete" };
  const captureId = outcome.workflow?.sourceCaptureId ?? (outcome.workflowFinalization.state === "NOT_PROMOTED" ? outcome.workflowFinalization.captureId : undefined);
  if (!captureId || outcome.acquiredContent.canonicalUrl !== probe.candidateUrl) return { stage: "WEB_OPERATOR", status: "STRUCTURAL_FAILURE", reason: "Web Operator exploration did not produce grounded article evidence" };
  const repository = new D1WorkflowRepository(env.DB);
  const priorVersions = await repository.listWorkflowCandidates(input.resourceId);
  const now = new Date().toISOString();
  const candidate: WorkflowCandidate = {
    id: makeId("source_workflow", input.resourceId, outcome.run.runId, JSON.stringify(probe.plan)),
    tenantId: input.tenantId,
    resourceId: input.resourceId,
    sourceCaptureId: captureId,
    candidate: outcome.run.candidate,
    sourceAcquisition: probe.plan,
    state: "CANDIDATE",
    version: Math.max(0, ...priorVersions.map((workflow) => workflow.version)) + 1,
    operations: [
      { id: makeId("source_op", input.resourceId, "entry"), kind: "navigate", locatorAlternatives: [{ kind: "url_pattern", value: sourceUrl, confidence: 1 }] },
      { id: makeId("source_op", input.resourceId, "listing"), kind: "extract_listing", locatorAlternatives: [{ kind: "page_type", value: "listing", confidence: 1 }] },
      { id: makeId("source_op", input.resourceId, "continuation"), kind: "paginate", locatorAlternatives: [{ kind: "page_type", value: "listing", confidence: 1 }] },
      { id: makeId("source_op", input.resourceId, "article"), kind: "extract_article", locatorAlternatives: [{ kind: "article_canonical", value: probe.candidateUrl, confidence: 1 }] }
    ],
    unsupportedGaps: [],
    createdAt: now,
    validatedAt: undefined,
    activatedAt: undefined
  };
  await repository.saveWorkflowCandidate(candidate);
  const execute = async (request: SourceAcquisitionRequest, workflow: WorkflowCandidate) => executeWorkerSourcePlan(env, { tenantId: input.tenantId, ownerId: input.ownerId, resourceId: input.resourceId, runId: makeId("source_execution", input.runId, workflow.id), request, workflow });
  return {
    candidate: { id: candidate.id, version: candidate.version, state: "CANDIDATE", execute: (request) => execute(request, candidate) },
    validate: async () => {
      validateSourceBrowserWorkflowPlan(probe.plan, input.request);
      const criteria = { sourceIdentity: new URL(probe.evidence.listing.url).origin === origin, twoDatedArticles: probe.evidence.sampledArticles.length >= 2, groundedAgentArticle: outcome.acquiredContent.canonicalUrl === probe.candidateUrl && Boolean(outcome.acquiredContent.publisherTimestamp), deterministicContinuation: probe.plan.continuation.kind !== "NONE", readOnlyOrigins: probe.plan.allowedOrigins.length === 1 && probe.plan.allowedOrigins[0] === origin };
      const passed = Object.values(criteria).every(Boolean);
      await repository.saveValidationResult({ workflowId: candidate.id, passed, criteria, failureClass: passed ? undefined : "structural_site_change", validatedAt: now });
      if (!passed) throw new Error("source workflow validation failed");
      return { id: candidate.id, version: candidate.version, state: "VALIDATED", execute: (request) => execute(request, { ...candidate, state: "VALIDATED" }) };
    },
    activate: async () => {
      const active = await repository.promoteWorkflow(candidate.id, "source-workflow-validator", now);
      return { id: active.id, version: active.version, execute: (request) => execute(request, active) };
    },
    runId: outcome.run.runId,
    modelCalls: outcome.modelCalls + (probe.discoveryModelCalls ?? 0),
    browserOperations: probe.browserOperations
  };
}

export function bridgeStop(error: unknown, phase: "TRUSTED_PROBE" | "BROWSER_USE_DISCOVERY" | "WORKFLOW_EXPLORATION" | "UNKNOWN" = "UNKNOWN"): AcquisitionStageOutcome {
  if (error instanceof PublicSourceDiscoveryStop) {
    const challenge = error.diagnostics;
    if (challenge) console.log(JSON.stringify({ event: "public_acquisition_challenge", challengeKind: challenge.state, classifierRule: challenge.rule, visibleEvidence: challenge.visibleEvidence, structuralEvidence: challenge.structuralEvidence, actionableControlEvidence: challenge.actionableEvidence, surface: challenge.surface, originHost: error.originHost }));
    return { stage: "WEB_OPERATOR", status: error.status, reason: "source requires unsupported access or challenge", details: challenge ? { challenge: { ...challenge, ...(error.originHost ? { originHost: error.originHost } : {}), ...(error.observedPath ? { observedPath: error.observedPath } : {}), ...(error.observedTitle ? { observedTitle: error.observedTitle } : {}) } } : undefined };
  }
  const code = error && typeof error === "object" && "code" in error ? (error as { code?: unknown }).code : undefined;
  const bridgeCode = BRIDGE_FAILURE_CODES.includes(code as typeof BRIDGE_FAILURE_CODES[number]) ? code as typeof BRIDGE_FAILURE_CODES[number] : undefined;
  console.log(JSON.stringify({ event: "public_acquisition_discovery_stop", phase, bridgeCode: bridgeCode ?? "UNCLASSIFIED" }));
  const rawOperation = error && typeof error === "object" && "operation" in error ? (error as { operation?: unknown }).operation : undefined;
  const operation = ["OPEN_AUTH_BROWSER", "NAVIGATE_PUBLIC_PAGE", "OBSERVE_PUBLIC_PAGE", "SCROLL_PUBLIC_PAGE", "CLOSE_AUTH_BROWSER"].includes(String(rawOperation)) ? rawOperation : undefined;
  const raw = error && typeof error === "object" && "diagnostic" in error ? (error as { diagnostic?: unknown }).diagnostic : undefined;
  const diagnostic = raw && typeof raw === "object" ? raw as Record<string, unknown> : undefined;
  const browserUseFailure = diagnostic && BROWSER_USE_FAILURE_CATEGORIES.includes(diagnostic.browserUseFailure as typeof BROWSER_USE_FAILURE_CATEGORIES[number]) ? diagnostic.browserUseFailure as typeof BROWSER_USE_FAILURE_CATEGORIES[number] : undefined;
  const failureType = diagnostic && typeof diagnostic.failureType === "string" && /^[A-Za-z0-9_.]{1,120}$/.test(diagnostic.failureType) ? diagnostic.failureType : undefined;
  const causeType = diagnostic && typeof diagnostic.causeType === "string" && /^[A-Za-z0-9_.]{1,120}$/.test(diagnostic.causeType) ? diagnostic.causeType : undefined;
  if (browserUseFailure) console.log(JSON.stringify({ event: "public_acquisition_browser_use_failure", category: browserUseFailure }));
  const allowedRules = ["ORIGIN_NOT_ADMITTED", "REDIRECT_ORIGIN_NOT_ADMITTED", "FINAL_ORIGIN_NOT_ADMITTED", "SCHEME_NOT_ALLOWED", "PRIVATE_OR_UNRESOLVED_ORIGIN", "METHOD_NOT_ALLOWED", "REQUEST_BLOCKED"];
  const policy = diagnostic && allowedRules.includes(String(diagnostic.policyRule)) ? {
    rule: String(diagnostic.policyRule),
    ...(typeof diagnostic.deniedHostname === "string" && /^[a-z0-9.-]{1,253}$/i.test(diagnostic.deniedHostname) ? { deniedHostname: diagnostic.deniedHostname } : {}),
    redirectHop: diagnostic.redirectHop === true,
    topLevelNavigation: diagnostic.topLevelNavigation === true
  } : undefined;
  return code === "BRIDGE_NETWORK_POLICY_DENIED"
    ? { stage: "WEB_OPERATOR", status: "POLICY_DENIED", reason: "browser network policy denied", details: { phase, ...(operation ? { operation } : {}), ...(policy ? { policy } : {}) } }
    : { stage: "WEB_OPERATOR", status: "STRUCTURAL_FAILURE", reason: `public Web Operator discovery failed: ${phase}/${String(operation ?? "UNKNOWN_OPERATION")}/${bridgeCode ?? "UNCLASSIFIED"}${browserUseFailure ? `/${browserUseFailure}` : ""}${failureType ? `/${failureType}` : ""}${causeType ? `/${causeType}` : ""}`, details: { phase, operation, bridgeCode: bridgeCode ?? "UNCLASSIFIED", ...(browserUseFailure ? { browserUseFailure } : {}), ...(failureType ? { failureType } : {}), ...(causeType ? { causeType } : {}) } };
}
function liveModelRouting(model: string): ModelRoutingConfig {
  return { mode: "api", apiGateway: "openrouter", selfHostedGateway: "openai_compatible", roles: { NAVIGATION_FAST: { primary: { deployment: "api", model }, fallbacks: [] }, VISION_FAST: { primary: { deployment: "api", model }, fallbacks: [] } } };
}
function liveModelCapability(model: string, provider: string): ModelCapability {
  return { modelRef: model, provider, toolCalling: true, vision: false, structuredOutput: true, reasoningClass: "fast", enabled: true, inputCostPerMillion: 0, outputCostPerMillion: 0, deployment: "api", externallyHosted: true, privacyEligibility: ["public"], retentionClass: "zero_data_retention" };
}
