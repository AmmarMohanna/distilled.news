import type { ModelCapability, ModelRoutingConfig } from "@distilled/agent-runtime/contracts";
import { modelRoutingConfigFromEnv } from "@distilled/agent-runtime/model";
import { WebOperatorAcquisitionStrategy } from "@distilled/agent-runtime/admission";
import type { RunPolicySnapshot } from "@distilled/agent-runtime/policy";
import { D1AgentRuntimeStore } from "./agent-runtime-store";
import type { Env, WebOperatorRunMessage } from "./types";

export interface KnownCandidateAdmissionInput {
  tenantId: string;
  resourceId: string;
  idempotencyKey: string;
  objective: string;
  policy: RunPolicySnapshot;
  modelCapabilities: ModelCapability[];
  baseModelRouting?: ModelRoutingConfig;
}

export async function admitKnownCandidateWebOperatorRun(
  env: Env,
  input: KnownCandidateAdmissionInput,
  now = new Date()
) {
  if (!env.WEB_OPERATOR_QUEUE) throw new Error("WEB_OPERATOR_QUEUE is not configured for external routing");
  const store = new D1AgentRuntimeStore(env.DB);
  const strategy = new WebOperatorAcquisitionStrategy(store);
  const admitted = await strategy.admitKnownCandidate({
    ...input,
    enabled: env.DISTILLED_WEB_OPERATOR_ENABLED === "true",
    modelRouting: modelRoutingConfigFromEnv(env as unknown as Record<string, string | undefined>, input.baseModelRouting)
  }, now);
  if (admitted.created) {
    await env.WEB_OPERATOR_QUEUE.send(admitted.wake satisfies WebOperatorRunMessage);
    await store.markOutboxDelivered(admitted.run.runId,now.toISOString());
  }
  return admitted;
}
