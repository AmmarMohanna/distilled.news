import type { ModelRole } from "./contracts";

export interface EvaluationRuntimeIdentity {
  softwareVersion: string;
  configurationVersion: string;
  toolSchemaVersion: string;
  workflowVersion?: string;
}

export interface AcquisitionEvaluationMetrics {
  runId: string;
  resourceId: string;
  candidateId?: string;
  modelRole?: ModelRole;
  resolvedModel?: string;
  resolvedProvider?: string;
  resolvedDeployment?: string;
  acquisitionSucceeded: boolean;
  correctCandidate: boolean;
  modelCalls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
  toolActions: number;
  replans: number;
  strongModelEscalations: number;
  visualUsages: number;
  workflowCompilationSucceeded: boolean;
  deterministicReplaySucceeded: boolean;
  repairSucceeded: boolean;
  verifierRejections: number;
  policyDenials: number;
  effectUnknowns: number;
  challenges: number;
  runtime: EvaluationRuntimeIdentity;
  recordedAt: string;
}

export interface EvaluationSink {
  recordMetrics(metrics: AcquisitionEvaluationMetrics): Promise<void>;
}

export class MemoryEvaluationSink implements EvaluationSink {
  readonly metrics: AcquisitionEvaluationMetrics[] = [];

  async recordMetrics(metrics: AcquisitionEvaluationMetrics): Promise<void> {
    this.metrics.push(structuredClone(metrics));
  }
}

export function emptyAcquisitionMetrics(input: {
  runId: string;
  resourceId: string;
  candidateId?: string;
  runtime: EvaluationRuntimeIdentity;
  now?: string;
}): AcquisitionEvaluationMetrics {
  return {
    runId: input.runId,
    resourceId: input.resourceId,
    candidateId: input.candidateId,
    acquisitionSucceeded: false,
    correctCandidate: false,
    modelCalls: 0,
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
    latencyMs: 0,
    toolActions: 0,
    replans: 0,
    strongModelEscalations: 0,
    visualUsages: 0,
    workflowCompilationSucceeded: false,
    deterministicReplaySucceeded: false,
    repairSucceeded: false,
    verifierRejections: 0,
    policyDenials: 0,
    effectUnknowns: 0,
    challenges: 0,
    runtime: structuredClone(input.runtime),
    recordedAt: input.now ?? new Date().toISOString()
  };
}
