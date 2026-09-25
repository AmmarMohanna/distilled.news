import { compileSourceBrowserWorkflowPlan, DEFAULT_SLICE_BUDGET, makeId, validateSourceBrowserWorkflowPlan, type AcquisitionStageOutcome, type ModelCapability, type ModelRoutingConfig, type PublicBrowserObservation, type SourceAcquisitionRequest, type SourceBrowserDiscoveryEvidence, type SourceBrowserWorkflowPlan, type SourceBrowserWorkflowPort, type WebOperatorDiscovery, type WorkflowCandidate } from "@distilled/agent-runtime";
import { ContainerSourceBrowserPort } from "./container-source-browser-port";
import type { Env } from "./types";
import { D1WorkflowRepository } from "./web-operator-workflow-store";
import { createWorkerContainerPublicWebOperatorLifecycle, executeWorkerSourcePlan } from "./web-operator-runtime";

export interface PublicSourceDiscoveryResult { evidence: SourceBrowserDiscoveryEvidence; plan: SourceBrowserWorkflowPlan; candidateUrl: string; browserOperations: number }
class PublicSourceDiscoveryStop extends Error { constructor(readonly status: "AUTH_REQUIRED" | "CHALLENGE_REQUIRED" | "POLICY_DENIED", readonly diagnostics?: PublicBrowserObservation["challengeDiagnostics"], readonly originHost?: string) { super(status); } }
function challengeStop(observation: PublicBrowserObservation): PublicSourceDiscoveryStop {
  let originHost: string | undefined;
  try { originHost = new URL(observation.url).hostname.slice(0, 253); } catch { /* bounded diagnostic only */ }
  return new PublicSourceDiscoveryStop(observation.challengeState === "LOGIN_REQUIRED" ? "AUTH_REQUIRED" : "CHALLENGE_REQUIRED", observation.challengeDiagnostics, originHost);
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
  catch (error) { return bridgeStop(error); }
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
  } catch (error) { return bridgeStop(error); }
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
    modelCalls: outcome.modelCalls,
    browserOperations: probe.browserOperations
  };
}

export function bridgeStop(error: unknown): AcquisitionStageOutcome {
  if (error instanceof PublicSourceDiscoveryStop) {
    const challenge = error.diagnostics;
    if (challenge) console.log(JSON.stringify({ event: "public_acquisition_challenge", challengeKind: challenge.state, classifierRule: challenge.rule, visibleEvidence: challenge.visibleEvidence, structuralEvidence: challenge.structuralEvidence, actionableControlEvidence: challenge.actionableEvidence, surface: challenge.surface, originHost: error.originHost }));
    return { stage: "WEB_OPERATOR", status: error.status, reason: "source requires unsupported access or challenge", details: challenge ? { challenge: { ...challenge, ...(error.originHost ? { originHost: error.originHost } : {}) } } : undefined };
  }
  const code = error && typeof error === "object" && "code" in error ? (error as { code?: unknown }).code : undefined;
  const rawOperation = error && typeof error === "object" && "operation" in error ? (error as { operation?: unknown }).operation : undefined;
  const operation = ["OPEN_AUTH_BROWSER", "NAVIGATE_PUBLIC_PAGE", "OBSERVE_PUBLIC_PAGE", "SCROLL_PUBLIC_PAGE", "CLOSE_AUTH_BROWSER"].includes(String(rawOperation)) ? rawOperation : undefined;
  const raw = error && typeof error === "object" && "diagnostic" in error ? (error as { diagnostic?: unknown }).diagnostic : undefined;
  const diagnostic = raw && typeof raw === "object" ? raw as Record<string, unknown> : undefined;
  const allowedRules = ["ORIGIN_NOT_ADMITTED", "REDIRECT_ORIGIN_NOT_ADMITTED", "FINAL_ORIGIN_NOT_ADMITTED", "SCHEME_NOT_ALLOWED", "PRIVATE_OR_UNRESOLVED_ORIGIN", "METHOD_NOT_ALLOWED", "REQUEST_BLOCKED"];
  const policy = diagnostic && allowedRules.includes(String(diagnostic.policyRule)) ? {
    rule: String(diagnostic.policyRule),
    ...(typeof diagnostic.deniedHostname === "string" && /^[a-z0-9.-]{1,253}$/i.test(diagnostic.deniedHostname) ? { deniedHostname: diagnostic.deniedHostname } : {}),
    redirectHop: diagnostic.redirectHop === true,
    topLevelNavigation: diagnostic.topLevelNavigation === true
  } : undefined;
  return code === "BRIDGE_NETWORK_POLICY_DENIED"
    ? { stage: "WEB_OPERATOR", status: "POLICY_DENIED", reason: "browser network policy denied", details: { ...(operation ? { operation } : {}), ...(policy ? { policy } : {}) } }
    : { stage: "WEB_OPERATOR", status: "STRUCTURAL_FAILURE", reason: "public Web Operator discovery failed" };
}
function liveModelRouting(model: string): ModelRoutingConfig {
  return { mode: "api", apiGateway: "openrouter", selfHostedGateway: "openai_compatible", roles: { NAVIGATION_FAST: { primary: { deployment: "api", model }, fallbacks: [] }, VISION_FAST: { primary: { deployment: "api", model }, fallbacks: [] } } };
}
function liveModelCapability(model: string, provider: string): ModelCapability {
  return { modelRef: model, provider, toolCalling: true, vision: false, structuredOutput: true, reasoningClass: "fast", enabled: true, inputCostPerMillion: 0, outputCostPerMillion: 0, deployment: "api", externallyHosted: true, privacyEligibility: ["public"], retentionClass: "zero_data_retention" };
}
