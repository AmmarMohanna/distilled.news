import { z } from "zod";
import {
  MODEL_ROLES,
  TOOL_NAMES,
  type AgentPageState,
  type BoundedActionPlan,
  type ModelCapability,
  type ModelRole,
  type ModelRoute,
  type ModelRoutingConfig
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
  visualInputs?: Array<{ observationId: string; dataUrl: string }>;
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
}

export interface ModelGateway {
  readonly id: string;
  complete(request: ModelRequest): Promise<ModelGatewayResult>;
}

export interface ModelRoutingEnvironment {
  DISTILLED_LLM_GATEWAY?: string;
  [key: string]: string | undefined;
}

export function modelRoutingConfigFromEnv(
  environment: ModelRoutingEnvironment,
  base: ModelRoutingConfig = { gateway: "openrouter", roles: {} }
): ModelRoutingConfig {
  const roles: ModelRoutingConfig["roles"] = { ...base.roles };
  for (const role of MODEL_ROLES) {
    const prefix = `DISTILLED_MODEL_ROLE_${role}`;
    const primary = environment[`${prefix}_PRIMARY`] ?? roles[role]?.primary;
    const fallbackJson = environment[`${prefix}_FALLBACKS_JSON`];
    let fallbacks = roles[role]?.fallbacks ?? [];
    if (fallbackJson !== undefined) {
      const parsed: unknown = JSON.parse(fallbackJson);
      if (!Array.isArray(parsed) || !parsed.every((value) => typeof value === "string")) {
        throw new Error(`${prefix}_FALLBACKS_JSON must be a JSON string array`);
      }
      fallbacks = parsed;
    }
    if (primary !== undefined) roles[role] = validateRoleRoute(role, { primary, fallbacks });
  }
  return {
    gateway: environment.DISTILLED_LLM_GATEWAY?.trim() || base.gateway || "openrouter",
    roles
  };
}

function validateRoleRoute(role: ModelRole, route: { primary: string; fallbacks: string[] }) {
  const chain = [route.primary, ...route.fallbacks].map((value) => value.trim());
  if (chain.some((value) => value.length === 0)) throw new Error(`${role} contains an empty model reference`);
  if (new Set(chain).size !== chain.length) throw new Error(`${role} contains duplicate model references`);
  return { primary: chain[0], fallbacks: chain.slice(1) };
}

export class ModelRouter {
  private readonly capabilities: Map<string, ModelCapability>;

  constructor(
    private readonly config: ModelRoutingConfig,
    capabilities: ModelCapability[]
  ) {
    this.capabilities = new Map(capabilities.map((capability) => [capability.modelRef, capability]));
  }

  resolve(input: {
    role: ModelRole;
    reason: string;
    required: Array<"toolCalling" | "vision" | "structuredOutput">;
    allowedProviders?: string[];
    policyConstraints?: string[];
  }): ModelRoute {
    return this.resolveCandidates(input)[0];
  }

  resolveCandidates(input: {
    role: ModelRole;
    reason: string;
    required: Array<"toolCalling" | "vision" | "structuredOutput">;
    allowedProviders?: string[];
    policyConstraints?: string[];
  }): ModelRoute[] {
    const configured = this.config.roles[input.role];
    if (!configured) throw new Error(`no model route configured for role ${input.role}`);
    const chain = [configured.primary, ...configured.fallbacks];
    const allowedProviders = input.allowedProviders ? new Set(input.allowedProviders) : undefined;
    const routes: ModelRoute[] = [];
    let filteredReason: string | undefined;
    for (const [index, modelRef] of chain.entries()) {
      const capability = this.capabilities.get(modelRef);
      const eligible =
        capability?.enabled &&
        (!allowedProviders || allowedProviders.has(capability.provider)) &&
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
        gateway: this.config.gateway || "openrouter",
        selectedModel: modelRef,
        selectedProvider: capability.provider,
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
      responseId: `scripted_${this.index}`
    };
  }
}

export interface OpenRouterGatewayOptions {
  apiKey: string;
  endpoint?: string;
  fetcher?: typeof fetch;
}

export function buildOpenRouterRequest(request: ModelRequest): RequestInit & { body: string } {
  const dynamicContent = request.visualInputs?.length
    ? [
        { type: "text", text: JSON.stringify(request.dynamic) },
        ...request.visualInputs.map((input) => ({ type: "image_url", image_url: { url: input.dataUrl } }))
      ]
    : JSON.stringify(request.dynamic);
  return {
    method: "POST",
    headers: {
      authorization: `Bearer __DISTILLED_OPENROUTER_KEY__`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: request.route.selectedModel,
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
                      additionalProperties: false,
                      properties: {
                        pageRevision: { type: "string" },
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

export class OpenRouterGateway implements ModelGateway {
  readonly id = "openrouter";
  private readonly endpoint: string;
  private readonly fetcher: typeof fetch;

  constructor(private readonly options: OpenRouterGatewayOptions) {
    this.endpoint = options.endpoint ?? "https://openrouter.ai/api/v1/chat/completions";
    this.fetcher = options.fetcher ?? fetch;
  }

  async complete(request: ModelRequest): Promise<ModelGatewayResult> {
    const started = Date.now();
    const translated = buildOpenRouterRequest(request);
    const headers = new Headers(translated.headers);
    headers.set("authorization", `Bearer ${this.options.apiKey}`);
    const response = await this.fetcher(this.endpoint, { ...translated, headers });
    if (!response.ok) throw new Error(`OpenRouter request failed: ${response.status}`);
    const body = (await response.json()) as {
      id: string;
      model: string;
      provider?: string;
      choices: Array<{ message: { content: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
    };
    const content = body.choices[0]?.message.content;
    if (!content) throw new Error("OpenRouter returned no completed message");
    return {
      plan: boundedActionPlanSchema.parse(JSON.parse(content)) as BoundedActionPlan,
      usage: {
        inputTokens: body.usage?.prompt_tokens ?? 0,
        outputTokens: body.usage?.completion_tokens ?? 0,
        costUsd: body.usage?.cost ?? 0,
        latencyMs: Date.now() - started
      },
      provider: body.provider ?? request.route.selectedProvider,
      model: body.model,
      responseId: body.id
    };
  }
}

export async function createContextManifestHash(input: {
  stable: StableModelInstructions;
  dynamic: DynamicModelContext;
  route: ModelRoute;
}): Promise<string> {
  return sha256Text(JSON.stringify(input));
}
