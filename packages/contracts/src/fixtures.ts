import type { ConnectorHandoffRequest } from "./handoff";
import type { IntakeReceipt, SourceObservation } from "./types";
import type { OrderingState, OrderingDecision } from "./ordering";

/** Portable synthetic fixtures; no provider payloads, credentials or live claims. */
export function handoffFixture(): ConnectorHandoffRequest {
  const o:SourceObservation={id:"observation-1",feedId:"feed-1",feedSourceId:"feed-source-1",sourceId:"source-1",fetchRunId:"fetch-1",fetchStartSequence:1,sourceItemKey:"guid-1",operation:"UPSERT",representation:"ARTICLE_EXCERPT",contentCompleteness:"COMPLETE",contentHash:"a".repeat(64),authoritativeCurrentState:false,canonicalUrl:"https://publisher.example/article",suppliedPayloadRef:"payload-1",observedAt:"2026-10-02T09:00:00Z"};
  return {contractVersion:"distilled-v1",handoffId:"handoff-1",coverage:{id:"coverage-1",feedId:o.feedId,feedSourceId:o.feedSourceId,fetchRunId:o.fetchRunId,fetchStartSequence:1,requestedBounds:{},observedBounds:{},status:"PARTIAL",continuationState:"PENDING",continuationToken:"page-2",safeCheckpointCursor:"cursor-1",createdAt:o.observedAt},observations:[o,{...o,id:"deletion-1",sourceItemKey:"guid-2",operation:"DELETE",authoritativeCurrentState:true,suppliedPayloadRef:undefined,contentHash:undefined}],proposals:[{observationId:o.id,feedId:o.feedId,feedSourceId:o.feedSourceId,sourceId:o.sourceId,sourceItemKey:o.sourceItemKey,connectorType:"rss",url:o.canonicalUrl,representation:o.representation,contentCompleteness:o.contentCompleteness,suppliedPayloadRef:o.suppliedPayloadRef,discoveredAt:o.observedAt,discoveryRunId:o.fetchRunId}]};
}
export function receiptFixture(o: SourceObservation): IntakeReceipt {
  return {id:`receipt-${o.id}`,observationId:o.id,feedId:o.feedId,feedSourceId:o.feedSourceId,sourceItemKey:o.sourceItemKey,decision:"ACCEPTED",reasonCode:"ACCEPTED_NEW_ITEM",checkpointResolution:"RESOLVED",candidateItemId:`candidate-${o.sourceItemKey}`,decidedAt:o.observedAt,intakePolicyVersion:"v1"};
}
const base:OrderingState={operation:"UPSERT",fetchStartSequence:10,contentHash:"A"};
const revision=(value:string)=>({scheme:"provider_integer",value,comparability:"COMPARABLE" as const,authority:"PROVIDER" as const});
export const orderingFixtures: Array<{name:string;current:OrderingState|undefined;incoming:OrderingState;expected:OrderingDecision}> = [
  {name:"initial observation",current:undefined,incoming:base,expected:"WIN"},
  {name:"later unversioned content",current:base,incoming:{...base,fetchStartSequence:12,contentHash:"B"},expected:"WIN"},
  {name:"delayed earlier acquisition",current:base,incoming:{...base,fetchStartSequence:9,contentHash:"B"},expected:"STALE"},
  {name:"equal sequence identical content",current:base,incoming:base,expected:"REPLAY"},
  {name:"equal sequence conflicting content",current:base,incoming:{...base,contentHash:"B"},expected:"CONFLICT"},
  {name:"equal sequence conflicting operation",current:base,incoming:{...base,operation:"DELETE"},expected:"CONFLICT"},
  {name:"older comparable source revision",current:{...base,sourceRevision:revision("2")},incoming:{...base,fetchStartSequence:12,sourceRevision:revision("1")},expected:"STALE"},
  {name:"newer comparable source revision",current:{...base,sourceRevision:revision("2")},incoming:{...base,fetchStartSequence:9,sourceRevision:revision("3")},expected:"WIN"},
  {name:"equal source revision identical content",current:{...base,sourceRevision:revision("2")},incoming:{...base,fetchStartSequence:12,sourceRevision:revision("2")},expected:"REPLAY"},
  {name:"equal source revision conflicting content",current:{...base,sourceRevision:revision("2")},incoming:{...base,fetchStartSequence:12,sourceRevision:revision("2"),contentHash:"B"},expected:"CONFLICT"},
  {name:"mixed comparable and absent revisions",current:{...base,sourceRevision:revision("2")},incoming:{...base,fetchStartSequence:12},expected:"CONFLICT"},
  {name:"incomparable schemes",current:{...base,sourceRevision:revision("2")},incoming:{...base,sourceRevision:{...revision("3"),scheme:"other"}},expected:"CONFLICT"},
  {name:"authority mismatch requires check",current:{...base,sourceRevision:revision("2")},incoming:{...base,sourceRevision:{...revision("3"),authority:"ORIGIN"}},expected:"CONFLICT"},
  {name:"ordered deletion",current:base,incoming:{operation:"DELETE",fetchStartSequence:12},expected:"WIN"},
  {name:"old upsert cannot resurrect",current:{operation:"DELETE",fetchStartSequence:12},incoming:base,expected:"STALE"},
  {name:"newer upsert can reactivate",current:{operation:"DELETE",fetchStartSequence:9},incoming:base,expected:"WIN"},
  {name:"same deletion is harmless replay",current:{operation:"DELETE",fetchStartSequence:12},incoming:{operation:"DELETE",fetchStartSequence:12},expected:"REPLAY"}
];
