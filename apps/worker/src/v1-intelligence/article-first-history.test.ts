import {it,expect} from 'vitest';
import {evaluateEditorialDelta} from './editorial';
import type {FeedTransaction} from './store';
// Controlled persisted-edition fixtures, not model judgments. Two feeds may know
// the same occurrence independently; only their own publication history counts.
const known='The council announced a water fund.',detail='The fund will supply 500 homes.';
const evidence:any={id:'source-revision',body:known+' '+detail};
const target:any={type:'EVENT',id:'v2',stableId:'water-fund',eventVersionIds:['v2'],evidence:[evidence]};
function transaction(feedId:string):FeedTransaction{
 const edition={id:'edition',selectionId:'selection',windowEnd:'2026-10-03T12:00:00Z',generation:{},stories:[{candidateId:'candidate',claims:[{id:'claim',text:known,support:[{evidenceRevisionId:'source-revision',quote:known+' '+detail}]}]}]};
 return {list:async(kind:string)=>kind==='editions'&&feedId==='published-feed'?[edition]:[],read:async(kind:string,id:string)=>kind==='event_versions'?{eventId:'water-fund'}:kind==='publication_status'?{status:'PUBLISHED'}:kind==='candidates'?{targetType:'EVENT',targetVersionId:'v1'}:undefined} as unknown as FeedTransaction;
}
it('graph knowledge is not reader history; another feed remains eligible',async()=>{
 const facts=[{text:known,evidenceRevisionIds:[evidence.id]}];
 const communicated=await evaluateEditorialDelta(transaction('published-feed'),target,'2026-10-04T00:00:00Z',undefined,facts);
 const unseen=await evaluateEditorialDelta(transaction('other-feed'),target,'2026-10-04T00:00:00Z',undefined,facts);
 expect(communicated.decision).toBe('SUPPRESS');expect(unseen.decision).toBe('INCLUDE');expect(unseen.previouslyCommunicated).toHaveLength(0);
});
it('source context and an existing event ID do not mark an uncommunicated material fact delivered',async()=>{
 const decision=await evaluateEditorialDelta(transaction('published-feed'),target,'2026-10-04T00:00:00Z',undefined,[{text:known,evidenceRevisionIds:[evidence.id]},{text:detail,evidenceRevisionIds:[evidence.id]}]);
 expect(decision.decision).toBe('INCLUDE');expect(decision.previouslyCommunicated.flatMap(p=>p.facts)).toEqual([known]);expect(decision.newUnderstanding.map(f=>f.text)).toEqual([detail]);
});
