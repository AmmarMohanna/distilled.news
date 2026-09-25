import type { SourceAcquisitionRequest, SourceAcquisitionResult } from "./temporal-acquisition";
import type { ActiveWorkflowHandle, CandidateWorkflowHandle, WebOperatorDiscovery } from "./source-acquisition-orchestrator";
import type { BrowserAllocation } from "./browser";
import { normalizeHttpsOrigin } from "./origin";

export interface PublicAcquisitionCapability {
  runId: string;
  tenantId: string;
  ownerId: string;
  resourceId: string;
  browserGeneration: number;
  allowedOrigins: string[];
  siteKind: "PUBLIC";
  readOnly: true;
  expiresAt: string;
}

export interface PublicAcquisitionCapabilityFactory {
  create(input: { request: SourceAcquisitionRequest; runId: string }): Promise<PublicAcquisitionCapability>;
}

export interface WebOperatorDiscoveryPort {
  discover(input: { request: SourceAcquisitionRequest; capability: PublicAcquisitionCapability }): Promise<{ candidate: CandidateWorkflowHandle; runId: string; modelCalls: number; browserOperations: number }>;
}

export interface WorkflowLifecyclePort {
  validate(candidate: CandidateWorkflowHandle): Promise<CandidateWorkflowHandle>;
  promote(candidate: CandidateWorkflowHandle): Promise<ActiveWorkflowHandle>;
}

export interface DeterministicWorkflowExecutionPort {
  execute(input: { workflow: ActiveWorkflowHandle; request: SourceAcquisitionRequest; capability: PublicAcquisitionCapability }): Promise<SourceAcquisitionResult>;
}

/** Production bridge: WebOperatorCoordinator → lifecycle validator/promoter → deterministic executor. */
export class ProductionWebOperatorAcquisitionAdapter {
  constructor(private readonly options: {
    capabilityFactory: PublicAcquisitionCapabilityFactory;
    discovery: WebOperatorDiscoveryPort;
    lifecycle: WorkflowLifecyclePort;
    executor: DeterministicWorkflowExecutionPort;
    runId?: () => string;
  }) {}

  async discover(request: SourceAcquisitionRequest): Promise<WebOperatorDiscovery & { runId: string; modelCalls: number; browserOperations: number }> {
    const runId = this.options.runId?.() ?? crypto.randomUUID();
    const capability = await this.options.capabilityFactory.create({ request, runId });
    const discovered = await this.options.discovery.discover({ request, capability });
    const validated = await this.options.lifecycle.validate(discovered.candidate);
    const active = await this.options.lifecycle.promote(validated);
    return {
      runId: discovered.runId,
      modelCalls: discovered.modelCalls,
      browserOperations: discovered.browserOperations,
      candidate: discovered.candidate,
      validate: async () => validated,
      activate: async () => active
    };
  }

  async execute(request: SourceAcquisitionRequest, workflow: ActiveWorkflowHandle, runId: string): Promise<SourceAcquisitionResult> {
    const capability = await this.options.capabilityFactory.create({ request, runId });
    return this.options.executor.execute({ workflow, request, capability });
  }
}

export function publicCapabilityFromAllocation(input: { request: SourceAcquisitionRequest; allocation: BrowserAllocation; tenantId: string; ownerId: string; expiresAt: string }): PublicAcquisitionCapability {
  const source = input.request.source.canonicalSourceUrl ?? input.request.source.resourceLocator;
  if (!source) throw new Error("public acquisition source origin is required");
  const origin = normalizeHttpsOrigin(source);
  return { runId: input.allocation.runId, tenantId: input.tenantId, ownerId: input.ownerId, resourceId: source, browserGeneration: input.allocation.generation, allowedOrigins: [origin], siteKind: "PUBLIC", readOnly: true, expiresAt: input.expiresAt };
}
