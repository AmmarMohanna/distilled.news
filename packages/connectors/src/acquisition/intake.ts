import type { CandidateIntakePort, CandidateProposal, Checkpoint, CheckpointStore, ConnectorBatch, ConnectorScope, PayloadStore, UpstreamObservation } from "./contracts";

export async function sha256(text: string): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))), v => v.toString(16).padStart(2,"0")).join("");
}
export async function handoffConnectorBatch(scope: ConnectorScope, checkpoint: Checkpoint, batch: ConnectorBatch,
  ports: { payloads: PayloadStore; intake: CandidateIntakePort; checkpoints: CheckpointStore }) {
  if (batch.retry.kind !== "none") return { proposals: [], checkpointAdvanced: false };
  const next = batch.checkpointProposal;
  if (next?.afterMessageId !== undefined && (!Number.isSafeInteger(next.afterMessageId) || next.afterMessageId < (checkpoint.afterMessageId ?? 0))) throw new Error("checkpoint_regression");
  if (batch.checkpointProposal?.historicalBoundary && (batch.coverage.completeness !== "complete" || batch.coverage.historicalBoundary !== batch.checkpointProposal.historicalBoundary)) {
    throw new Error("unproven_historical_checkpoint");
  }
  const unique = new Map<string, CandidateProposal>();
  for (const observation of batch.observations) {
    if (!observation.upstreamId || (observation.operation === "upsert" && !observation.text.trim())) throw new Error("invalid_connector_observation");
    // Only source facts enter revision identity; fetch time/provider mechanism do not.
    const payload = JSON.stringify(Object.fromEntries(Object.entries(observation).sort(([a], [b]) => a.localeCompare(b))));
    const hash = await sha256(payload);
    const candidateKey = await sha256(JSON.stringify([scope.tenantId,scope.resourceId,observation.upstreamId]));
    const observationKey = await sha256(JSON.stringify([candidateKey, hash]));
    if (unique.has(observationKey)) continue;
    const suppliedPayloadRef = await ports.payloads.put(scope, hash, payload);
    if (!suppliedPayloadRef) throw new Error("payload_not_durable");
    unique.set(observationKey, { ...scope, schemaVersion:"connector-v1.5", candidateKey, observationKey,
      upstreamId:observation.upstreamId, connector:batch.connector, operation:observation.operation,
      suppliedPayloadRef, payloadSha256:hash, representation:observation.representation, contentCompleteness:observation.contentCompleteness });
  }
  const proposals = [...unique.values()];
  const receipt = await ports.intake.accept(proposals);
  const accepted = new Set(receipt.acceptedObservationKeys);
  if (receipt.durable !== true || proposals.some(p => !accepted.has(p.observationKey))) throw new Error("intake_not_durably_accepted");
  const { version: _version, ...previous } = checkpoint;
  const checkpointAdvanced = next ? await ports.checkpoints.advance(scope, checkpoint.version, { ...previous, ...next }) : false;
  return { proposals, checkpointAdvanced };
}

/** Acquisition Router adapter: reuse supplied content only for the requested representation.
 * Returns null when article acquisition is still needed; never fabricates model/tool IDs. */
export async function reuseSuppliedPayload(proposal: CandidateProposal, requested: "full_article" | UpstreamObservation["representation"], store: PayloadStore) {
  const payload = await store.get(proposal, proposal.suppliedPayloadRef);
  if (await sha256(payload) !== proposal.payloadSha256) throw new Error("payload_integrity_failure");
  const observation = JSON.parse(payload) as UpstreamObservation;
  if (observation.upstreamId !== proposal.upstreamId || observation.operation !== proposal.operation) throw new Error("payload_identity_mismatch");
  if (observation.operation === "delete" || requested === "full_article" || requested !== observation.representation) return null;
  return { candidateKey:proposal.candidateKey, suppliedPayloadRef:proposal.suppliedPayloadRef, content:observation,
    provenance:{ kind:"deterministic" as const, connector:proposal.connector, payloadSha256:proposal.payloadSha256 } };
}
