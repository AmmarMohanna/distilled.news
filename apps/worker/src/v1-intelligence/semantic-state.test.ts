import {afterEach,beforeEach,expect,it} from 'vitest';
import {createIntakeDatabase,seedIntakeScope,batchFixture,testPolicy} from '../v1-intake/test-utils';
import {V1IntakeStore} from '../v1-intake/store';
import {createCandidateIntakePort} from '../v1-intake/intake';
import {acceptAcquiredContent} from '../v1-intake/evidence';
import {V1FeedStore,feedTransact} from './store';
import {independentSupportCount} from './scoring';
import {feedFixture,seedIntelligence} from './test-utils';
import {extractClaimMentions} from './claims';
import {deterministicMatchers} from './matchers';
import {processEvidenceIntelligence} from './engine';
import {validateConstruction,type SemanticGroup} from './semantic-state';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,store:V1FeedStore;
beforeEach(async()=>{ctx=await createIntakeDatabase();await seedIntakeScope(new V1IntakeStore(ctx.db));store=new V1FeedStore(ctx.db);await store.registerFeed(feedFixture)});
afterEach(async()=>ctx.dispose());
it('persists exact TEXT propositions and compact supported Storyline memory',async()=>{
 await seedIntelligence(store,1,'Officials may approve reform. The date remains uncertain.');
 expect(await store.list('feed-1','propositions')).toHaveLength(2);
 expect(await store.list('feed-1','storyline_memories')).toMatchObject([{lifecycle:'WATCHING',openQuestions:[{text:'The date remains uncertain.'}]}]);
},15000);
it('shared dependency metadata changes independence without adding an unapproved source fact',async()=>{
 await seedIntelligence(store,1,'Officials reported 12 people affected. Reporting by WireDesk','publisher-a');
 await seedIntelligence(store,2,'Officials reported 40 people affected. Reporting by WireDesk','publisher-b');
 const count=await feedTransact(store,'feed-1',async tx=>independentSupportCount(tx,(await store.currentEvidence('feed-1')).map(e=>e.revision)));
 expect(count).toBe(1);expect((await store.list<any>('feed-1','propositions')).some(p=>p.evidenceRevisionIds.length===0)).toBe(false);
},15000);
it('retains multilingual aliases and exact structured quantity while rejecting invented values',async()=>{
 const revision={id:'r',feedId:'feed-1',contentHash:'h',body:'BDL (مصرف لبنان) confirmed 40 people affected.',acceptedAt:testPolicy.now()} as any,{mentions}=await extractClaimMentions(revision),m=mentions[0];
 const group:SemanticGroup={claimMentionIds:[m.id],eventId:null,storylineId:null,structuralRelation:'NEW_STORYLINE',epistemicEffects:['CHANGES_STATE'],entities:[{canonicalLabel:'Banque du Liban',aliases:['BDL','مصرف لبنان'],claimMentionIds:[m.id]}],slots:[{kind:'count',claimMentionId:m.id,entityLabel:'Banque du Liban',value:'40',asOf:null}],storylineState:{lifecycle:'WATCHING',openQuestionMentionIds:[],expectedNextDate:null}};
 const value={groups:[group],backgroundMentionIds:[],provenance:{scorer:'GPT',policyVersion:'test'}};expect(validateConstruction(value,mentions)).toEqual(value);
 expect(()=>validateConstruction({...value,groups:[{...group,slots:[{...group.slots[0],value:'12'}]}]},mentions)).toThrow();
},15000);
it('decomposes two developments from one approved article while preserving exact evidence membership',async()=>{
 const intake=new V1IntakeStore(ctx.db),accepted=await createCandidateIntakePort(intake,testPolicy).acceptBatch(batchFixture());
 await acceptAcquiredContent(intake,{id:'multi',feedId:'feed-1',candidateId:accepted.receipts[0].candidateItemId!,sourceObservationId:'observation-1',body:'Parliament approved banking reform. The court overturned the tax decision.',representation:'ARTICLE_EXCERPT',contentCompleteness:'COMPLETE',acquisitionMethod:'supplied_payload',acquiredAt:testPolicy.now()},testPolicy);
 const revision=(await store.currentEvidence('feed-1'))[0].revision,{mentions}=await extractClaimMentions(revision);
 const groups:SemanticGroup[]=mentions.map(m=>({claimMentionIds:[m.id],eventId:null,storylineId:null,structuralRelation:'NEW_STORYLINE',epistemicEffects:['CHANGES_STATE'],entities:[],slots:[]}));
 const construction={groups,backgroundMentionIds:[],provenance:{scorer:'GPT',policyVersion:'test'}};
 const matchers={...deterministicMatchers,event:{match:()=>({structuralRelation:'NEW_STORYLINE' as const,epistemicEffects:['CHANGES_STATE' as const],confidence:.9,provenance:construction.provenance})},construction:()=>construction};
 await processEvidenceIntelligence(store,JSON.stringify(['REASSESS','observation-1','']),testPolicy.now(),matchers);
 expect(await store.list('feed-1','events')).toHaveLength(2);expect(await store.list('feed-1','storylines')).toHaveLength(2);
 expect((await store.list<any>('feed-1','event_versions')).map(e=>e.state).sort()).toEqual(mentions.map(m=>m.sourceText).sort());
 expect(await store.list('feed-1','memberships')).toHaveLength(2);
 const bad={...construction,groups:[{...groups[0],slots:[{kind:'count' as const,claimMentionId:mentions[0].id,entityLabel:null,value:'40',asOf:null}]}]};expect(()=>validateConstruction(bad,mentions)).toThrow();
},15000);

it('schedules repair for any deferred construction group, independently of the first group',async()=>{
 const intake=new V1IntakeStore(ctx.db),accepted=await createCandidateIntakePort(intake,testPolicy).acceptBatch(batchFixture());
 await acceptAcquiredContent(intake,{id:'partial',feedId:'feed-1',candidateId:accepted.receipts[0].candidateItemId!,sourceObservationId:'observation-1',body:'Parliament approved banking reform. The court overturned the tax decision.',representation:'ARTICLE_EXCERPT',contentCompleteness:'COMPLETE',acquisitionMethod:'supplied_payload',acquiredAt:testPolicy.now()},testPolicy);
 const revision=(await store.currentEvidence('feed-1'))[0].revision,{mentions}=await extractClaimMentions(revision),construction={groups:mentions.map((m,i)=>({claimMentionIds:[m.id],eventId:null,storylineId:null,structuralRelation:i===0?'NEW_STORYLINE' as const:'DEFER' as const,epistemicEffects:[],entities:[],slots:[]})),backgroundMentionIds:[],provenance:{scorer:'GPT',policyVersion:'test'}};
 const matchers={...deterministicMatchers,event:{match:()=>({structuralRelation:'NEW_STORYLINE' as const,epistemicEffects:[],confidence:.9,provenance:construction.provenance})},construction:()=>construction};
 const receipt=await processEvidenceIntelligence(store,JSON.stringify(['REASSESS','observation-1','']),testPolicy.now(),matchers);
 expect(await store.list('feed-1','rematch_requests')).toHaveLength(1);expect((receipt as any).semanticDeferred).toBe(true);
},25000);
it('support removal preserves decomposed Event claim subset and structured provenance',async()=>{
 const intake=new V1IntakeStore(ctx.db);
 const acquire=async(sequence:number,body:string)=>{const batch=batchFixture(sequence);batch.observations[0].sourceItemKey=`item-${sequence}`;batch.proposals[0].sourceItemKey=`item-${sequence}`;const accepted=await createCandidateIntakePort(intake,testPolicy).acceptBatch(batch);await acceptAcquiredContent(intake,{id:`c-${sequence}`,feedId:'feed-1',candidateId:accepted.receipts[0].candidateItemId!,sourceObservationId:`observation-${sequence}`,body,representation:'ARTICLE_EXCERPT',contentCompleteness:'COMPLETE',acquisitionMethod:'supplied_payload',acquiredAt:testPolicy.now()},testPolicy);return (await store.currentEvidence('feed-1')).find(e=>e.revision.sourceObservationId===`observation-${sequence}`)!.revision};
 const revision=await acquire(1,'Parliament approved 40 reform measures. The court overturned the tax decision.'),{mentions}=await extractClaimMentions(revision),provenance={scorer:'GPT',policyVersion:'test'};
 const groups:SemanticGroup[]=mentions.map((m,i)=>({claimMentionIds:[m.id],eventId:null,storylineId:null,structuralRelation:'NEW_STORYLINE',epistemicEffects:[],entities:[],slots:i===0?[{kind:'count',claimMentionId:m.id,entityLabel:null,value:'40',asOf:null}]:[]}));
 await processEvidenceIntelligence(store,JSON.stringify(['REASSESS','observation-1','']),testPolicy.now(),{...deterministicMatchers,event:{match:()=>({structuralRelation:'NEW_STORYLINE',epistemicEffects:[],confidence:.9,provenance})},construction:()=>({groups,backgroundMentionIds:[],provenance})});
 const versions=await store.list<any>('feed-1','event_versions'),first=versions.find(e=>e.state.includes('40'))!,eventId=first.eventId;
 await acquire(2,'Parliament approved 40 reform measures.');
 await processEvidenceIntelligence(store,JSON.stringify(['REASSESS','observation-2','']),testPolicy.now(),{...deterministicMatchers,event:{match:()=>({structuralRelation:'SAME_EVENT',eventId,epistemicEffects:['CORROBORATES'],confidence:.9,provenance})}});
 const deletion=batchFixture(3);deletion.observations[0]={...deletion.observations[0],sourceItemKey:'item-2',operation:'DELETE',authoritativeCurrentState:true};deletion.proposals=[];
 await createCandidateIntakePort(intake,{...testPolicy,orderingFor:async()=>({...await testPolicy.orderingFor(deletion.observations[0]),authoritativeReplacementAllowed:true})}).acceptBatch(deletion);
 await processEvidenceIntelligence(store,JSON.stringify(['REASSESS','observation-3','']),testPolicy.now());
 const current=(await store.list<any>('feed-1','events')).find(e=>e.id===eventId),version=await store.read<any>('feed-1','event_versions',current.currentVersionId),state=await store.read<any>('feed-1','event_semantic_states',current.currentVersionId);
 expect(version.state).toBe(mentions[0].sourceText);expect(state.provenance.scorer).toBe('GPT');expect(state.propositionIds).toHaveLength(1);expect(state.stateSlotIds).toHaveLength(1);
},45000);
