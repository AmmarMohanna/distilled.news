import type { AgentRun, AgentRunBudgetLimits, CandidateIdentity, ModelCapability, ModelRoutingConfig } from "./contracts";
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
  candidate: CandidateIdentity;
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
      policySnapshotId:input.policy.id,completionContractVersion:"known-candidate-exact-v1",
      createdAt:timestamp,updatedAt:timestamp,candidate:structuredClone(input.candidate)
    };
    const ledger = new BudgetLedger(runId,input.budgetLimits ?? DEFAULT_SLICE_BUDGET,timestamp);
    const admitted = await this.store.admitRun({
      run,budget:ledger.snapshot(),
      configuration:{runId,candidate:structuredClone(input.candidate),policy:structuredClone(input.policy),modelRouting:structuredClone(input.modelRouting),modelCapabilities:structuredClone(input.modelCapabilities),createdAt:timestamp},
      outbox:{id:makeId("outbox",runId,"wake"),runId,kind:"agent_run_wake",state:"pending",createdAt:timestamp,attempts:0,nextAttemptAt:timestamp}
    });
    if (admitted.created) await this.store.transitionRun(admitted.run.runId,0,"queued",timestamp);
    return {run:(await this.store.getRun(admitted.run.runId))!,created:admitted.created,wake:{type:"web_operator_run",runId:admitted.run.runId}};
  }
}
