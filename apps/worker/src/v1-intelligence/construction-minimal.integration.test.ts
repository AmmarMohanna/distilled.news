import {it,expect,beforeEach,afterEach,describe} from 'vitest';
import {createIntakeDatabase,seedIntakeScope,testPolicy} from '../v1-intake/test-utils';
import {V1IntakeStore} from '../v1-intake/store';
import {V1FeedStore} from './store';
import {feedFixture,acceptEvidence} from './test-utils';
import {extractClaimMentions} from './claims';
import {constructionTransport,MINIMAL_CONSTRUCTION_VERSION} from './construction-transport';
import {parseConstruction} from './semantic-construction';
import {deterministicMatchers} from './matchers';
import {processEvidenceIntelligence} from './engine';
import {prepareSemanticShortlist} from './shortlist';
import {scoreAndSelect,DEFAULT_BRIEFING_BUDGET} from './scoring';
import {publishSelection} from './publication';
import {projectEditionLedger} from './ledger';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,store:V1FeedStore;
const window={start:'2026-10-03T00:00:00Z',end:'2026-10-04T00:00:00Z',kind:'DAILY' as const};
beforeEach(async()=>{ctx=await createIntakeDatabase();await seedIntakeScope(new V1IntakeStore(ctx.db));store=new V1FeedStore(ctx.db);await store.registerFeed(feedFixture)});
afterEach(async()=>ctx.dispose());
async function construct(sequence:number,body:string,options:{eventId?:string;effects?:string[];split?:boolean}={}){
 await acceptEvidence(store,sequence,body,'publisher-'+sequence);
 const revision=(await store.currentEvidence('feed-1')).find(e=>e.revision.sourceObservationId==='observation-'+sequence)!.revision,{mentions}=await extractClaimMentions(revision);
 const event=options.eventId?await store.read<any>('feed-1','events',options.eventId):undefined,old=event?await store.read<any>('feed-1','event_versions',event.currentVersionId):undefined;
 const input:any={revision,role:'REPORTED_DEVELOPMENT',candidates:event?[{id:event.id,version:old,evidenceRevisionIds:[],newestAt:old.createdAt}]:[]};
 const wire=constructionTransport(mentions,input,{constructionOwnershipVersion:MINIMAL_CONSTRUCTION_VERSION}),effects=options.effects??['CHANGES_STATE'];
 const groups=(options.split?mentions:[mentions[0]]).map((_,i)=>({groupId:'G'+i,occurrence:'A controlled occurrence',eventId:event?'E0':null,storylineId:null,structuralRelation:event?'SAME_EVENT':'NEW_STORYLINE',epistemicEffects:effects}));
 const raw={confidence:1,groups,dispositionByUnitId:Object.fromEntries(mentions.map((m,i)=>['C'+i,options.split?'G'+i:'G0']))},provenance={scorer:'GPT',policyVersion:'CONTROLLED_OFFLINE_MINIMAL',judgmentId:'fixture-'+sequence},construction=parseConstruction(wire.decode(raw),mentions,input,provenance);
 const first=construction.groups[0];await processEvidenceIntelligence(store,JSON.stringify(['REASSESS','observation-'+sequence,'']),testPolicy.now(),{...deterministicMatchers,event:{match:()=>({structuralRelation:first.structuralRelation,eventId:first.eventId??undefined,storylineId:first.storylineId??undefined,epistemicEffects:first.epistemicEffects,confidence:1,provenance})},construction:()=>construction});
 return {revision,mentions,construction};
}
it('retains quantities, conditions and historical context as text with no enrichment prerequisites',async()=>{
 const body='Parliament announced banking reform covering 5% of deposits. Officials previously committed $200 million to research. The fund may receive another 2% if value rises 50%.';
 const {mentions}=await construct(1,body),states=await store.list<any>('feed-1','event_semantic_states'),props=await store.list<any>('feed-1','propositions');
 expect(await store.list('feed-1','events')).toHaveLength(1);expect(states[0]).toMatchObject({entityIds:[],stateSlotIds:[]});expect(states[0].storylineState).toBeUndefined();expect(new Set(props.map(p=>p.text))).toEqual(new Set(mentions.map(m=>m.sourceText)));
 const shortlist=await prepareSemanticShortlist(store,'feed-1',window,testPolicy.now());expect(shortlist.candidates).toHaveLength(1);const text=shortlist.candidates[0].facts.map(f=>f.text).join(' ');for(const term of ['5%','$200 million','may','2%','50%'])expect(text).toContain(term);
});
it('preserves independent developments and their own source-owned propositions',async()=>{
 const {mentions}=await construct(1,'Parliament approved banking reform. The court independently overturned a tax decision.',{split:true});
 const versions=await store.list<any>('feed-1','event_versions');expect(versions).toHaveLength(2);expect(new Set(versions.map(v=>v.state))).toEqual(new Set(mentions.map(m=>m.sourceText)));expect(await store.list('feed-1','memberships')).toHaveLength(2);
});
it('consolidates overlapping articles without losing either evidence identity',async()=>{
 const body='Lebanon Parliament approved banking reform legislation.';await construct(1,body);const event=(await store.list<any>('feed-1','events'))[0];await construct(2,body,{eventId:event.id,effects:['CORROBORATES']});
 expect(await store.list('feed-1','events')).toHaveLength(1);const current=(await store.list<any>('feed-1','events'))[0],members=(await store.list<any>('feed-1','memberships')).filter(m=>m.eventVersionId===current.currentVersionId);expect(members).toHaveLength(2);
 const shortlist=await prepareSemanticShortlist(store,'feed-1',window,testPolicy.now());expect(shortlist.candidates).toHaveLength(1);expect(shortlist.candidates[0].facts).toHaveLength(1);expect(shortlist.candidates[0].facts[0].evidenceRevisionIds).toHaveLength(2);
});
async function publishFixture(){
 const selected=await scoreAndSelect(store,'feed-1',window,DEFAULT_BRIEFING_BUDGET,testPolicy.now()),edition=await publishSelection(store,'feed-1',selected.id,{now:testPolicy.now});await projectEditionLedger(store,'feed-1',edition.id);return edition;
}
describe('previously published minimal state',()=>{
 const original='Lebanon Parliament approved 40 banking reform measures.';
 beforeEach(async()=>{await construct(1,original);await publishFixture()});
it.each(['CORRECTS','CONTRADICTS'] as const)('retains %s obligations and event continuity without structured slots',async effect=>{
 const event=(await store.list<any>('feed-1','events'))[0];
 await construct(2,'Officials corrected the banking reform count to 35 measures.',{eventId:event.id,effects:[effect]});
 expect(await store.list('feed-1','events')).toHaveLength(1);expect(await store.list('feed-1','correction_obligations')).toMatchObject([{kind:effect==='CORRECTS'?'CORRECTED':'CONTRADICTED'}]);
 const shortlist=await prepareSemanticShortlist(store,'feed-1',window,testPolicy.now());expect(shortlist.candidates.some(c=>c.protectedReasons.includes(effect)&&c.facts.some(f=>f.text.includes('35')))).toBe(true);
});
it('published exact corroboration is not selected as new news without entity or slot annotations',async()=>{
 const event=(await store.list<any>('feed-1','events'))[0];await construct(2,original,{eventId:event.id,effects:['CORROBORATES']});
 const next={...window,end:'2026-10-05T00:00:00Z'},shortlist=await prepareSemanticShortlist(store,'feed-1',next,testPolicy.now());
 // Known repeats are excluded before planning, while canonical evidence/history remain retained.
 expect(shortlist.candidates).toHaveLength(0);expect(shortlist.ledger.some(e=>e.claimFacts.includes(original))).toBe(true);expect(await store.list('feed-1','events')).toHaveLength(1);expect((await store.currentEvidence('feed-1'))).toHaveLength(2);
 const selected=await scoreAndSelect(store,'feed-1',next,DEFAULT_BRIEFING_BUDGET,testPolicy.now());expect(selected.selectedCandidateIds).toHaveLength(0);
});
});

describe('five independent sources of one known but unpublished occurrence',()=>{
 const body='Lebanon Parliament approved banking reform legislation.';let eventId:string;
 beforeEach(async()=>{await construct(1,body);eventId=(await store.list<any>('feed-1','events'))[0].id});
 beforeEach(async()=>{await construct(2,body,{eventId,effects:['CORROBORATES']});await construct(3,'Lebanon Parliament passed banking reform legislation.',{eventId,effects:['CORROBORATES']})});
 beforeEach(async()=>{await construct(4,body,{eventId,effects:['CORROBORATES']});await construct(5,'Banking reform legislation was approved by Lebanon Parliament.',{eventId,effects:['CORROBORATES']})});
 it('keeps one identity and all provenance, but does not mistake ingestion for reader communication',async()=>{
  expect(await store.list('feed-1','events')).toHaveLength(1);expect(await store.list('feed-1','editions')).toHaveLength(0);
  const shortlist=await prepareSemanticShortlist(store,'feed-1',window,testPolicy.now());expect(shortlist.ledger).toHaveLength(0);expect(shortlist.candidates).toHaveLength(1);expect(shortlist.candidates[0].readerState).toBe('UNSEEN');expect(new Set(shortlist.candidates[0].facts.flatMap(f=>f.evidenceRevisionIds)).size).toBe(5);expect(shortlist.candidates[0].facts.some(f=>f.text.includes('passed'))).toBe(true);
 });
});
describe('material detail about an already published event',()=>{
 let eventId:string;
 beforeEach(async()=>{await construct(1,'Lebanon Parliament approved banking reform legislation.');eventId=(await store.list<any>('feed-1','events'))[0].id;await publishFixture()});
 beforeEach(async()=>{await construct(2,'Lebanon Parliament approved banking reform legislation. The reform guarantees compensation of $5000 per depositor.',{eventId,effects:['ADDS_DETAIL']})});
 it('keeps the canonical identity but preserves new reader understanding without repeating the whole event',async()=>{
  const next={...window,start:'2026-10-04T00:00:00Z',end:'2026-10-05T00:00:00Z'},shortlist=await prepareSemanticShortlist(store,'feed-1',next,testPolicy.now());
  expect(await store.list('feed-1','events')).toHaveLength(1);expect(shortlist.candidates).toHaveLength(1);const candidate=shortlist.candidates[0];expect(candidate.readerState).toBe('PARTIALLY_SEEN');expect(candidate.fallbackEditorial.newUnderstanding.some(f=>f.text.includes('$5000'))).toBe(true);expect(candidate.fallbackEditorial.newUnderstanding.some(f=>f.text==='Lebanon Parliament approved banking reform legislation.')).toBe(false);
 });
});
