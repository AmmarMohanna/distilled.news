import type { CandidateIdentity, ModelCapability, ModelRoutingConfig } from "./contracts";
import { createConfiguredWebOperatorHttpHandler, type CoordinatorOptions } from "./runtime";
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
    leaseTtlMs: input.leaseTtlMs
  });
}

export function resolvePublicCandidateModelRouting(input: {
  environment: ModelGatewayEnvironment;
  baseModelRouting?: ModelRoutingConfig;
}): ModelRoutingConfig {
  return modelRoutingConfigFromEnv(input.environment, input.baseModelRouting);
}
