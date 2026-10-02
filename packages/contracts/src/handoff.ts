import { z } from "zod";
import { candidateProposalSchema, collectionCoverageSchema, idSchema, intakeReceiptSchema, sourceObservationSchema } from "./schemas";
import type { CandidateProposal, CollectionCoverage, IntakeReceipt, SourceObservation } from "./types";

export const CONTRACT_VERSION = "distilled-v1" as const;
export interface ConnectorHandoffRequest {
  contractVersion: typeof CONTRACT_VERSION;
  /** Stable across retries of this exact immutable batch. */
  handoffId: string;
  coverage: CollectionCoverage;
  observations: SourceObservation[];
  proposals: CandidateProposal[];
}
export interface ConnectorHandoffResponse {
  contractVersion: typeof CONTRACT_VERSION;
  handoffId: string;
  /** The implementation returns only after receipts and required retry state commit. */
  durable: true;
  receipts: IntakeReceipt[];
}
export const connectorHandoffRequestSchema = z.object({
  contractVersion: z.literal(CONTRACT_VERSION), handoffId: idSchema,
  coverage: collectionCoverageSchema, observations: z.array(sourceObservationSchema).max(500), proposals: z.array(candidateProposalSchema).max(500)
}).strict().superRefine((batch, ctx) => {
  const ids = new Set<string>(), keys = new Set<string>(), proposals = new Set<string>();
  for (const o of batch.observations) {
    const key = JSON.stringify([o.sourceItemKey, o.operation]);
    if (ids.has(o.id) || keys.has(key)) ctx.addIssue({ code: "custom", message: "Duplicate observation" });
    ids.add(o.id); keys.add(key);
    const c = batch.coverage;
    if (o.feedId !== c.feedId || o.feedSourceId !== c.feedSourceId || o.fetchRunId !== c.fetchRunId || o.fetchStartSequence !== c.fetchStartSequence) ctx.addIssue({ code: "custom", message: "Observation outside fetch scope" });
  }
  for (const p of batch.proposals) {
    const o = batch.observations.find(o => o.id === p.observationId);
    if (proposals.has(p.observationId)) ctx.addIssue({ code: "custom", message: "Duplicate proposal" });
    proposals.add(p.observationId);
    if (!o || o.operation !== "UPSERT" || p.feedId !== o.feedId || p.feedSourceId !== o.feedSourceId || p.sourceId !== o.sourceId || p.sourceItemKey !== o.sourceItemKey || p.representation !== o.representation || p.contentCompleteness !== o.contentCompleteness || p.suppliedPayloadRef !== o.suppliedPayloadRef || p.discoveryRunId !== o.fetchRunId || p.url !== o.canonicalUrl || p.upstreamId !== o.upstreamId || p.titleHint !== o.titleHint || p.publishedAtHint !== o.publishedAtHint || p.languageHint !== o.languageHint) ctx.addIssue({ code: "custom", message: "Proposal/observation mismatch" });
  }
  // An invalid/unproposable observation still needs an intake decision; it must not disappear.
});
export const connectorHandoffResponseSchema = z.object({ contractVersion: z.literal(CONTRACT_VERSION), handoffId: idSchema, durable: z.literal(true), receipts: z.array(intakeReceiptSchema).max(500) }).strict();

export type HandoffErrorCode = "INVALID_REQUEST" | "INVALID_RESPONSE" | "IDEMPOTENCY_CONFLICT" | "SCOPE_DENIED" | "TEMPORARY_UNAVAILABLE";
export class HandoffError extends Error {
  constructor(public readonly code: HandoffErrorCode) { super(code); }
  get retryable() { return this.code === "TEMPORARY_UNAVAILABLE"; }
}

/** Direct async service port. No HTTP endpoint or queue consumer is implied. */
export interface CandidateIntakePort {
  acceptBatch(request: ConnectorHandoffRequest): Promise<ConnectorHandoffResponse>;
}

export function validateHandoffResponse(request: ConnectorHandoffRequest, response: unknown): ConnectorHandoffResponse {
  const parsed = connectorHandoffResponseSchema.safeParse(response);
  if (!parsed.success || parsed.data.handoffId !== request.handoffId || parsed.data.receipts.length !== request.observations.length) throw new HandoffError("INVALID_RESPONSE");
  const seen = new Set<string>();
  for (const receipt of parsed.data.receipts) {
    const o = request.observations.find(o => o.id === receipt.observationId);
    if (!o || seen.has(o.id) || receipt.feedId !== o.feedId || receipt.feedSourceId !== o.feedSourceId || receipt.sourceItemKey !== o.sourceItemKey || (receipt.decision === "DELETION_ACCEPTED" && o.operation !== "DELETE") || (["ACCEPTED", "REPLAY"].includes(receipt.decision) && o.operation !== "UPSERT")) throw new HandoffError("INVALID_RESPONSE");
    seen.add(o.id);
  }
  return parsed.data;
}

/** Connector retries a transient/uncertain failure with the same batch and handoffId. */
export async function handoffConnectorBatch(port: CandidateIntakePort, input: unknown): Promise<ConnectorHandoffResponse> {
  const parsed = connectorHandoffRequestSchema.safeParse(input);
  if (!parsed.success) throw new HandoffError("INVALID_REQUEST");
  const response = await port.acceptBatch(parsed.data);
  return validateHandoffResponse(parsed.data, response);
}

/** Only checks receipts for a prefix the connector independently proved contiguous.
 * This function cannot infer cursor continuity, commit persistence, or advance a checkpoint. */
export function isIntakePrefixResolved(response: ConnectorHandoffResponse, observationIds: string[]): boolean {
  if (new Set(observationIds).size !== observationIds.length) return false;
  return observationIds.every(id => response.receipts.some(r => r.observationId === id && r.checkpointResolution === "RESOLVED"));
}
