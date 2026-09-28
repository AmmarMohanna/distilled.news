import {readFileSync,readdirSync} from "node:fs";
import {Miniflare} from "miniflare";
import {expect,it} from "vitest";
import {D1UpstreamResourceStore} from "./upstream-resource-store";
import {D1SourceHighWaterStore} from "./source-acquisition-store";
import {createApp} from "./app";
import {D1Repository} from "./repository";
import {enqueueScheduledSourceAcquisitions} from "./scheduled-source-acquisition";
import {processPublicAcquisitionRequest} from "./public-acquisition-request";
import {acquisitionEvaluationDocument} from "./acquisition-evaluation-fixtures";
import {enrollRetainedNewsForSource} from "./retained-news-enrollment";
import {addSourceFromInput} from "./sources";
import type {Env,ProcessingJobMessage,PublicAcquisitionRequestMessage} from "./types";

it("evaluates the real account/queue/service/D1 handoff and scheduled next window with exact boundaries",async()=>{
  const mf=new Miniflare({modules:true,script:"export default {fetch(){return new Response('ok')}}",d1Databases:["DB"]});
  try{
    const db=await mf.getD1Database("DB");
    const directory=new URL("../migrations/",import.meta.url);
    for(const name of readdirSync(directory).filter(name=>/^\d+.*\.sql$/.test(name)).sort()){
      const statements=readFileSync(new URL(name,directory),"utf8").split(/;\s*(?:\r?\n|$)/).map(value=>value.trim()).filter(value=>value.replace(/--[^\r\n]*/g,"").trim());
      if(statements.length)await db.batch(statements.map(value=>db.prepare(value)));
    }
    const now=new Date("2026-09-28T00:00:00Z"),repo=new D1Repository(db);
    await db.prepare("INSERT INTO accounts(id,email,normalized_email,username,role,password_hash,created_at,updated_at) VALUES('owner','fixture@example.com','fixture@example.com','fixture','user','not-a-login',?,?)").bind(now.toISOString(),now.toISOString()).run();
    await db.prepare("INSERT INTO briefings(id,owner_account_id,slug,title,interest_profile,retention_days,created_at,updated_at) VALUES('feed','owner','fixture','Evaluation','news',15,?,?)").bind(now.toISOString(),now.toISOString()).run();
    const queued:PublicAcquisitionRequestMessage[]=[],processing:ProcessingJobMessage[]=[];
    const env={DB:db,WEB_OPERATOR_RUNTIME_TOKEN:"test-only",DISTILLED_LIVE_PUBLIC_ACQUISITION_SMOKE:"true",WEB_OPERATOR_QUEUE:{send:async(value:PublicAcquisitionRequestMessage)=>{queued.push(value)}},PROCESSING_QUEUE:{send:async(value:ProcessingJobMessage)=>{processing.push(value)}}} as unknown as Env;
    const fetcher=(async(input:string)=>{const url=new URL(input);return acquisitionEvaluationDocument(url.pathname.split('/').at(-1)!,url.origin)}) as typeof fetch;
    const app=createApp({fetcher,now:()=>now});
    const invoke=async(path:string,body?:unknown)=>app.fetch(new Request(`https://evaluation.example.com${path}`,{method:body?'POST':'GET',headers:{authorization:'Bearer test-only','content-type':'application/json'},body:body?JSON.stringify(body):undefined}),env);
    const source=await repo.upsertConfiguredSource({briefingId:"feed",provider:"rss",kind:"rss_feed",title:"Temporal feed",sourceUrl:"https://evaluation.example.com/v1/live-smoke/acquisition-fixture/rss",enabled:true},now);
    const payload={sourceUrl:source.sourceUrl,sourceId:source.id,ownerAccountId:"owner",evaluationId:"strict-window",startTime:"2026-09-24T12:00:00Z",endTime:"2026-09-25T12:00:00Z",idempotencyKey:"strict-full-window",limits:{maxItems:10,maxPages:3,maxScrolls:3,maxPhysicalAttempts:16,maxExecutionMs:90000}};
    const submitted=await (await invoke('/v1/live-smoke/public-acquisition/submit',payload)).json() as {requestId:string};
    await processPublicAcquisitionRequest(env,{type:'public_acquisition_request',requestId:submitted.requestId},async request=>app.fetch(request,env));
    const full=await (await invoke(`/v1/live-smoke/public-acquisition/requests/${submitted.requestId}`)).json() as any;
    expect(full.result).toMatchObject({status:"SUCCESS",selectedStage:"STRUCTURED",webOperatorCalls:0,discoveryModelCalls:0,jevCalls:0,coverage:{rangeCovered:true,truncated:false,stopReason:"START_BOUNDARY_REACHED"},committedHighWater:{lastSuccessfulBoundary:"2026-09-25T12:00:00.000Z"},itemHandoff:{inserted:2,processingJobsCreated:2}});
    expect(full.result.items.map((item:any)=>item.publishedAt).sort()).toEqual(["2026-09-24T12:00:00.000Z","2026-09-25T00:00:00.000Z"]);
    expect(processing).toHaveLength(2);
    const fullStateKey=full.result.committedHighWater.key;
    const broaderRetry={startTime:"2026-09-23T00:00:00.000Z",endTime:"2026-09-27T00:00:00.000Z"};
    await new D1SourceHighWaterStore(db,"owner").put({key:fullStateKey,unresolvedWindow:broaderRetry});
    const freshRepo=new D1Repository(db);
    const raw=await freshRepo.getRawMessage(processing[0].rawMessageId);
    expect(raw).toMatchObject({source:{id:source.id,provider:"rss"},sourceUrl:full.result.items[0].canonicalItemUrl});
    expect(raw?.text).toContain("Complete deterministic");
    // Repeated acquisition has no duplicate normalized items or processing jobs.
    const replay=await (await invoke('/v1/live-smoke/public-acquisition',{...payload,idempotencyKey:"fresh-full-window"})).json() as any;
    expect(replay.itemHandoff).toMatchObject({inserted:0,alreadyPersisted:2,processingJobsCreated:0});
    expect(replay.committedHighWater.unresolvedWindow).toEqual(broaderRetry);
    expect(processing).toHaveLength(2);
    const partial=await (await invoke('/v1/live-smoke/public-acquisition',{...payload,evaluationId:"strict-partial",idempotencyKey:"strict-partial-window",limits:{...payload.limits,maxItems:1}})).json() as any;
    // An incomplete cheap stage may escalate; it must never claim full coverage.
    expect(partial.committedHighWater?.lastSuccessfulBoundary).toBeUndefined();
    expect(partial.committedHighWater?.unresolvedWindow).toEqual({startTime:"2026-09-24T12:00:00.000Z",endTime:"2026-09-25T12:00:00.000Z"});
    const article=await (await invoke('/v1/live-smoke/public-acquisition',{...payload,sourceId:undefined,sourceUrl:"https://evaluation.example.com/v1/live-smoke/acquisition-fixture/article",evaluationId:"finite-article",idempotencyKey:"finite-article-window"})).json() as any;
    expect(article).toMatchObject({status:"SUCCESS",webOperatorCalls:0,coverage:{rangeCovered:true,truncated:false,stopReason:"SOURCE_EXHAUSTED"}});
    expect(article.stages.at(-1)).toMatchObject({stage:"HTTP",status:"SUCCESS"});
    const denied=await (await invoke('/v1/live-smoke/public-acquisition',{...payload,sourceId:undefined,sourceUrl:"https://evaluation.example.com/v1/live-smoke/acquisition-fixture/denied",evaluationId:"denied-source",idempotencyKey:"denied-source-window"})).json() as any;
    expect(denied).toMatchObject({status:"STOPPED",stopReason:"AUTH_REQUIRED",webOperatorCalls:0});
    // Scheduled work uses the normal source state, independently of evaluations.
    const normalResource=await new D1UpstreamResourceStore(db).resolveOrCreate({tenantId:"owner",canonicalSourceUrl:source.sourceUrl!});
    const normalKey=`owner:${normalResource.id}`;
    await new D1SourceHighWaterStore(db,"owner").put({key:normalKey,lastSuccessfulBoundary:"2026-09-25T12:00:00.000Z",unresolvedWindow:{startTime:"2026-09-26T00:00:00.000Z",endTime:"2026-09-27T00:00:00.000Z"}});
    env.DISTILLED_LIVE_PUBLIC_ACQUISITION_SMOKE="false";
    expect(await enqueueScheduledSourceAcquisitions(env,now)).toBe(1);
    expect(await enqueueScheduledSourceAcquisitions(env,now)).toBe(0);
    const scheduled=queued.at(-1)!;
    const stored=await db.prepare("SELECT request_json FROM public_acquisition_requests WHERE request_id=?").bind(scheduled.requestId).first<{request_json:string}>();
    expect(JSON.parse(stored!.request_json)).toMatchObject({sourceId:source.id,startTime:"2026-09-26T00:00:00.000Z",endTime:"2026-09-27T00:00:00.000Z"});
    await db.prepare("UPDATE public_acquisition_requests SET state='completed' WHERE request_id=?").bind(scheduled.requestId).run();
    await new D1SourceHighWaterStore(db,"owner").put({key:normalKey,lastSuccessfulBoundary:"2026-09-27T00:00:00.000Z"});
    expect(await enqueueScheduledSourceAcquisitions(env,new Date(now.getTime()+6*60000))).toBe(1);
    const nextRow=await db.prepare("SELECT request_json FROM public_acquisition_requests WHERE request_id=?").bind(queued.at(-1)!.requestId).first<{request_json:string}>();
    expect(JSON.parse(nextRow!.request_json).startTime).toBe("2026-09-27T00:00:00.000Z");
    // Two distinct queue requests sharing one origin/resource authority are fenced.
    const ordinary={...payload,evaluationId:undefined,sourceId:undefined,sourceUrl:"https://news.example.com/feed.xml",idempotencyKey:"concurrent-request-a"};
    const one=await (await invoke('/v1/sources/acquisition/submit',ordinary)).json() as any;
    const two=await (await invoke('/v1/sources/acquisition/submit',{...ordinary,idempotencyKey:"concurrent-request-b"})).json() as any;
    let release!:()=>void,entered!:()=>void;
    const blocked=new Promise<void>(resolve=>{release=resolve}),started=new Promise<void>(resolve=>{entered=resolve});
    let calls=0;
    const running=processPublicAcquisitionRequest(env,{type:"public_acquisition_request",requestId:one.requestId},async()=>{calls++;entered();await blocked;return Response.json({status:"SUCCESS",webOperatorCalls:0,items:[]})});
    await started;
    await processPublicAcquisitionRequest(env,{type:"public_acquisition_request",requestId:two.requestId},async()=>{calls++;return Response.json({})});
    expect(calls).toBe(1);
    expect((await db.prepare("SELECT state FROM public_acquisition_requests WHERE request_id=?").bind(two.requestId).first<{state:string}>())?.state).toBe("pending");
    release();await running;
    expect((await db.prepare("SELECT count(*) AS n FROM source_acquisition_leases").first<{n:number}>())?.n).toBe(0);
    expect((await db.prepare("SELECT count(*) AS n FROM processing_jobs").first<{n:number}>())?.n).toBe(2);
    // Queue admission failure leaves normalized evidence and durable processing
    // work intact; it must not turn a completed acquisition into reacquisition.
    env.DISTILLED_LIVE_PUBLIC_ACQUISITION_SMOKE='true';
    const firstFeed=await freshRepo.getBriefingById('feed');
    await freshRepo.upsertBriefing({...firstFeed!,id:'deferred-feed',slug:'deferred'},now);
    const deferredSource=await freshRepo.upsertConfiguredSource({briefingId:'deferred-feed',provider:'rss',kind:'rss_feed',title:'Deferred delivery',sourceUrl:source.sourceUrl,enabled:true},now);
    env.PROCESSING_QUEUE={send:async()=>{throw Error('queue_unavailable')}} as unknown as Env['PROCESSING_QUEUE'];
    const deferred=await(await invoke('/v1/live-smoke/public-acquisition',{...payload,sourceId:deferredSource.id,idempotencyKey:'deferred-admission'})).json() as any;
    expect(deferred).toMatchObject({status:'SUCCESS',itemHandoff:{inserted:0,processingJobsCreated:2,processingQueueDeferred:2}});
    expect((await db.prepare("SELECT count(*) AS n FROM raw_messages WHERE briefing_id='deferred-feed'").first<{n:number}>())?.n).toBe(2);
    expect((await db.prepare("SELECT count(*) AS n FROM processing_jobs WHERE briefing_id='deferred-feed' AND state='queued'").first<{n:number}>())?.n).toBe(2);
    await freshRepo.upsertBriefing({...firstFeed!,id:'warm-feed',slug:'warm'},now);
    const warm=await freshRepo.upsertConfiguredSource({briefingId:'warm-feed',provider:'rss',kind:'rss_feed',title:'Retained evidence',sourceUrl:source.sourceUrl,enabled:true},now);
    const delivered:ProcessingJobMessage[]=[];
    const enrollment={tenantId:'owner',source:warm,retentionDays:15,now,queue:{send:async(message:ProcessingJobMessage)=>{delivered.push(message)}}};
    expect(await enrollRetainedNewsForSource(db,{...enrollment,tenantId:'foreign'})).toEqual({enrolled:0,queued:0,deferred:0});
    expect(await enrollRetainedNewsForSource(db,enrollment)).toEqual({enrolled:2,queued:2,deferred:0});
    expect(await enrollRetainedNewsForSource(db,enrollment)).toEqual({enrolled:0,queued:0,deferred:0});
    expect(delivered).toHaveLength(2);
    expect(await new D1Repository(db).getRawMessage(delivered[0].rawMessageId)).toMatchObject({news:{tenantId:'owner',upstreamResourceId:full.result.upstreamResourceId},receivedAt:now.toISOString()});
    await freshRepo.upsertBriefing({...firstFeed!,id:'warm-deferred-feed',slug:'warm-deferred'},now);
    const warmDeferred=await freshRepo.upsertConfiguredSource({briefingId:'warm-deferred-feed',provider:'rss',kind:'rss_feed',title:'Retained during outage',sourceUrl:source.sourceUrl,enabled:true},now);
    expect(await enrollRetainedNewsForSource(db,{...enrollment,source:warmDeferred,queue:{send:async()=>{throw Error('queue_unavailable')}}})).toEqual({enrolled:2,queued:2,deferred:2});
    expect((await db.prepare("SELECT count(*) AS n FROM processing_jobs WHERE briefing_id='warm-deferred-feed' AND state='queued'").first<{n:number}>())?.n).toBe(2);
    expect(await enrollRetainedNewsForSource(db,{...enrollment,source:{...warm,sourceUrl:'https://other.example.com/feed.xml'}})).toEqual({enrolled:0,queued:0,deferred:0});
    expect(await enrollRetainedNewsForSource(db,{...enrollment,source:warm,now:new Date('2026-11-01T00:00:00Z')})).toEqual({enrolled:0,queued:0,deferred:0});
    await freshRepo.upsertBriefing({...firstFeed!,id:'new-subscription-feed',slug:'new-subscription'},now);
    const newFeed=await freshRepo.getBriefingById('new-subscription-feed');
    const subscription=await addSourceFromInput({briefing:newFeed!,repo:freshRepo,bucket:{put:async()=>{}},queue:enrollment.queue,env,now,sourceInput:source.sourceUrl!});
    expect(subscription).toMatchObject({imported:2,queued:2});
    expect((await db.prepare("SELECT count(*) AS n FROM raw_messages WHERE briefing_id='new-subscription-feed'").first<{n:number}>())?.n).toBe(2);
  }finally{await mf.dispose()}
},60000);
