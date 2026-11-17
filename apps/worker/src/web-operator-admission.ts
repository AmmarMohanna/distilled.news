import type { CandidateIdentity, ModelCapability, ModelRoutingConfig } from "@distilled/agent-runtime/contracts";
import { modelRoutingConfigFromEnv } from "@distilled/agent-runtime/model";
import { WebOperatorAcquisitionStrategy } from "@distilled/agent-runtime/admission";
import type { RunPolicySnapshot } from "@distilled/agent-runtime/policy";
import { D1AgentRuntimeStore } from "./agent-runtime-store";
import type { RuntimeStore } from "@distilled/agent-runtime/persistence";
import type { Env, WebOperatorRunMessage } from "./types";

export interface KnownCandidateAdmissionInput {
  tenantId: string;
  resourceId: string;
  idempotencyKey: string;
  objective: string;
  candidate: CandidateIdentity;
  policy: RunPolicySnapshot;
  modelCapabilities: ModelCapability[];
  baseModelRouting?: ModelRoutingConfig;
}

export async function admitKnownCandidateWebOperatorRun(
  env: Env,
  input: KnownCandidateAdmissionInput,
  now = new Date()
) {
  const store = new D1AgentRuntimeStore(env.DB);
  const strategy = new WebOperatorAcquisitionStrategy(store);
  const admitted = await strategy.admitKnownCandidate({
    ...input,
    enabled: env.DISTILLED_WEB_OPERATOR_ENABLED === "true",
    modelRouting: modelRoutingConfigFromEnv(env as unknown as Record<string, string | undefined>, input.baseModelRouting)
  }, now);
  await relayPendingWebOperatorOutbox(env,store,25,now);
  return admitted;
}

export async function relayPendingWebOperatorOutbox(env:Env,store:RuntimeStore=new D1AgentRuntimeStore(env.DB),limit=25,now=new Date()) {
  if (!env.WEB_OPERATOR_QUEUE) throw new Error("WEB_OPERATOR_QUEUE is not configured for external routing");
  const pending=await store.listPendingOutbox(limit,now);
  for (const outbox of pending) {
    await env.WEB_OPERATOR_QUEUE.send({type:"web_operator_run",runId:outbox.runId} satisfies WebOperatorRunMessage);
    await store.markOutboxDelivered(outbox.runId,new Date().toISOString());
  }
  return pending.length;
}
