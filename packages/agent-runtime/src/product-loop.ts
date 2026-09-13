import type { CandidateIdentity, ModelCapability, ModelRoutingConfig } from "./contracts";
import { createConfiguredWebOperatorHttpHandler, type CoordinatorOptions } from "./runtime";
import { WebOperatorAcquisitionStrategy, type AdmittedRun } from "./admission";
import { selectBrowserBackend, type BrowserBackendEnvironment, type CloudflareBrowserBinding, type CloudflareBrowserLauncher } from "./browser";
import { modelRoutingConfigFromEnv, type ModelGatewayEnvironment } from "./model";
import type { RuntimeStore } from "./persistence";
import type { ArtifactStore } from "./observations";
import type { RunPolicySnapshot } from "./policy";

export interface PublicCandidateAcquisitionRequest {
  tenantId: string;
  resourceId: string;
  idempotencyKey: string;
  objective: string;
  candidate: CandidateIdentity;
  policy: RunPolicySnapshot;
  modelCapabilities: ModelCapability[];
  baseModelRouting?: ModelRoutingConfig;
}

export interface WebOperatorRuntimeAssemblyInput {
  store: RuntimeStore;
  artifacts: ArtifactStore;
  environment: ModelGatewayEnvironment & BrowserBackendEnvironment;
  runtimeToken: string;
  cloudflareBrowser?: {
    binding?: CloudflareBrowserBinding;
    launch?: CloudflareBrowserLauncher;
  };
  stableInstructions?: CoordinatorOptions["stableInstructions"];
  leaseTtlMs?: number;
  gatewayFetcher?: typeof fetch;
  workerIdFactory?: () => string;
}

export function createWebOperatorRuntimeHandler(input: WebOperatorRuntimeAssemblyInput) {
  const browser = selectBrowserBackend({
    environment: input.environment,
    cloudflare: input.cloudflareBrowser
  });
  return createConfiguredWebOperatorHttpHandler({
    store: input.store,
    artifacts: input.artifacts,
    browserExecutor: browser.executor,
    structured: browser.executor,
    visual: browser.executor,
    environment: input.environment,
    runtimeToken: input.runtimeToken,
    stableInstructions: input.stableInstructions,
    leaseTtlMs: input.leaseTtlMs,
    gatewayFetcher: input.gatewayFetcher,
    workerIdFactory: input.workerIdFactory
  });
}

export async function admitPublicCandidateAcquisition(input: {
  store: RuntimeStore;
  request: PublicCandidateAcquisitionRequest;
  enabled: boolean;
  now?: Date;
  environment?: ModelGatewayEnvironment;
}): Promise<AdmittedRun> {
  const strategy = new WebOperatorAcquisitionStrategy(input.store);
  const modelRouting = input.environment
    ? resolvePublicCandidateModelRouting({
        environment: input.environment,
        baseModelRouting: input.request.baseModelRouting
      })
    : input.request.baseModelRouting;
  if (!modelRouting) throw new Error("public candidate acquisition requires model routing configuration");
  return strategy.admitKnownCandidate({
    tenantId: input.request.tenantId,
    resourceId: input.request.resourceId,
    idempotencyKey: input.request.idempotencyKey,
    objective: input.request.objective,
    enabled: input.enabled,
    candidate: input.request.candidate,
    policy: input.request.policy,
    modelCapabilities: input.request.modelCapabilities,
    modelRouting
  }, input.now);
}

export function resolvePublicCandidateModelRouting(input: {
  environment: ModelGatewayEnvironment;
  baseModelRouting?: ModelRoutingConfig;
}): ModelRoutingConfig {
  return modelRoutingConfigFromEnv(input.environment, input.baseModelRouting);
}
