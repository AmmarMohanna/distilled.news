import type { AgentRun, AgentRunBudgetLimits, ModelCapability, ModelRoutingConfig } from "./contracts";
import { makeId } from "./contracts";
import { BudgetLedger, DEFAULT_SLICE_BUDGET } from "./budget";
import type { RuntimeStore } from "./persistence";
import type { RunPolicySnapshot } from "./policy";

export interface KnownCandidateInvocation {
  tenantId: string;
  resourceId: string;
  idempotencyKey: string;
  objective: string;
  enabled: boolean;
  policy: RunPolicySnapshot;
  modelRouting: ModelRoutingConfig;
  modelCapabilities: ModelCapability[];
  budgetLimits?: AgentRunBudgetLimits;
}

export interface AdmittedRun {
  run: AgentRun;
  created: boolean;
  wake: { type: "web_operator_run"; runId: string };
}

export class WebOperatorDisabledError extends Error {
  constructor() {
    super("DISTILLED_WEB_OPERATOR_ENABLED is not true");
    this.name = "WebOperatorDisabledError";
  }
}

export class WebOperatorAcquisitionStrategy {
  readonly kind = "web_operator" as const;
  constructor(private readonly store: RuntimeStore) {}

  async admitKnownCandidate(input: KnownCandidateInvocation, now = new Date()): Promise<AdmittedRun> {
    if (!input.enabled) throw new WebOperatorDisabledError();
    const timestamp = now.toISOString();
    const runId = makeId("agent_run", input.tenantId, input.resourceId, input.idempotencyKey);
    const run: AgentRun = {
      runId,tenantId:input.tenantId,resourceId:input.resourceId,idempotencyKey:input.idempotencyKey,
      objective:input.objective,mode:"known_candidate",state:"admitted",generation:0,
      policySnapshotId:input.policy.id,completionContractVersion:"known-candidate-watermark-v1",
      createdAt:timestamp,updatedAt:timestamp
    };
    const ledger = new BudgetLedger(runId,input.budgetLimits ?? DEFAULT_SLICE_BUDGET,timestamp);
    const admitted = await this.store.admitRun({
      run,budget:ledger.snapshot(),
      configuration:{runId,policy:structuredClone(input.policy),modelRouting:structuredClone(input.modelRouting),modelCapabilities:structuredClone(input.modelCapabilities),createdAt:timestamp},
      outbox:{id:makeId("outbox",runId,"wake"),runId,kind:"agent_run_wake",state:"pending",createdAt:timestamp}
    });
    if (admitted.created) await this.store.transitionRun(runId,0,"queued",timestamp);
    return {run:(await this.store.getRun(runId))!,created:admitted.created,wake:{type:"web_operator_run",runId}};
  }
}
