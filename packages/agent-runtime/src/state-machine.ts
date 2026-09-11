import type { AgentRunState, AgentTurnState, ToolCallState } from "./contracts";

const RUN_TRANSITIONS: Readonly<Record<AgentRunState, readonly AgentRunState[]>> = {
  admitted: ["queued", "cancelled"],
  queued: ["running", "cancelled"],
  running: ["queued", "waiting_human", "suspended", "completed", "failed", "cancelled"],
  waiting_human: ["queued", "failed", "cancelled"],
  suspended: ["queued", "failed", "cancelled"],
  completed: [],
  failed: [],
  cancelled: []
};

const TURN_TRANSITIONS: Readonly<Record<AgentTurnState, readonly AgentTurnState[]>> = {
  created: ["model_pending", "cancelled"],
  model_pending: ["model_streaming", "failed", "cancelled"],
  model_streaming: ["response_validating", "failed", "cancelled"],
  response_validating: ["tools_pending", "failed", "cancelled"],
  tools_pending: ["tools_running", "completion_proposed", "failed", "cancelled"],
  tools_running: ["results_recorded", "completion_proposed", "failed", "cancelled", "effect_unknown"],
  results_recorded: ["continuation_pending", "completed", "failed", "cancelled"],
  continuation_pending: ["model_pending", "tools_running", "completed", "failed", "cancelled"],
  completion_proposed: ["continuation_pending", "completed", "failed", "cancelled"],
  completed: [],
  failed: [],
  cancelled: [],
  effect_unknown: ["failed", "cancelled"]
};

const TOOL_TRANSITIONS: Readonly<Record<ToolCallState, readonly ToolCallState[]>> = {
  requested: ["schema_validated", "failed", "cancelled"],
  schema_validated: ["policy_allowed", "policy_denied", "failed", "cancelled"],
  policy_allowed: ["budget_reserved", "failed", "cancelled"],
  policy_denied: [],
  budget_reserved: ["intent_persisted", "failed", "cancelled"],
  intent_persisted: ["dispatching", "cancelled"],
  dispatching: ["succeeded", "failed", "cancelled", "effect_unknown"],
  succeeded: [],
  failed: [],
  cancelled: [],
  effect_unknown: []
};

export class InvalidTransitionError extends Error {
  constructor(entity: string, from: string, to: string) {
    super(`invalid ${entity} transition: ${from} -> ${to}`);
    this.name = "InvalidTransitionError";
  }
}

function transition<T extends string>(entity: string, table: Readonly<Record<T, readonly T[]>>, from: T, to: T): T {
  if (!table[from].includes(to)) throw new InvalidTransitionError(entity, from, to);
  return to;
}

export function transitionRun(from: AgentRunState, to: AgentRunState): AgentRunState {
  return transition("AgentRun", RUN_TRANSITIONS, from, to);
}

export function transitionTurn(from: AgentTurnState, to: AgentTurnState): AgentTurnState {
  return transition("AgentTurn", TURN_TRANSITIONS, from, to);
}

export function transitionToolCall(from: ToolCallState, to: ToolCallState): ToolCallState {
  return transition("AgentToolCall", TOOL_TRANSITIONS, from, to);
}

export function isTerminalToolState(state: ToolCallState): boolean {
  return ["policy_denied", "succeeded", "failed", "cancelled", "effect_unknown"].includes(state);
}
