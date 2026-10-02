import type { ObservationOperation, SourceRevision } from "./types";

export interface OrderingState {
  operation: ObservationOperation;
  fetchStartSequence: number;
  sourceRevision?: SourceRevision;
  contentHash?: string;
}
export interface OrderingPolicy {
  /** Registered comparator must verify scheme, authority and reliability.
   * Return null when revisions cannot be compared. Never lexically compare opaque values. */
  compareRevisions(left: SourceRevision, right: SourceRevision): -1 | 0 | 1 | null;
  /** Runtime-owned evidence of an authoritative check, not a model assertion. */
  authoritativeReplacementAllowed: boolean;
}
export type OrderingDecision = "WIN" | "STALE" | "REPLAY" | "CONFLICT";

/** Pure ordering decision. Caller owns atomic storage, representation checks and outbox. */
export function decideObservationOrdering(current: OrderingState | undefined, incoming: OrderingState, policy: OrderingPolicy): OrderingDecision {
  if (!current) return "WIN";
  const a = incoming.sourceRevision, b = current.sourceRevision;
  const reliableA = a?.comparability === "COMPARABLE", reliableB = b?.comparability === "COMPARABLE";
  let comparison: -1 | 0 | 1;
  if (reliableA && reliableB && a.scheme === b.scheme) {
    const result = policy.compareRevisions(a, b);
    if (result === null) return policy.authoritativeReplacementAllowed ? "WIN" : "CONFLICT";
    comparison = result;
  } else if (reliableA || reliableB) {
    return policy.authoritativeReplacementAllowed ? "WIN" : "CONFLICT";
  } else comparison = incoming.fetchStartSequence === current.fetchStartSequence ? 0 : incoming.fetchStartSequence > current.fetchStartSequence ? 1 : -1;
  if (comparison < 0) return "STALE";
  if (comparison > 0) return "WIN";
  if (incoming.operation !== current.operation) return "CONFLICT";
  if (incoming.operation === "DELETE") return "REPLAY";
  return incoming.contentHash && incoming.contentHash === current.contentHash ? "REPLAY" : "CONFLICT";
}
