import {
  createClosedLoopWebOperatorLifecycle,
  createWebOperatorRuntimeHandler,
  type CloudflareBrowserBinding,
  type CloudflareBrowserLauncher,
  type DeterministicAcquisitionPort,
  type ClosedLoopWebOperatorLifecycle,
  type ClosedLoopAcquisitionRequest,
  type SourceAcquisitionRequest,
  type SourceAcquisitionResult
} from "@distilled/agent-runtime";
import { D1AgentRuntimeStore } from "./agent-runtime-store";
import { R2AgentArtifactStore } from "./agent-artifact-store";
import type { Env } from "./types";
import { D1WorkflowRepository } from "./web-operator-workflow-store";
import { D1SourceHighWaterStore } from "./source-acquisition-store";
import { ProductionSourceAcquisitionService, type ProductionSourceAcquisitionDependencies } from "@distilled/agent-runtime";

interface BrowserWorkerBinding {
  fetch: typeof fetch;
}

const WORKER_AGENT_LEASE_TTL_MS=30_000;
const DEFAULT_MODEL_CALL_TIMEOUT_MS=45_000;
const DEFAULT_RUN_SETTLEMENT_RESERVE_MS=5_000;

export function createWorkerWebOperatorRuntimeHandler(env: Env) {
  const runtimeToken = env.WEB_OPERATOR_RUNTIME_TOKEN?.trim();
  if (!runtimeToken) throw new Error("WEB_OPERATOR_RUNTIME_TOKEN is required for Web Operator runtime processing");
  const timing=workerRuntimeTiming(env);
  return createWebOperatorRuntimeHandler({
    store: new D1AgentRuntimeStore(env.DB),
    artifacts: new R2AgentArtifactStore(env.RAW_ARCHIVE),
    environment: env as unknown as Record<string, string | undefined>,
    runtimeToken,
    cloudflareBrowser: workerCloudflareBrowser(env),
    leaseTtlMs:WORKER_AGENT_LEASE_TTL_MS,
    ...timing,
    workerIdFactory: () => "worker-web-operator-runtime"
  });
}

export function createWorkerClosedLoopWebOperatorLifecycle(
  env: Env,
  options: {
    deterministicAcquisition?: Partial<Record<DeterministicAcquisitionPort["method"], DeterministicAcquisitionPort>>;
  } = {}
) {
  const store = new D1AgentRuntimeStore(env.DB);
  const workflowStore = new D1WorkflowRepository(env.DB);
  const timing=workerRuntimeTiming(env);
  return createClosedLoopWebOperatorLifecycle({
    store,
    artifacts: new R2AgentArtifactStore(env.RAW_ARCHIVE),
    environment: env as unknown as Record<string, string | undefined>,
    cloudflareBrowser: workerCloudflareBrowser(env),
    workflowStore,
    acquisitionFailures: workflowStore,
    deterministicAcquisition: options.deterministicAcquisition,
    softwareVersion: "distilled-worker@0.1.0",
    toolSchemaVersion: "web-operator-tools@1",
    leaseTtlMs:WORKER_AGENT_LEASE_TTL_MS,
    ...timing,
    workerIdFactory: () => "worker-closed-loop-web-operator"
  });
}


/** Worker composition root for generic bounded source acquisition. Stage adapters are injected
 * by the source registry; persistence and workflow lookup are always durable Worker stores. */
export function createWorkerProductionSourceAcquisitionService(
  env: Env,
  dependencies: Omit<ProductionSourceAcquisitionDependencies, "highWater" | "lookupActiveWorkflow"> & {
    tenantId: string;
    ownerId: string;
    executeActiveWorkflow: (input: { resourceId: string; request: import("@distilled/agent-runtime").SourceAcquisitionRequest; workflow: import("@distilled/agent-runtime").WorkflowCandidate }) => Promise<import("@distilled/agent-runtime").AcquisitionStageOutcome>;
  }
) {
  const workflowStore = new D1WorkflowRepository(env.DB);
  const highWater = new D1SourceHighWaterStore(env.DB, dependencies.tenantId);
  return new ProductionSourceAcquisitionService({
    ...dependencies,
    highWater,
    lookupActiveWorkflow: async ({ resourceId }) => {
      const active = await workflowStore.getActiveWorkflow(resourceId);
      if (!active) return undefined;
      return {
        id: active.id,
        version: active.version,
        execute: async (request) => dependencies.executeActiveWorkflow({ resourceId, request, workflow: active })
      };
    }
  });
}

export function createWorkerLifecycleBackedSourceAcquisitionService(
  env: Env,
  options: {
    tenantId: string;
    ownerId: string;
    resourceId: string;
    lifecycle: ClosedLoopWebOperatorLifecycle;
    buildClosedLoopRequest: (request: SourceAcquisitionRequest) => ClosedLoopAcquisitionRequest;
  }
) {
  const run = async (request: SourceAcquisitionRequest): Promise<{ outcome: Awaited<ReturnType<ClosedLoopWebOperatorLifecycle["acquire"]>>; runId: string }> => {
    const outcome = await options.lifecycle.acquire(options.buildClosedLoopRequest(request), new Date(request.acquisitionAsOf ?? Date.now()));
    const runId = "run" in outcome && outcome.run ? outcome.run.runId : `source_${crypto.randomUUID()}`;
    return { outcome, runId };
  };
  const toResult = (request: SourceAcquisitionRequest, value: Awaited<ReturnType<ClosedLoopWebOperatorLifecycle["acquire"]>>, workflowId?: string, workflowVersion?: number): SourceAcquisitionResult | undefined => {
    if (!("acquiredContent" in value) || !value.acquiredContent) return undefined;
    const item = value.acquiredContent;
    return {
      items: [{ sourceResource: request.source.canonicalSourceUrl ?? request.source.resourceLocator ?? item.canonicalUrl, canonicalItemUrl: item.canonicalUrl, title: item.title, text: item.body, publishedAt: item.publisherTimestamp, originalSourceReference: item.canonicalUrl, acquisitionEvidence: { acceptanceId: item.acceptanceId, observationId: item.observationId } }],
      requestedWindow: request.window,
      effectiveWindow: request.window,
      acquisitionAsOf: request.acquisitionAsOf ?? new Date().toISOString(),
      coverage: { newestObservedTimestamp: item.publisherTimestamp, oldestObservedTimestamp: item.publisherTimestamp, rangeCovered: false, truncated: true, stopReason: "SOURCE_PAGINATION_EXHAUSTED" },
      continuation: { pageCount: 1, scrollCount: 0, noProgressCount: 0, uniqueCanonicalIds: 0, uniqueCanonicalUrls: 1 },
      provenance: { workflowId, workflowVersion, mechanism: "web_operator" }
    };
  };
  const execute = async (request: SourceAcquisitionRequest, workflow: { id: string; version: number }) => {
    const { outcome } = await run(request);
    const result = toResult(request, outcome, workflow.id, workflow.version);
    return result ? { stage: "BROWSER_WORKFLOW" as const, status: "SUCCESS" as const, result } : { stage: "BROWSER_WORKFLOW" as const, status: "STRUCTURAL_FAILURE" as const, reason: "deterministic acquisition did not produce content" };
  };
  return createWorkerProductionSourceAcquisitionService(env, {
    tenantId: options.tenantId,
    ownerId: options.ownerId,
    executeActiveWorkflow: async ({ request, workflow }) => execute(request, workflow),
    structured: async () => ({ stage: "STRUCTURED" as const, status: "UNSUPPORTED" as const }),
    http: async () => ({ stage: "HTTP" as const, status: "INSUFFICIENT" as const }),
    webOperator: async (request) => {
      const { outcome, runId } = await run(request);
      const workflow = "workflow" in outcome ? outcome.workflow : undefined;
      if (!workflow) throw new Error("Web Operator did not produce a deterministic workflow");
      const candidate = { id: workflow.id, version: workflow.version, state: "CANDIDATE" as const, execute: async (next: SourceAcquisitionRequest) => execute(next, workflow) };
      return { runId, modelCalls: outcome.modelCalls, browserOperations: 0, candidate, validate: async () => ({ ...candidate, state: "VALIDATED" as const }), activate: async () => ({ ...candidate, state: "ACTIVE" as const }) };
    }
  });
}
export function workerCloudflareBrowser(
  env: Pick<Env, "DISTILLED_BROWSER_BACKEND" | "BROWSER">,
  launcher: CloudflareBrowserLauncher = cloudflarePlaywrightLaunch
): {
  binding: CloudflareBrowserBinding;
  launch: CloudflareBrowserLauncher;
} | undefined {
  if (env.DISTILLED_BROWSER_BACKEND?.trim().toLowerCase() !== "cloudflare") return undefined;
  if (!env.BROWSER) throw new Error("DISTILLED_BROWSER_BACKEND=cloudflare requires the BROWSER binding");
  return {
    binding: env.BROWSER as CloudflareBrowserBinding,
    launch: launcher
  };
}

const cloudflarePlaywrightLaunch: CloudflareBrowserLauncher = async (binding, policy) => {
  const { launch } = await import("@cloudflare/playwright");
  return await launch(binding as BrowserWorkerBinding,{
    guardrails:{allowedDomains:policy.allowedDomains}
  }) as unknown as Awaited<ReturnType<CloudflareBrowserLauncher>>;
};

export function workerRuntimeTiming(env:Pick<Env,"DISTILLED_MODEL_CALL_TIMEOUT_MS"|"DISTILLED_RUN_SETTLEMENT_RESERVE_MS">) {
  return {
    modelCallTimeoutMs:runtimeDuration(env.DISTILLED_MODEL_CALL_TIMEOUT_MS,DEFAULT_MODEL_CALL_TIMEOUT_MS,"DISTILLED_MODEL_CALL_TIMEOUT_MS"),
    runSettlementReserveMs:runtimeDuration(env.DISTILLED_RUN_SETTLEMENT_RESERVE_MS,DEFAULT_RUN_SETTLEMENT_RESERVE_MS,"DISTILLED_RUN_SETTLEMENT_RESERVE_MS",0)
  };
}

function runtimeDuration(value:string|undefined,fallback:number,name:string,minimum=1_000) {
  if (value===undefined||value.trim()==="") return fallback;
  const parsed=Number(value);
  if (!Number.isInteger(parsed)||parsed<minimum) throw new Error(`${name} must be an integer of at least ${minimum} milliseconds`);
  return parsed;
}
