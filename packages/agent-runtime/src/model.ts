import { z } from "zod";
import {
  MODEL_ROLES,
  TOOL_NAMES,
  type AgentPageState,
  type BoundedActionPlan,
  type LlmDeploymentMode,
  type ModelCapability,
  type ModelDeployment,
  type ModelRole,
  type ModelRoute,
  type ModelRoutingConfig,
  type ModelPolicy,
  type ModelGatewayDiagnostic,
  type ModelTargetConfig
} from "./contracts";
import { sha256Text } from "./observations";

const expectedSchema = z
  .object({
    pageRevision: z.string().optional(),
    urlIncludes: z.string().optional(),
    challengeState: z.string().optional()
  })
  .strict();

const plannedActionSchema = z
  .object({
    tool: z.enum(TOOL_NAMES),
    arguments: z.unknown(),
    expected: expectedSchema.optional()
  })
  .strict()
  .superRefine((action,context) => {
    if (["browser.navigate@1","browser.follow_link@1","computer.click@1"].includes(action.tool) &&
      !action.expected?.urlIncludes && !action.expected?.challengeState) {
      context.addIssue({code:z.ZodIssueCode.custom,message:"page-changing actions require an expected URL or challenge state"});
    }
  });

export const boundedActionPlanSchema = z
  .object({
    version: z.literal(1),
    actions: z.array(plannedActionSchema).min(1).max(5),
    rationale: z.string().max(400).optional()
  })
  .strict();

export interface StableModelInstructions {
  version: string;
  system: string;
  toolSchemaVersion: string;
}

export interface DynamicModelContext {
  runId: string;
  objective: string;
  pageState: AgentPageState;
  observationIds: string[];
  observationDelta?: unknown;
  visualObservation?: { observationId: string; artifactRef: string; hash: string; contentType: string };
  completionDeficits: string[];
}

export interface ModelRequest {
  callId: string;
  role: ModelRole;
  route: ModelRoute;
  stable: StableModelInstructions;
  dynamic: DynamicModelContext;
  contextManifestHash: string;
  allowExactReuse: boolean;
  maxOutputTokens: number;
  visualInputs?: Array<{ observationId: string; dataUrl: string }>;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface ModelGatewayResult {
  plan: BoundedActionPlan;
  usage: {
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    latencyMs: number;
  };
  provider: string;
  model: string;
  responseId: string;
  gateway: string;
  deployment: ModelDeployment;
}

export class ModelGatewayError extends Error {
  constructor(
    message:string,
    readonly usage?:ModelGatewayResult["usage"],
    readonly observedIdentity?:{model?:string;provider?:string;gateway?:string;deployment?:ModelDeployment},
    readonly failureClass:import("./contracts").ModelGatewayFailureClass="transport_failure",
    readonly usageConfirmed=usage!==undefined,
    readonly gatewayDiagnostic?:ModelGatewayDiagnostic
  ) { super(message); this.name="ModelGatewayError"; }
}

export interface ModelGateway {
  readonly id: string;
  complete(request: ModelRequest): Promise<ModelGatewayResult>;
}

export interface ModelRoutingEnvironment {
  DISTILLED_LLM_MODE?: string;
  DISTILLED_LLM_API_GATEWAY?: string;
  DISTILLED_LLM_GATEWAY?: string;
  [key: string]: string | undefined;
}

export function modelRoutingConfigFromEnv(
  environment: ModelRoutingEnvironment,
  base: ModelRoutingConfig = {
    mode: "api",
    apiGateway: "openrouter",
    selfHostedGateway: "openai_compatible",
    roles: {}
  }
): ModelRoutingConfig {
  const mode = parseDeploymentMode(environment.DISTILLED_LLM_MODE ?? base.mode);
  const apiGateway = environment.DISTILLED_LLM_API_GATEWAY?.trim()
    || environment.DISTILLED_LLM_GATEWAY?.trim()
    || base.apiGateway
    || "openrouter";
  const selfHostedGateway = base.selfHostedGateway || "openai_compatible";
  const roles: ModelRoutingConfig["roles"] = { ...base.roles };
  for (const role of MODEL_ROLES) {
    const prefix = `DISTILLED_MODEL_ROLE_${role}`;
    const primaryModel = environment[`${prefix}_PRIMARY`] ?? roles[role]?.primary.model;
    const fallbackJson = environment[`${prefix}_FALLBACKS_JSON`];
    let fallbacks = roles[role]?.fallbacks ?? [];
    if (fallbackJson !== undefined) {
      const parsed: unknown = JSON.parse(fallbackJson);
      if (!Array.isArray(parsed)) {
        throw new Error(`${prefix}_FALLBACKS_JSON must be a JSON array of deployment/model objects`);
      }
      fallbacks = parsed.map((value,index) => parseTarget(value, mode, `${prefix}_FALLBACKS_JSON[${index}]`));
    }
    if (primaryModel !== undefined) {
      const primaryDeploymentValue = environment[`${prefix}_PRIMARY_DEPLOYMENT`]
        ?? roles[role]?.primary.deployment
        ?? defaultDeployment(mode);
      roles[role] = validateRoleRoute(role, {
        primary: {
          deployment: parseDeployment(primaryDeploymentValue, `${prefix}_PRIMARY_DEPLOYMENT`),
          model: primaryModel
        },
        fallbacks
      }, mode);
    }
  }
  return {
    mode,
    apiGateway,
    selfHostedGateway,
    roles
  };
}

function parseDeploymentMode(value: string): LlmDeploymentMode {
  const normalized = value.trim();
  if (normalized === "api" || normalized === "self_hosted" || normalized === "hybrid") return normalized;
  throw new Error("DISTILLED_LLM_MODE must be api, self_hosted, or hybrid");
}

function defaultDeployment(mode: LlmDeploymentMode): ModelDeployment {
  if (mode === "hybrid") throw new Error("hybrid role targets require an explicit deployment");
  return mode;
}

function parseDeployment(value: string, field: string): ModelDeployment {
  const normalized = value.trim();
  if (normalized === "api" || normalized === "self_hosted") return normalized;
  throw new Error(`${field} must be api or self_hosted`);
}

function parseTarget(value: unknown, mode: LlmDeploymentMode, field: string): ModelTargetConfig {
  if (typeof value === "string") {
    return { deployment: defaultDeployment(mode), model: value };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${field} must contain deployment and model`);
  }
  const candidate = value as { deployment?: unknown; model?: unknown };
  if (typeof candidate.deployment !== "string" || typeof candidate.model !== "string") {
    throw new Error(`${field} must contain string deployment and model fields`);
  }
  return { deployment: parseDeployment(candidate.deployment, `${field}.deployment`), model: candidate.model };
}

function validateRoleRoute(
  role: ModelRole,
  route: { primary: ModelTargetConfig; fallbacks: ModelTargetConfig[] },
  mode: LlmDeploymentMode
) {
  const targets = [route.primary, ...route.fallbacks].map((target) => ({
    deployment: target.deployment,
    model: target.model.trim()
  }));
  if (targets.some((target) => target.model.length === 0)) throw new Error(`${role} contains an empty model reference`);
  const identities = targets.map((target) => `${target.deployment}:${target.model}`);
  if (new Set(identities).size !== identities.length) throw new Error(`${role} contains duplicate model targets`);
  if (mode !== "hybrid" && targets.some((target) => target.deployment !== mode)) {
    throw new Error(`${role} contains a ${targets.find((target) => target.deployment !== mode)?.deployment} target in ${mode} mode`);
  }
  return { primary: targets[0], fallbacks: targets.slice(1) };
}

export class ModelRouter {
  private readonly capabilities: Map<string, ModelCapability>;

  constructor(
    private readonly config: ModelRoutingConfig,
    capabilities: ModelCapability[]
  ) {
    if (!config.apiGateway.trim()) throw new Error("apiGateway must not be empty");
    if (!config.selfHostedGateway.trim()) throw new Error("selfHostedGateway must not be empty");
    for (const role of MODEL_ROLES) {
      const configured = config.roles[role];
      if (configured) validateRoleRoute(role, configured, config.mode);
    }
    for (const capability of capabilities) {
      if ((capability.deployment==="api")!==capability.externallyHosted) {
        throw new Error(`model capability ${capability.modelRef} has inconsistent deployment/external-hosting metadata`);
      }
    }
    this.capabilities = new Map(capabilities.map((capability) => [`${capability.deployment}:${capability.modelRef}`, capability]));
  }

  resolve(input: {
    role: ModelRole;
    reason: string;
    required: Array<"toolCalling" | "vision" | "structuredOutput">;
    allowedProviders?: string[];
    modelPolicy?: ModelPolicy;
    policyConstraints?: string[];
  }): ModelRoute {
    return this.resolveCandidates(input)[0];
  }

  resolveCandidates(input: {
    role: ModelRole;
    reason: string;
    required: Array<"toolCalling" | "vision" | "structuredOutput">;
    allowedProviders?: string[];
    modelPolicy?: ModelPolicy;
    policyConstraints?: string[];
  }): ModelRoute[] {
    const configured = this.config.roles[input.role];
    if (!configured) throw new Error(`no model route configured for role ${input.role}`);
    const targets = [configured.primary, ...configured.fallbacks];
    const chain = targets.map((target) => target.model);
    const allowedProviders = input.allowedProviders ? new Set(input.allowedProviders) : undefined;
    const routes: ModelRoute[] = [];
    let filteredReason: string | undefined;
    for (const [index, target] of targets.entries()) {
      const modelRef = target.model;
      const capability = this.capabilities.get(`${target.deployment}:${modelRef}`);
      const eligible =
        capability?.enabled &&
        capability.deployment === target.deployment &&
        (!allowedProviders || allowedProviders.has(capability.provider)) &&
        policyAllows(capability,target.deployment,input.modelPolicy) &&
        input.required.every((required) => capability[required]);
      if (!eligible) {
        filteredReason ??= `configured candidate ${modelRef} failed capability/provider policy filtering`;
        continue;
      }
      routes.push({
        role: input.role,
        routingReason: input.reason,
        requiredCapabilities: [...input.required],
        configuredChain: chain,
        configuredTargets: structuredClone(targets),
        deployment: target.deployment,
        gateway: target.deployment === "api" ? this.config.apiGateway : this.config.selfHostedGateway,
        selectedModel: modelRef,
        selectedProvider: capability.provider,
        selectedCapability:structuredClone(capability),
        appliedPolicyConstraints: [...(input.policyConstraints ?? [])],
        fallbackReason: index > 0
          ? filteredReason ?? `prior configured candidate failed at execution time`
          : undefined
      });
    }
    if (routes.length === 0) throw new Error(`no eligible model for role ${input.role}`);
    return routes;
  }
}

export class ModelEscalationPolicy {
  chooseRole(input: { requiresVision: boolean; repeatedStructuralFailures: number }): ModelRole {
    if (input.requiresVision) return input.repeatedStructuralFailures > 1 ? "VISION_STRONG" : "VISION_FAST";
    if (input.repeatedStructuralFailures > 1) return "REASONING_STANDARD";
    return "NAVIGATION_FAST";
  }
}

export class ScriptedModelGateway implements ModelGateway {
  readonly id = "scripted";
  private index = 0;
  readonly requests: ModelRequest[] = [];

  constructor(private readonly scripts: BoundedActionPlan[]) {}

  async complete(request: ModelRequest): Promise<ModelGatewayResult> {
    this.requests.push(structuredClone(request));
    const script = this.scripts[this.index];
    if (!script) throw new Error(`scripted gateway exhausted at call ${this.index + 1}`);
    this.index += 1;
    const plan = boundedActionPlanSchema.parse(script) as BoundedActionPlan;
    return {
      plan,
      usage: {
        inputTokens: 120 + request.dynamic.observationIds.length * 8,
        outputTokens: 20 + plan.actions.length * 12,
        costUsd: 0.0001 + plan.actions.length * 0.00001,
        latencyMs: 7
      },
      provider: "scripted",
      model: request.route.selectedModel,
      responseId: `scripted_${this.index}`,
      gateway:this.id,
      deployment:request.route.deployment
    };
  }
}

export interface OpenRouterGatewayOptions {
  apiKey: string;
  endpoint?: string;
  fetcher?: typeof fetch;
}

export interface OpenRouterProbeResult {
  httpStatus:number;
  elapsedMs:number;
  response:unknown;
  requestIds:ModelGatewayDiagnostic["requestIds"];
}

export interface OpenAICompatibleGatewayOptions {
  baseUrl: string;
  apiKey?: string;
  id?: string;
  provider?: string;
  fetcher?: typeof fetch;
}

export interface ModelGatewayEnvironment extends ModelRoutingEnvironment {
  DISTILLED_SELF_HOSTED_BASE_URL?: string;
  DISTILLED_SELF_HOSTED_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
}

export function buildOpenAICompatibleRequest(request: ModelRequest): RequestInit & { body: string } {
  const currentPageRevision = request.dynamic.pageState.pageRevision;
  const dynamicContent = request.visualInputs?.length
    ? [
        { type: "text", text: JSON.stringify(request.dynamic) },
        ...request.visualInputs.map((input) => ({ type: "image_url", image_url: { url: input.dataUrl } }))
      ]
    : JSON.stringify(request.dynamic);
  return {
    method: "POST",
    headers: {
      authorization: `Bearer __DISTILLED_GATEWAY_KEY__`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: request.route.selectedModel,
      max_tokens:request.maxOutputTokens,
      messages: [
        { role: "system", content: request.stable.system },
        { role: "user", content: dynamicContent }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "bounded_action_plan",
          strict: true,
          schema: boundedActionPlanResponseSchema(currentPageRevision)
        }
      }
    })
  };
}

export const OPENROUTER_BOUNDED_PLAN_TOOL_NAME="submit_bounded_action_plan";

function boundedActionPlanResponseSchema(currentPageRevision:string) {
  return {
    type:"object",
    additionalProperties:false,
    required:["version","actions"],
    properties:{
      version:{const:1},
      rationale:{type:"string",maxLength:400},
      actions:{type:"array",minItems:1,maxItems:5,items:actionResponseSchema(currentPageRevision)}
    }
  };
}

function actionResponseSchema(currentPageRevision:string) {
  const stringProperty={type:"string",minLength:1};
  const expected={
    type:"object",
    description:"Optional deterministic guards. pageRevision is a pre-action stale-plan guard; URL and challenge fields are postconditions.",
    additionalProperties:false,
    properties:{
      pageRevision:{
        const:currentPageRevision,
        description:"If present, it must be the exact current PageState.pageRevision. Never predict a future revision."
      },
      urlIncludes:{type:"string"},
      challengeState:{type:"string"}
    }
  };
  return {
    type:"object",
    additionalProperties:false,
    required:["tool","arguments"],
    properties:{
      tool:{type:"string",enum:[...TOOL_NAMES]},
      arguments:{
        type:"object",
        description:"Use exactly the fields required by the selected tool: navigate {url}; follow_link {handle,observationRevision,capability}; scroll {deltaY}; move_pointer/click {x,y,screenshotObservationId,screenshotHash}; propose_completion {citedObservationIds}; fixture.publish {articleId}; all inspection, extraction, query, and screenshot tools {}.",
        additionalProperties:false,
        properties:{
          url:stringProperty,
          handle:stringProperty,
          observationRevision:stringProperty,
          capability:stringProperty,
          deltaY:{type:"integer",minimum:-2000,maximum:2000},
          x:{type:"number",minimum:0},
          y:{type:"number",minimum:0},
          screenshotObservationId:stringProperty,
          screenshotHash:stringProperty,
          citedObservationIds:{type:"array",items:{type:"string"},maxItems:20},
          articleId:stringProperty
        }
      },
      expected
    }
  };
}

export function buildOpenRouterRequest(request: ModelRequest): RequestInit & { body: string } {
  const translated=buildOpenAICompatibleRequest(request);
  const body=JSON.parse(translated.body) as Record<string,unknown>;
  const responseFormat=body.response_format as {json_schema?:{schema?:unknown}}|undefined;
  const planSchema=responseFormat?.json_schema?.schema;
  delete body.response_format;
  body.tools=[{type:"function",function:{
    name:OPENROUTER_BOUNDED_PLAN_TOOL_NAME,
    description:"Submit the next bounded action plan for deterministic runtime validation.",
    parameters:planSchema
  }}];
  body.tool_choice={type:"function",function:{name:OPENROUTER_BOUNDED_PLAN_TOOL_NAME}};
  const automatic=request.route.selectedCapability.providerRouting;
  body.provider={
    only:automatic?.endpoints.map((endpoint)=>endpoint.tag)??[request.route.selectedProvider],
    allow_fallbacks:automatic?.allowFallbacks??false,
    ...(automatic?{sort:automatic.sort}:{}),
    require_parameters:true,
    data_collection:request.route.selectedCapability.retentionClass==="standard"?"allow":"deny",
    ...(request.route.selectedCapability.retentionClass==="zero_data_retention"?{zdr:true}:{})
  };
  return {...translated,body:JSON.stringify(body)};
}

export class OpenAICompatibleGateway implements ModelGateway {
  readonly id: string;
  protected readonly endpoint: string;
  protected readonly fetcher: typeof fetch;

  constructor(protected readonly options: OpenAICompatibleGatewayOptions) {
    this.id = options.id ?? "openai_compatible";
    this.endpoint = chatCompletionsEndpoint(options.baseUrl);
    this.fetcher = options.fetcher ?? fetch;
  }

  protected translate(request:ModelRequest) { return buildOpenAICompatibleRequest(request); }
  protected planPayload(message:{content?:unknown;tool_calls?:unknown}):string|undefined {
    return typeof message.content==="string"?message.content:undefined;
  }
  protected validateResult(request:ModelRequest,result:ModelGatewayResult) {
    if (result.model.toLowerCase()!==request.route.selectedModel.toLowerCase() ||
        result.provider.toLowerCase()!==request.route.selectedProvider.toLowerCase()) {
      throw new ModelGatewayError(
        `${this.id} returned an unexpected model/provider identity: ${result.model} via ${result.provider}`,
        result.usage,
        {model:result.model,provider:result.provider,gateway:result.gateway,deployment:result.deployment},
        "provider_identity_mismatch"
      );
    }
  }

  async complete(request: ModelRequest): Promise<ModelGatewayResult> {
    const started = Date.now();
    const translated = this.translate(request);
    const headers = new Headers(translated.headers);
    if (this.options.apiKey) headers.set("authorization", `Bearer ${this.options.apiKey}`);
    else headers.delete("authorization");
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(new Error("model gateway deadline exceeded")),request.timeoutMs??15_000);
    const abort=()=>controller.abort(request.signal?.reason);
    request.signal?.addEventListener("abort",abort,{once:true});
    if (request.signal?.aborted) abort();
    const gatewayIdentity={gateway:this.id,deployment:request.route.deployment};
    try {
      const response=await this.fetcher.call(globalThis,this.endpoint,{...translated,headers,signal:controller.signal});
      if (!response.ok) {
        const responseText=await response.text();
        const diagnostic=this.id==="openrouter"
          ? openRouterErrorDiagnostic(response,responseText,request,Date.now()-started)
          : undefined;
        throw new ModelGatewayError(
          `${this.id} request failed: ${response.status}${diagnostic?.message?`: ${diagnostic.message}`:""}`,
          unconfirmedModelUsage(started),gatewayIdentity,"provider_http_failure",false,diagnostic
        );
      }
      let body:{
        id:string;
        model:string;
        provider?:string;
        choices:Array<{message:{content?:unknown;tool_calls?:unknown}}>;
        usage?:{prompt_tokens?:number;completion_tokens?:number;cost?:number};
      };
      try { body=await response.json() as typeof body; }
      catch (error) {
        if (controller.signal.aborted) throw error;
        throw new ModelGatewayError(`${this.id} returned invalid JSON`,unconfirmedModelUsage(started),gatewayIdentity,"malformed_response",false);
      }
      if (!body||typeof body!=="object"||typeof body.id!=="string"||typeof body.model!=="string"||!Array.isArray(body.choices)) {
        throw new ModelGatewayError(`${this.id} returned an invalid response envelope`,unconfirmedModelUsage(started),{
          ...gatewayIdentity,
          model:typeof body?.model==="string"?body.model:undefined,
          provider:typeof body?.provider==="string"?body.provider:undefined
        },"malformed_response",false);
      }
      const usage={
        inputTokens:body.usage?.prompt_tokens??0,
        outputTokens:body.usage?.completion_tokens??0,
        costUsd:body.usage?.cost??0,
        latencyMs:Date.now()-started
      };
      const observedIdentity={...gatewayIdentity,model:body.model,provider:body.provider??request.route.selectedProvider};
      const content=this.planPayload(body.choices?.[0]?.message??{});
      if (!content) throw new ModelGatewayError(`${this.id} returned no completed message`,usage,observedIdentity,"malformed_response");
      let plan:BoundedActionPlan;
      try { plan=boundedActionPlanSchema.parse(JSON.parse(content)) as BoundedActionPlan; }
      catch { throw new ModelGatewayError(`${this.id} returned an invalid bounded action plan`,usage,observedIdentity,"malformed_response"); }
      const result:ModelGatewayResult={
        plan,usage,provider:observedIdentity.provider,model:body.model,responseId:body.id,gateway:this.id,deployment:request.route.deployment
      };
      this.validateResult(request,result);
      return result;
    } catch (error) {
      if (error instanceof ModelGatewayError) throw error;
      const latencyMs=Date.now()-started;
      const usage={inputTokens:0,outputTokens:0,costUsd:0,latencyMs};
      const ownDeadline=controller.signal.aborted && !request.signal?.aborted;
      const cancelled=Boolean(request.signal?.aborted);
      throw new ModelGatewayError(
        `${this.id} transport failed: ${error instanceof Error?error.message:String(error)}`,
        usage,
        gatewayIdentity,
        ownDeadline?"deadline_exceeded":cancelled?"cancelled":"transport_failure",
        false
      );
    } finally {
      clearTimeout(timeout);
      request.signal?.removeEventListener("abort",abort);
    }
  }
}

function openRouterErrorDiagnostic(
  response:Response,
  responseText:string,
  request:ModelRequest,
  elapsedMs:number
):ModelGatewayDiagnostic {
  const provider=request.route.selectedCapability.providerRouting;
  return openRouterErrorDiagnosticFromPayload(response,responseText,{
    model:request.route.selectedModel,
    provider:{
      only:provider?.endpoints.map((endpoint)=>endpoint.tag)??[request.route.selectedProvider],
      sort:provider?.sort,
      allow_fallbacks:provider?.allowFallbacks??false,
      require_parameters:true,
      zdr:request.route.selectedCapability.retentionClass==="zero_data_retention",
      data_collection:request.route.selectedCapability.retentionClass==="standard"?"allow":"deny"
    }
  },elapsedMs);
}

function openRouterErrorDiagnosticFromPayload(
  response:Response,
  responseText:string,
  payload:Record<string,unknown>,
  elapsedMs:number
):ModelGatewayDiagnostic {
  let error:Record<string,unknown>|undefined;
  try {
    const parsed=JSON.parse(responseText) as unknown;
    if (parsed && typeof parsed==="object" && !Array.isArray(parsed)) {
      const candidate=(parsed as Record<string,unknown>).error;
      if (candidate && typeof candidate==="object" && !Array.isArray(candidate)) error=candidate as Record<string,unknown>;
    }
  } catch { /* A non-JSON provider error remains classified by status. */ }
  const routing=payload.provider && typeof payload.provider==="object" && !Array.isArray(payload.provider)
    ? payload.provider as Record<string,unknown> : undefined;
  return {
    httpStatus:response.status,
    errorCode:sanitizedDiagnosticText(error?.code,80),
    errorType:sanitizedDiagnosticText(error?.type,80),
    message:sanitizedDiagnosticText(error?.message,500),
    requestIds:diagnosticRequestIds(response.headers),
    requestedModel:typeof payload.model==="string"?payload.model:"unknown",
    routingPreferences:{
      only:stringArray(routing?.only),
      order:stringArray(routing?.order),
      sort:typeof routing?.sort==="string"?routing.sort:undefined,
      allowFallbacks:typeof routing?.allow_fallbacks==="boolean"?routing.allow_fallbacks:undefined,
      requireParameters:typeof routing?.require_parameters==="boolean"?routing.require_parameters:undefined,
      zeroDataRetention:typeof routing?.zdr==="boolean"?routing.zdr:undefined,
      dataCollection:routing?.data_collection==="allow"||routing?.data_collection==="deny"?routing.data_collection:undefined
    },
    elapsedMs
  };
}

function diagnosticRequestIds(headers:Headers):ModelGatewayDiagnostic["requestIds"] {
  const requestIds:ModelGatewayDiagnostic["requestIds"]={};
  for (const name of ["x-request-id","x-openrouter-request-id","cf-ray"] as const) {
    const value=sanitizedDiagnosticText(headers.get(name),200);
    if (value) requestIds[name]=value;
  }
  return requestIds;
}

function stringArray(value:unknown):string[]|undefined {
  return Array.isArray(value) && value.every((entry)=>typeof entry==="string") ? value : undefined;
}

function sanitizedDiagnosticText(value:unknown,maxLength:number):string|undefined {
  if (typeof value!=="string" && typeof value!=="number") return undefined;
  const sanitized=String(value)
    .replace(/bearer\s+[^\s,;]+/gi,"Bearer [REDACTED]")
    .replace(/\bsk-(?:or-v1-)?[a-z0-9_-]{12,}\b/gi,"[REDACTED]")
    .replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim();
  return sanitized ? sanitized.slice(0,maxLength) : undefined;
}

function unconfirmedModelUsage(started:number):ModelGatewayResult["usage"] {
  return {inputTokens:0,outputTokens:0,costUsd:0,latencyMs:Date.now()-started};
}

function policyAllows(capability:ModelCapability,deployment:ModelDeployment,policy?:ModelPolicy) {
  if ((deployment==="api")!==capability.externallyHosted) return false;
  if (!policy) return true;
  const providersAllowed=policy.allowedProviders.includes(capability.provider) &&
    (!capability.providerRouting || capability.providerRouting.endpoints.every((endpoint)=>policy.allowedProviders.includes(endpoint.tag)));
  return providersAllowed && policy.allowedDeployments.includes(deployment) &&
    policy.requiredPrivacyEligibility.every((entry)=>capability.privacyEligibility.includes(entry)) &&
    policy.allowedRetentionClasses.includes(capability.retentionClass) &&
    (!policy.allowedResidencies?.length || Boolean(capability.residency && policy.allowedResidencies.includes(capability.residency)));
}

export class OpenRouterGateway extends OpenAICompatibleGateway {
  constructor(options: OpenRouterGatewayOptions) {
    super({
      baseUrl: options.endpoint ?? "https://openrouter.ai/api/v1/chat/completions",
      apiKey: options.apiKey,
      id: "openrouter",
      fetcher: options.fetcher
    });
  }

  protected override translate(request:ModelRequest) { return buildOpenRouterRequest(request); }

  protected override planPayload(message:{content?:unknown;tool_calls?:unknown}):string|undefined {
    if (!Array.isArray(message.tool_calls)||message.tool_calls.length!==1) return undefined;
    const toolCall=message.tool_calls[0];
    if (!toolCall||typeof toolCall!=="object"||Array.isArray(toolCall)) return undefined;
    const functionCall=(toolCall as Record<string,unknown>).function;
    if (!functionCall||typeof functionCall!=="object"||Array.isArray(functionCall)) return undefined;
    const record=functionCall as Record<string,unknown>;
    return record.name===OPENROUTER_BOUNDED_PLAN_TOOL_NAME&&typeof record.arguments==="string"
      ? record.arguments : undefined;
  }

  async probeSerialized(serializedBody:string,timeoutMs:number,signal?:AbortSignal):Promise<OpenRouterProbeResult> {
    const payload=JSON.parse(serializedBody) as Record<string,unknown>;
    if (typeof payload.model!=="string" || !payload.model.trim()) throw new Error("OpenRouter probe requires a model");
    const started=Date.now();
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(new Error("model gateway diagnostic deadline exceeded")),timeoutMs);
    const abort=()=>controller.abort(signal?.reason);
    signal?.addEventListener("abort",abort,{once:true});
    if (signal?.aborted) abort();
    try {
      const response=await this.fetcher.call(globalThis,this.endpoint,{
        method:"POST",
        headers:{authorization:`Bearer ${this.options.apiKey??""}`,"content-type":"application/json"},
        body:serializedBody,
        signal:controller.signal
      });
      const responseText=await response.text();
      const elapsedMs=Date.now()-started;
      if (!response.ok) {
        const diagnostic=openRouterErrorDiagnosticFromPayload(response,responseText,payload,elapsedMs);
        throw new ModelGatewayError(
          `${this.id} diagnostic request failed: ${response.status}${diagnostic.message?`: ${diagnostic.message}`:""}`,
          unconfirmedModelUsage(started),{gateway:this.id,deployment:"api"},"provider_http_failure",false,diagnostic
        );
      }
      let responseBody:unknown;
      try { responseBody=JSON.parse(responseText); }
      catch {
        throw new ModelGatewayError(`${this.id} diagnostic returned invalid JSON`,unconfirmedModelUsage(started),
          {gateway:this.id,deployment:"api"},"malformed_response",false);
      }
      return {httpStatus:response.status,elapsedMs,response:responseBody,requestIds:diagnosticRequestIds(response.headers)};
    } catch (error) {
      if (error instanceof ModelGatewayError) throw error;
      throw new ModelGatewayError(
        `${this.id} diagnostic transport failed: ${error instanceof Error?error.message:String(error)}`,
        unconfirmedModelUsage(started),{gateway:this.id,deployment:"api"},
        controller.signal.aborted&&!signal?.aborted?"deadline_exceeded":signal?.aborted?"cancelled":"transport_failure",false
      );
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort",abort);
    }
  }

  protected override validateResult(request:ModelRequest,result:ModelGatewayResult) {
    const automatic=request.route.selectedCapability.providerRouting;
    const expectedProviderTag=request.route.selectedProvider.toLowerCase();
    const expectedProviderSlug=expectedProviderTag.split("/",1)[0];
    const actualProviderSlug=normalizedProviderIdentity(result.provider);
    const providerAccepted=automatic
      ? automatic.endpoints.some((endpoint)=>
          normalizedProviderIdentity(endpoint.tag).split("/",1)[0]===actualProviderSlug ||
          endpoint.reportedIdentities.some((identity)=>normalizedProviderIdentity(identity)===actualProviderSlug))
      : result.provider.toLowerCase()===expectedProviderTag || actualProviderSlug===expectedProviderSlug;
    if (result.model.toLowerCase()!==request.route.selectedModel.toLowerCase() ||
        !providerAccepted) {
      throw new ModelGatewayError(
        `${this.id} returned an unexpected model/provider identity: ${result.model} via ${result.provider}`,
        result.usage,
        {model:result.model,provider:result.provider,gateway:result.gateway,deployment:result.deployment},
        "provider_identity_mismatch"
      );
    }
  }
}

function normalizedProviderIdentity(value:string):string {
  return value.trim().toLowerCase().replace(/\s+/g,"-");
}

export class DeploymentModelGateway implements ModelGateway {
  readonly id = "deployment_router";

  constructor(
    private readonly mode: LlmDeploymentMode,
    private readonly gateways: Partial<Record<ModelDeployment, ModelGateway>>
  ) {
    if ((mode === "api" || mode === "hybrid") && !gateways.api) throw new Error(`${mode} mode requires an API gateway`);
    if ((mode === "self_hosted" || mode === "hybrid") && !gateways.self_hosted) {
      throw new Error(`${mode} mode requires a self-hosted gateway`);
    }
  }

  complete(request: ModelRequest): Promise<ModelGatewayResult> {
    const deployment = request.route.deployment;
    if (this.mode !== "hybrid" && deployment !== this.mode) {
      throw new Error(`${deployment} route is not permitted in ${this.mode} mode`);
    }
    const gateway = this.gateways[deployment];
    if (!gateway) throw new Error(`no ${deployment} ModelGateway is configured`);
    return gateway.complete(request);
  }
}

export function createModelGatewayFromEnv(
  environment: ModelGatewayEnvironment,
  fetcher?: typeof fetch
): DeploymentModelGateway {
  const mode = parseDeploymentMode(environment.DISTILLED_LLM_MODE ?? "api");
  const gateways: Partial<Record<ModelDeployment, ModelGateway>> = {};
  if (mode === "api" || mode === "hybrid") {
    const gateway = environment.DISTILLED_LLM_API_GATEWAY?.trim()
      || environment.DISTILLED_LLM_GATEWAY?.trim()
      || "openrouter";
    if (gateway !== "openrouter") throw new Error(`unsupported hosted API gateway: ${gateway}`);
    const apiKey = environment.OPENROUTER_API_KEY?.trim();
    if (!apiKey) throw new Error("OPENROUTER_API_KEY is required for api or hybrid mode");
    gateways.api = new OpenRouterGateway({ apiKey, fetcher });
  }
  if (mode === "self_hosted" || mode === "hybrid") {
    const baseUrl = environment.DISTILLED_SELF_HOSTED_BASE_URL?.trim();
    if (!baseUrl) throw new Error("DISTILLED_SELF_HOSTED_BASE_URL is required for self_hosted or hybrid mode");
    gateways.self_hosted = new OpenAICompatibleGateway({
      baseUrl,
      apiKey: environment.DISTILLED_SELF_HOSTED_API_KEY?.trim() || undefined,
      id: "openai_compatible",
      provider: "self_hosted",
      fetcher
    });
  }
  return new DeploymentModelGateway(mode, gateways);
}

function chatCompletionsEndpoint(baseUrl: string): string {
  const url = new URL(baseUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("self-hosted base URL must use http or https");
  }
  const path = url.pathname.replace(/\/$/, "");
  if (!path.endsWith("/chat/completions")) url.pathname = `${path}/chat/completions`;
  return url.toString();
}

export async function createContextManifestHash(input: {
  stable: StableModelInstructions;
  dynamic: DynamicModelContext;
  route: ModelRoute;
}): Promise<string> {
  return sha256Text(JSON.stringify(input));
}
