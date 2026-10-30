import {productPublicationState} from '../product-feeds';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {createIntakeDatabase,seedIntakeScope} from '../v1-intake/test-utils';
import {V1IntakeStore} from '../v1-intake/store';
import {V1FeedStore,feedTransact} from './store';
import {feedFixture,seedIntelligence} from './test-utils';
import {processV1Briefing,windowIdentity} from './runtime';
import * as scoring from './scoring';
import {createApp} from '../app';
import {InMemoryRepository} from '../repository';
import type {Env} from '../types';
const window={start:'2026-10-03T12:00:00Z',end:'2026-10-03T13:00:00Z',kind:'HOURLY' as const};
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,store:V1FeedStore,env:Env;
beforeEach(async()=>{ctx=await createIntakeDatabase({product:true});await seedIntakeScope(new V1IntakeStore(ctx.db));store=new V1FeedStore(ctx.db);await store.registerFeed({...feedFixture,briefingFrequency:'HOURLY'});await seedIntelligence(store);env={DB:ctx.db,V1_DOWNSTREAM_ENABLED:'true',V1_DOWNSTREAM_FEED_SOURCE_IDS:'feed-source-1',WEB_OPERATOR_RUNTIME_TOKEN:'test-runtime'} as Env});
afterEach(async()=>{vi.restoreAllMocks();await ctx.dispose()});
async function failedIntake(kind='ACQUIRE',observedAt='2026-10-03T12:30:00Z',state='FAILED'){
 await ctx.db.prepare('INSERT INTO v1_inputs(id,feed_source_id,json) VALUES(?,?,?)').bind('failed-observation','feed-source-1',JSON.stringify({observation:{id:'failed-observation',observedAt}})).run();
 await ctx.db.prepare('INSERT INTO v1_jobs(id,feed_source_id,json) VALUES(?,?,?)').bind('failed-job','feed-source-1',JSON.stringify({id:'failed-job',feedId:'feed-1',feedSourceId:'feed-source-1',observationId:'failed-observation',kind,state,exhausted:state==='FAILED',attempts:state==='FAILED'?5:0,failureCode:state==='FAILED'?'EXTRACTION_FAILED':undefined})).run();
}
const request=async()=>store.read<any>('feed-1','briefing_requests',await windowIdentity('feed-1',window));
it('direct briefing execution waits for pre-boundary review instead of bypassing dispatch',async()=>{await failedIntake('REASSESS',undefined,'PENDING');expect(await processV1Briefing(env,{type:'v1_briefing',feedId:'feed-1',window},()=>window.end)).toBeUndefined();expect(await request()).toMatchObject({state:'PENDING',attempts:0,reason:'AWAITING_INTAKE_REASSESSMENT',coverage:{state:'PENDING',pendingJobs:1}});expect(await store.list('feed-1','selections')).toHaveLength(0)},30000);
it('exhausted source work cannot become confirmed quiet, and remains visible without consuming attempts',async()=>{await failedIntake();vi.spyOn(scoring,'scoreAndSelect').mockResolvedValue({selectedCandidateIds:[],deferredProtectedTargetIds:[]} as any);for(let n=0;n<2;n++)await processV1Briefing(env,{type:'v1_briefing',feedId:'feed-1',window},()=>window.end);expect(await request()).toMatchObject({state:'DONE',result:'DEFERRED',attempts:0,reason:'INCOMPLETE_INTAKE_COVERAGE',coverage:{state:'INCOMPLETE',failedJobs:1}});expect((await request()).result).not.toBe('QUIET');expect(await store.list('feed-1','editions')).toHaveLength(0)},30000);
it('independently supported news publishes while failed acquisition remains explicitly incomplete',async()=>{await failedIntake();const edition=await processV1Briefing(env,{type:'v1_briefing',feedId:'feed-1',window},()=>window.end);expect(edition?.stories).toHaveLength(1);expect(await request()).toMatchObject({state:'DONE',result:'PUBLISHED',coverage:{state:'INCOMPLETE',failedJobs:1}});expect(await ctx.db.prepare("SELECT json_extract(json,'$.state') AS state FROM v1_jobs WHERE id='failed-job'").first()).toEqual({state:'FAILED'})},30000);
it('post-cutoff source failure cannot change the earlier window coverage',async()=>{await failedIntake('ACQUIRE','2026-10-03T13:30:00Z');await processV1Briefing(env,{type:'v1_briefing',feedId:'feed-1',window},()=>window.end);expect(await request()).toMatchObject({result:'PUBLISHED',coverage:{state:'COMPLETE',failedJobs:0,pendingJobs:0}})},30000);
it.each([['QUIET','NO_NEWS'],['DEFERRED','DEFERRED']] as const)('HTTP result preserves durable %s rather than guessing from undefined',async(result,state)=>{const id=await windowIdentity('feed-1',window);await feedTransact(store,'feed-1',tx=>tx.write('briefing_requests',id,{id,feedId:'feed-1',window,state:'DONE',result,reason:result==='DEFERRED'?'EDITORIAL_WORK_DEFERRED':'NO_SELECTED_DEVELOPMENTS',attempts:0,createdAt:window.end}));const app=createApp({repository:new InMemoryRepository(),now:()=>new Date(window.end)}),response=await app.request('/v1/downstream/briefing',{method:'POST',headers:{authorization:'Bearer test-runtime','content-type':'application/json'},body:JSON.stringify({feedId:'feed-1',window})},env);expect(response.status).toBe(200);expect(await response.json()).toMatchObject({state,requestId:id,result})},30000);
it('HTTP model-setup wait is BLOCKED, never NO_NEWS',async()=>{const app=createApp({repository:new InMemoryRepository(),now:()=>new Date(window.end)}),response=await app.request('/v1/downstream/briefing',{method:'POST',headers:{authorization:'Bearer test-runtime','content-type':'application/json'},body:JSON.stringify({feedId:'feed-1',window})},{...env,V1_REAL_MODEL_REQUIRED:'true'});expect(await response.json()).toMatchObject({state:'BLOCKED',reason:'MODEL_SETUP_REQUIRED'});expect(await store.list('feed-1','editions')).toHaveLength(0)},30000);

it.each([
 {name:'pending incomplete coverage',state:'PENDING',result:undefined,coverage:'INCOMPLETE',reason:'INCOMPLETE_INTAKE_COVERAGE',expected:'checking'},
 {name:'completed incomplete coverage without publication',state:'DONE',result:undefined,coverage:'INCOMPLETE',reason:'INCOMPLETE_INTAKE_COVERAGE',expected:'failed'},
 {name:'terminal failure',state:'FAILED',result:undefined,coverage:'COMPLETE',reason:'PUBLICATION_FAILED',expected:'failed'},
 {name:'confirmed complete quiet',state:'DONE',result:'QUIET',coverage:'COMPLETE',reason:'NO_SELECTED_DEVELOPMENTS',expected:'quiet'},
 {name:'deferred editorial work',state:'DONE',result:'DEFERRED',coverage:'COMPLETE',reason:'EDITORIAL_WORK_DEFERRED',expected:'checking'},
 {name:'unresolved pending work',state:'PENDING',result:undefined,coverage:'PENDING',reason:'AWAITING_INTAKE_REASSESSMENT',expected:'checking'},
 {name:'unclassified completed request',state:'DONE',result:undefined,coverage:undefined,reason:undefined,expected:'checking'},
 {name:'incomplete coverage despite a retained quiet label',state:'DONE',result:'QUIET',coverage:'INCOMPLETE',reason:'INCOMPLETE_INTAKE_COVERAGE',expected:'failed'}
] as const)('public publication lifecycle: $name is $expected',async({state,result,coverage,reason,expected})=>{
 const id=await windowIdentity('feed-1',window);
 const record={id,feedId:'feed-1',window,state,result,reason,coverage:coverage?{state:coverage,failedJobs:coverage==='INCOMPLETE'?1:0,pendingJobs:coverage==='PENDING'?1:0}:undefined,attempts:0,createdAt:window.end};
 await feedTransact(store,'feed-1',tx=>tx.write('briefing_requests',id,record));
 expect(await store.list('feed-1','editions')).toHaveLength(0);
 const before=await request(),actual=await productPublicationState(env,'feed-1');
 expect(actual).toBe(expected);
 if(expected!=='quiet')expect(actual).not.toBe('quiet');
 expect(await request()).toEqual(before);
},30000);

it('internal outcomes do not advertise a withdrawn edition as currently published',async()=>{const id=await windowIdentity('feed-1',window);await feedTransact(store,'feed-1',async tx=>{await tx.write('briefing_requests',id,{id,feedId:'feed-1',window,state:'DONE',result:'PUBLISHED',attempts:0,createdAt:window.end});await tx.write('publication_status',id,{id,feedId:'feed-1',status:'WITHDRAWN'})});await ctx.db.prepare("INSERT INTO v1_feed_documents VALUES('editions',?,'feed-1',?)").bind(id,JSON.stringify({id,feedId:'feed-1'})).run();const {readBriefingOutcome}=await import('./briefing-outcome');expect(await readBriefingOutcome(ctx.db,'feed-1',window)).toMatchObject({state:'WITHDRAWN',requestId:id})},30000);
