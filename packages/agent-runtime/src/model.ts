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
    readonly observedIdentity?:{model?:string;provider?:string;gateway?:string;deployment?:ModelDeployment}
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
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["version", "actions"],
            properties: {
              version: { const: 1 },
              rationale: { type: "string", maxLength: 400 },
              actions: {
                type: "array",
                minItems: 1,
                maxItems: 5,
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["tool", "arguments"],
                  properties: {
                    tool: { type: "string", enum: [...TOOL_NAMES] },
                    arguments: { type: "object" },
                    expected: {
                      type: "object",
                      description: "Optional deterministic guards. pageRevision is a pre-action stale-plan guard; URL and challenge fields are postconditions.",
                      additionalProperties: false,
                      properties: {
                        pageRevision: {
                          const: currentPageRevision,
                          description: "If present, it must be the exact current PageState.pageRevision. Never predict a future revision."
                        },
                        urlIncludes: { type: "string" },
                        challengeState: { type: "string" }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    })
  };
}

export function buildOpenRouterRequest(request: ModelRequest): RequestInit & { body: string } {
  const translated=buildOpenAICompatibleRequest(request);
  const body=JSON.parse(translated.body) as Record<string,unknown>;
  body.provider={
    only:[request.route.selectedProvider],
    allow_fallbacks:false,
    require_parameters:true,
    data_collection:request.route.selectedCapability.retentionClass==="standard"?"allow":"deny",
    ...(request.route.selectedCapability.retentionClass==="zero_data_retention"?{zdr:true}:{})
  };
  return {...translated,body:JSON.stringify(body)};
}

export class OpenAICompatibleGateway implements ModelGateway {
  readonly id: string;
  private readonly endpoint: string;
  private readonly fetcher: typeof fetch;

  constructor(private readonly options: OpenAICompatibleGatewayOptions) {
    this.id = options.id ?? "openai_compatible";
    this.endpoint = chatCompletionsEndpoint(options.baseUrl);
    this.fetcher = options.fetcher ?? fetch;
  }

  protected translate(request:ModelRequest) { return buildOpenAICompatibleRequest(request); }
  protected validateResult(request:ModelRequest,result:ModelGatewayResult) {
    if (result.model.toLowerCase()!==request.route.selectedModel.toLowerCase() ||
        result.provider.toLowerCase()!==request.route.selectedProvider.toLowerCase()) {
      throw new ModelGatewayError(
        `${this.id} returned an unexpected model/provider identity: ${result.model} via ${result.provider}`,
        result.usage,
        {model:result.model,provider:result.provider,gateway:result.gateway,deployment:result.deployment}
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
    let response:Response;
    try { response = await this.fetcher.call(globalThis, this.endpoint, { ...translated, headers,signal:controller.signal }); }
    catch (error) {
      throw new ModelGatewayError(`${this.id} transport failed: ${error instanceof Error?error.message:String(error)}`,undefined,gatewayIdentity);
    }
    finally { clearTimeout(timeout); request.signal?.removeEventListener("abort",abort); }
    if (!response.ok) throw new ModelGatewayError(`${this.id} request failed: ${response.status}`,undefined,gatewayIdentity);
    let body:{
      id: string;
      model: string;
      provider?: string;
      choices: Array<{ message: { content: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
    };
    try { body=await response.json() as typeof body; }
    catch { throw new ModelGatewayError(`${this.id} returned invalid JSON`,undefined,gatewayIdentity); }
    if (!body || typeof body!=="object" || typeof body.id!=="string" || typeof body.model!=="string" || !Array.isArray(body.choices)) {
      throw new ModelGatewayError(`${this.id} returned an invalid response envelope`,undefined,{
        ...gatewayIdentity,
        model:typeof body?.model==="string"?body.model:undefined,
        provider:typeof body?.provider==="string"?body.provider:undefined
      });
    }
    const usage={
      inputTokens: body.usage?.prompt_tokens ?? 0,
      outputTokens: body.usage?.completion_tokens ?? 0,
      costUsd: body.usage?.cost ?? 0,
      latencyMs: Date.now() - started
    };
    const observedIdentity={...gatewayIdentity,model:body.model,provider:body.provider??request.route.selectedProvider};
    const content = body.choices?.[0]?.message.content;
    if (!content) throw new ModelGatewayError(`${this.id} returned no completed message`,usage,observedIdentity);
    let plan:BoundedActionPlan;
    try { plan=boundedActionPlanSchema.parse(JSON.parse(content)) as BoundedActionPlan; }
    catch { throw new ModelGatewayError(`${this.id} returned an invalid bounded action plan`,usage,observedIdentity); }
    const result:ModelGatewayResult = {
      plan,
      usage,
      provider: observedIdentity.provider,
      model: body.model,
      responseId: body.id,
      gateway:this.id,
      deployment:request.route.deployment
    };
    this.validateResult(request,result);
    return result;
  }
}

function policyAllows(capability:ModelCapability,deployment:ModelDeployment,policy?:ModelPolicy) {
  if ((deployment==="api")!==capability.externallyHosted) return false;
  if (!policy) return true;
  return policy.allowedProviders.includes(capability.provider) && policy.allowedDeployments.includes(deployment) &&
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
  protected override validateResult(request:ModelRequest,result:ModelGatewayResult) {
    const expectedProviderTag=request.route.selectedProvider.toLowerCase();
    const expectedProviderSlug=expectedProviderTag.split("/",1)[0];
    const actualProviderSlug=result.provider.trim().toLowerCase().replace(/\s+/g,"-");
    if (result.model.toLowerCase()!==request.route.selectedModel.toLowerCase() ||
        (result.provider.toLowerCase()!==expectedProviderTag && actualProviderSlug!==expectedProviderSlug)) {
      throw new ModelGatewayError(
        `${this.id} returned an unexpected model/provider identity: ${result.model} via ${result.provider}`,
        result.usage,
        {model:result.model,provider:result.provider,gateway:result.gateway,deployment:result.deployment}
      );
    }
  }
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
