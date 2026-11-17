import {afterEach,beforeEach,expect,it} from 'vitest';
import {createIntakeDatabase,seedIntakeScope,testPolicy} from '../v1-intake/test-utils';
import {V1IntakeStore} from '../v1-intake/store';
import {V1FeedStore,feedTransact} from './store';
import {durableSalience} from './salience-persistence';
import {feedFixture,seedIntelligence} from './test-utils';
import {scoreAndSelect,DEFAULT_BRIEFING_BUDGET} from './scoring';
import {DeterministicSalienceScorer,type SalienceInput} from './salience';
import {SemanticSalienceRouter} from './salience-router';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,store:V1FeedStore;
beforeEach(async()=>{ctx=await createIntakeDatabase();await seedIntakeScope(new V1IntakeStore(ctx.db));store=new V1FeedStore(ctx.db);await store.registerFeed(feedFixture);await seedIntelligence(store)});
afterEach(async()=>ctx.dispose());
const window={start:'2026-10-03T00:00:00Z',end:'2026-10-04T00:00:00Z',kind:'DAILY' as const};
it('uses semantic assessments durably and replay cannot repeat model judgment',async()=>{
 let calls=0;const router=new SemanticSalienceRouter({jev:{score:(input:SalienceInput)=>{calls++;return {...new DeterministicSalienceScorer().score(input),components:{...new DeterministicSalienceScorer().score(input).components,overallScore:.75},provenance:{scorer:'JEV',model:'fixture',promptVersion:'fixture',policyVersion:'fixture'},confidence:.9}}}});
 const selection=await scoreAndSelect(store,'feed-1',window,DEFAULT_BRIEFING_BUDGET,testPolicy.now(),router);
 const assessment=(await store.list<any>('feed-1','salience'))[0];expect(assessment.overallScore).toBe(.75);
 const provenance=(await store.list<any>('feed-1','salience_provenance'))[0];expect(provenance.assessmentId).toBe(assessment.id);expect(provenance.result.route).toBe('NATIVE_JEV');
 expect(await scoreAndSelect(store,'feed-1',window,DEFAULT_BRIEFING_BUDGET,testPolicy.now(),router)).toEqual(selection);expect(calls).toBe(1);
});
it('concurrent delivery cannot run the same paid judgment twice',async()=>{
 let finish!:(value:any)=>void,calls=0;
 const input:SalienceInput={feedId:'feed-1',feedRevision:1,targetType:'EVENT',targetVersionId:'fixture-target',text:'Parliament approved reform.',version:1,independentSupport:1,persistence:0,recency:1};
 const scorer={score:async()=>{calls++;return new Promise<any>(resolve=>{finish=resolve})}};
 const pending=durableSalience(store,input,scorer,testPolicy.now());
 while(!finish)await new Promise(resolve=>setTimeout(resolve,10));
 await expect(durableSalience(store,input,scorer,testPolicy.now())).rejects.toMatchObject({code:'TEMPORARY_UNAVAILABLE'});
 finish(new DeterministicSalienceScorer().score(input));await pending;expect(calls).toBe(1);
});
it('a lost expired judgment retains its reservation and cannot repeat a provider call',async()=>{
 const input:SalienceInput={feedId:'feed-1',feedRevision:1,targetType:'EVENT',targetVersionId:'fixture-target',text:'Parliament approved reform.',version:1,independentSupport:1,persistence:0,recency:1};
 let calls=0;const scorer={score:()=>{calls++;throw Error('lost provider outcome')}};
 await expect(durableSalience(store,input,scorer,testPolicy.now())).rejects.toThrow('lost provider outcome');
 const intent=(await store.list<any>('feed-1','salience_intents'))[0];
 // Clock advancement models lease expiration without editing the immutable intent.
 const dateNow=Date.now;Date.now=()=>intent.leaseUntil+1;
 try{const result=await durableSalience(store,input,scorer,testPolicy.now());expect(result.result.fallback).toBe('SALIENCE_OUTCOME_UNKNOWN');expect(result.result.usage).toMatchObject({costUsd:.04,reported:false});expect(calls).toBe(1)}finally{Date.now=dateNow}
});
it('restarted scoring respects prior charged window usage rather than resetting its budget',async()=>{
 let calls=0;const scorer={score:(input:SalienceInput)=>{calls++;return {...new DeterministicSalienceScorer().score(input),usage:{calls:2,costUsd:.04,reported:true}}}};
 const input:SalienceInput={feedId:'feed-1',feedRevision:1,targetType:'EVENT',targetVersionId:'a',text:'Parliament approved reform.',version:1,independentSupport:1,persistence:0,recency:1};
 await durableSalience(store,input,scorer,testPolicy.now(),'window');
 await durableSalience(new V1FeedStore(ctx.db),{...input,targetVersionId:'b'},scorer,testPolicy.now(),'window');
 const result=await durableSalience(new V1FeedStore(ctx.db),{...input,targetVersionId:'c'},scorer,testPolicy.now(),'window');
 expect(result.result.fallback).toBe('SALIENCE_WINDOW_BUDGET_EXHAUSTED');expect(result.result.usage.calls).toBe(0);expect(calls).toBe(2);
});
