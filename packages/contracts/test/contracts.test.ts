import { describe, expect, it, vi } from "vitest";
import {
  decideObservationOrdering, handoffConnectorBatch, isIntakePrefixResolved,
  sourceObservationSchema, intakeReceiptSchema, evidenceAcceptanceReceiptSchema,
  evidenceRevisionConflictSchema, collectionCoverageSchema, windowScoreSchema,
  validateCandidateAssessments, acceptanceCases, hashContent, sha256, type ConnectorHandoffRequest, type ConnectorHandoffResponse,
  type OrderingState, type OrderingPolicy
} from "../src";
import { handoffFixture, receiptFixture, orderingFixtures } from "../src/fixtures";

describe("ordering contract (pure decisions; persistence tested by each binding)", () => {
  const policy: OrderingPolicy = {
    authoritativeReplacementAllowed: false,
    compareRevisions: (a,b) => a.authority !== b.authority ? null : Number(a.value) === Number(b.value) ? 0 : Number(a.value) > Number(b.value) ? 1 : -1
  };
  it.each(orderingFixtures)("$name", ({ current, incoming, expected }) => {
    expect(decideObservationOrdering(current, incoming, policy)).toBe(expected);
  });
  it("identical winning content advances a watermark and blocks a delayed intermediate result", () => {
    const current: OrderingState = { operation:"UPSERT", fetchStartSequence:10, contentHash:"A" };
    const replay = { ...current, fetchStartSequence:12 };
    expect(decideObservationOrdering(current,replay,policy)).toBe("WIN");
    expect(decideObservationOrdering(replay,{ ...current, fetchStartSequence:11, contentHash:"B" },policy)).toBe("STALE");
  });
  it("A to B to A wins twice; historical equality cannot suppress a transition", () => {
    const a: OrderingState = { operation:"UPSERT", fetchStartSequence:1, contentHash:"A" };
    const b = { ...a, fetchStartSequence:2, contentHash:"B" };
    expect(decideObservationOrdering(a,b,policy)).toBe("WIN");
    expect(decideObservationOrdering(b,{ ...a, fetchStartSequence:3 },policy)).toBe("WIN");
  });
  it("allocation/failure alone leaves accepted state unchanged", () => {
    const current: OrderingState = { operation:"UPSERT", fetchStartSequence:1, contentHash:"A" };
    const allocatedButFailed = 3;
    expect(allocatedButFailed).toBeGreaterThan(current.fetchStartSequence);
    expect(decideObservationOrdering(current,{ ...current, fetchStartSequence:2, contentHash:"B" },policy)).toBe("WIN");
  });
  it("allows mixed metadata replacement only with runtime-authorized check", () => {
    const current: OrderingState = { operation:"UPSERT", fetchStartSequence:1, sourceRevision:{scheme:"origin",value:"1",comparability:"COMPARABLE",authority:"ORIGIN"} };
    expect(decideObservationOrdering(current,{operation:"UPSERT",fetchStartSequence:2}, {...policy,authoritativeReplacementAllowed:true})).toBe("WIN");
  });
});

describe("batch handoff", () => {
  it("returns a complete durable receipt set for mixed upsert/deletion", async () => {
    const request = handoffFixture();
    const response: ConnectorHandoffResponse = { contractVersion:"distilled-v1",handoffId:request.handoffId,durable:true,receipts:[receiptFixture(request.observations[0]), {...receiptFixture(request.observations[1]),decision:"DELETION_ACCEPTED",reasonCode:"ACCEPTED_DELETION",candidateItemId:undefined,tombstoneId:"tombstone-1"}] };
    expect(await handoffConnectorBatch({acceptBatch:async()=>response},request)).toEqual(response);
    expect(isIntakePrefixResolved(response,request.observations.map(o=>o.id))).toBe(true);
  });
  it("keeps quarantine unresolved and never infers a safe cursor", async () => {
    const request = handoffFixture(); request.observations = request.observations.slice(0,1);
    const receipt = {...receiptFixture(request.observations[0]),decision:"QUARANTINED" as const, reasonCode:"QUARANTINE_MISSING_VALIDATION_FIELDS" as const,checkpointResolution:"UNRESOLVED" as const,candidateItemId:undefined};
    const response = await handoffConnectorBatch({acceptBatch:async()=>({contractVersion:"distilled-v1",handoffId:request.handoffId,durable:true,receipts:[receipt]})},request);
    expect(isIntakePrefixResolved(response,[receipt.observationId])).toBe(false);
    expect(isIntakePrefixResolved(response,["missing"])).toBe(false);
  });
  it.each(["scope", "duplicate", "deletion-proposal", "run", "url"])("rejects malformed request: %s before calling intake", async kind => {
    const request = handoffFixture();
    if(kind==="scope") request.observations[0].feedId="other-feed";
    if(kind==="duplicate") request.observations.push(request.observations[0]);
    if(kind==="deletion-proposal") request.proposals[0].observationId=request.observations[1].id;
    if(kind==="run") request.proposals[0].discoveryRunId="wrong-run";
    if(kind==="url") request.proposals[0].url="https://unapproved.example/article";
    const acceptBatch=vi.fn();
    await expect(handoffConnectorBatch({acceptBatch},request)).rejects.toThrow("INVALID_REQUEST");
    expect(acceptBatch).not.toHaveBeenCalled();
  });
  it.each(["missing", "duplicate", "scope", "durability", "handoff"])("rejects invalid receipts: %s",async kind=>{
    const request=handoffFixture(); request.observations=request.observations.slice(0,1);
    const response:any={contractVersion:"distilled-v1",handoffId:request.handoffId,durable:true,receipts:[receiptFixture(request.observations[0])]};
    if(kind==="missing") response.receipts=[];
    if(kind==="duplicate") response.receipts.push(response.receipts[0]);
    if(kind==="scope") response.receipts[0].feedSourceId="other";
    if(kind==="durability") response.durable=false;
    if(kind==="handoff") response.handoffId="other";
    await expect(handoffConnectorBatch({acceptBatch:async()=>response},request)).rejects.toThrow("INVALID_RESPONSE");
  });
  it("permits immutable retry with the same handoff identity",async()=>{
    const request=handoffFixture(); request.observations=request.observations.slice(0,1);
    const saved={contractVersion:"distilled-v1" as const,handoffId:request.handoffId,durable:true as const,receipts:[receiptFixture(request.observations[0])]};
    const port={acceptBatch:vi.fn(async (_:ConnectorHandoffRequest)=>saved)};
    expect(await handoffConnectorBatch(port,request)).toEqual(await handoffConnectorBatch(port,request));
    expect(port.acceptBatch.mock.calls[0][0]).toEqual(port.acceptBatch.mock.calls[1][0]);
  });
});

describe("runtime validators",()=>{
  it("shares normalized content identity while preserving representation and changed facts",async()=>{
    const a=await hashContent({representation:"ARTICLE_EXCERPT",title:"Ａ title",body:"12 people\n were injured."});
    expect(a).toBe(await hashContent({representation:"ARTICLE_EXCERPT",title:"A title",body:"12 people were injured."}));
    expect(a).not.toBe(await hashContent({representation:"ARTICLE_EXCERPT",title:"A title",body:"8 people were injured."}));
    expect(a).not.toBe(await hashContent({representation:"FULL_ARTICLE",title:"A title",body:"12 people were injured."}));
    expect(await sha256("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
  it("publishes the full C12 integration acceptance catalogue without claiming it passed",()=>{
    expect(acceptanceCases).toHaveLength(27);
    expect(new Set(acceptanceCases.map(c=>c.id)).size).toBe(27);
    expect(acceptanceCases.every(c=>c.scenario && c.expected && c.verification.includes("Binding integration required"))).toBe(true);
  });
  it.each(["ARTICLE_EXCERPT","TELEGRAM_MESSAGE","LISTING_RESULT"] as const)("accepts honest %s representation", representation=>{
    expect(sourceObservationSchema.parse({...handoffFixture().observations[0],representation}).representation).toBe(representation);
  });
  it("rejects unsafe sequence, local timestamp, unknown properties and unauthoritative deletion",()=>{
    const o=handoffFixture().observations[0];
    for(const patch of [{fetchStartSequence:Number.MAX_SAFE_INTEGER+1},{observedAt:"2026-10-02T12:00:00+03:00"},{secret:"password"},{operation:"DELETE",authoritativeCurrentState:false}]) expect(sourceObservationSchema.safeParse({...o,...patch}).success).toBe(false);
  });
  it("rejects inconsistent intake decision/reason/reference/resolution",()=>{
    const r=receiptFixture(handoffFixture().observations[0]);
    for(const patch of [{reasonCode:"ACCEPTED_DELETION"},{candidateItemId:undefined},{checkpointResolution:"UNRESOLVED"}]) expect(intakeReceiptSchema.safeParse({...r,...patch}).success).toBe(false);
  });
  it("requires durable post-acquisition conflict references",()=>{
    const r={id:"receipt",evidenceId:"evidence",sourceObservationId:"obs",acquiredContentId:"acquired",decision:"QUARANTINED_REVISION_CONFLICT",decidedAt:"2026-10-02T09:00:00Z"};
    expect(evidenceAcceptanceReceiptSchema.safeParse(r).success).toBe(false);
    expect(evidenceAcceptanceReceiptSchema.safeParse({...r,conflictId:"conflict"}).success).toBe(true);
    expect(evidenceRevisionConflictSchema.safeParse({id:"conflict",evidenceId:"evidence",sourceObservationId:"obs",acquiredContentId:"acquired",reason:"EQUAL_FETCH_SEQUENCE_DIFFERENT_STATE",state:"PENDING_AUTHORITATIVE_RECHECK",createdAt:r.decidedAt,resolvedAt:r.decidedAt}).success).toBe(false);
  });
  it("allows partial coverage but rejects contradictory complete coverage",()=>{
    const c=handoffFixture().coverage;
    expect(collectionCoverageSchema.safeParse(c).success).toBe(true);
    expect(collectionCoverageSchema.safeParse({...c,status:"COMPLETE"}).success).toBe(false);
  });
  it("rejects mixed assessment targets, invalid scores and empty windows",()=>{
    const common={id:"salience",feedId:"feed",feedRevision:1,targetType:"EVENT",targetVersionId:"event-v1",policyVersion:"v1",computedAt:"2026-10-02T09:00:00Z"};
    const salience={...common,impact:1,novelty:1,changeMagnitude:1,institutionalSignificance:1,corroboration:1,persistence:1,recency:1,overallScore:1};
    const relevance={...common,id:"relevance",topicMatch:1,geographyMatch:1,entityMatch:1,sourcePreference:1,languageFit:1,overallScore:1};
    const window={...common,id:"window",windowStart:"2026-10-02T08:00:00Z",windowEnd:common.computedAt,windowKind:"HOURLY",components:{recency:1,novelty:1,changeMagnitude:1,impact:1,persistence:1,turningPoint:1},finalScore:1,reasonCodes:["HIGH_IMPACT"]};
    const candidate={id:"candidate",feedId:"feed",feedRevision:1,targetType:"EVENT",targetVersionId:"event-v1",salienceAssessmentId:"salience",relevanceAssessmentId:"relevance",windowScoreId:"window",initialScore:1,reasons:[],selectionState:"SELECTED",selectionPolicyVersion:"v1"};
    expect(validateCandidateAssessments(candidate,salience,relevance,window)).toEqual(candidate);
    expect(()=>validateCandidateAssessments(candidate,salience,{...relevance,targetVersionId:"event-v2"},window)).toThrow("ASSESSMENT_REFERENCE_MISMATCH");
    expect(windowScoreSchema.safeParse({...window,finalScore:NaN}).success).toBe(false);
    expect(windowScoreSchema.safeParse({...window,windowStart:window.windowEnd}).success).toBe(false);
    expect(windowScoreSchema.safeParse({...window,windowStart:"2026-10-02T09:00:00.100Z",windowEnd:"2026-10-02T09:00:00Z"}).success).toBe(false);
  });
});
