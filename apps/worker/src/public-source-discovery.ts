import { BrowserUseDiscoveryBackend, BrowserUseEvidenceError, BrowserUseTrustedChallengeError, BROWSER_USE_FAILURE_CATEGORIES, BRIDGE_FAILURE_CODES, compileSourceBrowserWorkflowPlan, verifyBrowserUseProposal, DEFAULT_SLICE_BUDGET, makeId, validateSourceBrowserWorkflowPlan, type AcquisitionStageOutcome, type ModelCapability, type ModelRoutingConfig, type PublicBrowserObservation, type SourceAcquisitionRequest, type SourceBrowserDiscoveryEvidence, type SourceBrowserWorkflowPlan, type SourceBrowserWorkflowPort, type WebOperatorDiscovery, type WorkflowCandidate, type WorkflowCaptureBundle } from "@distilled/agent-runtime";
import { ContainerSourceBrowserPort } from "./container-source-browser-port";
import type { Env } from "./types";
import { D1WorkflowRepository } from "./web-operator-workflow-store";
import { createWorkerContainerPublicWebOperatorLifecycle, executeWorkerSourcePlan } from "./web-operator-runtime";

export interface PublicSourceDiscoveryResult { evidence: SourceBrowserDiscoveryEvidence; plan: SourceBrowserWorkflowPlan; candidateUrl: string; browserOperations: number; discoveryModelCalls?: number; agentRunId?: string }
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
    console.log(JSON.stringify({ event: "public_source_trusted_probe", phase: "listing", listedLinks: listing.listingLinks?.length ?? 0, controls: listing.controls.length, articlePresent: Boolean(listing.article), visibleTextLength: listing.visibleText.length, challenge: listing.challengeState ?? "NO_CHALLENGE" }));
    if (listing.challengeState && listing.challengeState !== "NO_CHALLENGE") throw challengeStop(listing);
    let afterScroll: PublicBrowserObservation | undefined;
    if (port.scrollAndObserve && input.request.limits.maxScrolls > 0) {
      afterScroll = await port.scrollAndObserve(1200); operations++;
      console.log(JSON.stringify({ event: "public_source_trusted_probe", phase: "scroll", listedLinks: afterScroll.listingLinks?.length ?? 0, controls: afterScroll.controls.length, articlePresent: Boolean(afterScroll.article), visibleTextLength: afterScroll.visibleText.length, challenge: afterScroll.challengeState ?? "NO_CHALLENGE" }));
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
      console.log(JSON.stringify({ event: "public_source_trusted_probe", phase: "article", articlePresent: Boolean(observed.article), bodyPresent: Boolean(observed.article?.body), validDate: Boolean(observed.article && Number.isFinite(Date.parse(observed.article.publisherTimestamp))), challenge: observed.challengeState ?? "NO_CHALLENGE" }));
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
export async function discoverBrowserUseSourcePlan(env: Env, input: { request: SourceAcquisitionRequest; tenantId: string; ownerId: string; resourceId: string; runId: string }, ports?: { agent: Pick<ContainerSourceBrowserPort, "open" | "close" | "discoverWithBrowserUse">; verifier: SourceBrowserWorkflowPort }, maxSteps = 6): Promise<PublicSourceDiscoveryResult | undefined> {
  const sourceUrl = input.request.source.canonicalSourceUrl ?? input.request.source.resourceLocator;
  const model = env.DISTILLED_LIVE_OPENROUTER_MODEL?.trim();
  if (!sourceUrl || !model || !env.OPENROUTER_API_KEY) return undefined;
  const origin = new URL(sourceUrl).origin;
  const agentPort = ports?.agent ?? new ContainerSourceBrowserPort(env, { ...input, runId: `${input.runId}_browser_use`, generation: 1 });
  try { await agentPort.open({ sourceUrl, allowedOrigins: [origin], request: input.request }); }
  catch (error) { throw tagBrowserUseStage(error, "AGENT_OPEN"); }
  let proposal: Awaited<ReturnType<ContainerSourceBrowserPort["discoverWithBrowserUse"]>>;
  let agentFailure: unknown;
  try {
    const backend = new BrowserUseDiscoveryBackend({ discover: () => agentPort.discoverWithBrowserUse(sourceUrl, model, maxSteps) });
    proposal = await backend.propose({ request: input.request, capability: { runId: `${input.runId}_browser_use`, tenantId: input.tenantId, ownerId: input.ownerId, resourceId: input.resourceId, browserGeneration: 1, allowedOrigins: [origin], siteKind: "PUBLIC", readOnly: true, expiresAt: new Date(Date.now() + 120_000).toISOString() } });
  } catch (error) {
    agentFailure = error;
    throw tagBrowserUseStage(error, "AGENT_RUN");
  }
  finally { try { await agentPort.close(); } catch (error) { if (!agentFailure) throw tagBrowserUseStage(error, "AGENT_CLOSE"); } }
  console.log(JSON.stringify({ event: "browser_use_agent_proposal", modelCalls: proposal.modelCalls ?? null, browserActions: proposal.browserActions ?? null, agentBrowserActions: proposal.agentBrowserActions ?? null, visitedPages: proposal.visitedUrls.length, articleHints: proposal.articleUrls.length }));
  // A model-reported challenge is only a hint; the verification session owns the typed result.
  const verifier = ports?.verifier ?? new ContainerSourceBrowserPort(env, { ...input, runId: `${input.runId}_browser_use_verify`, generation: 1 });
  let trusted: Awaited<ReturnType<typeof verifyBrowserUseProposal>>;
  try { trusted = await verifyBrowserUseProposal({ request: input.request, capability: { runId: proposal.runId, tenantId: input.tenantId, ownerId: input.ownerId, resourceId: input.resourceId, browserGeneration: 1, allowedOrigins: [origin], siteKind: "PUBLIC", readOnly: true, expiresAt: new Date(Date.now() + 120_000).toISOString() }, proposal, port: verifier }); }
  catch (error) { if (error instanceof BrowserUseTrustedChallengeError) throw challengeStop(error.observation); throw tagBrowserUseStage(error, "TRUSTED_VERIFY"); }
  if (trusted.plan.continuation.kind === "NONE") return undefined;
  console.log(JSON.stringify({ event: "browser_use_discovery_verified", modelCalls: proposal.modelCalls ?? null, browserActions: proposal.browserActions ?? null, agentBrowserActions: proposal.agentBrowserActions ?? null, trustedArticles: trusted.articles.length }));
  return { evidence: { sourceUrl, listing: trusted.listing, sampledArticles: trusted.articles, afterScroll: trusted.afterScroll }, plan: trusted.plan, candidateUrl: trusted.articles[0].article!.canonicalUrl, browserOperations: (proposal.browserActions ?? proposal.steps) + trusted.articles.length + 1, discoveryModelCalls: proposal.modelCalls ?? proposal.steps, agentRunId: proposal.runId };
}

function tagBrowserUseStage(error: unknown, stage: "AGENT_OPEN" | "AGENT_RUN" | "AGENT_CLOSE" | "TRUSTED_VERIFY"): unknown {
  if (error && typeof error === "object") {
    try { Object.defineProperty(error, "browserUseStage", { value: stage, configurable: true }); } catch { /* Preserve the original failure. */ }
  }
  return error;
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
  if (probe.agentRunId) {
    try { return await compileVerifiedBrowserUseDiscovery(env, input, probe); }
    catch (error) { return bridgeStop(error, "WORKFLOW_EXPLORATION"); }
  }
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

/** Browser Use has already supplied the discovery hypothesis. Preserve its
 * actual run and the independent CDP observations as a capture, then use the
 * same Candidate/Validated/ACTIVE repository path as other source workflows. */
export async function compileVerifiedBrowserUseDiscovery(
  env: Env,
  input: { request: SourceAcquisitionRequest; tenantId: string; ownerId: string; resourceId: string; runId: string; idempotencyKey: string },
  probe: PublicSourceDiscoveryResult
): Promise<WebOperatorDiscovery> {
  const sourceUrl = input.request.source.canonicalSourceUrl ?? input.request.source.resourceLocator!;
  const origin = new URL(sourceUrl).origin;
  const runId = probe.agentRunId!;
  const now = new Date().toISOString();
  const article = probe.evidence.sampledArticles[0].article!;
  const identity = { candidateId: makeId("source_candidate", probe.candidateUrl), canonicalUrl: probe.candidateUrl, publisherId: new URL(sourceUrl).hostname, acquisitionAttempt: input.idempotencyKey };
  await env.DB.prepare(`INSERT OR IGNORE INTO agent_runs
    (run_id,tenant_id,resource_id,idempotency_key,candidate_id,candidate_url,publisher_id,acquisition_attempt,objective,mode,state,generation,policy_snapshot_id,completion_contract_version,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
    runId,input.tenantId,input.resourceId,`${input.idempotencyKey}:browser_use`,identity.candidateId,identity.canonicalUrl,identity.publisherId,identity.acquisitionAttempt,
    "Bounded read-only Browser Use source discovery","discovery","completed",1,makeId("public_source_policy",input.resourceId),"browser-use-discovery-v1",now,now
  ).run();
  const observations = [probe.evidence.listing, probe.evidence.afterScroll, ...probe.evidence.sampledArticles].filter((value): value is PublicBrowserObservation => Boolean(value));
  const observationId = (value: PublicBrowserObservation) => makeId("trusted_source_observation",runId,value.url,value.pageRevision);
  const capture: WorkflowCaptureBundle = {
    id: makeId("workflow_capture",runId,observations.map(observationId).join(",")),runId,tenantId:input.tenantId,resourceId:input.resourceId,candidate:identity,
    actions:[],observationIds:observations.map(observationId),successfulAlternatives:[],failedAlternatives:[],
    discoveryEvidence:{
      canonicalResourceIdentity:{resourceId:input.resourceId,candidateCanonicalUrl:probe.candidateUrl,publisherId:identity.publisherId},
      listingUrlCandidates:[probe.evidence.listing.url],
      paginationBehavior:{watermarkObserved:false,exhausted:false,evidenceObservationIds:probe.evidence.afterScroll?[observationId(probe.evidence.afterScroll)]:[]},
      articleUrlPatterns:[`${origin}${probe.plan.articlePathPrefix}{slug}`],
      publicationTimeEvidence:probe.evidence.sampledArticles.map(value=>({observationId:observationId(value),publisherTimestamp:value.article!.publisherTimestamp})),
      pageTypeObservations:observations.map(value=>({observationId:observationId(value),url:value.url,pageType:value.article?"article" as const:"listing" as const,title:value.title})),
      locatorEvidence:(probe.evidence.listing.listingLinks??[]).map(destinationUrl=>({observationId:observationId(probe.evidence.listing),kind:"link",destinationUrl,safeAction:"follow"})),
      requiredReadCapabilities:["follow_read_link"],stoppingWatermarkEvidence:[]
    },
    extractionEvidence:await Promise.all(probe.evidence.sampledArticles.map(async value=>({observationId:observationId(value),canonicalUrl:value.article!.canonicalUrl,contentHash:await hashSourceBody(value.article!.body)}))),
    completionEvidence:{citedObservationIds:probe.evidence.sampledArticles.map(observationId),watermarkObserved:false},
    runtime:{softwareVersion:"distilled-worker@0.1.0",toolSchemaVersion:"browser-use-discovery-v1",workflowSchemaVersion:"workflow-capture-v1"},createdAt:now
  };
  const repository = new D1WorkflowRepository(env.DB);
  await repository.saveCaptureBundle(capture);
  const versions = await repository.listWorkflowCandidates(input.resourceId);
  const candidate: WorkflowCandidate = {
    id:makeId("source_workflow",input.resourceId,runId,JSON.stringify(probe.plan)),tenantId:input.tenantId,resourceId:input.resourceId,sourceCaptureId:capture.id,candidate:identity,
    sourceAcquisition:probe.plan,state:"CANDIDATE",version:Math.max(0,...versions.map(value=>value.version))+1,
    operations:[
      {id:makeId("source_op",input.resourceId,"entry"),kind:"navigate",locatorAlternatives:[{kind:"url_pattern",value:sourceUrl,confidence:1}]},
      {id:makeId("source_op",input.resourceId,"listing"),kind:"extract_listing",locatorAlternatives:[{kind:"page_type",value:"listing",confidence:1}]},
      {id:makeId("source_op",input.resourceId,"continuation"),kind:"paginate",locatorAlternatives:[{kind:"page_type",value:"listing",confidence:1}]},
      {id:makeId("source_op",input.resourceId,"article"),kind:"extract_article",locatorAlternatives:[{kind:"article_canonical",value:probe.candidateUrl,confidence:1}]}
    ],unsupportedGaps:[],createdAt:now
  };
  await repository.saveWorkflowCandidate(candidate);
  const execute = async (request: SourceAcquisitionRequest, workflow: WorkflowCandidate) => executeWorkerSourcePlan(env,{tenantId:input.tenantId,ownerId:input.ownerId,resourceId:input.resourceId,runId:makeId("source_execution",input.runId,workflow.id),request,workflow});
  return {
    candidate:{id:candidate.id,version:candidate.version,state:"CANDIDATE",execute:request=>execute(request,candidate)},
    validate:async()=>{
      validateSourceBrowserWorkflowPlan(probe.plan,input.request);
      const criteria={sourceIdentity:new URL(probe.evidence.listing.url).origin===origin,twoDatedArticles:probe.evidence.sampledArticles.length>=2&&probe.evidence.sampledArticles.every(value=>Boolean(value.article?.body)&&Number.isFinite(Date.parse(value.article!.publisherTimestamp))),groundedAgentArticle:probe.discoveryModelCalls!==undefined&&probe.discoveryModelCalls>0&&article.canonicalUrl===probe.candidateUrl,deterministicContinuation:probe.plan.continuation.kind!=="NONE",readOnlyOrigins:probe.plan.allowedOrigins.length===1&&probe.plan.allowedOrigins[0]===origin};
      const passed=Object.values(criteria).every(Boolean);
      await repository.saveValidationResult({workflowId:candidate.id,passed,criteria,failureClass:passed?undefined:"structural_site_change",validatedAt:now});
      if(!passed)throw new Error("source workflow validation failed");
      return {id:candidate.id,version:candidate.version,state:"VALIDATED",execute:(request:SourceAcquisitionRequest)=>execute(request,{...candidate,state:"VALIDATED"})};
    },
    activate:async()=>{const active=await repository.promoteWorkflow(candidate.id,"source-workflow-validator",now);return {id:active.id,version:active.version,execute:(request:SourceAcquisitionRequest)=>execute(request,active)};},
    runId,modelCalls:probe.discoveryModelCalls??0,browserOperations:probe.browserOperations
  };
}

async function hashSourceBody(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,"0")).join("");
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
  const rawBrowserUseStage = error && typeof error === "object" && "browserUseStage" in error ? (error as { browserUseStage?: unknown }).browserUseStage : undefined;
  const browserUseStage = ["AGENT_OPEN", "AGENT_RUN", "AGENT_CLOSE", "TRUSTED_VERIFY"].includes(String(rawBrowserUseStage)) ? rawBrowserUseStage as string : undefined;
  const errorName = error instanceof Error && /^[A-Za-z]{1,40}$/.test(error.name) ? error.name : undefined;
  const trustedError = error instanceof Error && ["browser_use_trusted_evidence_insufficient", "browser_use_observation_origin_denied", "browser_use_source_denied"].includes(error.message) ? error.message : undefined;
  const evidenceCounts = error instanceof BrowserUseEvidenceError ? error.counts : undefined;
  const operation = ["OPEN_AUTH_BROWSER", "NAVIGATE_PUBLIC_PAGE", "OBSERVE_PUBLIC_PAGE", "SCROLL_PUBLIC_PAGE", "CLOSE_AUTH_BROWSER"].includes(String(rawOperation)) ? rawOperation : undefined;
  const raw = error && typeof error === "object" && "diagnostic" in error ? (error as { diagnostic?: unknown }).diagnostic : undefined;
  const diagnostic = raw && typeof raw === "object" ? raw as Record<string, unknown> : undefined;
  const browserUseFailure = diagnostic && BROWSER_USE_FAILURE_CATEGORIES.includes(diagnostic.browserUseFailure as typeof BROWSER_USE_FAILURE_CATEGORIES[number]) ? diagnostic.browserUseFailure as typeof BROWSER_USE_FAILURE_CATEGORIES[number] : undefined;
  const failureType = diagnostic && typeof diagnostic.failureType === "string" && /^[A-Za-z0-9_.]{1,120}$/.test(diagnostic.failureType) ? diagnostic.failureType : undefined;
  const causeType = diagnostic && typeof diagnostic.causeType === "string" && /^[A-Za-z0-9_.]{1,120}$/.test(diagnostic.causeType) ? diagnostic.causeType : undefined;
  const failureTrace = diagnostic && Array.isArray(diagnostic.failureTrace) && diagnostic.failureTrace.length <= 4 && diagnostic.failureTrace.every(value => typeof value === "string" && /^[A-Za-z0-9_.]{1,100}$/.test(value)) ? diagnostic.failureTrace as string[] : undefined;
  const runtimeHint = diagnostic && typeof diagnostic.runtimeHint === "string" && /^[A-Z_]{1,40}$/.test(diagnostic.runtimeHint) ? diagnostic.runtimeHint : undefined;
  const runnerExit = diagnostic && ["SIGNAL", "EMPTY_OUTPUT", "EXIT_CODE"].includes(String(diagnostic.runnerExit)) ? diagnostic.runnerExit as string : undefined;
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
    : { stage: "WEB_OPERATOR", status: "STRUCTURAL_FAILURE", reason: `public Web Operator discovery failed: ${phase}/${browserUseStage ?? "UNKNOWN_STAGE"}/${String(operation ?? "UNKNOWN_OPERATION")}/${bridgeCode ?? "UNCLASSIFIED"}${browserUseFailure ? `/${browserUseFailure}` : ""}${failureType ? `/${failureType}` : ""}${causeType ? `/${causeType}` : ""}${runnerExit ? `/${runnerExit}` : ""}${runtimeHint ? `/${runtimeHint}` : ""}${failureTrace?.length ? `/${failureTrace.join(",")}` : ""}${errorName ? `/${errorName}` : ""}${trustedError ? `/${trustedError}` : ""}${evidenceCounts ? `/${evidenceCounts.visitedPages},${evidenceCounts.proposalArticles},${evidenceCounts.observedLinks},${evidenceCounts.trustedArticles},${evidenceCounts.scrollObservations},${evidenceCounts.continuation}` : ""}`, details: { phase, browserUseStage, operation, bridgeCode: bridgeCode ?? "UNCLASSIFIED", ...(browserUseFailure ? { browserUseFailure } : {}), ...(failureType ? { failureType } : {}), ...(causeType ? { causeType } : {}), ...(runnerExit ? { runnerExit } : {}), ...(runtimeHint ? { runtimeHint } : {}), ...(failureTrace ? { failureTrace } : {}), ...(errorName ? { errorName } : {}), ...(trustedError ? { trustedError } : {}), ...(evidenceCounts ? { evidenceCounts } : {}) } };
}
function liveModelRouting(model: string): ModelRoutingConfig {
  return { mode: "api", apiGateway: "openrouter", selfHostedGateway: "openai_compatible", roles: { NAVIGATION_FAST: { primary: { deployment: "api", model }, fallbacks: [] }, VISION_FAST: { primary: { deployment: "api", model }, fallbacks: [] } } };
}
function liveModelCapability(model: string, provider: string): ModelCapability {
  return { modelRef: model, provider, toolCalling: true, vision: false, structuredOutput: true, reasoningClass: "fast", enabled: true, inputCostPerMillion: 0, outputCostPerMillion: 0, deployment: "api", externallyHosted: true, privacyEligibility: ["public"], retentionClass: "zero_data_retention" };
}
