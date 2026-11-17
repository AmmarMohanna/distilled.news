import {createApp} from './app';
import {InMemoryRepository} from './repository';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {sha256} from '@distilled/contracts';
import {TESTED_ACTORS} from '@distilled/connectors';
import {createIntakeDatabase} from './v1-intake/test-utils';
import * as authorization from './connector-runtime';
import {reconcileApifyRead,recoverInterruptedApifyRead} from './connector-read-recovery';
import {recoverConnectorPoll} from './connector-scheduling';
import type {Env} from './types';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,env:Env,operationId:string,runId:string;
const scope={feedId:'read-feed',feedSourceId:'read-source',sourceId:'source-identity'},url='https://api.apify.com/v2/actor-runs/ExistingRun';
beforeEach(async()=>{
 ctx=await createIntakeDatabase({product:true});const objects=new Map<string,Uint8Array>();
 env={DB:ctx.db,APIFY_API_TOKEN:'fixture-only',RAW_ARCHIVE:{put:async(k:string,b:Uint8Array)=>objects.set(k,b.slice()),get:async(k:string)=>{const b=objects.get(k);return b?{arrayBuffer:async()=>b.slice().buffer}:null;}}} as unknown as Env;
 vi.spyOn(authorization,'authorizeConnectorSource').mockResolvedValue(true);
 const request={scope,configurationRevision:1,runId:'read-poll',source:{family:'x_profile',locator:'test'},limit:20,requestedBounds:{},continuation:{providerId:'x_apify',token:JSON.stringify({runId:'ExistingRun',offset:20})}};
 runId=await sha256(JSON.stringify([scope,request.runId,'x_apify']));operationId=await sha256(JSON.stringify([scope,runId+':status']));
 await ctx.db.prepare("INSERT INTO connector_provider_poll_jobs(job_id,request,initial_hash,provider_order,due_at,state,last_error) VALUES('read-job',?,'hash','[\"x_apify\"]',?,'BLOCKED','UNCERTAIN_PAID_SUBMISSION')").bind(JSON.stringify(request),new Date().toISOString()).run();
 await ctx.db.prepare("INSERT INTO connector_provider_budgets(provider_id,limit_usd,reserved_usd) VALUES('x_apify',15,0.250001)").run();
 await ctx.db.prepare("INSERT INTO connector_provider_operations(provider_id,operation_id,request_hash,ceiling_usd,status,feed_id,feed_source_id) VALUES('x_apify',?,?,0.000001,-1,?,?)").bind(operationId,await sha256(JSON.stringify([url,'GET',null])),scope.feedId,scope.feedSourceId).run();
});
afterEach(async()=>{vi.restoreAllMocks();await ctx.dispose();});
const response=()=>Response.json({data:{id:'ExistingRun',status:'SUCCEEDED',defaultDatasetId:'ExistingDataset'}});
it('automatically resumes a legacy interrupted GET without starting an actor or changing reserved charges',async()=>{
 const fetcher=vi.spyOn(globalThis,'fetch').mockResolvedValue(response());
 expect(await recoverInterruptedApifyRead(env,scope.feedId,scope.feedSourceId)).toBe(true);
 expect(fetcher).toHaveBeenCalledTimes(1);expect(fetcher.mock.calls[0][0]).toBe(url);expect(fetcher.mock.calls[0][1]?.method).toBe('GET');
 expect(await ctx.db.prepare("SELECT state,last_error FROM connector_provider_poll_jobs WHERE job_id='read-job'").first()).toEqual({state:'PENDING',last_error:null});
 expect(await ctx.db.prepare("SELECT reserved_usd FROM connector_provider_budgets WHERE provider_id='x_apify'").first()).toEqual({reserved_usd:0.250001});
 expect(await recoverInterruptedApifyRead(env,scope.feedId,scope.feedSourceId)).toBe(false);expect(fetcher).toHaveBeenCalledTimes(1);
});
it('automatic recovery preserves unknown actor starts and refuses unrelated feeds',async()=>{
 const fetcher=vi.spyOn(globalThis,'fetch');
 expect(await recoverInterruptedApifyRead(env,'other-feed',scope.feedSourceId)).toBe(false);
 await ctx.db.prepare("INSERT INTO connector_provider_operations(provider_id,operation_id,request_hash,ceiling_usd,status,feed_id,feed_source_id) VALUES('x_apify',?,'start-hash',0.25,-1,?,?)").bind(await sha256(JSON.stringify([scope,runId+':start'])),scope.feedId,scope.feedSourceId).run();
 expect(await recoverInterruptedApifyRead(env,scope.feedId,scope.feedSourceId)).toBe(false);expect(fetcher).not.toHaveBeenCalled();
 expect(await ctx.db.prepare("SELECT state FROM connector_provider_poll_jobs WHERE job_id='read-job'").first()).toEqual({state:'BLOCKED'});
});
async function seedRevisedReadSource(){
 await ctx.db.prepare("INSERT INTO accounts(id,email,normalized_email,username,role,password_hash,created_at,updated_at) VALUES('read-owner','read@example.invalid','read@example.invalid','read-owner','user','hash','2026-10-29','2026-10-29')").run();
 await ctx.db.prepare("INSERT INTO briefings(id,owner_account_id,slug,title,interest_profile,created_at,updated_at) VALUES('read-feed','read-owner','read','Read','news','2026-10-29','2026-10-29')").run();
 await ctx.db.prepare("INSERT INTO sources(id,briefing_id,title,type,provider,kind,source_url,input,actor_id,enabled,collection_owner,last_seen_at,created_at,updated_at) VALUES('read-source','read-feed','test','channel','apify','x_profile','https://x.com/test','https://x.com/test',?,1,'connector','2026-10-29','2026-10-29','2026-10-29')").bind(TESTED_ACTORS.x).run();
 await ctx.db.prepare('INSERT INTO v1_feeds(id,json) VALUES(?,?)').bind(scope.feedId,JSON.stringify({ownerId:'read-owner',revision:2,paused:false})).run();
 await ctx.db.prepare('INSERT INTO v1_intake_scopes(id,feed_id,source_id,json) VALUES(?,?,?,?)').bind(scope.feedSourceId,scope.feedId,scope.sourceId,JSON.stringify({enabled:true,feedRevision:2})).run();
 vi.mocked(authorization.authorizeConnectorSource).mockResolvedValue(false);
}
it('recovers only the old receipt across a feed revision without resuming or rebinding the frozen poll',async()=>{
 await seedRevisedReadSource();const original=await ctx.db.prepare("SELECT request FROM connector_provider_poll_jobs WHERE job_id='read-job'").first();
 const fetcher=vi.spyOn(globalThis,'fetch').mockResolvedValue(response());
 expect(await recoverInterruptedApifyRead(env,scope.feedId,scope.feedSourceId)).toBe(true);expect(fetcher).toHaveBeenCalledTimes(1);
 expect(await ctx.db.prepare('SELECT status,payload_ref IS NOT NULL retained FROM connector_provider_operations').first()).toEqual({status:200,retained:1});
 expect(await ctx.db.prepare("SELECT state,last_error FROM connector_provider_poll_jobs WHERE job_id='read-job'").first()).toEqual({state:'BLOCKED',last_error:'RETAINED_READ_RECONCILED'});
 expect(await ctx.db.prepare("SELECT request FROM connector_provider_poll_jobs WHERE job_id='read-job'").first()).toEqual(original);
 expect(await ctx.db.prepare("SELECT reserved_usd FROM connector_provider_budgets WHERE provider_id='x_apify'").first()).toEqual({reserved_usd:0.250001});
});
it('a reconciled retired poll cannot starve a later interrupted read for the same source',async()=>{
 await seedRevisedReadSource();
 const request=JSON.parse((await ctx.db.prepare("SELECT request FROM connector_provider_poll_jobs WHERE job_id='read-job'").first<{request:string}>())!.request);
 request.runId='later-poll';
 const laterRun=await sha256(JSON.stringify([scope,request.runId,'x_apify']));
 const laterOperation=await sha256(JSON.stringify([scope,laterRun+':status']));
 await ctx.db.prepare("INSERT INTO connector_provider_poll_jobs(job_id,request,initial_hash,provider_order,due_at,state,last_error,scheduled_at) VALUES('later-job',?,'later','[\"x_apify\"]',?,'BLOCKED','UNCERTAIN_PAID_SUBMISSION','2099-01-01')").bind(JSON.stringify(request),new Date().toISOString()).run();
 await ctx.db.prepare("INSERT INTO connector_provider_operations(provider_id,operation_id,request_hash,ceiling_usd,status,feed_id,feed_source_id) VALUES('x_apify',?,?,0.000001,-1,?,?)").bind(laterOperation,await sha256(JSON.stringify([url,'GET',null])),scope.feedId,scope.feedSourceId).run();
 const fetcher=vi.spyOn(globalThis,'fetch').mockImplementation(async()=>response());
 expect(await recoverInterruptedApifyRead(env,scope.feedId,scope.feedSourceId)).toBe(true);
 expect(await recoverInterruptedApifyRead(env,scope.feedId,scope.feedSourceId)).toBe(true);
 expect(fetcher).toHaveBeenCalledTimes(2);
 expect(await ctx.db.prepare("SELECT COUNT(*) n FROM connector_provider_operations WHERE payload_ref IS NULL").first()).toEqual({n:0});
 expect(await ctx.db.prepare("SELECT COUNT(*) n FROM connector_provider_poll_jobs WHERE state='BLOCKED' AND last_error='RETAINED_READ_RECONCILED'").first()).toEqual({n:2});
});
it.each(['paused','different-source','disabled-owner'])('refuses retained receipt recovery for %s',async mode=>{
 await seedRevisedReadSource();
 if(mode==='paused')await ctx.db.prepare("UPDATE briefings SET paused=1 WHERE id='read-feed'").run();
 if(mode==='different-source')await ctx.db.prepare("UPDATE sources SET source_url='https://x.com/other',input='https://x.com/other' WHERE id='read-source'").run();
 if(mode==='disabled-owner')await ctx.db.prepare("UPDATE accounts SET disabled_at='2026-10-30' WHERE id='read-owner'").run();
 const fetcher=vi.spyOn(globalThis,'fetch');expect(await recoverInterruptedApifyRead(env,scope.feedId,scope.feedSourceId)).toBe(false);expect(fetcher).not.toHaveBeenCalled();
});
it('resumes a poll blocked before dispatch once another source owns the legacy hold',async()=>{
 await ctx.db.prepare("UPDATE connector_provider_operations SET feed_id='other-feed',feed_source_id='other-source'").run();
 await recoverConnectorPoll(env,'provider','read-job');
 expect(await ctx.db.prepare("SELECT state,last_error FROM connector_provider_poll_jobs WHERE job_id='read-job'").first()).toEqual({state:'PENDING',last_error:null});
 expect(await ctx.db.prepare('SELECT status,payload_ref,feed_source_id FROM connector_provider_operations').first()).toEqual({status:-1,payload_ref:null,feed_source_id:'other-source'});
});
it('does not resume behind an unattributed hold on a provider in the frozen order',async()=>{
 await ctx.db.prepare('UPDATE connector_provider_operations SET feed_id=NULL,feed_source_id=NULL').run();
 await expect(recoverConnectorPoll(env,'provider','read-job')).rejects.toThrow('PAID_RECONCILIATION_REQUIRED');
});
it('recovers only the saved status GET, preserves reservations and resumes the same poll',async()=>{
 await expect(recoverConnectorPoll(env,'provider','read-job')).rejects.toThrow('PAID_RECONCILIATION_REQUIRED');
 const fetcher=vi.fn(async(value:unknown,init?:RequestInit)=>{expect(value).toBe(url);expect(init?.method).toBe('GET');return response();});
 expect(await reconcileApifyRead(env,'read-job',fetcher)).toMatchObject({state:'READ_RECONCILED',recovered:1});
 await recoverConnectorPoll(env,'provider','read-job');
 expect(await ctx.db.prepare("SELECT state,last_error FROM connector_provider_poll_jobs WHERE job_id='read-job'").first()).toEqual({state:'PENDING',last_error:null});
 expect(await ctx.db.prepare("SELECT limit_usd,reserved_usd FROM connector_provider_budgets WHERE provider_id='x_apify'").first()).toEqual({limit_usd:15,reserved_usd:0.250001});
 expect(await ctx.db.prepare('SELECT COUNT(*) AS n FROM connector_provider_operations').first()).toEqual({n:1});
 expect(await reconcileApifyRead(env,'read-job',fetcher)).toMatchObject({recovered:0});expect(fetcher).toHaveBeenCalledTimes(1);
});
it('an unresolved actor-start operation cannot use read recovery',async()=>{
 await ctx.db.prepare("INSERT INTO connector_provider_operations(provider_id,operation_id,request_hash,ceiling_usd,status,feed_id,feed_source_id) VALUES('x_apify',?,'hash',0.25,-1,?,?)").bind(await sha256(JSON.stringify([scope,runId+':start'])),scope.feedId,scope.feedSourceId).run();
 const fetcher=vi.fn();await expect(reconcileApifyRead(env,'read-job',fetcher)).rejects.toThrow('ACTOR_START_RECONCILIATION_REQUIRED');expect(fetcher).not.toHaveBeenCalled();
});
it('endpoint mismatch cannot recover an unrelated operation',async()=>{
 await ctx.db.prepare("UPDATE connector_provider_operations SET request_hash='different'").run();
 const fetcher=vi.fn();await expect(reconcileApifyRead(env,'read-job',fetcher)).rejects.toThrow('READ_IDENTITY_MISMATCH');expect(fetcher).not.toHaveBeenCalled();
});
it('wrong actor identity and approval revocation cannot resolve the ledger',async()=>{
 await expect(reconcileApifyRead(env,'read-job',vi.fn(async()=>Response.json({data:{id:'AnotherRun'}})))).rejects.toThrow('READ_NOT_CONFIRMED');
 expect(await ctx.db.prepare('SELECT payload_ref FROM connector_provider_operations').first()).toEqual({payload_ref:null});
 await ctx.db.prepare('UPDATE connector_provider_read_recoveries SET lease_until=0').run();
 vi.mocked(authorization.authorizeConnectorSource).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
 await expect(reconcileApifyRead(env,'read-job',vi.fn(async()=>response()))).rejects.toThrow('SOURCE_NOT_APPROVED');
 expect(await ctx.db.prepare('SELECT payload_ref FROM connector_provider_operations').first()).toEqual({payload_ref:null});
});
it('concurrent operator retries issue one read and cannot override an active poll',async()=>{
 let release!:(r:Response)=>void,started!:()=>void;const fetching=new Promise<void>(resolve=>{started=resolve;});
 const fetcher=vi.fn(async()=>{started();return new Promise<Response>(resolve=>{release=resolve;});});
 const first=reconcileApifyRead(env,'read-job',fetcher);await fetching;
 await expect(reconcileApifyRead(env,'read-job',fetcher)).rejects.toThrow('READ_RECOVERY_BUSY');
 release(response());await first;expect(fetcher).toHaveBeenCalledTimes(1);
 await ctx.db.prepare("UPDATE connector_provider_poll_jobs SET lease_until=? WHERE job_id='read-job'").bind(new Date(Date.now()+60000).toISOString()).run();
 await expect(reconcileApifyRead(env,'read-job',fetcher)).rejects.toThrow('POLL_LEASE_ACTIVE');expect(fetcher).toHaveBeenCalledTimes(1);
});

it('unpaid poll recovery refuses unknown payments even after unrelated holds move',async()=>{
 await ctx.db.prepare("UPDATE connector_provider_operations SET feed_id='other-feed',feed_source_id='other-source'").run();
 const request=JSON.parse((await ctx.db.prepare("SELECT request FROM connector_provider_poll_jobs WHERE job_id='read-job'").first<{request:string}>())!.request);request.source={family:'website',locator:'https://example.com'};
 await ctx.db.prepare("UPDATE connector_provider_poll_jobs SET request=? WHERE job_id='read-job'").bind(JSON.stringify(request)).run();
 await expect(recoverConnectorPoll(env,'provider','read-job',{unpaidOnly:true,approvalId:'free-check',feedId:scope.feedId})).rejects.toThrow('PAID_RECONCILIATION_REQUIRED');
 expect(await ctx.db.prepare("SELECT state FROM connector_provider_poll_jobs WHERE job_id='read-job'").first()).toEqual({state:'BLOCKED'});
});
it('unpaid poll recovery persists a scoped capability fence before making the job pending',async()=>{
 const request=JSON.parse((await ctx.db.prepare("SELECT request FROM connector_provider_poll_jobs WHERE job_id='read-job'").first<{request:string}>())!.request);request.source={family:'website',locator:'https://example.com'};
 await ctx.db.prepare("UPDATE connector_provider_poll_jobs SET request=?,last_error='PROVIDER_REPAIR_REQUIRED' WHERE job_id='read-job'").bind(JSON.stringify(request)).run();
 await expect(recoverConnectorPoll(env,'provider','read-job',{unpaidOnly:true,approvalId:'free-check',feedId:'wrong-feed'})).rejects.toThrow('INVALID_RECOVERY_APPROVAL');
 await recoverConnectorPoll(env,'provider','read-job',{unpaidOnly:true,approvalId:'free-check',feedId:scope.feedId});
 expect(await ctx.db.prepare("SELECT kind,feed_id,job_id,reason FROM connector_queue_recovery WHERE kind='UNPAID_POLL_RECOVERY'").first()).toEqual({kind:'UNPAID_POLL_RECOVERY',feed_id:scope.feedId,job_id:'read-job',reason:'free-check'});
 expect(await ctx.db.prepare("SELECT state FROM connector_provider_poll_jobs WHERE job_id='read-job'").first()).toEqual({state:'PENDING'});
});

it('runs only one explicitly selected free recovery slice with paid capabilities removed',async()=>{
 const request=JSON.parse((await ctx.db.prepare("SELECT request FROM connector_provider_poll_jobs WHERE job_id='read-job'").first<{request:string}>())!.request);request.source={family:'website',locator:'https://example.com'};
 await ctx.db.prepare("UPDATE connector_provider_poll_jobs SET request=?,last_error='PROVIDER_REPAIR_REQUIRED' WHERE job_id='read-job'").bind(JSON.stringify(request)).run();
 const backend=authorization.createConnectorRuntime(env),run=vi.spyOn(backend.scheduler,'runOne').mockResolvedValue('DONE');
 vi.spyOn(authorization,'createConnectorRuntime').mockImplementation((scoped,_fetcher,unpaidOnly)=>{
  expect(unpaidOnly).toBe(true);expect(scoped.APIFY_API_TOKEN).toBeUndefined();expect(scoped.ZYTE_API_KEY).toBeUndefined();expect(scoped.SOURCE_EXECUTION_SERVICE).toBeUndefined();expect(scoped.SOURCE_NATIVE_EXECUTION_ENABLED).toBe('true');return backend;
 });
 const app=createApp({repository:new InMemoryRepository()});
 const response=await app.request('/api/internal/collectors/recover-poll-unpaid',{method:'POST',headers:{'content-type':'application/json','x-distilled-internal':'fixture-secret'},body:JSON.stringify({feedId:scope.feedId,kind:'provider',jobId:'read-job',approvalId:'bounded-public-slice',runNow:true})},{...env,INTERNAL_MAINTENANCE_SECRET:'fixture-secret'});
 expect(response.status).toBe(200);expect(await response.json()).toEqual({outcome:'DONE',unpaidOnly:true});expect(run).toHaveBeenCalledExactlyOnceWith(300000,'read-job');
});
