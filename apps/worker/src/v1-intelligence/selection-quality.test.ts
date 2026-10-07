import {afterEach,beforeEach,expect,it,describe} from 'vitest';
import corpus from './fixtures/ai-overload-40.json';
import {cheapEditorialRanking,compareEditorialCandidates} from './editorial-ranking';
import {boundShortlist,prepareSemanticShortlist,type ShortlistCandidate} from './shortlist';
import {nonFactRole,extractClaimMentions} from './claims';
import {revisionChangesMeaning} from './correction-materiality';
import {noveltyClass} from './editorial';
import {communicationCost} from './planning-capacity';
import {fallbackEditorialPlan,prepareEditorialPlan,editorialPlanWireSchemaFor,validateEditorialPlan} from './editorial-plan';
import {DEFAULT_BRIEFING_BUDGET,scoreAndSelect} from './scoring';
import {createStrongSemanticModel} from './semantic-model';
import {createIntakeDatabase,seedIntakeScope} from '../v1-intake/test-utils';
import {V1IntakeStore} from '../v1-intake/store';
import {V1FeedStore,feedTransact} from './store';
import {feedFixture,seedIntelligence} from './test-utils';
import {deferEditorialWork,resolveEditorialWork} from './editorial-work';
import {projectEditionLedger} from './ledger';
import {publishSelection} from './publication';
import type {Env} from '../types';
const aiFeed={...feedFixture,title:'AI Industry Watch',interests:['AI model releases, research, products, companies and industry developments'],geography:[]};
function candidate(id:string,text:string,old=false):ShortlistCandidate {
 const c={targetType:'EVENT',targetVersionId:id,stableTargetId:'event-'+id,eventVersionIds:[id],evidenceRevisionIds:['r-'+id],facts:[{id:'fact-'+id,text,evidenceRevisionIds:['r-'+id],claimMentionIds:[],selfContained:'YES'}],stateSlotIds:[],effects:[],flags:old?['OLD_RECAP']:[],protectedReasons:[],correctionObligationIds:[],priority:.6,fallbackEditorial:{decision:'INCLUDE',newUnderstanding:[{text,evidenceRevisionIds:['r-'+id]}],previouslyCommunicated:[],treatment:'BRIEF',reasonCodes:['MATERIAL_NEW_FACT']}} as unknown as ShortlistCandidate;
 c.ranking=cheapEditorialRanking(aiFeed,c);c.communicationCost=communicationCost(c);return c;
}
it('Feed relevance ranks a relevant development above unrelated security all else equal',()=>{
 const relevant=candidate('z','A company released an AI research model.'),other=candidate('a','A retailer sent unauthorized notifications through its app.');
 expect(compareEditorialCandidates(relevant,other)).toBeLessThan(0);
});
it('equally relevant semantic ordering survives UUID reassignment and shuffled input',()=>{
 const a=candidate('z','Alpha released an AI model.'),b=candidate('a','Beta released an AI model.');
 const order=(list:ShortlistCandidate[])=>boundShortlist(list,1).selected.map(c=>c.facts[0].text);
 expect(order([a,b])).toEqual(order([{...b,targetVersionId:'z'},{...a,targetVersionId:'a'}]));
});
it('25 ordinary candidates are ranked before the cap; protected work bypasses it',()=>{
 const list=Array.from({length:25},(_,i)=>candidate(String(i),i<5?'A retailer changed its app.':`Company ${i} released an AI model.`));
 const protectedItem={...candidate('protected','An official correction.'),protectedReasons:['CORRECTS']};
 const bounded=boundShortlist([...list,protectedItem],20);
 expect(bounded.selected).toHaveLength(21);expect(bounded.selected).toContain(protectedItem);
 expect(bounded.overflow.every(c=>c.facts[0].text.includes('retailer'))).toBe(true);
});
it('retained forty-item corpus ranks all factual material without asserting exact winners',()=>{
 expect(corpus).toHaveLength(40);
 const facts=corpus.filter(r=>!nonFactRole(r.body)).map((r,i)=>candidate(String(i),r.body,Date.parse(r.publishedAt)<Date.parse('2026-10-05T21:00:00Z')));
 const first=boundShortlist(facts,20),shuffled=boundShortlist([...facts].reverse().map((c,i)=>({...c,targetVersionId:'changed-'+i})),20);
 expect(first.selected.map(c=>c.ranking!.semanticKey)).toEqual(shuffled.selected.map(c=>c.ranking!.semanticKey));
 const currentRelevant=facts.filter(c=>!c.flags.includes('OLD_RECAP')&&c.ranking!.relevance>.5);
 expect(currentRelevant.every(c=>first.selected.includes(c))).toBe(true);
 expect(first.selected.every(c=>c.ranking&&c.communicationCost)).toBe(true);
});
it.each(['What is a supercomputer for?','How does it work?','Register now to save $100','We explain all.','Learn how founders choose their platform.','Save up to $100 today.'])('non-factual excerpt is identified: %s',text=>expect(nonFactRole(text)).toBeDefined());
it('mixed promotional evidence retains factual reporting and exact spans',async()=>{
 const {mentions}=await extractClaimMentions({id:'r',feedId:'f',contentHash:'h',body:'Register now to save $100. Acme announced an open AI model.',acceptedAt:'2026-10-07T00:00:00Z'} as any);
 expect(mentions).toHaveLength(2);expect(mentions[0].reportingRole).toBe('CALL_TO_ACTION');expect(mentions[1].reportingRole).toBe('QUOTED_CLAIM');
});
it.each([['Officials confirmed the result.','Officials confirmed the result',false],['The agency confir\u200bmed the result.','The agency confirmed the result.',false],['Officials reported 12 deaths.','Officials reported 40 deaths.',true],['The minister may resign.','The minister will resign.',true],['The proposal was approved.','The proposal was not approved.',true],['Officials confirmed the claim.','Officials retracted the claim.',true],['The agency approved the result.','The agency approves the result.',true]])('revision materiality: %s → %s', (a,b,changed)=>expect(revisionChangesMeaning(a,b)).toBe(changed));
it('editorial model is independent of deterministic Event configuration and explicit fallback is honored',()=>{
 const env={OPENROUTER_API_KEY:'synthetic',V1_SEMANTIC_POLICY:'DETERMINISTIC'} as Env;
 expect(createStrongSemanticModel(env,fetch,'EDITORIAL')).toBeDefined();expect(createStrongSemanticModel(env,fetch,'EVENT')).toBeUndefined();
 expect(createStrongSemanticModel({...env,V1_EDITORIAL_MODEL_POLICY:'DETERMINISTIC'},fetch,'EDITORIAL')).toBeUndefined();
});

it('twenty ordinary candidates share a compact wire schema while exact fact ownership remains mandatory',()=>{
 const candidates=Array.from({length:20},(_,i)=>candidate(String(i),`Company ${i} released an AI model.`)),sl={candidates,ledger:[],obligations:[]} as unknown as import('./shortlist').ShortlistRecord;
 const wire=editorialPlanWireSchemaFor((sl as any));expect(wire.properties.stories.items.anyOf).toHaveLength(2);expect(JSON.stringify(wire).length).toBeLessThan(12000);
 const body=fallbackEditorialPlan(sl);body.stories[0].mustIncludeFactIds=[candidates[1].facts[0].id];expect(()=>validateEditorialPlan(body,sl)).toThrow();
});
it('compact provider schema scopes history to its related target and gives fresh targets no ledger handles',()=>{
 const a=candidate('a','Acme released an AI model.'),b=candidate('b','Beta released an AI model.'),sl={candidates:[a,b],ledger:[{id:'known',eventIds:[a.stableTargetId],storylineIds:[],claimFacts:['Acme announced an earlier model.']}],obligations:[]} as any;
 const schema=editorialPlanWireSchemaFor(sl),branches=schema.properties.stories.items.anyOf as any[];
 const fresh=branches.filter(x=>x.properties.targetVersionId.enum.includes('b')),continuing=branches.filter(x=>x.properties.targetVersionId.enum.includes('a'));
 expect(fresh).toHaveLength(2);expect(fresh.every(x=>x.properties.previousLedgerEntryIds.maxItems===0)).toBe(true);
 expect(continuing).toHaveLength(2);expect(continuing.every(x=>x.properties.previousLedgerEntryIds.items.enum.includes('known'))).toBe(true);
 const body=fallbackEditorialPlan(sl);body.stories[1].previousLedgerEntryIds=['known'];expect(()=>validateEditorialPlan(body,sl)).toThrow();
});

describe('durable editorial selection',()=>{
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,store:V1FeedStore;
beforeEach(async()=>{ctx=await createIntakeDatabase();await seedIntakeScope(new V1IntakeStore(ctx.db));store=new V1FeedStore(ctx.db);await store.registerFeed(aiFeed)});
afterEach(async()=>ctx.dispose());
const first={start:'2026-10-03T12:00:00Z',end:'2026-10-03T13:00:00Z',kind:'HOURLY' as const};
it('ordinary overflow and DEFER carry without a revision and resolve after communication',async()=>{
 await seedIntelligence(store,1,'Acme announced an AI model.');await seedIntelligence(store,2,'Beta announced an AI research platform.','publisher-2');
 const sl=await prepareSemanticShortlist(store,'feed-1',first,first.end,1),plan=await prepareEditorialPlan(store,sl,DEFAULT_BRIEFING_BUDGET,first.end),selection=await scoreAndSelect(store,'feed-1',first,DEFAULT_BRIEFING_BUDGET,first.end,undefined,plan);
 expect(sl.overflow).toHaveLength(1);expect(await store.list('feed-1','editorial_deferred_work')).toEqual(expect.arrayContaining([expect.objectContaining({reason:'SHORTLIST_OVERFLOW'})]));
 const edition=await publishSelection(store,'feed-1',selection.id,{now:()=>first.end});await projectEditionLedger(store,'feed-1',edition.id);
 const later={...first,start:first.end,end:'2026-10-03T14:00:00Z'},next=await prepareSemanticShortlist(store,'feed-1',later,later.end);
 expect(next.candidates.some(c=>c.stableTargetId===sl.overflow[0].stableTargetId)).toBe(true);
 const nextPlan=await prepareEditorialPlan(store,next,DEFAULT_BRIEFING_BUDGET,later.end),nextSelection=await scoreAndSelect(store,'feed-1',later,DEFAULT_BRIEFING_BUDGET,later.end,undefined,nextPlan),nextEdition=await publishSelection(store,'feed-1',nextSelection.id,{now:()=>later.end});await projectEditionLedger(store,'feed-1',nextEdition.id);
 expect(await store.list('feed-1','editorial_work_resolutions')).toEqual(expect.arrayContaining([expect.objectContaining({workId:expect.any(String)})]));
 const after=await prepareSemanticShortlist(store,'feed-1',{...later,start:later.end,end:'2026-10-03T15:00:00Z'},'2026-10-03T15:00:00Z');expect(after.candidates).toHaveLength(0);
},30000);
it('a formatting-only update to an already communicated fact is excluded as corroboration before planning',async()=>{
 await seedIntelligence(store,1,'Acme announced an AI model.');const sl=await prepareSemanticShortlist(store,'feed-1',first,first.end),plan=await prepareEditorialPlan(store,sl,DEFAULT_BRIEFING_BUDGET,first.end),selection=await scoreAndSelect(store,'feed-1',first,DEFAULT_BRIEFING_BUDGET,first.end,undefined,plan),edition=await publishSelection(store,'feed-1',selection.id,{now:()=>first.end});await projectEditionLedger(store,'feed-1',edition.id);
 await seedIntelligence(store,2,'Acme announced an AI model','publisher-2','2026-10-03T13:30:00Z');const later={...first,start:first.end,end:'2026-10-03T14:00:00Z'},next=await prepareSemanticShortlist(store,'feed-1',later,later.end);expect(next.candidates).toHaveLength(0);expect(next.obligations).toHaveLength(0);
},30000);
it('new planner capacity deferral has its own reason, not already communicated',async()=>{
 await seedIntelligence(store,1,'Acme announced an AI model.');await seedIntelligence(store,2,'Beta announced an AI research platform.','publisher-2');
 const sl=await prepareSemanticShortlist(store,'feed-1',first,first.end),budget={...DEFAULT_BRIEFING_BUDGET,maxStories:1},plan=await prepareEditorialPlan(store,sl,budget,first.end),selection=await scoreAndSelect(store,'feed-1',first,budget,first.end,undefined,plan);
 expect(plan.stories.filter(s=>s.decision==='DEFER')).toHaveLength(1);expect(selection.omissions.map(o=>o.reason)).toContain('DEFERRED_EDITORIAL_WORK');expect(selection.omissions.map(o=>o.reason)).not.toContain('ALREADY_COMMUNICATED');
},30000);
it('planner receives capacity and constrains three-story writer before selection',async()=>{
 const texts=['Acme released an AI model.','The university opened a robotics laboratory.','Parliament passed a technology regulation.','Researchers discovered a semiconductor material.'];for(let i=0;i<texts.length;i++)await seedIntelligence(store,i+1,texts[i],`publisher-${i}`);
 const sl=await prepareSemanticShortlist(store,'feed-1',first,first.end),budget={...DEFAULT_BRIEFING_BUDGET,maxStories:3};
 let observed:any;
 const strong={model:'synthetic',usage:()=>({calls:1,costUsd:.001,reported:true}),complete:async(_f:string,_p:string,state:any)=>{observed=state;const wire=(await import('./editorial-transport')).compactEditorialInput({...sl,budget,communicationCapacity:{maxStories:3}});const body=fallbackEditorialPlan(sl);if(state.feasibilityFeedback)body.stories=body.stories.map((s,i)=>i<3?s:{...s,decision:'DEFER' as const,treatment:'OMIT' as const,rationale:'Fits the three-story capacity.'});return {value:wire.encode(body),usage:{calls:1,costUsd:.001,reported:true}}}};
 const plan=await prepareEditorialPlan(store,sl,budget,first.end,strong as any);
 expect(observed.communicationCapacity.maxStories).toBe(3);expect(plan.modelOperationIds).toHaveLength(2);expect(plan.capacityAdjustments).toHaveLength(0);expect(observed.candidates[0].communicationCost.inputUnits).toBeGreaterThan(0);expect(plan.plannerSource).toBe('REAL_COMPARATIVE_MODEL');expect(plan.stories.filter(s=>s.decision==='SELECT')).toHaveLength(3);expect(plan.stories.filter(s=>s.decision==='DEFER')).toHaveLength(1);
},30000);
it('questions remain evidence but cannot form normal propositions, and mixed articles preserve factual claims',async()=>{
 await seedIntelligence(store,1,'What is a supercomputer for? We explain all.');
 expect(await store.list('feed-1','propositions')).toHaveLength(0);
 await seedIntelligence(store,2,'Register now to save $100. Acme announced an open AI model.','publisher-2');
 const propositions=await store.list<any>('feed-1','propositions');expect(propositions).toHaveLength(1);expect(propositions[0].text).toContain('Acme announced');
},15000);
it('bootstrap considers older retained current-state context without calling its ingestion a new event time',async()=>{
 await seedIntelligence(store,1,'Acme announced an AI model.','publisher-1','2026-10-03T10:00:00Z');
 const sl=await prepareSemanticShortlist(store,'feed-1',first,first.end);expect(sl.bootstrap).toBe(true);expect(sl.candidates).toHaveLength(1);expect(sl.candidates[0].facts[0].timing?.sourcePublishedAt).toBe('2026-10-03T10:00:00.000Z');
},15000);

it('repeated ordinary deferral preserves its first expiry and does not grow duplicate open work',async()=>{
 const c=candidate('v1','Acme announced an AI model.');
 await feedTransact(store,'feed-1',async tx=>{await deferEditorialWork(tx,c,'DEFERRED_EDITORIAL_WORK',first.end,'first');await deferEditorialWork(tx,c,'DEFERRED_EDITORIAL_WORK','2026-10-05T13:00:00Z','later');await deferEditorialWork(tx,c,'SHORTLIST_OVERFLOW','2026-10-05T13:00:00Z','overflow')});
 const work=await store.list<any>('feed-1','editorial_deferred_work');expect(work).toHaveLength(2);expect(new Set(work.map(w=>w.expiresAt))).toEqual(new Set(['2026-10-10T13:00:00.000Z']));
},15000);
it('an explicit editor omission terminates existing ordinary work',async()=>{
 await seedIntelligence(store,1,'Acme announced an AI model.');const sl=await prepareSemanticShortlist(store,'feed-1',first,first.end);
 await feedTransact(store,'feed-1',tx=>deferEditorialWork(tx,sl.candidates[0],'DEFERRED_EDITORIAL_WORK',first.end,'earlier'));
 const strong={model:'synthetic',usage:()=>({calls:1,costUsd:.001,reported:true}),complete:async()=>{const wire=(await import('./editorial-transport')).compactEditorialInput(sl),body=fallbackEditorialPlan(sl);body.stories=body.stories.map(s=>({...s,decision:'SUPPRESS' as const,treatment:'OMIT' as const,rationale:'Not useful to this reader.',relevanceRationale:'Insufficient relevance.'}));return {value:wire.encode(body),usage:{calls:1,costUsd:.001,reported:true}}}};
 await prepareEditorialPlan(store,sl,DEFAULT_BRIEFING_BUDGET,first.end,strong as any);
 expect(await store.list('feed-1','editorial_work_resolutions')).toEqual(expect.arrayContaining([expect.objectContaining({reason:'OMITTED_BY_EDITOR'})]));
 const later=await prepareSemanticShortlist(store,'feed-1',{...first,start:first.end,end:'2026-10-03T14:00:00Z'},'2026-10-03T14:00:00Z');expect(later.candidates).toHaveLength(0);const replay=await prepareSemanticShortlist(store,'feed-1',first,first.end);expect(replay.candidates).toHaveLength(1);
},15000);

it('batched relevance uses valid JEV question handles and demotes confident irrelevance without filtering',async()=>{
 await seedIntelligence(store,1,'Acme released an AI model.');await seedIntelligence(store,2,'A retailer sent unauthorized app notifications.','publisher-2');
 let calls=0;
 const fetcher=(async(_url:any,init:any)=>{calls++;const request=JSON.parse(init.body);expect(Object.keys(request.questions).every(k=>/^[a-z][a-z_]*$/.test(k))).toBe(true);const answers=Object.fromEntries(request.state.candidates.map((c:any)=>{const relevant=c.facts.includes('AI model');return [c.key,{type:'score',score:relevant?2:0,confidence:.9,probabilities:{'0':relevant?0:1,'1':0,'2':relevant?1:0}}]}));return new Response(JSON.stringify({answers,usage:{cost:.001,input_tokens:100,output_tokens:30}}))}) as typeof fetch;
 const env={OPENROUTER_API_KEY:'synthetic',V1_EDITORIAL_RANKING_POLICY:'SEMANTIC'} as Env,sl=await prepareSemanticShortlist(store,'feed-1',first,first.end,20,env,fetcher);
 expect(calls).toBe(1);expect(sl.candidates).toHaveLength(2);expect(sl.candidates[0].facts[0].text).toContain('AI model');expect(sl.candidates[1].ranking).toMatchObject({source:'JEV',relevance:0});
 await prepareSemanticShortlist(store,'feed-1',first,first.end,20,env,fetcher);expect(calls).toBe(1);
},20000);

it('low relevance and low information gain never claim prior communication',()=>{expect(noveltyClass('LOW_RELEVANCE')).toBe('LOW_RELEVANCE');expect(noveltyClass('LOW_INFORMATION_GAIN')).toBe('LOW_INFORMATION_GAIN')});

it('expired ordinary work is explicitly retired even when the Feed has not published yet',async()=>{
 await seedIntelligence(store,1,'Acme announced an AI model.');const sl=await prepareSemanticShortlist(store,'feed-1',first,first.end);
 await feedTransact(store,'feed-1',tx=>deferEditorialWork(tx,sl.candidates[0],'DEFERRED_EDITORIAL_WORK',first.end,'earlier',first.end));
 const next=await prepareSemanticShortlist(store,'feed-1',{...first,start:'2026-10-11T12:00:00Z',end:'2026-10-11T13:00:00Z'},'2026-10-11T13:00:00Z');expect(next.candidates).toHaveLength(0);expect(await store.list('feed-1','editorial_work_resolutions')).toEqual(expect.arrayContaining([expect.objectContaining({reason:'STALE_AFTER_SEVEN_DAYS'})]));
},20000);
it('a newer Event state supersedes its deferred old version without surfacing a separate old story',async()=>{
 await seedIntelligence(store,1,'Officials reported 12 deaths.');const sl=await prepareSemanticShortlist(store,'feed-1',first,first.end);
 await feedTransact(store,'feed-1',tx=>deferEditorialWork(tx,sl.candidates[0],'DEFERRED_EDITORIAL_WORK',first.end,'earlier',first.end));
 await seedIntelligence(store,2,'Officials reported 40 deaths.','publisher-2','2026-10-03T13:30:00Z');
 const next=await prepareSemanticShortlist(store,'feed-1',{...first,start:first.end,end:'2026-10-03T14:00:00Z'},'2026-10-03T14:00:00Z');expect(next.candidates).toHaveLength(1);expect(next.candidates[0].targetVersionId).not.toBe(sl.candidates[0].targetVersionId);expect(next.candidates[0].facts.some(f=>f.text.includes('40 deaths'))).toBe(true);expect(await store.list('feed-1','editorial_work_resolutions')).toEqual(expect.arrayContaining([expect.objectContaining({reason:'REPLACED_BY_CURRENT_VERSION'})]));
},30000);

});

it('conditional second-person registration is a CTA without suppressing reported registration',()=>{
 expect(nonFactRole('If you\u2019re planning to be one of them, register for your ticket before prices increase at the door.')).toBe('CALL_TO_ACTION');
 expect(nonFactRole('Officials registered 100 new companies this month.')).toBeUndefined();
 expect(nonFactRole('If demand increases, the company will register a new subsidiary.')).toBeUndefined();
});
