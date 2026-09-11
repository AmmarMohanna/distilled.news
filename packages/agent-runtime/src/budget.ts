import type {
  AgentRunBudget,
  AgentRunBudgetLimits,
  AgentRunBudgetUsage,
  ModelRole,
  ToolName
} from "./contracts";
import { emptyBudgetUsage } from "./contracts";

export type BudgetDimension = keyof AgentRunBudgetLimits;

export class BudgetExceededError extends Error {
  constructor(readonly dimension: BudgetDimension) {
    super(`budget exhausted: ${dimension}`);
    this.name = "BudgetExceededError";
  }
}

export interface BudgetReservation {
  modelCalls?: number;
  inputTokens?: number;
  outputTokens?: number;
  modelCostUsd?: number;
  strongModelCalls?: number;
  visionCalls?: number;
  browserActions?: number;
  navigations?: number;
  downloads?: number;
  retries?: number;
  challengeTransitions?: number;
  pages?: number;
  childAgents?: number;
  wallClockMs?: number;
}

const DIMENSIONS = Object.keys(emptyBudgetUsage()) as BudgetDimension[];

export class BudgetLedger {
  readonly budget: AgentRunBudget;

  constructor(
    runId: string,
    limits: AgentRunBudgetLimits,
    startedAt = new Date().toISOString(),
    usage: AgentRunBudgetUsage = emptyBudgetUsage()
  ) {
    this.budget = { runId, limits: { ...limits }, usage: { ...usage }, startedAt };
  }

  reserve(request: BudgetReservation): AgentRunBudgetUsage {
    const exceeded=this.wouldExceed(request);
    if (exceeded) throw new BudgetExceededError(exceeded);
    for (const dimension of DIMENSIONS) {
      const increment = request[dimension] ?? 0;
      this.budget.usage[dimension] += increment;
    }
    return { ...this.budget.usage };
  }

  wouldExceed(request:BudgetReservation):BudgetDimension|undefined {
    return DIMENSIONS.find((dimension)=>this.budget.usage[dimension]+(request[dimension]??0)>this.budget.limits[dimension]);
  }

  reserveModel(input: {
    capability: import("./contracts").ModelCapability;
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number;
  }): AgentRunBudgetUsage {
    return this.reserve({
      modelCalls: 1,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      modelCostUsd: input.estimatedCostUsd,
      strongModelCalls: input.capability.reasoningClass === "strong" ? 1 : 0,
      visionCalls: input.capability.vision ? 1 : 0
    });
  }

  reconcileModel(reserved:{inputTokens:number;outputTokens:number;modelCostUsd:number},actual:{inputTokens:number;outputTokens:number;costUsd:number}) {
    const next={...this.budget.usage};
    next.inputTokens += actual.inputTokens-reserved.inputTokens;
    next.outputTokens += actual.outputTokens-reserved.outputTokens;
    next.modelCostUsd += actual.costUsd-reserved.modelCostUsd;
    for (const dimension of ["inputTokens","outputTokens","modelCostUsd"] as const)
      if (next[dimension]<0) throw new Error(`invalid negative budget reconciliation: ${dimension}`);
    this.budget.usage=next;
    const exceeded=(['inputTokens','outputTokens','modelCostUsd'] as const)
      .find((dimension)=>next[dimension]>this.budget.limits[dimension]);
    return {usage:{...next},exceeded};
  }

  reserveTool(tool: ToolName): AgentRunBudgetUsage {
    return this.reserve({
      browserActions: tool.startsWith("browser.") || tool.startsWith("computer.") ? 1 : 0,
      navigations: tool === "browser.navigate@1" || tool === "browser.follow_link@1" ? 1 : 0,
      downloads: 0,
      pages: tool === "browser.navigate@1" ? 1 : 0
    });
  }

  remaining(): AgentRunBudgetLimits {
    const result = {} as AgentRunBudgetLimits;
    for (const dimension of DIMENSIONS) result[dimension] = this.budget.limits[dimension] - this.budget.usage[dimension];
    return result;
  }

  snapshot(): AgentRunBudget {
    return {
      ...this.budget,
      limits: { ...this.budget.limits },
      usage: { ...this.budget.usage }
    };
  }
}

export const DEFAULT_SLICE_BUDGET: AgentRunBudgetLimits = {
  modelCalls: 8,
  inputTokens: 20_000,
  outputTokens: 4_000,
  modelCostUsd: 0.5,
  strongModelCalls: 1,
  visionCalls: 2,
  browserActions: 30,
  navigations: 6,
  downloads: 0,
  retries: 3,
  challengeTransitions: 1,
  pages: 6,
  childAgents: 0,
  wallClockMs: 60_000
};
