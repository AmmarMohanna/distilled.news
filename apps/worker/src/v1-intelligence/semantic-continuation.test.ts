import {beforeEach,afterEach,it,expect} from 'vitest';
import {createIntakeDatabase,seedIntakeScope,testPolicy} from '../v1-intake/test-utils';
import {V1IntakeStore} from '../v1-intake/store';
import {V1FeedStore} from './store';
import {feedFixture,acceptEvidence,syntheticModelAdmission} from './test-utils';
import {extractClaimMentions,isNewsMention} from './claims';
import {continueSemanticConstruction} from './semantic-continuation';
import {indexSourcePassages} from './source-passages';
import {PACKET_CONSTRUCTION_VERSION} from './construction-transport';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,store:V1FeedStore;
beforeEach(async()=>{ctx=await createIntakeDatabase();await seedIntakeScope(new V1IntakeStore(ctx.db));store=new V1FeedStore(ctx.db);await store.registerFeed(feedFixture);await acceptEvidence(store,1,'Parliament approved banking reform. The airport reopened. Officials confirmed a security incident. The minister resigned.');});afterEach(async()=>ctx.dispose());
const group=(ids:string[])=>({claimMentionIds:ids,eventId:null,storylineId:null,structuralRelation:'NEW_STORYLINE',epistemicEffects:[],entities:[],slots:[]});
it('completes and reuses an all-background source continuation without inventing a development',async()=>{
 const revision=(await store.currentEvidence('feed-1'))[0].revision,{mentions}=await indexSourcePassages(revision),input={revision,role:'REPORTED_DEVELOPMENT' as const,candidates:[]};let calls=0;
 const usage={calls:1,costUsd:.001,reported:true},strong={model:'background-continuation-fixture',admission:syntheticModelAdmission,usage:()=>usage,complete:async(_f:string,phase:string,state:any)=>{calls++;return {value:phase==='SEMANTIC_DEVELOPMENT_RECONCILIATION'?{confidence:1,groups:[]}:{confidence:1,groups:[],dispositionByUnitId:Object.fromEntries(state.claimMentions.map((m:any)=>[m.id,'BACKGROUND']))},usage}}};
 const base={feedId:'feed-1',feedRevision:1,evidenceRevisionIds:[revision.id],kind:'SEMANTIC_CONSTRUCTION',policyVersion:'source-passages-continuation',model:strong.model,budgetKey:'semantic:2026-10-03',state:{}},state={source:{id:revision.id,text:revision.body},constructionOwnershipVersion:PACKET_CONSTRUCTION_VERSION};
 const result=await continueSemanticConstruction(store,base,mentions,input,strong,state,testPolicy.now(),{reconciliation:'DEVELOPMENTS'});expect(result.status).toBe('SUCCEEDED');expect(result.value!.construction.groups).toEqual([]);expect(result.value!.construction.backgroundMentionIds).toEqual(mentions.map(m=>m.id));expect(calls).toBe(2);
 await continueSemanticConstruction(store,base,mentions,input,strong,state,testPolicy.now(),{reconciliation:'DEVELOPMENTS'});expect(calls).toBe(2);
},20000);
it('preserves every mention across operation packets and reconciles meaning before canonical consumption',async()=>{const revision=(await store.currentEvidence('feed-1'))[0].revision,mentions=(await extractClaimMentions(revision)).mentions.filter(isNewsMention),input={revision,role:'REPORTED_DEVELOPMENT' as const,candidates:[]};let calls=0;
 const strong={model:'continuation-stand-in',usage:()=>({calls:1,costUsd:.001,reported:true}),admission:(state:any,_schema:object,phase?:string)=>({...syntheticModelAdmission(),fits:phase==='SEMANTIC_RECONCILIATION'||state.claimMentions.length<=2}),complete:async(_feed:string,phase:string,state:any)=>{calls++;return {value:{groups:phase==='SEMANTIC_RECONCILIATION'?state.packetGroups.map((g:any)=>group(g.claimMentionIds)):state.claimMentions.map((m:any)=>group([m.id])),backgroundMentionIds:[],confidence:.9},usage:{calls:1,costUsd:.001,reported:true}}}};
 const base={feedId:'feed-1',feedRevision:1,evidenceRevisionIds:[revision.id],kind:'SEMANTIC_CONSTRUCTION',policyVersion:'unchanged-root-policy',model:strong.model,budgetKey:'semantic:2026-10-03',state:{}};
 const result=await continueSemanticConstruction(store,base,mentions,input,strong,{claimMentions:mentions.map(m=>({id:m.id,text:m.sourceText}))},testPolicy.now(),{reconciliation:'CLAIMS'});
 expect(result.status).toBe('SUCCEEDED');expect(result.value!.construction.groups.flatMap(g=>g.claimMentionIds).sort()).toEqual(mentions.map(m=>m.id).sort());expect(calls).toBe(3);expect(await store.list('feed-1','semantic_construction_work')).toHaveLength(1);
 const restarted=await continueSemanticConstruction(new V1FeedStore(ctx.db),base,mentions,input,{...strong,admission:(state:any,_schema:object,phase?:string)=>({...syntheticModelAdmission(),fits:phase==='SEMANTIC_RECONCILIATION'||state.claimMentions.length<=1})},{claimMentions:mentions.map(m=>({id:m.id,text:m.sourceText}))},testPolicy.now(),{reconciliation:'CLAIMS'});expect(restarted.value).toEqual(result.value);expect(calls).toBe(3);
},25000);
it('unknown packet outcome remains fenced after restart and cannot be replaced by a paid retry',async()=>{const revision=(await store.currentEvidence('feed-1'))[0].revision,mentions=(await extractClaimMentions(revision)).mentions.filter(isNewsMention),input={revision,role:'REPORTED_DEVELOPMENT' as const,candidates:[]};let calls=0;const strong={model:'unknown-stand-in',usage:()=>({calls:1,costUsd:.02,reported:false}),admission:(s:any)=>({...syntheticModelAdmission(),fits:s.claimMentions.length<=2}),complete:async()=>{calls++;throw Error('SEMANTIC_OUTCOME_UNKNOWN')}};const base={feedId:'feed-1',feedRevision:1,evidenceRevisionIds:[revision.id],kind:'SEMANTIC_CONSTRUCTION',policyVersion:'root-policy',model:strong.model,budgetKey:'semantic:2026-10-03',state:{}};for(let i=0;i<2;i++)expect((await continueSemanticConstruction(store,{...base,budgetKey:i?'semantic:2026-10-04':base.budgetKey,state:{attempt:i}},mentions,input,strong,{claimMentions:mentions.map(m=>({id:m.id,text:m.sourceText})),attempt:i},i?'2026-10-04T12:00:00Z':testPolicy.now(),{})).status).toBe('DEFERRED');expect(calls).toBe(2);expect(await store.list('feed-1','semantic_intents')).toHaveLength(2)},25000);

it('runs independent inference concurrently, retains complete context and reconstructs developments durably',async()=>{
 const revision=(await store.currentEvidence('feed-1'))[0].revision,mentions=(await extractClaimMentions(revision)).mentions.filter(isNewsMention),input={revision,role:'REPORTED_DEVELOPMENT' as const,candidates:[]};
 let calls=0,active=0,peak=0;const release:(()=>void)[]=[];const contexts:string[]=[];
 const strong={model:'development-offline-stand-in',usage:()=>({calls:1,costUsd:.001,reported:true}),admission:(state:any,_schema:object,phase?:string)=>({...syntheticModelAdmission(),fits:phase==='SEMANTIC_DEVELOPMENT_RECONCILIATION'||state.claimMentions.length<=2}),complete:async(_feed:string,phase:string,state:any)=>{
  calls++;active++;peak=Math.max(peak,active);contexts.push(state.source.text);
  if(phase==='SEMANTIC_CONSTRUCTION')await new Promise<void>(resolve=>{release.push(resolve);if(release.length===2)release.forEach(r=>r())});
  active--;
  const value=phase==='SEMANTIC_DEVELOPMENT_RECONCILIATION'?{confidence:.9,groups:state.developments.map((d:any)=>({developmentIds:[d.id],eventId:null,storylineId:null,structuralRelation:'NEW_STORYLINE',epistemicEffects:[],relationship:'INDEPENDENT',relatedDevelopmentIds:[]}))}:{confidence:.9,groups:state.claimMentions.map((m:any)=>group([m.id])),backgroundMentionIds:[]};
  return {value,usage:{calls:1,costUsd:.001,reported:true}};
 }};
 const base={feedId:'feed-1',feedRevision:1,evidenceRevisionIds:[revision.id],kind:'SEMANTIC_CONSTRUCTION',policyVersion:'development-test',model:strong.model,budgetKey:'semantic:2026-10-03',state:{}},state={source:{id:revision.id,text:revision.body},claimMentions:mentions.map(m=>({id:m.id,text:m.sourceText}))};
 const result=await continueSemanticConstruction(store,base,mentions,input,strong,state,testPolicy.now(),{});
 expect(result.status).toBe('SUCCEEDED');expect(peak).toBe(2);expect(calls).toBe(3);expect(contexts.every(text=>text===revision.body)).toBe(true);
 expect(result.value!.construction.groups.flatMap(g=>g.claimMentionIds).sort()).toEqual(mentions.map(m=>m.id).sort());
 const replay=await continueSemanticConstruction(new V1FeedStore(ctx.db),base,mentions,input,strong,state,testPolicy.now(),{reconciliation:'CLAIMS'});
 expect(replay.value).toEqual(result.value);expect(calls).toBe(3);expect(await store.list('feed-1','semantic_intents')).toHaveLength(3);
},30000);
