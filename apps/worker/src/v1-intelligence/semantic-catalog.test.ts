import {afterEach,beforeEach,expect,it} from 'vitest';
import {createIntakeDatabase,seedIntakeScope,testPolicy} from '../v1-intake/test-utils';
import {V1IntakeStore} from '../v1-intake/store';
import {V1FeedStore} from './store';
import {feedFixture,seedIntelligence,acceptEvidence} from './test-utils';
import {prepareSemanticMatch} from './semantic-preparation';
import {processEvidenceIntelligence} from './engine';
import type {Env} from '../types';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,store:V1FeedStore;
beforeEach(async()=>{ctx=await createIntakeDatabase();await seedIntakeScope(new V1IntakeStore(ctx.db));store=new V1FeedStore(ctx.db);await store.registerFeed(feedFixture)});
afterEach(async()=>ctx.dispose());
const strong={model:'catalog-test',usage:()=>({calls:1,costUsd:.001,reported:true}),complete:async(_feed:string,_phase:string,state:any)=>({value:{groups:[{claimMentionIds:state.claimMentions.map((m:any)=>m.id),structuralRelation:'NEW_STORYLINE',eventId:null,storylineId:null,epistemicEffects:[],entities:[],slots:[]}],backgroundMentionIds:[],confidence:.9},usage:{calls:1,costUsd:.001,reported:true}})};
async function prepare(){
 await seedIntelligence(store,1,'Parliament approved a banking reform.');
 // Faithful bounded fixture: the retained Event survives, but its old support is no longer active.
 await ctx.db.prepare("UPDATE v1_evidence SET json=json_set(json,'$.state','WITHDRAWN')").run();
 await acceptEvidence(store,2,'Researchers discovered a new protein.');
 return (await prepareSemanticMatch(store,{} as Env,JSON.stringify(['REASSESS','observation-2','']),testPolicy.now(),{strong}))!;
}
it('an unchanged unavailable-support Event is catalogued but never offered as approved support',async()=>{
 const p=await prepare();expect(p.input.candidates).toHaveLength(0);
 const receipt=await processEvidenceIntelligence(store,JSON.stringify(['REASSESS','observation-2','']),testPolicy.now(),p.matchers);
 expect(receipt.semanticDeferred).toBe(false);
 const states=await store.list<any>('feed-1','event_semantic_states');expect(states.some(s=>s.provenance.scorer==='GPT'&&!s.provisional)).toBe(true);
},15000);
it('an actually new Event after preparation still invalidates the paid judgment',async()=>{
 const p=await prepare();await seedIntelligence(store,3,'A court cancelled an election.');
 const receipt=await processEvidenceIntelligence(store,JSON.stringify(['REASSESS','observation-2','']),testPolicy.now(),p.matchers);
 expect(receipt.semanticDeferred).toBe(true);
 expect((await store.list<any>('feed-1','event_semantic_states')).some(s=>s.provenance.fallbackReason==='STALE_PREPARED_MEMORY')).toBe(true);
},15000);
