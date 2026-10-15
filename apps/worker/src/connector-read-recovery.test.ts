import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {sha256} from '@distilled/contracts';
import {createIntakeDatabase} from './v1-intake/test-utils';
import * as authorization from './connector-runtime';
import {reconcileApifyRead} from './connector-read-recovery';
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
