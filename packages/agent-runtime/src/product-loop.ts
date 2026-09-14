import type { CandidateIdentity, ModelCapability, ModelRoutingConfig } from "./contracts";
import { createConfiguredWebOperatorHttpHandler, type CoordinatorOptions } from "./runtime";
import { WebOperatorAcquisitionStrategy, type AdmittedRun } from "./admission";
import { selectBrowserBackend, type BrowserBackendEnvironment, type CloudflareBrowserBinding, type CloudflareBrowserLauncher } from "./browser";
import { createModelGatewayFromEnv, modelRoutingConfigFromEnv, type ModelGatewayEnvironment } from "./model";
import type { RuntimeStore } from "./persistence";
import type { ArtifactStore } from "./observations";
import type { RunPolicySnapshot } from "./policy";
import type { AcquisitionFailureRepository } from "./acquisition-router";
import { ClosedLoopWebOperatorLifecycle, type DeterministicAcquisitionPort } from "./closed-loop";
import type { WorkflowRepository } from "./workflow";

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

export interface ClosedLoopWebOperatorAssemblyInput extends Omit<WebOperatorRuntimeAssemblyInput, "runtimeToken"> {
  workflowStore: WorkflowRepository;
  acquisitionFailures?: AcquisitionFailureRepository;
  deterministicAcquisition?: Partial<Record<DeterministicAcquisitionPort["method"], DeterministicAcquisitionPort>>;
  softwareVersion: string;
  toolSchemaVersion: string;
  minimumStructuralEvidence?: number;
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

export function createClosedLoopWebOperatorLifecycle(input: ClosedLoopWebOperatorAssemblyInput): ClosedLoopWebOperatorLifecycle {
  const browser = selectBrowserBackend({
    environment: input.environment,
    cloudflare: input.cloudflareBrowser
  });
  return new ClosedLoopWebOperatorLifecycle({
    runtimeStore: input.store,
    workflowStore: input.workflowStore,
    acquisitionFailures: input.acquisitionFailures,
    artifacts: input.artifacts,
    browserExecutor: browser.executor,
    structured: browser.executor,
    visual: browser.executor,
    modelGateway: createModelGatewayFromEnv(input.environment, input.gatewayFetcher),
    softwareVersion: input.softwareVersion,
    toolSchemaVersion: input.toolSchemaVersion,
    deterministicAcquisition: input.deterministicAcquisition,
    minimumStructuralEvidence: input.minimumStructuralEvidence,
    workerIdFactory: input.workerIdFactory,
    leaseTtlMs:input.leaseTtlMs
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
