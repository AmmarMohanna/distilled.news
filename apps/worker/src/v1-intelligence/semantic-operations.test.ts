import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {createIntakeDatabase,seedIntakeScope} from '../v1-intake/test-utils';
import {V1IntakeStore} from '../v1-intake/store';
import {V1FeedStore} from './store';
import {feedFixture,seedIntelligence} from './test-utils';
import {testDurableSemanticOperation as durableSemanticOperation} from './test-utils';
import {boundedCompletion} from '../ai';
import {SemanticValidationError} from './semantic-operations';
import {editorialWindowAwaitingRecovery} from './window-delivery';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,store:V1FeedStore;
beforeEach(async()=>{ctx=await createIntakeDatabase();await seedIntakeScope(new V1IntakeStore(ctx.db));store=new V1FeedStore(ctx.db);await store.registerFeed(feedFixture);await seedIntelligence(store)});
it('model authorization and result consumption validate active IDs without reloading article bodies',async()=>{
 const evidenceRevisionIds=(await store.currentEvidence('feed-1')).map(e=>e.revision.id),read=vi.spyOn(store,'currentEvidence');
 try{
  const result=await durableSemanticOperation(store,{feedId:'feed-1',feedRevision:1,evidenceRevisionIds,kind:'RELATION',policyVersion:'ids-only',model:'fake',budgetKey:'id-authorization',state:{}},async()=>({value:{ok:true},usage:{calls:1,costUsd:.001,reported:true}}),'2026-10-03T12:00:00Z');
  expect(result.status).toBe('SUCCEEDED');expect(read).not.toHaveBeenCalled();
 }finally{read.mockRestore()}
},15000);
afterEach(async()=>ctx.dispose());
it('records unpaid capacity waits without duplicating model state and preserves retry identity',async()=>{
 const input={feedId:'feed-1',feedRevision:1,evidenceRevisionIds:(await store.currentEvidence('feed-1')).map(e=>e.revision.id),kind:'RELATION',policyVersion:'test',model:'fake',budgetKey:'wait',state:{text:'large context '.repeat(10000)}};
 const run=async()=>{throw Error('must not call provider')};
 const options={operationAdmission:{fits:false,reason:'CONTEXT_LIMIT',reservationCostUsd:.02}};
 const first=await durableSemanticOperation(store,input,run,'2026-10-03T12:00:00Z',undefined,options);
 const second=await durableSemanticOperation(store,input,run,'2026-10-03T12:00:00Z',undefined,options);
 expect(second.id).toBe(first.id);expect(first.input.state).toEqual(input.state);
 const waits=await store.list<any>('feed-1','semantic_resource_waits');
 expect(waits).toHaveLength(1);expect(waits[0].operationId).toBe(first.id);
 expect(waits[0].input.state).toBeUndefined();expect(waits[0].input.stateOmitted).toBe(true);
 expect(waits[0].input.evidenceRevisionIds).toEqual(input.evidenceRevisionIds);
 expect(JSON.stringify(waits[0]).length).toBeLessThan(2000);
 expect(await store.list('feed-1','semantic_intents')).toHaveLength(0);
},15000);
it('a cached editorial timeout blocks only its own window without retrying or changing spending',async()=>{
 const window={start:'2026-10-03T11:00:00.000Z',end:'2026-10-03T12:00:00.000Z'};
 const evidenceRevisionIds=(await store.currentEvidence('feed-1')).map(e=>e.revision.id);let calls=0;
 await durableSemanticOperation(store,{feedId:'feed-1',feedRevision:1,evidenceRevisionIds,kind:'COMPARATIVE_EDITORIAL_PLAN',policyVersion:'blocked-window-test',model:'fake',budgetKey:`editorial:${window.start}:${window.end}`,state:{window}},async()=>{calls++;throw Error('SEMANTIC_MODEL_TIMEOUT')},'2026-10-03T12:00:00Z',()=>({calls:1,costUsd:.001,reported:true}));
 const before=await ctx.db.prepare('SELECT * FROM v1_model_spending_settlements').all();
 expect(await editorialWindowAwaitingRecovery(ctx.db,'feed-1',window)).toBe(true);
 expect(await editorialWindowAwaitingRecovery(ctx.db,'feed-1',{start:window.end,end:'2026-10-03T13:00:00.000Z'})).toBe(false);
 expect((await ctx.db.prepare('SELECT * FROM v1_model_spending_settlements').all()).results).toEqual(before.results);
 expect(calls).toBe(1);
},15000);
it('retains exact raw failed construction beyond compact diagnostics and never purchases it again',async()=>{
 const rawResponse=JSON.stringify({dispositionByUnitId:{C0:'G0'},unexpected:'x'.repeat(20000)}),usage={calls:1,costUsd:.001,reported:true};let calls=0;
 const input={feedId:'feed-1',feedRevision:1,evidenceRevisionIds:(await store.currentEvidence('feed-1')).map(e=>e.revision.id),kind:'SEMANTIC_CONSTRUCTION',policyVersion:'claim-disposition-v1',model:'fake',budgetKey:'raw-retention',state:{constructionOwnershipVersion:'claim-disposition-v1'}};
 const run=async()=>{calls++;throw new SemanticValidationError({stage:'OUTPUT_SCHEMA',response:JSON.parse(rawResponse),rawResponse,rejection:{name:'ConstructionContractError',mechanicalIssues:[{code:'INVALID_OUTPUT_SHAPE',pointer:'/unexpected',observed:'unexpected',invariant:'Only contracted fields allowed.'}]}})};
 const first=await durableSemanticOperation(store,input,run,'2026-10-03T12:00:00Z',()=>usage);
 expect(first.status).toBe('DEFERRED');expect(first.validationDiagnostic).toMatchObject({rawResponse,responseOmitted:true});expect(first.usage).toEqual(usage);
 const second=await durableSemanticOperation(store,input,run,'2026-10-03T12:01:00Z',()=>usage);expect(second.id).toBe(first.id);expect(calls).toBe(1);expect(second.validationDiagnostic?.rawResponse).toBe(rawResponse);
});
it('durably binds provider headers to the paid operation without changing its reservation identity',async()=>{
 const input={feedId:'feed-1',feedRevision:1,evidenceRevisionIds:(await store.currentEvidence('feed-1')).map(e=>e.revision.id),kind:'RELATION',policyVersion:'receipt-test',model:'fake',budgetKey:'test',state:{}};
 const first=await durableSemanticOperation(store,input,async()=>{
  const value=await boundedCompletion({accountId:'',gatewayId:'',provider:'OPENROUTER',apiKey:'fixture',model:'fake',fetcher:async()=>Response.json({choices:[{message:{content:'{"ok":true}'}}],usage:{cost:.001}},{headers:{'x-generation-id':'gen-durable'}})},'feed-1','event_review','RELATION','{}',{});
  return {value,usage:{calls:1,costUsd:.001,reported:true}};
 },'2026-10-03T12:00:00Z');
 const rows=await ctx.db.prepare("SELECT json FROM v1_feed_documents WHERE kind='model_provider_receipts' AND feed_id=?").bind('feed-1').all<{json:string}>();
 expect(rows.results).toHaveLength(2);expect(rows.results.map(r=>JSON.parse(r.json))).toContainEqual(expect.objectContaining({reservationId:'semantic_intents:'+first.id,generationId:'gen-durable',model:'fake',stage:'HEADERS'}));
 expect(await ctx.db.prepare('SELECT COUNT(*) n FROM v1_model_spending_reservations WHERE id=?').bind('semantic_intents:'+first.id).first()).toMatchObject({n:1});
},15000);
it('a captured header cannot release UNKNOWN money or authorize another paid call',async()=>{
 const input={feedId:'feed-1',feedRevision:1,evidenceRevisionIds:(await store.currentEvidence('feed-1')).map(e=>e.revision.id),kind:'RELATION',policyVersion:'receipt-unknown-test',model:'fake',budgetKey:'test',state:{}};let calls=0;
 const run=async()=>{
  calls++;
  await boundedCompletion({accountId:'',gatewayId:'',provider:'OPENROUTER',apiKey:'fixture',model:'fake',fetcher:async()=>new Response(new ReadableStream({start(c){c.error(new DOMException('body lost','AbortError'))}}),{headers:{'x-generation-id':'gen-unknown'}})},'feed-1','event_review','RELATION','{}',{});
  return {value:{},usage:{calls:1,costUsd:0,reported:false}};
 };
 const first=await durableSemanticOperation(store,input,run,'2026-10-03T12:00:00Z');expect(first.usage.reported).toBe(false);
 await durableSemanticOperation(store,input,run,'2026-10-03T13:00:00Z');expect(calls).toBe(1);
 const money=await ctx.db.prepare('SELECT cost_usd,reported FROM v1_model_spending_settlements WHERE id=?').bind('semantic_intents:'+first.id).first();
 expect(money).toMatchObject({cost_usd:.02,reported:0});
 expect((await ctx.db.prepare("SELECT COUNT(*) n FROM v1_feed_documents WHERE kind='model_provider_receipts' AND feed_id=?").bind('feed-1').first())?.n).toBe(1);
},15000);
it('settles verified provider usage before subsequent semantic processing can lose its outcome',async()=>{
 const input={feedId:'feed-1',feedRevision:1,evidenceRevisionIds:(await store.currentEvidence('feed-1')).map(e=>e.revision.id),kind:'RELATION',policyVersion:'early-usage-test',model:'fake',budgetKey:'test',state:{}};
 let reportedBeforeReturn:number|undefined;
 await durableSemanticOperation(store,input,async()=>{
  const value=await boundedCompletion({accountId:'',gatewayId:'',provider:'OPENROUTER',apiKey:'fixture',model:'fake',fetcher:async()=>Response.json({choices:[{message:{content:'{"ok":true}'}}],usage:{cost:.003}},{headers:{'x-generation-id':'gen-early-usage'}}),onProviderReceipt:async receipt=>{
   if(receipt.stage==='USAGE'){const row=await ctx.db.prepare('SELECT s.reported FROM v1_model_spending_settlements s JOIN v1_model_spending_reservations r ON r.id=s.id WHERE r.feed_id=?').bind('feed-1').first<{reported:number}>();reportedBeforeReturn=row?.reported}
  }},'feed-1','event_review','RELATION','{}',{});
  return {value,usage:{calls:1,costUsd:.003,reported:true}};
 },'2026-10-03T12:00:00Z');
 expect(reportedBeforeReturn).toBe(1);
},15000);
it('commits intent before provider use, replays exactly and rejects source revocation during a call',async()=>{
 const evidence=(await store.currentEvidence('feed-1')).map(e=>e.revision.id),input={feedId:'feed-1',feedRevision:1,evidenceRevisionIds:evidence,kind:'RELATION',policyVersion:'test',model:'fake',budgetKey:'test',state:{text:'approved'}};
 let calls=0;
 const run=async()=>{calls++;expect(await store.list('feed-1','semantic_intents')).toHaveLength(1);return {value:{relation:'NEW_STORYLINE'},usage:{calls:1,costUsd:.001,reported:true}}};
 const first=await durableSemanticOperation(store,input,run,'2026-10-03T12:00:00Z');expect(first.status).toBe('SUCCEEDED');
 expect(await durableSemanticOperation(store,input,run,'2026-10-03T13:00:00Z')).toEqual(first);expect(calls).toBe(1);
 await expect(durableSemanticOperation(store,{...input,state:{text:'changed'}},async()=>{await new V1IntakeStore(ctx.db).registerScope({... (await new V1IntakeStore(ctx.db).getScope('feed-source-1'))!,enabled:false});return {value:{},usage:{calls:1,costUsd:.001,reported:true}}},'2026-10-03T12:00:00Z')).rejects.toMatchObject({code:'SCOPE_DENIED'});
},15000);
it('unknown provider outcomes stay deferred and cannot automatically issue another call',async()=>{
 const input={feedId:'feed-1',feedRevision:1,evidenceRevisionIds:(await store.currentEvidence('feed-1')).map(e=>e.revision.id),kind:'RELATION',policyVersion:'test',model:'fake',budgetKey:'unknown',state:{}};let calls=0;
 const run=async()=>{calls++;throw Error('lost connection')};
 const first=await durableSemanticOperation(store,input,run,'2026-10-03T12:00:00Z');expect(first).toMatchObject({status:'DEFERRED',usage:{reported:false,costUsd:.02}});
 expect(await durableSemanticOperation(store,input,run,'2026-10-03T13:00:00Z')).toEqual(first);expect(calls).toBe(1);
},15000);

it('a new editorial window key cannot rebill the same unchanged UNKNOWN planner question',async()=>{
 const input={feedId:'feed-1',feedRevision:1,evidenceRevisionIds:(await store.currentEvidence('feed-1')).map(e=>e.revision.id),kind:'COMPARATIVE_EDITORIAL_PLAN',policyVersion:'test',model:'fake',budgetKey:'editorial:original-window',state:{offered:['retained-development'],history:[]}};
 let calls=0;const run=async()=>{calls++;throw Error('SEMANTIC_MODEL_TIMEOUT')};
 const first=await durableSemanticOperation(store,input,run,'2026-10-03T12:00:00Z');
 const next=await durableSemanticOperation(new V1FeedStore(ctx.db),{...input,budgetKey:'editorial:later-window',state:{...input.state,attempt:2}},run,'2026-10-04T12:00:00Z');
 expect(next.id).toBe(first.id);expect(next.failure).toBe('SEMANTIC_OUTCOME_UNKNOWN');expect(calls).toBe(1);
 expect(await store.list('feed-1','semantic_intents')).toHaveLength(1);
},15000);

it('comparative planning reserves a ninety-second lease without increasing the cost reservation',async()=>{
 const input={feedId:'feed-1',feedRevision:1,evidenceRevisionIds:(await store.currentEvidence('feed-1')).map(e=>e.revision.id),kind:'COMPARATIVE_EDITORIAL_PLAN',policyVersion:'test',model:'fake',budgetKey:'planner',state:{}};
 await durableSemanticOperation(store,input,async()=>{const [intent]=await store.list<any>('feed-1','semantic_intents');expect(intent.leaseUntil-Date.now()).toBeGreaterThan(85000);expect(intent.reservedCostUsd).toBe(.02);return {value:{},usage:{calls:1,costUsd:.001,reported:true}}},'2026-10-03T12:00:00Z');
},15000);

it('retained large supported inputs and reported costs above the old per-call ceiling do not become semantic failures',async()=>{
 const input={feedId:'feed-1',feedRevision:1,evidenceRevisionIds:(await store.currentEvidence('feed-1')).map(e=>e.revision.id),kind:'COMPARATIVE_EDITORIAL_PLAN',policyVersion:'test',model:'fake',budgetKey:'large-supported',state:{text:'Retained supported fact. '.repeat(2300)}};
 let calls=0;
 const result=await durableSemanticOperation(store,input,async()=>{calls++;return {value:{requiredFacts:['one','two']},usage:{calls:1,costUsd:.03,reported:true}}},'2026-10-03T12:00:00Z',undefined,{reservationCostUsd:.04});
 expect(result.status).toBe('SUCCEEDED');expect(result.value).toEqual({requiredFacts:['one','two']});expect(result.usage.costUsd).toBe(.03);
 expect(await durableSemanticOperation(new V1FeedStore(ctx.db),input,async()=>{throw Error('UNSAFE_REBILL')},'2026-10-04T12:00:00Z',undefined,{reservationCostUsd:.04})).toEqual(result);expect(calls).toBe(1);
},15000);

it('concurrent differently sized initial scopes cannot reserve two paid questions for one editorial window',async()=>{
 const base={feedId:'feed-1',feedRevision:1,evidenceRevisionIds:(await store.currentEvidence('feed-1')).map(e=>e.revision.id),kind:'COMPARATIVE_EDITORIAL_PLAN',policyVersion:'test',model:'same-model',budgetKey:'editorial:same-window'};
 let entered!:()=>void,release!:()=>void;const started=new Promise<void>(r=>entered=r),finish=new Promise<void>(r=>release=r);let extraCalls=0,error:unknown;
 const first=durableSemanticOperation(store,{...base,state:{offered:['one','two']}},async()=>{entered();await finish;return {value:{ok:true},usage:{calls:1,costUsd:.001,reported:true}}},'2026-10-03T12:00:00Z',undefined,{preserveStartedEditorialScope:true});
 await started;
 try{await durableSemanticOperation(new V1FeedStore(ctx.db),{...base,state:{offered:['one']}},async()=>{extraCalls++;return {value:{ok:true},usage:{calls:1,costUsd:.001,reported:true}}},'2026-10-03T12:00:00Z',undefined,{preserveStartedEditorialScope:true})}catch(e){error=e}finally{release();await first}
 expect(extraCalls).toBe(0);expect(error).toMatchObject({code:'TEMPORARY_UNAVAILABLE'});expect(await store.list('feed-1','semantic_intents')).toHaveLength(1);
},15000);
