import {
  createClosedLoopWebOperatorLifecycle,
  createWebOperatorRuntimeHandler,
  type CloudflareBrowserBinding,
  type CloudflareBrowserLauncher,
  type DeterministicAcquisitionPort,
  type SourceAcquisitionRequest,
} from "@distilled/agent-runtime";
import { DeterministicSourceBrowserWorkflowExecutor, PublicSourceStages, type AcquisitionStageOutcome, type WebOperatorDiscovery } from "@distilled/agent-runtime";
import { D1AgentRuntimeStore } from "./agent-runtime-store";
import { R2AgentArtifactStore } from "./agent-artifact-store";
import type { Env } from "./types";
import { D1WorkflowRepository } from "./web-operator-workflow-store";
import { D1SourceHighWaterStore } from "./source-acquisition-store";
import { ProductionSourceAcquisitionService, type ProductionSourceAcquisitionDependencies } from "@distilled/agent-runtime";
import { ContainerSourceBrowserPort } from "./container-source-browser-port";
import { WorkerPublicSourceFetch } from "./public-source-fetch";
import { ContainerPublicWebOperatorBrowser } from "./container-web-operator-browser";

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

export function createWorkerContainerPublicWebOperatorLifecycle(env: Env, input: { ownerId: string; resourceId: string; sourceUrl: string; operationBudget: number }) {
  const browser = new ContainerPublicWebOperatorBrowser(env, input.ownerId, input.resourceId, input.sourceUrl, input.operationBudget);
  const store = new D1AgentRuntimeStore(env.DB);
  const workflowStore = new D1WorkflowRepository(env.DB);
  return createClosedLoopWebOperatorLifecycle({
    store, artifacts: new R2AgentArtifactStore(env.RAW_ARCHIVE), workflowStore, acquisitionFailures: workflowStore,
    environment: env as unknown as Record<string, string | undefined>,
    browserPorts: { executor: browser, structured: browser, visual: browser },
    softwareVersion: "distilled-worker@0.1.0", toolSchemaVersion: "web-operator-tools@1",
    leaseTtlMs: WORKER_AGENT_LEASE_TTL_MS, ...workerRuntimeTiming(env), workerIdFactory: () => "worker-container-public-web-operator"
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
    browserWorkflow: dependencies.browserWorkflow ?? (async (request, workflow) => workflow ? workflow.execute(request) : { stage: "BROWSER_WORKFLOW", status: "UNSUPPORTED" }),
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

/** Production source-neutral stage composition. A workflow may only execute a validated source plan. */
export function createWorkerPublicSourceAcquisitionService(
  env: Env,
  options: { tenantId: string; ownerId: string; resourceId: string; runId: string; sourceUrl: string; fetcher?: typeof fetch; webOperator?: (request: SourceAcquisitionRequest) => Promise<WebOperatorDiscovery | AcquisitionStageOutcome> }
) {
  const stages = new PublicSourceStages(new WorkerPublicSourceFetch(options.sourceUrl, options.fetcher));
  const executeActiveWorkflow = async (input: { request: SourceAcquisitionRequest; workflow: import("@distilled/agent-runtime").WorkflowCandidate }): Promise<AcquisitionStageOutcome> =>
    executeWorkerSourcePlan(env, { ...options, request: input.request, workflow: input.workflow });
  return createWorkerProductionSourceAcquisitionService(env, {
    tenantId: options.tenantId,
    ownerId: options.ownerId,
    executeActiveWorkflow: async ({ request, workflow }) => executeActiveWorkflow({ request, workflow }),
    structured: (request) => stages.structured(request),
    http: (request) => stages.http(request),
    webOperator: options.webOperator
  });
}

export async function executeWorkerSourcePlan(env: Env, input: { tenantId: string; ownerId: string; resourceId: string; runId: string; request: SourceAcquisitionRequest; workflow: import("@distilled/agent-runtime").WorkflowCandidate }): Promise<AcquisitionStageOutcome> {
  if (!input.workflow.sourceAcquisition) return { stage: "BROWSER_WORKFLOW", status: "STRUCTURAL_FAILURE", reason: "ACTIVE workflow lacks a validated source acquisition plan" };
  try {
    const port = new ContainerSourceBrowserPort(env, { tenantId: input.tenantId, ownerId: input.ownerId, resourceId: input.resourceId, runId: input.runId, generation: input.workflow.version });
    const result = await new DeterministicSourceBrowserWorkflowExecutor(port).execute(input.request, input.workflow.sourceAcquisition);
    return { stage: "BROWSER_WORKFLOW", status: "SUCCESS", result: { ...result, provenance: { ...result.provenance, workflowId: input.workflow.id, workflowVersion: input.workflow.version } } };
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? (error as { code?: unknown }).code : undefined;
    return code === "BRIDGE_NETWORK_POLICY_DENIED"
      ? { stage: "BROWSER_WORKFLOW", status: "POLICY_DENIED", reason: "browser network policy denied" }
      : { stage: "BROWSER_WORKFLOW", status: "STRUCTURAL_FAILURE", reason: "deterministic browser workflow failed" };
  }
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
