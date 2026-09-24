import { commitSourceHighWater, type SourceAcquisitionRequest, type SourceAcquisitionResult, type SourceHighWaterState, type SourceHighWaterStore } from "./temporal-acquisition";
import { SourceAcquisitionOrchestrator, type AcquisitionStageOutcome, type ActiveWorkflowHandle, type SourceAcquisitionOrchestrationResult } from "./source-acquisition-orchestrator";

export interface ProductionSourceAcquisitionInput {
  tenantId: string;
  ownerId: string;
  resourceId: string;
  source: SourceAcquisitionRequest["source"];
  window: SourceAcquisitionRequest["window"];
  limits: SourceAcquisitionRequest["limits"];
  filters?: SourceAcquisitionRequest["filters"];
  authentication?: SourceAcquisitionRequest["authentication"];
  acquisitionAsOf?: string;
}

export interface ProductionSourceAcquisitionDependencies {
  highWater: SourceHighWaterStore;
  lookupActiveWorkflow?: (input: { tenantId: string; ownerId: string; resourceId: string; source: SourceAcquisitionRequest["source"] }) => Promise<ActiveWorkflowHandle | undefined>;
  structured?: (request: SourceAcquisitionRequest) => Promise<AcquisitionStageOutcome>;
  http?: (request: SourceAcquisitionRequest) => Promise<AcquisitionStageOutcome>;
  browserWorkflow?: (request: SourceAcquisitionRequest, workflow?: ActiveWorkflowHandle) => Promise<AcquisitionStageOutcome>;
  webOperator?: (request: SourceAcquisitionRequest) => Promise<import("./source-acquisition-orchestrator").WebOperatorDiscovery | AcquisitionStageOutcome>;
}

export interface ProductionSourceAcquisitionResult extends SourceAcquisitionOrchestrationResult {
  request: SourceAcquisitionRequest;
  committedHighWater?: SourceHighWaterState;
}

/** Production composition root for generic bounded acquisition. It owns no site semantics. */
export class ProductionSourceAcquisitionService {
  constructor(private readonly dependencies: ProductionSourceAcquisitionDependencies) {}

  async acquire(input: ProductionSourceAcquisitionInput): Promise<ProductionSourceAcquisitionResult> {
    const request: SourceAcquisitionRequest = {
      source: input.source,
      window: input.window,
      filters: input.filters,
      limits: input.limits,
      authentication: input.authentication ?? "PUBLIC",
      acquisitionAsOf: input.acquisitionAsOf
    };
    const orchestrator = new SourceAcquisitionOrchestrator({
      structured: this.dependencies.structured,
      http: this.dependencies.http,
      browserWorkflow: this.dependencies.browserWorkflow,
      webOperator: this.dependencies.webOperator,
      lookupActiveWorkflow: async (source) => this.dependencies.lookupActiveWorkflow ? this.dependencies.lookupActiveWorkflow({ tenantId: input.tenantId, ownerId: input.ownerId, resourceId: input.resourceId, source }) : undefined
    });
    const outcome = await orchestrator.acquire(request);
    let committedHighWater: SourceHighWaterState | undefined;
    if (outcome.status === "SUCCESS" && outcome.result) committedHighWater = await commitSourceHighWater(this.dependencies.highWater, `${input.tenantId}:${input.resourceId}`, outcome.result);
    else {
      const key = `${input.tenantId}:${input.resourceId}`;
      const current = await this.dependencies.highWater.get(key) ?? { key };
      if (!current.lastSuccessfulBoundary || Date.parse(current.lastSuccessfulBoundary) < Date.parse(request.window.endTime)) {
        await this.dependencies.highWater.put({ ...current, unresolvedWindow: request.window });
      }
      committedHighWater = await this.dependencies.highWater.get(key);
    }
    return { ...outcome, request, committedHighWater };
  }
}
