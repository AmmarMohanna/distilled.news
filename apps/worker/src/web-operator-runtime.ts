import {
  createClosedLoopWebOperatorLifecycle,
  createWebOperatorRuntimeHandler,
  type CloudflareBrowserBinding,
  type CloudflareBrowserLauncher,
  type DeterministicAcquisitionPort
} from "@distilled/agent-runtime";
import { D1AgentRuntimeStore } from "./agent-runtime-store";
import { R2AgentArtifactStore } from "./agent-artifact-store";
import type { Env } from "./types";
import { D1WorkflowRepository } from "./web-operator-workflow-store";

interface BrowserWorkerBinding {
  fetch: typeof fetch;
}

export function createWorkerWebOperatorRuntimeHandler(env: Env) {
  const runtimeToken = env.WEB_OPERATOR_RUNTIME_TOKEN?.trim();
  if (!runtimeToken) throw new Error("WEB_OPERATOR_RUNTIME_TOKEN is required for Web Operator runtime processing");
  return createWebOperatorRuntimeHandler({
    store: new D1AgentRuntimeStore(env.DB),
    artifacts: new R2AgentArtifactStore(env.RAW_ARCHIVE),
    environment: env as unknown as Record<string, string | undefined>,
    runtimeToken,
    cloudflareBrowser: workerCloudflareBrowser(env),
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
    workerIdFactory: () => "worker-closed-loop-web-operator"
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
