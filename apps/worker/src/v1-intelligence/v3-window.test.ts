import * as collectionCoverage from '../connector-publication-coverage';
import * as campaignFault from '../agentops-campaign-fault';
import * as providerReceipts from '../provider-receipt';
import * as semanticSettlement from './semantic-settlement';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {applyTestMigration} from '../test-migrations';
import {createIntakeDatabase,seedIntakeScope,batchFixture,testPolicy} from '../v1-intake/test-utils';
import {createCandidateIntakePort} from '../v1-intake/intake';
import {acceptAcquiredContent} from '../v1-intake/evidence';
import {V1IntakeStore} from '../v1-intake/store';
import {feedFixture,acceptEvidence} from './test-utils';
import {V1FeedStore,feedTransact,FeedTransaction} from './store';
import {dispatchV1Intelligence,processV1Briefing,processV1Reassessment,windowIdentity} from './runtime';
import {publicV1Edition} from './public-read';
import {prepareV3Window,publishProductV3Window,productV3PromptVersion} from './v3-window';
import {supersedeUnstartedV3Windows} from './window-catchup';
import {isAutomaticReportingWindow} from './runtime';
import {livePublicationWindow} from './schedule';
import {cutoffEvidenceAuthorized} from './cutoff-edition';
import {readScheduleAudit} from './schedule-audit';
import {acquireSemanticWorkLease,releaseSemanticWorkLease,SemanticLeaseError} from './semantic-work-lease';
import {isolateExpiredModelExecutions} from './model-capacity-recovery';
import {recoverBlockedV3Request} from './v3-blocked-recovery';
import {settleModelSpending} from './model-spending';
import {recoverPendingProviderGenerations} from './provider-recovery';
import type {Env} from '../types';

const window={start:'2026-10-03T12:00:00Z',end:'2026-10-03T12:30:00Z',kind:'30M' as const};
function responseArchive(){const objects=new Map<string,string>();return {objects,bucket:{put:async(key:string,value:string)=>{if(objects.has(key))return null;objects.set(key,value);return {key}},get:async(key:string)=>objects.has(key)?{text:async()=>objects.get(key)!}:null} as unknown as R2Bucket}}
it('persists a complete paid response through D1 when the R2 checkpoint is temporarily unavailable',async()=>{
 await article();const archive=responseArchive();archive.bucket.put=async()=>{throw Error('R2 temporarily unavailable')};env={...env,RAW_ARCHIVE:archive.bucket};
 const seen:string[]=[],edition=await processV1Briefing(env,{type:'v1_briefing',feedId:'feed-1',window},()=>window.end,undefined,fetcher(seen) as typeof fetch);
 expect(edition?.engine).toBe('v3');expect(seen).toHaveLength(2);expect(archive.objects.size).toBe(0);
 expect((await store.list<any>('feed-1','semantic_results')).every(r=>r.status==='SUCCEEDED'&&r.usage.reported)).toBe(true);
});
it('retains header correlation when the provider body is lost and never reissues it',async()=>{
 await article();env={...env,RAW_ARCHIVE:responseArchive().bucket};let calls=0;
 const lost=(async()=>{calls++;return new Response(new ReadableStream({start(controller){controller.error(Error('connection reset during body'))}}),{headers:{'x-generation-id':'gen-test-lost'}})}) as typeof fetch;
 const message={type:'v1_briefing' as const,feedId:'feed-1',window};
 await processV1Briefing(env,message,()=>window.end,undefined,lost);
 const receipts=await ctx.db.prepare("SELECT json_extract(json,'$.generationId') generation FROM v1_feed_documents WHERE kind='model_provider_receipts' AND feed_id='feed-1'").all();
 expect(receipts.results).toEqual([{generation:'gen-test-lost'}]);
 await processV1Briefing(env,message,()=> '2026-10-03T12:32:00Z',undefined,lost);expect(calls).toBe(1);
});
it('resumes the final source audit after D1 failure and preserves all supporting sources',async()=>{
 await article(1);await acceptEvidence(store,2,'Another outlet reports Parliament approved banking reform legislation; presidential approval is still required.','publisher-2','2026-10-03T12:11:00Z','en','2026-10-03T12:06:00Z','Another banking report','https://other.example/report');await processV1Reassessment(env,JSON.stringify(['REASSESS','observation-2','']),'2026-10-03T12:11:00Z');const archive=responseArchive();env={...env,RAW_ARCHIVE:archive.bucket};
 const capture=providerReceipts.captureProviderReceipt,seen:string[]=[];let fail=true;
 vi.spyOn(providerReceipts,'captureProviderReceipt').mockImplementation(async receipt=>{if(fail&&receipt.stage==='USAGE'&&seen.at(-1)?.includes('You audit source coverage')){fail=false;throw Error('D1_ERROR: D1 DB is overloaded')}return capture(receipt)});
 const message={type:'v1_briefing' as const,feedId:'feed-1',window};
 await processV1Briefing(env,message,()=>window.end,undefined,fetcher(seen) as typeof fetch);
 expect(fail).toBe(false);expect(seen).toHaveLength(2);expect(archive.objects.size).toBe(2);
 const edition=await processV1Briefing(env,message,()=> '2026-10-03T12:32:00Z',undefined,fetcher(seen) as typeof fetch);
 expect(edition?.evidenceRevisionIds).toHaveLength(2);expect(seen).toHaveLength(3);
},30000);
it('recovers a checkpoint when settlement fails after the model reply',async()=>{
 await article();env={...env,RAW_ARCHIVE:responseArchive().bucket};
 const settle=semanticSettlement.settleSemanticOperation;let fail=true;
 vi.spyOn(semanticSettlement,'settleSemanticOperation').mockImplementation(async(...args)=>{if(fail){fail=false;throw Error('D1_ERROR: D1 DB is overloaded')}return settle(...args)});
 const seen:string[]=[],message={type:'v1_briefing' as const,feedId:'feed-1',window};
 await processV1Briefing(env,message,()=>window.end,undefined,fetcher(seen) as typeof fetch);
 expect(await store.read('feed-1','briefing_requests',await windowIdentity('feed-1',window))).toMatchObject({state:'PENDING',reason:'V3_RESPONSE_AWAITING_PERSISTENCE',attempts:0});
 expect(await store.list('feed-1','semantic_results')).toHaveLength(0);
 expect(await processV1Briefing(env,message,()=> '2026-10-03T12:32:00Z',undefined,fetcher(seen) as typeof fetch)).toBeDefined();expect(seen).toHaveLength(2);
},30000);
it.each([false,true])('does not let a complete checkpoint bypass subsequent source revocation (indexed accounting %s)',async indexed=>{
 await article();env={...env,RAW_ARCHIVE:responseArchive().bucket};
 const capture=providerReceipts.captureProviderReceipt;let fail=true;
 vi.spyOn(providerReceipts,'captureProviderReceipt').mockImplementation(async receipt=>{if(fail){fail=false;throw Error('D1_ERROR: D1 DB is overloaded')}return capture(receipt)});
 const seen:string[]=[],message={type:'v1_briefing' as const,feedId:'feed-1',window};
 await processV1Briefing(env,message,()=>window.end,undefined,fetcher(seen) as typeof fetch);
 await ctx.db.prepare("UPDATE v1_intake_scopes SET json=json_set(json,'$.enabled',0),epoch=epoch+1 WHERE id='feed-source-1'").run();
 await processV1Briefing(env,message,()=> '2026-10-03T12:32:00Z',undefined,fetcher(seen) as typeof fetch).catch(()=>undefined);
 expect(seen).toHaveLength(1);expect(await store.list('feed-1','editions')).toHaveLength(0);
 if(indexed)await applyTestMigration(ctx.db,readFileSync(new URL('../../migrations/0071_provider_recovery_indexes.sql',import.meta.url),'utf8'));
 const metadata=vi.fn<typeof fetch>();
 await recoverPendingProviderGenerations(ctx.db,'test-key',new Date(Date.now()+300000),metadata,env.RAW_ARCHIVE);
 expect(await ctx.db.prepare('SELECT reported,cost_usd FROM v1_model_spending_settlements').first()).toMatchObject({reported:1,cost_usd:.001});
 expect(metadata).not.toHaveBeenCalled();expect(await store.list('feed-1','editions')).toHaveLength(0);
});
it.each(['HEADERS','USAGE'] as const)('recovers a complete paid response after D1 %s receipt failure without another provider call',async stage=>{
 await article();const objects=new Map<string,string>();
 env={...env,RAW_ARCHIVE:{put:async(key:string,value:string)=>{if(!objects.has(key))objects.set(key,value);return {key}},get:async(key:string)=>objects.has(key)?{text:async()=>objects.get(key)!}:null} as unknown as R2Bucket};
 const capture=providerReceipts.captureProviderReceipt;let fail=true;
 vi.spyOn(providerReceipts,'captureProviderReceipt').mockImplementation(async receipt=>{if(fail&&receipt.stage===stage){fail=false;throw Error('D1_ERROR: D1 DB is overloaded')}return capture(receipt)});
 const seen:string[]=[],message={type:'v1_briefing' as const,feedId:'feed-1',window};
 await processV1Briefing(env,message,()=>window.end,undefined,fetcher(seen) as typeof fetch).catch(()=>undefined);
 expect(seen).toHaveLength(1);expect(objects.size).toBe(1);
 expect(await store.list('feed-1','semantic_results')).toHaveLength(0);
 const edition=await processV1Briefing(env,message,()=> '2026-10-03T12:32:00Z',undefined,fetcher(seen) as typeof fetch);
 expect(edition?.engine).toBe('v3');expect(seen).toHaveLength(2);
 expect((await store.list<any>('feed-1','semantic_results')).every(r=>r.status==='SUCCEEDED'&&r.usage.reported)).toBe(true);
 await processV1Briefing(env,message,()=> '2026-10-03T12:33:00Z',undefined,fetcher(seen) as typeof fetch);expect(seen).toHaveLength(2);
},30000);
it('publishes a cutoff edition with unfinished intake and carries evidence accepted after cutoff into the next edition',async()=>{
 await article(1,'2026-10-03T12:05:00Z','2026-10-03T12:10:00Z','2026-10-03T12:09:00Z');
 await article(2,'2026-10-03T12:15:00Z','2026-10-03T12:31:00Z','2026-10-03T12:12:00Z');
 for(const kind of ['ACQUIRE','REASSESS'])await ctx.db.prepare('INSERT INTO v1_jobs(id,feed_source_id,json) VALUES(?,?,?)').bind('unfinished-'+kind,'feed-source-1',JSON.stringify({id:'unfinished-'+kind,kind,state:'PENDING',attempts:0,observationId:'observation-1'})).run();
 const before=(await ctx.db.prepare("SELECT id,json FROM v1_jobs WHERE id LIKE 'unfinished-%' ORDER BY id").all()).results;
 const schedule={durationMinutes:30 as const,timezone:'UTC',clockStartAt:'2026-10-03T11:00:00Z',clockPolicy:'clock-aligned-delivery-v2' as const};
 const scheduled=livePublicationWindow(schedule,new Date('2026-10-03T12:25:00Z')),id=await windowIdentity('feed-1',scheduled),seen:string[]=[];
 const edition=await processV1Briefing(env,{type:'v1_briefing',feedId:'feed-1',window:scheduled},()=> '2026-10-03T12:40:00Z',undefined,fetcher(seen) as typeof fetch);
 expect(edition).toBeDefined();expect(seen).toHaveLength(2);
 const frozen=await store.read<any>('feed-1','v3_window_inputs',id);
 expect(frozen.cutoffPolicy).toBe('READY_AT_CUTOFF_V1');expect(frozen.input.articles).toHaveLength(1);
 expect(frozen.input.articles[0].publishedAt).toBe('2026-10-03T12:05:00Z');
 expect(await store.read('feed-1','briefing_requests',id)).toMatchObject({state:'DONE',result:'PUBLISHED',coverage:{state:'INCOMPLETE',pendingJobs:0,deferredJobs:2}});
 expect((await ctx.db.prepare("SELECT id,json FROM v1_jobs WHERE id LIKE 'unfinished-%' ORDER BY id").all()).results).toEqual(before);
 await processV1Briefing(env,{type:'v1_briefing',feedId:'feed-1',window:scheduled},()=> '2026-10-03T12:45:00Z',undefined,fetcher(seen) as typeof fetch);expect(seen).toHaveLength(2);
 const next=await prepareV3Window(store,'feed-1',livePublicationWindow(schedule,new Date('2026-10-03T12:55:00Z')),'2026-10-03T12:55:00Z');
 expect(next.input.articles).toHaveLength(1);expect(next.input.articles[0].publishedAt).toBe('2026-10-03T12:15:00Z');expect(next.evidenceRevisionIds).not.toEqual(frozen.evidenceRevisionIds);
},30000);
it('keeps a cutoff snapshot stable when an included source revision is updated after cutoff',async()=>{
 await article(1,'2026-10-03T12:05:00Z','2026-10-03T12:10:00Z','2026-10-03T12:09:00Z');
 const schedule={durationMinutes:30 as const,timezone:'UTC',clockStartAt:'2026-10-03T11:00:00Z',clockPolicy:'clock-aligned-delivery-v2' as const};
 const scheduled=livePublicationWindow(schedule,new Date('2026-10-03T12:25:00Z')),id=await windowIdentity('feed-1',scheduled),seen:string[]=[];
 const provider=fetcher(seen);let replacement:string|undefined;
 const updating=(async(url:unknown,init?:RequestInit)=>{if(!replacement){const frozen=await store.read<any>('feed-1','v3_window_inputs',id);replacement=await supersedeFrozenRevision(frozen.evidenceRevisionIds[0],{acceptedAt:'2026-10-03T12:36:00Z',body:'Parliament corrected the banking reform report.'})}return provider(url,init)}) as typeof fetch;
 const edition=await processV1Briefing(env,{type:'v1_briefing',feedId:'feed-1',window:scheduled},()=> '2026-10-03T12:35:00Z',undefined,updating);
 expect(edition).toBeDefined();expect(edition!.evidenceRevisionIds).not.toContain(replacement);expect(seen).toHaveLength(2);
 const frozen=await store.read<any>('feed-1','v3_window_inputs',id);expect(frozen.cutoffPolicy).toBe('READY_AT_CUTOFF_V1');
 const next=await prepareV3Window(store,'feed-1',livePublicationWindow(schedule,new Date('2026-10-03T12:55:00Z')),'2026-10-03T12:55:00Z');
 expect(next.evidenceRevisionIds).toContain(replacement);
},30000);
it('selects the revision ready at cutoff when processing starts after a later update',async()=>{
 await article(1,'2026-10-03T12:05:00Z','2026-10-03T12:10:00Z','2026-10-03T12:09:00Z');
 const original=(await store.currentEvidenceHeaders('feed-1'))[0].revision.id;
 await supersedeFrozenRevision(original,{acceptedAt:'2026-10-03T12:26:00Z',body:'Later correction'});
 const scheduled=livePublicationWindow({durationMinutes:30,timezone:'UTC',clockStartAt:'2026-10-03T11:00:00Z',clockPolicy:'clock-aligned-delivery-v2'},new Date('2026-10-03T12:25:00Z'));
 const prepared=await prepareV3Window(store,'feed-1',scheduled,'2026-10-03T12:40:00Z');
 expect(prepared.evidenceRevisionIds).toEqual([original]);
 expect(prepared.input.articles[0].text).toContain('Presidential approval');
});
it('does not resurrect evidence deleted before cutoff and restored afterward',async()=>{
 await applyTestMigration(ctx.db,readFileSync(new URL('../../migrations/0092_cutoff_tombstone_lookup.sql',import.meta.url),'utf8'));
 await article(1,'2026-10-03T12:05:00Z','2026-10-03T12:10:00Z','2026-10-03T12:09:00Z');
 const original=(await store.currentEvidenceHeaders('feed-1'))[0].revision;
 const scheduled=livePublicationWindow({durationMinutes:30,timezone:'UTC',clockStartAt:'2026-10-03T11:00:00Z',clockPolicy:'clock-aligned-delivery-v2'},new Date('2026-10-03T12:25:00Z'));
 const before=await prepareV3Window(store,'feed-1',scheduled,'2026-10-03T12:25:00Z');
 await ctx.db.prepare('INSERT INTO v1_tombstones(id,feed_source_id,json) VALUES(?,?,?)').bind('deleted-at-cutoff','feed-source-1',JSON.stringify({evidenceId:original.evidenceId,acceptedAt:'2026-10-03T12:20:00Z'})).run();
 await supersedeFrozenRevision(original.id,{acceptedAt:'2026-10-03T12:40:00Z'});
 expect((await prepareV3Window(store,'feed-1',scheduled,'2026-10-03T12:45:00Z')).evidenceRevisionIds).toEqual([]);
 expect(await cutoffEvidenceAuthorized(store,before)).toBe(false);
});
async function supersedeFrozenRevision(id:string,changes:Record<string,unknown>={}){
 const row=await ctx.db.prepare('SELECT feed_source_id,item_key,json FROM v1_revisions WHERE id=?').bind(id).first<any>();
 const revision=JSON.parse(row.json),next={...revision,...changes,id:id+'-new',revision:revision.revision+1};
 await ctx.db.prepare('INSERT INTO v1_revisions(id,feed_source_id,item_key,json) VALUES(?,?,?,?)').bind(next.id,row.feed_source_id,row.item_key,JSON.stringify(next)).run();
 await ctx.db.prepare("UPDATE v1_evidence SET json=json_set(json,'$.currentRevisionId',?) WHERE id=?").bind(next.id,revision.evidenceId).run();
 await ctx.db.prepare('UPDATE v1_intake_scopes SET epoch=epoch+1 WHERE id=?').bind(row.feed_source_id).run();return next.id;
}
it('cutoff source revocation still prevents publication and retains the paid receipt',async()=>{
 await article(1,'2026-10-03T12:05:00Z','2026-10-03T12:10:00Z','2026-10-03T12:09:00Z');
 const scheduled=livePublicationWindow({durationMinutes:30,timezone:'UTC',clockStartAt:'2026-10-03T11:00:00Z',clockPolicy:'clock-aligned-delivery-v2'},new Date('2026-10-03T12:25:00Z'));
 const seen:string[]=[],provider=fetcher(seen);
 const revoked=(async(url:unknown,init?:RequestInit)=>{const response=await provider(url,init);if(seen.length===1)await ctx.db.prepare("UPDATE v1_intake_scopes SET json=json_set(json,'$.enabled',0),epoch=epoch+1 WHERE id='feed-source-1'").run();return response}) as typeof fetch;
 await expect(processV1Briefing(env,{type:'v1_briefing',feedId:'feed-1',window:scheduled},()=> '2026-10-03T12:30:00Z',undefined,revoked)).rejects.toThrow();
 expect(seen).toHaveLength(1);expect(await store.list('feed-1','editions')).toHaveLength(0);
 expect(await store.list('feed-1','semantic_settlements')).toMatchObject([{usage:{reported:true,costUsd:.001}}]);
});
it('retains a legacy frozen scheduled input and its intake gate',async()=>{
 await article(1,'2026-10-03T12:05:00Z','2026-10-03T12:10:00Z','2026-10-03T12:09:00Z');
 const scheduled=livePublicationWindow({durationMinutes:30,timezone:'UTC',clockStartAt:'2026-10-03T11:00:00Z',clockPolicy:'clock-aligned-delivery-v2'},new Date('2026-10-03T12:25:00Z')),id=await windowIdentity('feed-1',scheduled);
 const prepared={...await prepareV3Window(store,'feed-1',scheduled,scheduled.end,undefined,4,undefined,false),id};
 expect(prepared.cutoffPolicy).toBeUndefined();
 await feedTransact(store,'feed-1',async tx=>{await tx.write('briefing_requests',id,{id,feedId:'feed-1',window:scheduled,state:'PENDING',attempts:0,createdAt:scheduled.end,engine:'v3'});await tx.write('v3_window_inputs',id,prepared)});
 await ctx.db.prepare("INSERT INTO v1_jobs(id,feed_source_id,json) VALUES('legacy-pending','feed-source-1',?)").bind(JSON.stringify({kind:'REASSESS',state:'PENDING',observationId:'observation-1'})).run();
 const seen:string[]=[];expect(await processV1Briefing(env,{type:'v1_briefing',feedId:'feed-1',window:scheduled},()=> '2026-10-03T12:30:00Z',undefined,fetcher(seen) as typeof fetch)).toBeUndefined();
 expect(seen).toHaveLength(0);expect(await store.read('feed-1','v3_window_inputs',id)).toEqual(prepared);
});
it('dispatches scheduled cutoff preparation despite pending intake and records deferred coverage',async()=>{
 const schedule={durationMinutes:30 as const,timezone:'UTC',clockStartAt:'2026-10-03T12:00:00Z',clockPolicy:'clock-aligned-delivery-v2' as const};
 await store.registerFeed({...feedFixture,revision:2,createdAt:'2026-10-03T11:00:00Z',briefingFrequency:'30M',briefingSchedule:schedule});
 await article(1,'2026-10-03T12:05:00Z','2026-10-03T12:10:00Z','2026-10-03T12:09:00Z');
 await ctx.db.prepare("INSERT INTO v1_jobs(id,feed_source_id,json) VALUES('dispatch-pending','feed-source-1',?)").bind(JSON.stringify({kind:'REASSESS',state:'PENDING',observationId:'observation-1'})).run();
 const sent:any[]=[];env={...env,PROCESSING_QUEUE:{send:async(body:unknown)=>{sent.push(body)}}} as unknown as Env;
 const at=new Date('2026-10-03T12:25:00Z'),scheduled=livePublicationWindow(schedule,at),id=await windowIdentity('feed-1',scheduled);
 await dispatchV1Intelligence(env,at);
 expect(sent).toContainEqual({type:'v1_briefing',feedId:'feed-1',window:scheduled});
 expect(await store.read('feed-1','briefing_requests',id)).toMatchObject({coverage:{state:'INCOMPLETE',pendingJobs:0,deferredJobs:1}});
});
it('offers a due cutoff edition the available transport turn before unfinished review work',async()=>{
 const schedule={durationMinutes:30 as const,timezone:'UTC',clockStartAt:'2026-10-03T12:00:00Z',clockPolicy:'clock-aligned-delivery-v2' as const};
 await store.registerFeed({...feedFixture,revision:2,createdAt:'2026-10-03T11:00:00Z',briefingFrequency:'30M',briefingSchedule:schedule});
 await article();
 await ctx.db.prepare("INSERT INTO v1_jobs(id,feed_source_id,json) VALUES('review-waiting','feed-source-1',?)").bind(JSON.stringify({kind:'REASSESS',state:'PENDING',observationId:'observation-1'})).run();
 const accepted:any[]=[];env={...env,PROCESSING_QUEUE:{send:async(body:unknown)=>{if(accepted.length)return false;accepted.push(body)}}} as unknown as Env;
 const at=new Date('2026-10-03T12:25:00Z');await dispatchV1Intelligence(env,at);
 expect(accepted).toEqual([{type:'v1_briefing',feedId:'feed-1',window:livePublicationWindow(schedule,at)}]);
 expect(JSON.parse((await ctx.db.prepare("SELECT json FROM v1_jobs WHERE id='review-waiting'").first<{json:string}>())!.json).state).toBe('PENDING');
});
it.each(['v2','v3'] as const)('retains review-before-rematch transport ordering for a held legacy V2 window under %s',async engine=>{
 await article();env={...env,BRIEFING_ENGINE:engine};
 const revision=(await store.currentEvidenceHeaders('feed-1'))[0].revision.id,id=await windowIdentity('feed-1',window);
 await ctx.db.prepare("INSERT INTO v1_jobs(id,feed_source_id,json) VALUES('legacy-review','feed-source-1',?)").bind(JSON.stringify({kind:'REASSESS',state:'PENDING',observationId:'observation-1'})).run();
 await feedTransact(store,'feed-1',async tx=>{
  await tx.write('briefing_requests',id,{id,feedId:'feed-1',window,engine:'v2',state:'PENDING',attempts:0,createdAt:window.end});
  await tx.write('rematch_requests','legacy-rematch',{id:'legacy-rematch',feedId:'feed-1',jobId:'legacy-review',evidenceRevisionId:revision,policyVersion:'semantic-rematch-continuation-v2',createdAt:window.end});
 });
 const accepted:any[]=[];env={...env,PROCESSING_QUEUE:{send:async(body:unknown)=>{if(accepted.length)return false;accepted.push(body)}}} as unknown as Env;
 await dispatchV1Intelligence(env,new Date(window.end));
 expect(accepted).toEqual([{type:'v1_reassess',jobId:'legacy-review'}]);
 expect(await store.read('feed-1','briefing_requests',id)).toMatchObject({state:'PENDING',engine:'v2'});
});
it('refreshes an unstarted stale snapshot while preserving its predecessor and reporting window',async()=>{
 await article();const id=await windowIdentity('feed-1',window),prepared={...await prepareV3Window(store,'feed-1',window,window.end),id};
 await feedTransact(store,'feed-1',async tx=>{await tx.write('briefing_requests',id,{id,feedId:'feed-1',window,state:'PENDING',attempts:0,createdAt:window.end,engine:'v3'});await tx.write('v3_window_inputs',id,prepared)});
 const next=await supersedeFrozenRevision(prepared.evidenceRevisionIds[0]),seen:string[]=[];
 const edition=await processV1Briefing(env,{type:'v1_briefing',feedId:'feed-1',window},()=> '2026-10-03T12:34:00Z',undefined,fetcher(seen) as typeof fetch);
 expect(edition).toMatchObject({id,windowStart:window.start,windowEnd:window.end,evidenceRevisionIds:[next]});expect(edition?.v3InputId).not.toBe(id);
 expect(await store.read('feed-1','v3_window_inputs',id)).toEqual(prepared);
 expect(await store.read('feed-1','v3_window_inputs',edition!.v3InputId!)).toMatchObject({recovery:{priorInputId:id,reason:'SUPERSEDED_UNSTARTED_EVIDENCE'}});
 expect(seen).toHaveLength(2);expect(await publicV1Edition(ctx.db,id)).toBeDefined();
 await processV1Briefing(env,{type:'v1_briefing',feedId:'feed-1',window},()=> '2026-10-03T12:35:00Z',undefined,fetcher(seen) as typeof fetch);expect(seen).toHaveLength(2);
},30000);
it('never refreshes stale evidence after an uncertain paid call',async()=>{
 await article();let calls=0;const offline=(async()=>{calls++;throw Error('lost after send')}) as typeof fetch;
 const message={type:'v1_briefing' as const,feedId:'feed-1',window},id=await windowIdentity('feed-1',window);
 await processV1Briefing(env,message,()=>window.end,undefined,offline);
 const snapshot=await store.read<any>('feed-1','v3_window_inputs',id);await supersedeFrozenRevision(snapshot.evidenceRevisionIds[0]);
 await processV1Briefing(env,message,()=> '2026-10-03T12:32:00Z',undefined,offline);
 expect(calls).toBe(1);expect(await store.list('feed-1','v3_window_inputs')).toHaveLength(1);
 expect(await store.read('feed-1','briefing_requests',id)).toMatchObject({state:'PENDING',reason:'V3_FROZEN_EVIDENCE_SUPERSEDED'});
 expect(await store.list('feed-1','editions')).toHaveLength(0);
},30000);
it('retires a superseded started window without replay and carries the replacement evidence forward',async()=>{
 await article();let calls=0;const failed=(async()=>{calls++;throw Error('lost after send')}) as typeof fetch;
 const message={type:'v1_briefing' as const,feedId:'feed-1',window},id=await windowIdentity('feed-1',window);
 await processV1Briefing(env,message,()=>window.end,undefined,failed);
 const frozen=await store.read<any>('feed-1','v3_window_inputs',id),replacement=await supersedeFrozenRevision(frozen.evidenceRevisionIds[0]);
 await processV1Briefing(env,message,()=> '2026-10-03T12:40:00Z',undefined,failed);
 const before=(await ctx.db.prepare('SELECT id,json FROM v1_model_spending_reservations').all()).results;
 expect(await recoverBlockedV3Request(store,'feed-1',await store.read<any>('feed-1','briefing_requests',id),'2026-10-03T12:41:00Z')).toBe(true);
 expect(calls).toBe(1);expect(await store.read('feed-1','v3_window_inputs',id)).toEqual(frozen);
 expect(await store.read('feed-1','briefing_requests',id)).toMatchObject({state:'FAILED',failure:'V3_FROZEN_EVIDENCE_SUPERSEDED'});
 expect((await ctx.db.prepare('SELECT id,json FROM v1_model_spending_reservations').all()).results).toEqual(before);
 const next={start:window.end,end:'2026-10-03T13:00:00Z',kind:'30M' as const};
 expect((await prepareV3Window(store,'feed-1',next,next.end)).evidenceRevisionIds).toContain(replacement);
},30000);
it('automatically retires an isolated unknown window but leaves active unknown work pending',async()=>{
 await article();let calls=0;const failed=(async()=>{calls++;throw Error('lost after send')}) as typeof fetch;
 const message={type:'v1_briefing' as const,feedId:'feed-1',window},id=await windowIdentity('feed-1',window);
 await processV1Briefing(env,message,()=>window.end,undefined,failed);
 const request=await store.read<any>('feed-1','briefing_requests',id);
 expect(await recoverBlockedV3Request(store,'feed-1',request,'2026-10-03T12:35:00Z')).toBe(false);
 const money=await ctx.db.prepare('SELECT lease_until FROM v1_model_spending_reservations').first<{lease_until:number}>();
 await isolateExpiredModelExecutions(ctx.db,'isolate-after-5m-v1',new Date(money!.lease_until+300001));
 const lease=await acquireSemanticWorkLease(store,'feed-1');
 expect(await recoverBlockedV3Request(store,'feed-1',request,'2026-10-03T12:45:00Z')).toBe(false);
 await releaseSemanticWorkLease(store,lease);
 expect(await recoverBlockedV3Request(store,'feed-1',request,'2026-10-03T12:45:00Z')).toBe(true);
 expect(await store.read('feed-1','briefing_requests',id)).toMatchObject({state:'FAILED',failure:'V3_UNCERTAIN_CALL_ISOLATED'});expect(calls).toBe(1);
},30000);
it.each([false,true])('recovers an orphaned legacy window only after isolation while preserving checkpoint-capable work (%s)',async checkpointed=>{
 await article();if(checkpointed)env={...env,RAW_ARCHIVE:responseArchive().bucket};
 const message={type:'v1_briefing' as const,feedId:'feed-1',window},id=await windowIdentity('feed-1',window);let calls=0;
 await processV1Briefing(env,message,()=>window.end,undefined,(async()=>{calls++;throw Error('lost body')}) as typeof fetch);
 await ctx.db.prepare("DELETE FROM v1_feed_documents WHERE kind='semantic_results'").run();
 await feedTransact(store,'feed-1',async tx=>{const current=await tx.read<any>('briefing_requests',id);await tx.write('briefing_requests',id,{...current,reason:'INCOMPLETE_INTAKE_COVERAGE'})});
 const request=await store.read<any>('feed-1','briefing_requests',id),money=await ctx.db.prepare('SELECT lease_until FROM v1_model_spending_reservations').first<{lease_until:number}>();
 expect(await recoverBlockedV3Request(store,'feed-1',request,'2026-10-03T12:35:00Z')).toBe(false);
 await isolateExpiredModelExecutions(ctx.db,'isolate-after-5m-v1',new Date(money!.lease_until+300001));
 vi.spyOn(Date,'now').mockReturnValue(money!.lease_until+300001);
 const before=(await ctx.db.prepare('SELECT id,json FROM v1_model_spending_reservations').all()).results;
 expect(await recoverBlockedV3Request(store,'feed-1',request,'2026-10-03T12:45:00Z')).toBe(!checkpointed);
 expect(await store.read('feed-1','briefing_requests',id)).toMatchObject({state:checkpointed?'PENDING':'FAILED'});
 expect((await ctx.db.prepare('SELECT id,json FROM v1_model_spending_reservations').all()).results).toEqual(before);expect(calls).toBe(1);
},30000);
it.each(['SEMANTIC_PROVIDER_FAILURE','SEMANTIC_OUTCOME_UNKNOWN'])('retires a failed semantic call after accounting settles without treating the charge as usable content (%s)',async failure=>{
 await article();let calls=0;const failed=(async()=>{calls++;throw Error(failure)}) as typeof fetch;
 // Seed the expired-intent unknown fence before its immutable first write.
 const original=FeedTransaction.prototype.write;
 vi.spyOn(FeedTransaction.prototype,'write').mockImplementation(async function(this:FeedTransaction,kind,id,value){return original.call(this,kind,id,kind==='semantic_results'?{...(value as object),failure}:value)});
 const message={type:'v1_briefing' as const,feedId:'feed-1',window},id=await windowIdentity('feed-1',window);
 await processV1Briefing(env,message,()=>window.end,undefined,failed);
 const request=await store.read<any>('feed-1','briefing_requests',id),results=await store.list<any>('feed-1','semantic_results');
 expect(request.reason).toBe('SEMANTIC_OUTCOME_UNKNOWN');expect(results).toMatchObject([{status:'DEFERRED',failure,usage:{reported:false}}]);
 expect(await recoverBlockedV3Request(store,'feed-1',request,'2026-10-03T12:35:00Z')).toBe(false);
 const reservation=await ctx.db.prepare('SELECT id,token FROM v1_model_spending_reservations').first<{id:string;token:string}>();
 await settleModelSpending(ctx.db,reservation!.id,reservation!.token,{costUsd:.001,reported:true});
 const money=(await ctx.db.prepare('SELECT * FROM v1_model_spending_settlements').all()).results;
 const lease=await acquireSemanticWorkLease(store,'feed-1');
 expect(await recoverBlockedV3Request(store,'feed-1',request,'2026-10-03T12:40:00Z')).toBe(false);
 await releaseSemanticWorkLease(store,lease);
 expect(await recoverBlockedV3Request(store,'feed-1',request,'2026-10-03T12:41:00Z')).toBe(true);
 expect(await store.read('feed-1','briefing_requests',id)).toMatchObject({state:'FAILED',failure:'V3_SETTLED_CALL_FAILED'});
 expect(await store.list('feed-1','semantic_results')).toEqual(results);expect(await store.list('feed-1','editions')).toHaveLength(0);
 expect((await ctx.db.prepare('SELECT * FROM v1_model_spending_settlements').all()).results).toEqual(money);
 expect(calls).toBe(1);
},30000);
it('preserves recovered input identity and clock delivery together without duplicate inference',async()=>{
 const schedule={durationMinutes:30 as const,timezone:'UTC',clockStartAt:'2026-10-03T12:08:00Z'};
 const first=livePublicationWindow(schedule,new Date('2026-10-03T12:25:00Z'));
 await store.registerFeed({...feedFixture,revision:2,createdAt:schedule.clockStartAt,briefingFrequency:'30M',briefingSchedule:schedule});
 await article(1,'2026-10-03T12:15:00Z','2026-10-03T12:20:00Z','2026-10-03T12:19:00Z');
 const id=await windowIdentity('feed-1',first),prepared={...await prepareV3Window(store,'feed-1',first,first.end,undefined,4,undefined,false),id};
 await feedTransact(store,'feed-1',async tx=>{await tx.write('briefing_requests',id,{id,feedId:'feed-1',window:first,state:'PENDING',attempts:0,createdAt:first.end,engine:'v3'});await tx.write('v3_window_inputs',id,prepared)});
 const replacement=await supersedeFrozenRevision(prepared.evidenceRevisionIds[0]),seen:string[]=[],provider=fetcher(seen) as typeof fetch,message={type:'v1_briefing' as const,feedId:'feed-1',window:first};
 expect(await processV1Briefing(env,message,()=> '2026-10-03T12:25:01Z',undefined,provider)).toBeUndefined();
 const request=await store.read<any>('feed-1','briefing_requests',id);
 expect(request).toMatchObject({reason:'AWAITING_SCHEDULED_DELIVERY',nextAttemptAt:'2026-10-03T12:30:00.000Z'});
 expect(request.v3InputId).not.toBe(id);
 expect(await store.read('feed-1','v3_window_inputs',id)).toEqual(prepared);
 expect(await store.read('feed-1','v3_window_inputs',request.v3InputId)).toMatchObject({scheduledFor:first.scheduledFor,evidenceRevisionIds:[replacement],recovery:{priorInputId:id}});
 expect(await store.list('feed-1','editions')).toHaveLength(0);expect(seen).toHaveLength(2);
 const edition=await processV1Briefing(env,message,()=> '2026-10-03T12:30:01Z',undefined,provider);
 expect(edition).toMatchObject({id,v3InputId:request.v3InputId,scheduledFor:first.scheduledFor,windowStart:first.start,windowEnd:first.end,evidenceRevisionIds:[replacement]});
 expect(await publicV1Edition(ctx.db,id)).toMatchObject({scheduledFor:first.scheduledFor,publishedAt:'2026-10-03T12:30:01Z'});
 await processV1Briefing(env,message,()=> '2026-10-03T12:31:00Z',undefined,provider);expect(seen).toHaveLength(2);
 expect(await store.list('feed-1','delivery_jobs')).toHaveLength(1);
},30000);
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,store:V1FeedStore,env:Env;
beforeEach(async()=>{
 ctx=await createIntakeDatabase();await seedIntakeScope(new V1IntakeStore(ctx.db));store=new V1FeedStore(ctx.db);
 await store.registerFeed({...feedFixture,createdAt:'2026-10-03T11:00:00Z',briefingFrequency:'30M'});
 env={DB:ctx.db,V1_DOWNSTREAM_ENABLED:'true',V1_DOWNSTREAM_FEED_SOURCE_IDS:'feed-source-1',BRIEFING_ENGINE:'v3',OPENROUTER_API_KEY:'test-key'} as Env;
});
afterEach(async()=>{vi.restoreAllMocks();await ctx.dispose()});
async function article(n=1,publishedAt='2026-10-03T12:05:00Z',acceptedAt='2026-10-03T12:10:00Z',observedAt?:string){
 if(observedAt){
  const intake=new V1IntakeStore(ctx.db),batch=batchFixture(n),policy={...testPolicy,now:()=>acceptedAt},key=`item-${n}`;
  batch.observations[0]={...batch.observations[0],sourceItemKey:key,publisherId:'publisher-1',observedAt};batch.proposals[0]={...batch.proposals[0],sourceItemKey:key};
  const result=await createCandidateIntakePort(intake,policy).acceptBatch(batch);
  await acceptAcquiredContent(intake,{id:`content-${n}`,feedId:'feed-1',candidateId:result.receipts[0].candidateItemId!,sourceObservationId:`observation-${n}`,representation:'ARTICLE_EXCERPT',contentCompleteness:'COMPLETE',body:'Parliament approved banking reform legislation after a lengthy debate. Presidential approval is still required.',language:'en',publishedAt,acquiredAt:acceptedAt,acquisitionMethod:'supplied_payload'},policy);
 }else await acceptEvidence(store,n,'Parliament approved banking reform legislation after a lengthy debate. The measure still requires presidential approval.','publisher-1',acceptedAt,'en',publishedAt);
 await processV1Reassessment(env,JSON.stringify(['REASSESS',`observation-${n}`,'']),acceptedAt);
}
const fetcher=(seen:string[])=>async(_url:unknown,init?:RequestInit)=>{
 const body=JSON.parse(init!.body as string);seen.push(JSON.stringify(body));
 const verify=body.messages[0].content.includes('meticulous fact-checker')||body.messages[0].content.startsWith('You are an independent factual verifier.');
 const coverage=body.messages[0].content.startsWith('You audit source coverage');
 const content=coverage?{sources:JSON.parse(body.messages[1].content).sources.map((s:{ref:string;text:string})=>({ref:s.ref,stories:s.text.includes('Parliament approved')?[0]:[]}))}:verify?{results:[{i:0,verdict:'ok',issues:[]}]}:{items:[{headline:'Banking reform approved',body:'Parliament approved banking reform legislation; presidential approval is still required.',sources:['S1'],relation:'new',importance:1}]};
 return Response.json({id:`gen-test-${seen.length}`,choices:[{message:{content:JSON.stringify(content)},finish_reason:'stop'}],usage:{prompt_tokens:100,completion_tokens:50,cost:0.001}});
};
it.each(['body','headline'] as const)('keeps unrecoverable malformed V4 %s pending, never DONE/QUIET, and reuses its settled calls',async field=>{
 await article();const seen:any[]=[],message={type:'v1_briefing' as const,feedId:'feed-1',window},id=await windowIdentity('feed-1',window);
 const malformed=(async(_url:unknown,init?:RequestInit)=>{
  const body=JSON.parse(String(init?.body));seen.push(body);
  const item={headline:'Banking reform approved; presidential approval remains required',body:'Presidential approval remains required.',sources:['S1'],relation:'new',updates:null,importance:1};
  const { [field]:_missing,...malformedItem}=item;
  return Response.json({id:`gen-malformed-${seen.length}`,choices:[{message:{content:JSON.stringify({items:[malformedItem]})},finish_reason:'stop'}],usage:{prompt_tokens:100,completion_tokens:50,cost:.001}});
 }) as typeof fetch;
 await expect(processV1Briefing(env,message,()=>window.end,undefined,malformed)).rejects.toMatchObject({code:'TEMPORARY_UNAVAILABLE'});
 expect(seen).toHaveLength(2);expect(seen[1].messages[1].content).toContain(`INVALID_ARTICLE_${field.toUpperCase()}`);
 expect(await store.read('feed-1','briefing_requests',id)).toMatchObject({state:'PENDING',attempts:1,failure:'PUBLICATION_FAILED'});
 expect(await store.read('feed-1','v3_window_results',id)).toBeUndefined();expect(await store.list('feed-1','editions')).toHaveLength(0);expect(await store.list('feed-1','delivery_jobs')).toHaveLength(0);
 const settled=await store.list<any>('feed-1','semantic_results');expect(settled).toHaveLength(2);expect(settled.every(r=>r.usage.reported&&r.usage.costUsd===.001)).toBe(true);
 await expect(processV1Briefing(env,message,()=> '2026-10-03T12:32:01Z',undefined,malformed)).rejects.toMatchObject({code:'TEMPORARY_UNAVAILABLE'});
 expect(seen).toHaveLength(2);expect(await store.list('feed-1','semantic_results')).toEqual(settled);
 expect(await store.read('feed-1','briefing_requests',id)).toMatchObject({state:'PENDING',attempts:2,failure:'PUBLICATION_FAILED'});
});
it('publishes a valid empty-string body after bounded correction with independent verification',async()=>{
 await article();const seen:any[]=[],id=await windowIdentity('feed-1',window);
 const corrected=(async(_url:unknown,init?:RequestInit)=>{
  const body=JSON.parse(String(init?.body));seen.push(body);
  const draft={headline:'Banking reform approved; presidential approval remains required',sources:['S1'],relation:'new',updates:null,importance:1};
  const content=seen.length===3?{results:[{i:0,verdict:'ok'}]}:{items:[{...draft,...(seen.length===2?{body:''}:{})}]};
  return Response.json({id:`gen-corrected-${seen.length}`,choices:[{message:{content:JSON.stringify(content)},finish_reason:'stop'}],usage:{prompt_tokens:100,completion_tokens:50,cost:.001}});
 }) as typeof fetch;
 const edition=await processV1Briefing(env,{type:'v1_briefing',feedId:'feed-1',window},()=>window.end,undefined,corrected);
 expect(edition).toBeDefined();expect(seen).toHaveLength(3);expect(seen[1].messages[1].content).toContain('INVALID_ARTICLE_BODY');expect(seen[2].messages[0].content).toContain('meticulous fact-checker');
 expect(await store.read('feed-1','briefing_requests',id)).toMatchObject({state:'DONE',result:'PUBLISHED'});
});
it('keeps an explicit empty V4 selection a legitimate quiet completion',async()=>{
 await article();let calls=0;const empty=(async()=>{calls++;return Response.json({id:'gen-empty-selection',choices:[{message:{content:JSON.stringify({items:[],left_out:[{sources:['S1'],why:'No relevant new development.'}]})},finish_reason:'stop'}],usage:{prompt_tokens:100,completion_tokens:50,cost:.001}});}) as typeof fetch;
 expect(await processV1Briefing(env,{type:'v1_briefing',feedId:'feed-1',window},()=>window.end,undefined,empty)).toBeUndefined();expect(calls).toBe(1);
 expect(await store.read('feed-1','briefing_requests',await windowIdentity('feed-1',window))).toMatchObject({state:'DONE',result:'QUIET',reason:'NO_SELECTED_DEVELOPMENTS'});
});
it.each([undefined,'clock-aligned-delivery-v2'] as const)('prepares at the early cutoff, publishes at scheduled time, and reuses verified calls on delayed delivery (policy %s)',async clockPolicy=>{
 const schedule={durationMinutes:30 as const,timezone:'UTC',clockStartAt:'2026-10-03T12:08:00Z',...(clockPolicy?{clockPolicy}:{})};
 const first=livePublicationWindow(schedule,new Date('2026-10-03T12:25:00Z')),message={type:'v1_briefing' as const,feedId:'feed-1',window:first};
 await store.registerFeed({...feedFixture,revision:2,createdAt:schedule.clockStartAt,briefingFrequency:'30M',briefingSchedule:schedule});
 const intake=new V1IntakeStore(ctx.db),scope=(await intake.getScope('feed-source-1'))!;await intake.registerScope({...scope,feedRevision:2});
 expect(await readScheduleAudit(ctx.db,'feed-1',new Date('2026-10-03T12:20:00Z'))).toMatchObject({state:'NOT_DUE'});
 await article(1,'2026-10-03T12:10:00Z','2026-10-03T12:15:00Z');
 const seen:string[]=[],provider=fetcher(seen) as typeof fetch,id=await windowIdentity('feed-1',first);
 expect(await processV1Briefing(env,message,()=> '2026-10-03T12:25:01Z',undefined,provider)).toBeUndefined();
 expect(seen).toHaveLength(2);expect(await store.list('feed-1','editions')).toHaveLength(0);expect(await store.list('feed-1','delivery_jobs')).toHaveLength(0);
 expect(await store.read('feed-1','briefing_requests',id)).toMatchObject({state:'PENDING',reason:'AWAITING_SCHEDULED_DELIVERY',nextAttemptAt:'2026-10-03T12:30:00.000Z'});
 expect(await processV1Briefing(env,message,()=> '2026-10-03T12:26:00Z',undefined,provider)).toBeUndefined();expect(seen).toHaveLength(2);
 const sent:any[]=[];env={...env,PROCESSING_QUEUE:{send:async(body:unknown)=>sent.push(body)}} as unknown as Env;
 await dispatchV1Intelligence(env,new Date('2026-10-03T12:26:00Z'));expect(sent.filter(m=>m.type==='v1_briefing')).toHaveLength(0);
 await dispatchV1Intelligence(env,new Date('2026-10-03T12:30:00Z'));expect(sent.filter(m=>m.type==='v1_briefing')).toHaveLength(1);
 await article(2,'2026-10-03T12:26:00Z','2026-10-03T12:26:00Z');
 const edition=await processV1Briefing(env,message,()=> '2026-10-03T12:32:00Z',undefined,provider);
 expect(edition).toMatchObject({windowStart:schedule.clockStartAt,windowEnd:first.end,scheduledFor:'2026-10-03T12:30:00.000Z',createdAt:'2026-10-03T12:32:00Z'});
 expect(await publicV1Edition(ctx.db,id)).toMatchObject({scheduledFor:'2026-10-03T12:30:00.000Z',publishedAt:'2026-10-03T12:32:00Z'});
 expect(await readScheduleAudit(ctx.db,'feed-1',new Date('2026-10-03T12:32:00Z'))).toMatchObject({state:'PUBLISHED',requestId:id});
 expect(await store.list('feed-1','delivery_jobs')).toHaveLength(1);expect(seen).toHaveLength(2);
 expect((await store.read<any>('feed-1','v3_window_inputs',id)).input.articles).toHaveLength(1);
 const second=livePublicationWindow(schedule,new Date('2026-10-03T12:55:00Z'));
 expect(second.start).toBe(first.end);expect((await prepareV3Window(store,'feed-1',second,second.end)).input.articles).toHaveLength(1);
 expect(await processV1Briefing(env,message,()=> '2026-10-03T12:33:00Z',undefined,provider)).toEqual(edition);expect(seen).toHaveLength(2);
},30000);
it('V3 acknowledges acquired evidence without constructing a V2 event graph',async()=>{
 await article();expect(await store.list('feed-1','events')).toHaveLength(0);
 const row=await new V1IntakeStore(ctx.db).read<any>('jobs',JSON.stringify(['REASSESS','observation-1','']));expect(row?.value.state).toBe('DONE');
 const prepared=await prepareV3Window(store,'feed-1',window,window.end);expect(prepared.input.articles).toHaveLength(1);
},30000);
it('uses publication time, admits meaningful late discovery, excludes initial backlog and future evidence',async()=>{
 await article(1);await article(2,'2026-10-03T11:50:00Z');await article(3,'2026-10-02T12:00:00Z');await article(4,'2026-10-03T12:31:00Z');
 const prepared=await prepareV3Window(store,'feed-1',window,window.end);
 expect(prepared.input.articles).toHaveLength(2);expect(prepared.input.articles.map(a=>a.publishedAt)).toContain('2026-10-03T11:50:00Z');
},30000);
it('publishes through the shared request, citation and outbox path with paid-call replay on duplicate delivery',async()=>{
 await article();const seen:string[]=[];
 const result=await processV1Briefing(env,{type:'v1_briefing',feedId:'feed-1',window},()=> '2026-10-03T12:34:00Z',undefined,fetcher(seen) as typeof fetch);
 expect(result?.engine).toBe('v3');expect(result?.windowStart).toBe(window.start);expect(result?.windowEnd).toBe(window.end);expect(seen).toHaveLength(2);
 const id=await windowIdentity('feed-1',window);expect(await publicV1Edition(ctx.db,id)).toMatchObject({id,stories:expect.any(Array)});
 expect(await store.read('feed-1','briefing_requests',id)).toMatchObject({state:'DONE',result:'PUBLISHED',engine:'v3'});
 expect(await store.list('feed-1','delivery_jobs')).toHaveLength(1);
 expect(await processV1Briefing(env,{type:'v1_briefing',feedId:'feed-1',window},()=> '2026-10-03T12:35:00Z',undefined,fetcher(seen) as typeof fetch)).toEqual(result);expect(seen).toHaveLength(2);
 expect(await store.list('feed-1','semantic_intents')).toHaveLength(2);
},30000);
it('does not call a model for an empty fixed window',async()=>{
 let calls=0;await processV1Briefing(env,{type:'v1_briefing',feedId:'feed-1',window},()=>window.end,undefined,(async()=>{calls++;throw Error('unexpected')}) as typeof fetch);
 expect(calls).toBe(0);expect(await store.read('feed-1','briefing_requests',await windowIdentity('feed-1',window))).toMatchObject({state:'DONE',result:'QUIET'});
},30000);
it('does not retrieve completed request payloads while ordering a new quiet window',async()=>{
 for(let offset=0;offset<1000;offset+=50)await ctx.db.batch(Array.from({length:50},(_,i)=>{
  const id=`terminal-history-${offset+i}`;
  return ctx.db.prepare('INSERT INTO v1_feed_documents VALUES(?,?,?,?)').bind('briefing_requests',id,'feed-1',JSON.stringify({id,state:'DONE',result:'QUIET',window,padding:'x'.repeat(4096)}));
 }));
 let returnedTerminalRequests=0,calls=0;
 const instrument=(statement:D1PreparedStatement):D1PreparedStatement=>new Proxy(statement,{get(target,key){
  if(key==='bind')return (...values:unknown[])=>instrument(target.bind(...values));
  if(key==='all')return async()=>{const result=await target.all<{json?:string}>();for(const row of result.results)if(row.json&&JSON.parse(row.json).id?.startsWith('terminal-history-'))returnedTerminalRequests++;return result;};
  const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
 }});
 const db=new Proxy(ctx.db,{get(target,key){if(key==='prepare')return (sql:string)=>instrument(target.prepare(sql));const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});
 await processV1Briefing({...env,DB:db},{type:'v1_briefing',feedId:'feed-1',window},()=>window.end,undefined,(async()=>{calls++;throw Error('unexpected inference')}) as typeof fetch);
 expect(await store.read('feed-1','briefing_requests',await windowIdentity('feed-1',window))).toMatchObject({state:'DONE',result:'QUIET'});
 expect(calls).toBe(0);expect(returnedTerminalRequests).toBe(0);
},30000);
it('does not let a newer direct queue delivery overtake an older runnable request',async()=>{
 await article();const id=await windowIdentity('feed-1',window);await feedTransact(store,'feed-1',tx=>tx.write('briefing_requests',id,{id,feedId:'feed-1',window,state:'PENDING',attempts:0,createdAt:window.end,engine:'v3'}));
 let calls=0;expect(await processV1Briefing(env,{type:'v1_briefing',feedId:'feed-1',window:{start:window.end,end:'2026-10-03T13:00:00Z',kind:'30M'}},()=> '2026-10-03T13:01:00Z',undefined,(async()=>{calls++;throw Error('unexpected')}) as typeof fetch)).toBeUndefined();expect(calls).toBe(0);
},30000);
it('keeps a settled failed V3 call from indefinitely blocking subsequent windows',async()=>{
 await article();let calls=0;
 const failed=(async()=>{calls++;return Response.json({id:'gen-empty-settled',choices:[{message:{content:''},finish_reason:'stop'}],usage:{prompt_tokens:100,completion_tokens:1,cost:.001}})}) as typeof fetch;
 expect(await processV1Briefing(env,{type:'v1_briefing',feedId:'feed-1',window},()=>window.end,undefined,failed)).toBeUndefined();
 const retained=await store.list('feed-1','semantic_results');
 expect(retained).toMatchObject([{status:'DEFERRED',failure:'SEMANTIC_PROVIDER_FAILURE',usage:{calls:1,reported:true,costUsd:.001}}]);
 await article(2,'2026-10-03T12:35:00Z','2026-10-03T12:40:00Z');
 const next={start:window.end,end:'2026-10-03T13:00:00Z',kind:'30M' as const},seen:string[]=[];
 const prepared=await prepareV3Window(store,'feed-1',next,next.end);
 expect(prepared.evidenceRevisionIds).toContain((retained[0] as {input:{evidenceRevisionIds:string[]}}).input.evidenceRevisionIds[0]);
 const edition=await processV1Briefing(env,{type:'v1_briefing',feedId:'feed-1',window:next},()=>next.end,undefined,fetcher(seen) as typeof fetch);
 expect(edition?.engine).toBe('v3');expect(calls).toBe(1);expect(seen).toHaveLength(2);
 expect(await store.read('feed-1','briefing_requests',await windowIdentity('feed-1',window))).toMatchObject({state:'FAILED',failure:'SEMANTIC_PROVIDER_FAILURE'});
 expect((await store.list('feed-1','semantic_results')).filter((r:any)=>r.failure==='SEMANTIC_PROVIDER_FAILURE')).toEqual(retained);
 await expect(processV1Briefing(env,{type:'v1_briefing',feedId:'feed-1',window},()=>next.end,undefined,failed)).rejects.toThrow('INVALID_REQUEST');
 expect(calls).toBe(1);
},30000);

it('an isolated UNKNOWN V3 call fails its window without replay and carries evidence into a later edition',async()=>{
 await article();let calls=0;
 const failed=(async()=>{calls++;throw Error('connection lost after submission')}) as typeof fetch;
 const message={type:'v1_briefing' as const,feedId:'feed-1',window};
 await processV1Briefing(env,message,()=>window.end,undefined,failed);
 const retained=await store.list<any>('feed-1','semantic_results');expect(retained).toHaveLength(1);expect(retained[0].usage.reported).toBe(false);
 const money=await ctx.db.prepare('SELECT id,json,lease_until FROM v1_model_spending_reservations').first<{id:string;json:string;lease_until:number}>();
 expect(await isolateExpiredModelExecutions(ctx.db,'isolate-after-5m-v1',new Date(money!.lease_until+300001))).toBe(1);
 await processV1Briefing(env,message,()=> '2026-10-03T12:40:00Z',undefined,failed);
 expect(calls).toBe(1);
 expect(await store.read('feed-1','briefing_requests',await windowIdentity('feed-1',window))).toMatchObject({state:'FAILED',failure:'V3_UNCERTAIN_CALL_ISOLATED'});
 expect(await store.list('feed-1','semantic_results')).toEqual(retained);
 expect(await ctx.db.prepare('SELECT json FROM v1_model_spending_reservations WHERE id=?').bind(money!.id).first()).toEqual({json:money!.json});
 expect(await ctx.db.prepare('SELECT reported FROM v1_model_spending_settlements WHERE id=?').bind(money!.id).first()).toMatchObject({reported:0});
 await article(2,'2026-10-03T12:35:00Z','2026-10-03T12:40:00Z');
 const next={start:window.end,end:'2026-10-03T13:00:00Z',kind:'30M' as const},seen:string[]=[];
 expect((await prepareV3Window(store,'feed-1',next,next.end)).evidenceRevisionIds).toContain(retained[0].input.evidenceRevisionIds[0]);
 const edition=await processV1Briefing(env,{...message,window:next},()=>next.end,undefined,fetcher(seen) as typeof fetch);
 expect(edition?.engine).toBe('v3');expect(calls).toBe(1);expect(seen).toHaveLength(2);
 expect((await store.list<any>('feed-1','semantic_results')).find(r=>r.id===retained[0].id)).toEqual(retained[0]);
},30000);

it('reuses settled editor and verifier calls after a crash before result persistence',async()=>{
 await article();const seen:string[]=[],original=FeedTransaction.prototype.write;let crash=true;
 vi.spyOn(FeedTransaction.prototype,'write').mockImplementation(async function(this:FeedTransaction,kind,id,value){if(kind==='v3_window_results'&&crash){crash=false;throw Error('simulated crash')}return original.call(this,kind,id,value)});
 const message={type:'v1_briefing' as const,feedId:'feed-1',window};
 await expect(processV1Briefing(env,message,()=>window.end,undefined,fetcher(seen) as typeof fetch)).rejects.toThrow();expect(seen).toHaveLength(2);
 const edition=await processV1Briefing(env,message,()=> '2026-10-03T12:32:00Z',undefined,fetcher(seen) as typeof fetch);
 expect(edition?.engine).toBe('v3');expect(seen).toHaveLength(2);
},30000);
it('campaign interruption after durable output reuses both paid calls and publishes once',async()=>{
 await article();const seen:string[]=[];let interrupted=true;
 vi.spyOn(campaignFault,'campaignInterruptAfterResult').mockImplementation(async()=>{if(interrupted){interrupted=false;throw Error('CAMPAIGN_INJECTED_AFTER_DURABLE_RESULT')}});
 const message={type:'v1_briefing' as const,feedId:'feed-1',window};
 await expect(processV1Briefing(env,message,()=>window.end,undefined,fetcher(seen) as typeof fetch)).rejects.toThrow('TEMPORARY_UNAVAILABLE');
 expect(campaignFault.campaignInterruptAfterResult).toHaveBeenCalledTimes(1);expect(seen).toHaveLength(2);expect(await store.list('feed-1','v3_window_results')).toHaveLength(1);expect(await store.list('feed-1','editions')).toHaveLength(0);
 const recovered=await processV1Briefing(env,message,()=> '2026-10-03T12:32:00Z',undefined,fetcher(seen) as typeof fetch);
 expect(recovered?.engine).toBe('v3');expect(seen).toHaveLength(2);
 await processV1Briefing(env,message,()=> '2026-10-03T12:33:00Z',undefined,fetcher(seen) as typeof fetch);
 expect(await store.list('feed-1','editions')).toHaveLength(1);expect(seen).toHaveLength(2);
},30000);
it('uncertain provider outcomes preserve reservations and never reissue on redelivery',async()=>{
 await article();let calls=0;const offline=(async()=>{calls++;throw Error('connection lost after send')}) as typeof fetch;
 const message={type:'v1_briefing' as const,feedId:'feed-1',window};
 await processV1Briefing(env,message,()=>window.end,undefined,offline);
 await processV1Briefing(env,message,()=> '2026-10-03T12:32:00Z',undefined,offline);
 expect(calls).toBe(1);expect(await store.list('feed-1','editions')).toHaveLength(0);
 expect(await store.read('feed-1','briefing_requests',await windowIdentity('feed-1',window))).toMatchObject({state:'PENDING',reason:'SEMANTIC_OUTCOME_UNKNOWN'});
 const reservations=await ctx.db.prepare('SELECT COUNT(*) n FROM v1_model_spending_reservations r WHERE NOT EXISTS(SELECT 1 FROM v1_model_spending_settlements s WHERE s.id=r.id AND s.reported=1)').first<{n:number}>();expect(reservations?.n).toBe(1);
},30000);
it('source revocation during inference blocks publication while retaining the settled provider receipt',async()=>{
 await article();const seen:string[]=[],transport=fetcher(seen);
 const revoked=(async(url,init)=>{const response=await transport(url,init);if(seen.length===1)await ctx.db.prepare("UPDATE v1_intake_scopes SET json=json_set(json,'$.enabled',0),epoch=epoch+1 WHERE id='feed-source-1'").run();return response}) as typeof fetch;
 await expect(processV1Briefing(env,{type:'v1_briefing',feedId:'feed-1',window},()=>window.end,undefined,revoked)).rejects.toThrow();
 expect(seen).toHaveLength(1);expect(await store.list('feed-1','editions')).toHaveLength(0);
 expect(await store.list('feed-1','semantic_settlements')).toMatchObject([{usage:{reported:true,costUsd:.001}}]);
},30000);
it('shared dispatch waits for a full first interval, prepares before close and pins the V3 engine',async()=>{
 await store.registerFeed({...feedFixture,revision:2,createdAt:'2026-10-03T00:35:00Z',briefingFrequency:'30M',briefingSchedule:{durationMinutes:30,timezone:'UTC'}});
 const sent:unknown[]=[];env={...env,OPENROUTER_API_KEY:undefined,PROCESSING_QUEUE:{send:async(body:unknown)=>{sent.push(body)}}} as unknown as Env;
 await dispatchV1Intelligence(env,new Date('2026-10-03T01:00:00Z'));expect(await store.list('feed-1','briefing_requests')).toHaveLength(0);
 await dispatchV1Intelligence(env,new Date('2026-10-03T01:25:00Z'));expect(await store.list('feed-1','briefing_requests')).toHaveLength(0);
 await dispatchV1Intelligence(env,new Date('2026-10-03T01:30:00Z'));
 expect(await store.list('feed-1','briefing_requests')).toMatchObject([{engine:'v3',window:{start:'2026-10-03T01:00:00.000Z',end:'2026-10-03T01:30:00.000Z'}}]);expect(sent).toHaveLength(0);
},30000);

it('a normal next interval sees published reader context and only newly eligible articles',async()=>{
 await article();const seen:string[]=[];await processV1Briefing(env,{type:'v1_briefing',feedId:'feed-1',window},()=>window.end,undefined,fetcher(seen) as typeof fetch);
 await article(2,'2026-10-03T12:35:00Z','2026-10-03T12:40:00Z');
 const next={start:window.end,end:'2026-10-03T13:00:00Z',kind:'30M' as const},prepared=await prepareV3Window(store,'feed-1',next,next.end);
 expect(prepared.input.articles).toHaveLength(1);expect(prepared.input.articles[0].publishedAt).toBe('2026-10-03T12:35:00Z');expect(prepared.input.prior).toHaveLength(1);
 expect(prepared.input.prior?.[0].body).toContain('presidential approval is still required');
},30000);

it('includes a pre-deadline observation acquired after close and excludes observations arriving afterward',async()=>{
 await article(1,'2026-10-03T12:28:00Z','2026-10-03T12:32:00Z','2026-10-03T12:29:00Z');
 await article(2,'2026-10-03T12:27:00Z','2026-10-03T12:33:00Z','2026-10-03T12:31:00Z');
 const prepared=await prepareV3Window(store,'feed-1',window,'2026-10-03T12:34:00Z');expect(prepared.input.articles).toHaveLength(1);expect(prepared.input.articles[0].publishedAt).toBe('2026-10-03T12:28:00Z');
},30000);

async function relativeFeed(originAt='2026-10-03T12:05:40.123Z'){
 await store.registerFeed({...feedFixture,revision:2,createdAt:originAt,briefingFrequency:'30M',briefingSchedule:{durationMinutes:30,timezone:'UTC',originAt}});
 const intake=new V1IntakeStore(ctx.db),scope=(await intake.getScope('feed-source-1'))!;
 await intake.registerScope({...scope,feedRevision:2});
}
it('automatically records clock windows at their cutoffs and recovers consecutive missed windows without inference',async()=>{
 const clockStartAt='2026-10-03T12:08:40.123Z';
 await store.registerFeed({...feedFixture,revision:2,createdAt:clockStartAt,briefingFrequency:'30M',briefingSchedule:{durationMinutes:30,timezone:'UTC',clockStartAt}});
 env={...env,OPENROUTER_API_KEY:undefined};
 await dispatchV1Intelligence(env,new Date('2026-10-03T12:24:59.999Z'));
 expect(await store.list('feed-1','briefing_requests')).toHaveLength(0);
 for(let i=0;i<4;i++)await dispatchV1Intelligence(env,new Date('2026-10-03T13:26:00Z'));
 const requests=(await store.list<any>('feed-1','briefing_requests')).sort((a,b)=>a.window.end.localeCompare(b.window.end));
 expect(requests.map(r=>r.window.end)).toEqual(['2026-10-03T12:25:00.000Z','2026-10-03T12:55:00.000Z','2026-10-03T13:25:00.000Z']);
 expect(requests.map(r=>r.window.scheduledFor)).toEqual(['2026-10-03T12:30:00.000Z','2026-10-03T13:00:00.000Z','2026-10-03T13:30:00.000Z']);
 expect(requests[0].window.start).toBe(clockStartAt);for(let i=1;i<requests.length;i++)expect(requests[i].window.start).toBe(requests[i-1].window.end);
 expect(await store.list('feed-1','semantic_intents')).toHaveLength(0);
},60000);
it('automatically dispatches the precise first relative close and persists it with settled-call crash recovery',async()=>{
 await relativeFeed();await article(1,'2026-10-03T12:06:00Z');
 const sent:any[]=[];env={...env,PROCESSING_QUEUE:{send:async(body:unknown)=>{sent.push(body)}}} as unknown as Env;
 await dispatchV1Intelligence(env,new Date('2026-10-03T12:30:40.123Z'));
 await dispatchV1Intelligence(env,new Date('2026-10-03T12:35:40.122Z'));
 expect(sent).toHaveLength(0);expect(await store.list('feed-1','briefing_requests')).toHaveLength(0);
 await dispatchV1Intelligence(env,new Date('2026-10-03T12:35:40.123Z'));
 expect(sent).toHaveLength(1);expect(sent[0].window).toMatchObject({start:'2026-10-03T12:05:40.123Z',end:'2026-10-03T12:35:40.123Z',originAt:'2026-10-03T12:05:40.123Z',schedulePolicy:'creation-relative-v1'});
 const seen:string[]=[],original=FeedTransaction.prototype.write;let crash=true;
 vi.spyOn(FeedTransaction.prototype,'write').mockImplementation(async function(this:FeedTransaction,kind,id,value){if(kind==='v3_window_results'&&crash){crash=false;throw Error('retained-call crash')}return original.call(this,kind,id,value)});
 await expect(processV1Briefing(env,sent[0],()=>sent[0].window.end,undefined,fetcher(seen) as typeof fetch,{scheduledDelivery:true})).rejects.toThrow();
 expect(seen).toHaveLength(2);
 const edition=await processV1Briefing(env,sent[0],()=> '2026-10-03T12:36:40.123Z',undefined,fetcher(seen) as typeof fetch,{scheduledDelivery:true});
 expect(edition).toMatchObject({engine:'v3',windowStart:sent[0].window.start,windowEnd:sent[0].window.end});expect(seen).toHaveLength(2);
 await processV1Briefing(env,sent[0],()=> '2026-10-03T12:37:40.123Z',undefined,fetcher(seen) as typeof fetch,{scheduledDelivery:true});
 expect(seen).toHaveLength(2);expect(await store.list('feed-1','editions')).toHaveLength(1);
 await dispatchV1Intelligence(env,new Date('2026-10-03T13:05:40.123Z'));
 expect(sent.at(-1).window.start).toBe(sent[0].window.end);expect(sent.at(-1).window.end).toBe('2026-10-03T13:05:40.123Z');
},60000);
it('recovers missed relative closes consecutively without duplicate requests or inference',async()=>{
 await relativeFeed();env={...env,OPENROUTER_API_KEY:undefined};
 for(let i=0;i<4;i++)await dispatchV1Intelligence(env,new Date('2026-10-03T13:36:00Z'));
 const requests=(await store.list<any>('feed-1','briefing_requests')).sort((a,b)=>a.window.end.localeCompare(b.window.end));
 expect(requests.map(r=>r.window.end)).toEqual(['2026-10-03T12:35:40.123Z','2026-10-03T13:05:40.123Z','2026-10-03T13:35:40.123Z']);
 expect(requests[0].window.start).toBe('2026-10-03T12:05:40.123Z');
 for(let i=1;i<requests.length;i++)expect(requests[i].window.start).toBe(requests[i-1].window.end);
 expect(await store.list('feed-1','semantic_intents')).toHaveLength(0);
},60000);
it('an interval edit preserves the original pending request and retries its frozen relative window first',async()=>{
 await relativeFeed();const sent:any[]=[];env={...env,PROCESSING_QUEUE:{send:async(body:unknown)=>{sent.push(body)}}} as unknown as Env;
 await dispatchV1Intelligence(env,new Date('2026-10-03T12:35:40.123Z'));
 const oldMessage=sent[0],id=await windowIdentity('feed-1',oldMessage.window);
 await feedTransact(store,'feed-1',async tx=>{const old=await tx.read<any>('briefing_requests',id);await tx.write('briefing_requests',id,{...old,attempts:1,nextAttemptAt:'2026-10-03T13:30:00Z'})});
 const before=await store.read('feed-1','briefing_requests',id);
 await store.registerFeed({...feedFixture,revision:3,createdAt:'2026-10-03T12:05:40.123Z',briefingFrequency:'HOURLY',briefingSchedule:{durationMinutes:60,timezone:'UTC',originAt:oldMessage.window.end}});
 // Simulate expiration of the old transport's dispatch lease, as in a recovered delivery.
 await ctx.db.prepare("UPDATE v1_queue_dispatches SET lease_until=0 WHERE kind='v1_briefing' AND id=?").bind(id).run();
 await dispatchV1Intelligence(env,new Date('2026-10-03T13:35:40.123Z'));
 expect(await store.read('feed-1','briefing_requests',id)).toEqual(before);
 expect(sent.at(-1).window).toEqual(oldMessage.window);
 const next=(await store.list<any>('feed-1','briefing_requests')).find(r=>r.id!==id)!;
 expect(next.window.start).toBe(oldMessage.window.end);expect(next.window.end).toBe('2026-10-03T13:35:40.123Z');
},60000);


it('keeps V3 briefing attempts intact while another feed operation owns the semantic lease',async()=>{
 await article();const lease=await acquireSemanticWorkLease(store,'feed-1');const seen:string[]=[];
 try{
  for(let i=0;i<6;i++)await expect(processV1Briefing(env,{type:'v1_briefing',feedId:'feed-1',window},()=>window.end,undefined,fetcher(seen) as typeof fetch)).rejects.toBeInstanceOf(SemanticLeaseError);
  expect(await store.read('feed-1','briefing_requests',await windowIdentity('feed-1',window))).toMatchObject({state:'PENDING',attempts:0,engine:'v3'});
  expect(seen).toHaveLength(0);
 }finally{await releaseSemanticWorkLease(store,lease)}
 expect((await processV1Briefing(env,{type:'v1_briefing',feedId:'feed-1',window},()=>window.end,undefined,fetcher(seen) as typeof fetch))?.engine).toBe('v3');
 expect(seen).toHaveLength(2);
},60000);
it('multi-chunk malformed consolidation cannot complete as quiet and reuses settled calls on retry',async()=>{
 for(let n=1;n<=2;n++){
  await acceptEvidence(store,n,(n===1?'Parliament approved banking legislation while presidential approval remains required. ':'Scientists discovered a meteorite beneath Antarctic ice during an expedition studying ancient asteroid material. ').repeat(1200),'publisher-'+n,'2026-10-03T12:10:00Z','en','2026-10-03T12:05:00Z',undefined,'https://publisher.example/'+n);
  await processV1Reassessment(env,JSON.stringify(['REASSESS',`observation-${n}`,'']),'2026-10-03T12:10:00Z');
 }
 const seen:any[]=[],provider=(async(_url:unknown,init?:RequestInit)=>{
  const request=JSON.parse(String(init?.body));seen.push(request);
  const editor=request.messages[0].content.startsWith('You are the editor');
  const ref=(request.messages[1].content.split('NEW ARTICLES')[1]??'').match(/\[(S\d+)\]/)?.[1];
  const content=editor?{items:[{headline:ref==='S1'?'Banking legislation approved':'Meteorite discovered beneath Antarctic ice',body:'Further details reported.',sources:[ref],relation:'new',importance:2}]}:
   {items:[{headline:'Banking legislation approved',body:null,from:[0],relation:'new',importance:2}],cut:[{from:[1],why:'Off topic'}]};
  return Response.json({id:`gen-consolidation-${seen.length}`,choices:[{message:{content:JSON.stringify(content)},finish_reason:'stop'}],usage:{prompt_tokens:100,completion_tokens:50,cost:.001}});
 }) as typeof fetch;
 const message={type:'v1_briefing' as const,feedId:'feed-1',window},id=await windowIdentity('feed-1',window);
 await expect(processV1Briefing(env,message,()=>window.end,undefined,provider)).rejects.toMatchObject({code:'TEMPORARY_UNAVAILABLE'});
 expect(seen).toHaveLength(4);expect(seen.filter(r=>r.messages[0].content.startsWith('You are the editor'))).toHaveLength(2);
 expect(seen[2].messages[0].content).toContain('senior editor');expect(seen[3].messages[1].content).toContain('INVALID_ARTICLE_BODY');
 expect(await store.read('feed-1','briefing_requests',id)).toMatchObject({state:'PENDING',attempts:1,failure:'PUBLICATION_FAILED'});
 expect(await store.read('feed-1','v3_window_results',id)).toBeUndefined();expect(await store.list('feed-1','editions')).toHaveLength(0);expect(await store.list('feed-1','delivery_jobs')).toHaveLength(0);
 const settled=await store.list<any>('feed-1','semantic_results');expect(settled).toHaveLength(4);expect(settled.every(r=>r.usage.reported&&r.usage.costUsd===.001)).toBe(true);
 await expect(processV1Briefing(env,message,()=> '2026-10-03T12:32:01Z',undefined,provider)).rejects.toMatchObject({code:'TEMPORARY_UNAVAILABLE'});
 expect(seen).toHaveLength(4);expect(await store.list('feed-1','semantic_results')).toEqual(settled);
 expect(await store.read('feed-1','briefing_requests',id)).toMatchObject({state:'PENDING',attempts:2,failure:'PUBLICATION_FAILED'});
},60000);
it('large V3 batches serialize feed commits and can replay paid chunks without local lock starvation',async()=>{
 for(let n=1;n<=2;n++){await acceptEvidence(store,n,(n===1?'Parliament approved banking legislation while presidential approval remains required. ':'Scientists discovered a meteorite beneath Antarctic ice during an expedition studying ancient asteroid material. ').repeat(1200),'publisher-'+n,'2026-10-03T12:10:00Z','en','2026-10-03T12:05:00Z',undefined,'https://publisher.example/'+n);await processV1Reassessment(env,JSON.stringify(['REASSESS',`observation-${n}`,'']),'2026-10-03T12:10:00Z')}
 const original=V1FeedStore.prototype.commit;let active=0,maxActive=0;
 vi.spyOn(V1FeedStore.prototype,'commit').mockImplementation(async function(this:V1FeedStore,tx){active++;maxActive=Math.max(maxActive,active);try{await new Promise(resolve=>setTimeout(resolve,1));if(active>1)throw Error('competing feed commit');return await original.call(this,tx)}finally{active--}});
 // Chunk refs are global, not restarted at S1. This fixture must cite the
 // banking article actually supplied, and explicitly omit the off-topic chunk.
 const seen:string[]=[];const provider=async(url:unknown,init?:RequestInit)=>{
  const body=JSON.parse(init!.body as string);
  if(body.messages[0].content.startsWith('You are the editor')){
   const chunk=body.messages[1].content.split('NEW ARTICLES')[1]??'',ref=chunk.match(/\[(S\d+)\]/)?.[1];
   const items=chunk.includes('Parliament approved')?[{headline:'Banking reform approved',body:'Presidential approval is still required.',sources:[ref],relation:'new',importance:1}]:[];
   seen.push(JSON.stringify(body));return Response.json({id:'gen-chunk-'+seen.length,choices:[{message:{content:JSON.stringify({items})},finish_reason:'stop'}],usage:{prompt_tokens:100,completion_tokens:50,cost:0.001}});
  }
  return fetcher(seen)(url,init);
 };
 const edition=await processV1Briefing(env,{type:'v1_briefing',feedId:'feed-1',window},()=>window.end,undefined,provider as typeof fetch);
 expect(edition?.engine).toBe('v3');expect(seen.length).toBeGreaterThan(2);expect(maxActive).toBe(1);
},60000);

for (const promptVersion of [undefined,2,3,4,5,6] as const) it(`preserves frozen prompt ${promptVersion??'legacy'} and reuses settled calls after interruption`,async()=>{
 await article();const prepared=await prepareV3Window(store,'feed-1',window,window.end);
 expect(prepared.promptVersion).toBe(4);
 expect(prepared.noveltyGuard).toBe(true);
 const id=await windowIdentity('feed-1',window),full='Earlier notice\nOfficials say approval is still required.';
 const frozen={...prepared,id,input:{...prepared.input,prior:[{id:'previous-reader-item',at:'2026-10-03T11:30:00Z',headline:full,body:full}]}};
 // Historical snapshots predate the independently versioned novelty policy.
 delete frozen.noveltyGuard;
 delete frozen.citationCoverage;
 if(promptVersion===undefined)delete frozen.promptVersion;
 else frozen.promptVersion=promptVersion;
 await feedTransact(store,'feed-1',tx=>tx.write('v3_window_inputs',id,frozen));
 const seen:string[]=[],transport=fetcher(seen),original=FeedTransaction.prototype.write;let crash=true;
 vi.spyOn(FeedTransaction.prototype,'write').mockImplementation(async function(this:FeedTransaction,kind,key,value){if(kind==='v3_window_results'&&crash){crash=false;throw Error('result persistence interruption')}return original.call(this,kind,key,value)});
 const checked=(async(url,init)=>{const request=JSON.parse(String(init?.body));if(request.messages?.[0]?.content.startsWith('You are the editor'))expect(request.messages[1].content.split(full)).toHaveLength(promptVersion===undefined?3:2);return transport(url,init);}) as typeof fetch;
 const message={type:'v1_briefing' as const,feedId:'feed-1',window};
 await expect(processV1Briefing(env,message,()=>window.end,undefined,checked)).rejects.toThrow();
 expect(seen).toHaveLength(2);
 expect((await processV1Briefing(env,message,()=> '2026-10-03T12:32:00Z',undefined,checked))?.engine).toBe('v3');
 expect(seen).toHaveLength(2);
 expect((await store.read<{promptVersion?:number}>('feed-1','v3_window_inputs',id))?.promptVersion).toBe(promptVersion);
},30000);

it('publishes verified available evidence while retaining a recoverable foreign-payment dependency',async()=>{
 await article();const id='payment-dependent-job';
 await ctx.db.prepare('INSERT INTO v1_jobs(id,feed_source_id,item_key,json) VALUES(?,?,?,?)').bind(id,'feed-source-1',null,JSON.stringify({id,feedId:'feed-1',feedSourceId:'feed-source-1',observationId:'observation-1',kind:'ACQUIRE',state:'PENDING',attempts:0,exhausted:false,failureCode:'BACKPRESSURE',failureDetail:'ARTICLE_PROVIDER_RECONCILIATION_WAIT'})).run();
 const seen:string[]=[],edition=await processV1Briefing(env,{type:'v1_briefing',feedId:'feed-1',window},()=>window.end,undefined,fetcher(seen) as typeof fetch);
 expect(edition?.engine).toBe('v3');expect(seen).toHaveLength(2);
 const request=await store.read<any>('feed-1','briefing_requests',await windowIdentity('feed-1',window));expect(request.coverage).toMatchObject({state:'INCOMPLETE',pendingJobs:0,blockedJobs:1});
 const retained=await new V1IntakeStore(ctx.db).read<any>('jobs',id);expect(retained?.value.state).toBe('PENDING');
},30000);

it('persists a verified complete headline without padding its body',async()=>{
 await article();const seen:string[]=[];
 const provider=async(_url:unknown,init?:RequestInit)=>{const request=JSON.parse(String(init?.body));seen.push(request.messages[0].content);const verify=request.messages[0].content.includes('meticulous fact-checker');return Response.json({id:'gen-headline-'+seen.length,choices:[{message:{content:JSON.stringify(verify?{results:[{i:0,verdict:'ok',issues:[]}]}:{items:[{headline:'Parliament approves banking reform; presidential approval still required',body:'',sources:['S1'],relation:'new',importance:1}]})},finish_reason:'stop'}],usage:{prompt_tokens:100,completion_tokens:50,cost:.001}});};
 const edition=await processV1Briefing(env,{type:'v1_briefing',feedId:'feed-1',window},()=>window.end,undefined,provider as typeof fetch);
 expect(edition?.stories).toHaveLength(1);expect(seen).toHaveLength(2);const published=await publicV1Edition(ctx.db,edition!.id);expect(published?.stories[0].claims[0].text.trim()).toBe('Parliament approves banking reform; presidential approval still required');
},30000);

it('batches old publication identities without changing the prepared snapshot',async()=>{
 await article();const baseline=await prepareV3Window(store,'feed-1',window,window.end);
 const old={id:'old',windowEnd:window.start,createdAt:window.start,stories:[],evidenceRevisionIds:Array.from({length:181},(_,i)=>'missing-'+i)};
 vi.spyOn(store,'publicationPreparationHistory').mockResolvedValue([old as any]);
 const revision=vi.spyOn(store,'revision');const batched=vi.spyOn(store,'revisionEvidenceIds');
 const actual=await prepareV3Window(store,'feed-1',window,window.end);
 expect(actual).toEqual(baseline);expect(revision).not.toHaveBeenCalled();expect(batched).toHaveBeenCalledOnce();expect(batched.mock.calls[0][1]).toHaveLength(181);
},30000);

it('loads observation timing only for current evidence identities',async()=>{
 await article();const queries:string[]=[];const tracked=new V1FeedStore({prepare(sql:string){queries.push(sql);return ctx.db.prepare(sql)}} as D1Database);await prepareV3Window(tracked,'feed-1',window,window.end);
 const timing=queries.filter(sql=>sql.includes('AS observed_at'));
 expect(timing.length).toBeGreaterThanOrEqual(1);expect(timing.at(-1)!).toContain("r.id=json_extract(e.json,'$.currentRevisionId')");
},30000);

it('quiet preparation avoids carry and revision-history reads without changing its snapshot',async()=>{
 const baseline=await prepareV3Window(store,'feed-1',window,window.end);
 const identities=vi.spyOn(store,'revisionEvidenceIds');const lists=vi.spyOn(store,'list');
 const actual=await prepareV3Window(store,'feed-1',window,window.end);
 expect(actual).toEqual(baseline);expect(actual.input.articles).toEqual([]);expect(identities).not.toHaveBeenCalled();
 expect(lists.mock.calls.some(c=>c[1]==='v3_window_results')).toBe(false);
},30000);

it('V3 dispatch does not rescan or enqueue the retired V2 rematch graph',async()=>{
 await article();env={...env,PROCESSING_QUEUE:{send:async()=>{}}} as unknown as Env;const list=vi.spyOn(V1FeedStore.prototype,'list');
 await dispatchV1Intelligence(env,new Date(window.end));
 expect(list.mock.calls.some(c=>c[1]==='rematch_requests'||c[1]==='rematch_attempts')).toBe(false);
},30000);

it('V3 routing preserves rematch maintenance for explicitly pending V2 windows',async()=>{
 await article();env={...env,PROCESSING_QUEUE:{send:async()=>{}}} as unknown as Env;const id=await windowIdentity('feed-1',window);await feedTransact(store,'feed-1',tx=>tx.write('briefing_requests',id,{id,feedId:'feed-1',window,state:'PENDING',attempts:0,engine:'v2',createdAt:window.end}));
 const list=vi.spyOn(V1FeedStore.prototype,'list');await dispatchV1Intelligence(env,new Date(window.end));
 expect(list.mock.calls.some(c=>c[1]==='rematch_requests')).toBe(true);
},30000);

it('does not load old article bodies to prepare an unchanged current window',async()=>{
 await article();const baseline=await prepareV3Window(store,'feed-1',window,window.end);
 for(let i=2;i<7;i++)await acceptEvidence(store,i,'Old background '+i+' '+ 'x'.repeat(10000),'publisher-1','2026-10-03T12:10:00Z','en','2026-10-01T12:00:00Z');
 const full=vi.spyOn(store,'currentEvidence');const selected=vi.spyOn(store,'currentEvidenceByIds');const actual=await prepareV3Window(store,'feed-1',window,window.end);
 expect(actual).toEqual(baseline);expect(full).not.toHaveBeenCalled();expect(selected).toHaveBeenCalledWith('feed-1',baseline.evidenceRevisionIds,undefined);
},30000);

it('publishes the newest catch-up window with both ordinary and late-discovered old evidence, without replaying old windows',async()=>{
 await applyTestMigration(ctx.db,readFileSync(new URL('../../migrations/0084_v3_catchup_admission.sql',import.meta.url),'utf8'));
 const oldWindow={...window,start:'2026-10-03T11:30:00Z',end:'2026-10-03T12:00:00Z'},oldId=await windowIdentity('feed-1',oldWindow),targetId=await windowIdentity('feed-1',window),at='2026-10-03T12:34:00Z';
 await article(1,'2026-10-03T11:40:00Z','2026-10-03T11:45:00Z','2026-10-03T11:44:00Z');
 await article(2,'2026-10-03T11:10:00Z','2026-10-03T11:46:00Z','2026-10-03T11:44:00Z');
 await feedTransact(store,'feed-1',async tx=>{for(const [id,w]of [[oldId,oldWindow],[targetId,window]] as const)await tx.write('briefing_requests',id,{id,feedId:'feed-1',window:w,engine:'v3',state:'PENDING',attempts:0,createdAt:w.end});});
 expect(await supersedeUnstartedV3Windows(store,'feed-1',targetId,at,isAutomaticReportingWindow)).toEqual([oldId]);
 const prepared=await prepareV3Window(store,'feed-1',window,at);
 expect(prepared.input.articles.map(a=>a.publishedAt).sort()).toEqual(['2026-10-03T11:10:00Z','2026-10-03T11:40:00Z']);
 const seen:string[]=[],provider=fetcher(seen) as typeof fetch,message={type:'v1_briefing' as const,feedId:'feed-1',window};
 const edition=await processV1Briefing(env,message,()=>at,undefined,provider);
 expect(edition).toMatchObject({id:targetId,engine:'v3',windowStart:window.start,windowEnd:window.end});
 expect(seen).toHaveLength(2);expect(await publicV1Edition(ctx.db,targetId)).toBeDefined();
 expect(await processV1Briefing(env,{...message,window:oldWindow},()=>at,undefined,provider)).toBeUndefined();
 expect(await processV1Briefing(env,message,()=>at,undefined,provider)).toEqual(edition);expect(seen).toHaveLength(2);
 expect(await store.read('feed-1','editions',oldId)).toBeUndefined();
 expect(await store.read('feed-1','briefing_requests',oldId)).toMatchObject({state:'DONE',result:'DEFERRED',window:oldWindow});
 const later=await prepareV3Window(store,'feed-1',{...window,start:window.end,end:'2026-10-03T13:00:00Z'},'2026-10-03T13:00:00Z');
 expect((later.input.prior??[]).some(item=>item.body.includes('presidential approval'))).toBe(true);
},30000);

it('keeps an updated revision of previously published evidence available after its unstarted window is superseded',async()=>{
 await applyTestMigration(ctx.db,readFileSync(new URL('../../migrations/0084_v3_catchup_admission.sql',import.meta.url),'utf8'));
 await article();const seen:string[]=[];
 const edition=await processV1Briefing(env,{type:'v1_briefing',feedId:'feed-1',window},()=> '2026-10-03T12:31:00Z',undefined,fetcher(seen) as typeof fetch);
 const revised=await supersedeFrozenRevision(edition!.evidenceRevisionIds[0],{acceptedAt:'2026-10-03T12:45:00Z',body:'The publisher corrected the measure: presidential approval is still required.'});
 const old={...window,start:window.end,end:'2026-10-03T13:00:00Z'},target={...window,start:old.end,end:'2026-10-03T13:30:00Z'},oldId=await windowIdentity('feed-1',old),targetId=await windowIdentity('feed-1',target);
 await feedTransact(store,'feed-1',async tx=>{for(const [id,w]of [[oldId,old],[targetId,target]] as const)await tx.write('briefing_requests',id,{id,feedId:'feed-1',window:w,engine:'v3',state:'PENDING',attempts:0,createdAt:w.end});});
 expect(await supersedeUnstartedV3Windows(store,'feed-1',targetId,target.end,isAutomaticReportingWindow)).toEqual([oldId]);
 const prepared=await prepareV3Window(store,'feed-1',target,target.end);
 expect(prepared.input.articles).toHaveLength(1);expect(prepared.input.articles[0]).toMatchObject({id:revised,publishedAt:'2026-10-03T12:05:00Z',text:'The publisher corrected the measure: presidential approval is still required.'});
 expect(prepared.input.prior).toHaveLength(1);
},30000);

it('a stale publication callback cannot start a model after catch-up deferred its request',async()=>{
 const id=await windowIdentity('feed-1',window),request={id,feedId:'feed-1',window,engine:'v3',state:'DONE',result:'DEFERRED',reason:'SUPERSEDED_BY_LATER_WINDOW',attempts:0,createdAt:window.end};
 await feedTransact(store,'feed-1',tx=>tx.write('briefing_requests',id,request));
 const provider=vi.fn(async()=>{throw Error('No model call for a superseded window');});
 expect(await publishProductV3Window(env,'feed-1',window,id,()=> '2026-10-03T13:00:00Z',provider as typeof fetch)).toBeUndefined();
 expect(provider).not.toHaveBeenCalled();expect(await store.list('feed-1','v3_window_inputs')).toHaveLength(0);expect(await store.list('feed-1','semantic_intents')).toHaveLength(0);
 expect(await store.read('feed-1','briefing_requests',id)).toEqual(request);
});

it('prepares despite delayed collection, delivers at scheduled time and retains incomplete coverage without repeat calls',async()=>{
 await ctx.dispose();ctx=await createIntakeDatabase({product:true});await seedIntakeScope(new V1IntakeStore(ctx.db));store=new V1FeedStore(ctx.db);env={...env,DB:ctx.db};
 await ctx.db.exec("INSERT INTO accounts(id,email,normalized_email,username,role,password_hash,email_verified_at,created_at,updated_at) VALUES('owner-1','delivery@example.invalid','delivery@example.invalid','delivery','user','hash','2026-10-01','2026-10-01','2026-10-01'); INSERT INTO briefings(id,owner_account_id,slug,title,interest_profile,created_at,updated_at) VALUES('feed-1','owner-1','delivery','Delivery','news','2026-10-01','2026-10-01');");
 const schedule={durationMinutes:30 as const,timezone:'UTC',clockStartAt:'2026-10-03T12:08:00Z'},closed=livePublicationWindow(schedule,new Date('2026-10-03T12:25:00Z'));
 await store.registerFeed({...feedFixture,revision:2,createdAt:schedule.clockStartAt,briefingFrequency:'30M',briefingSchedule:schedule});
 await article(1,'2026-10-03T12:15:00Z','2026-10-03T12:20:00Z','2026-10-03T12:19:00Z');
 env={...env,SOURCE_QUEUE_SCHEDULING_ENABLED:'true'};
 const collection=vi.spyOn(collectionCoverage,'pendingWindowCollections').mockResolvedValue({pending:0,sources:[],continuing:0,continuingSources:[],unavailable:0,unavailableSources:[],deadlineReleased:1,deadlineReleasedSources:['Busy source']});
 const seen:string[]=[],message={type:'v1_briefing' as const,feedId:'feed-1',window:closed},transport=fetcher(seen) as typeof fetch;
 expect(await processV1Briefing(env,message,()=>closed.end,undefined,transport)).toBeUndefined();expect(seen).toHaveLength(2);expect(await store.list('feed-1','editions')).toHaveLength(0);
 const edition=await processV1Briefing(env,message,()=>closed.scheduledFor!,undefined,transport);
 expect(edition).toMatchObject({scheduledFor:closed.scheduledFor,createdAt:closed.scheduledFor});expect(seen).toHaveLength(2);
 expect(collection.mock.calls[0][0]===ctx.db).toBe(true);expect(collection.mock.calls[0].slice(1)).toEqual(['feed-1',closed.end,true,{scheduledFor:closed.scheduledFor,now:Date.parse(closed.scheduledFor!)}]);
 const id=await windowIdentity('feed-1',closed),request=await store.read<any>('feed-1','briefing_requests',id);
 expect(request).toMatchObject({state:'DONE',result:'PUBLISHED',coverage:{state:'INCOMPLETE',failures:[{kind:'COLLECTION',code:'COLLECTION_DEFERRED_AT_REPORTING_CUTOFF',count:1}]}});
 await processV1Briefing(env,message,()=> '2026-10-03T12:31:00Z',undefined,transport);expect(await store.list('feed-1','editions')).toHaveLength(1);expect(seen).toHaveLength(2);
 // A late-acquired article remains eligible in the following window rather
 // than forcing this edition to be rewritten or expanding its frozen period.
 await article(2,'2026-10-03T12:24:00Z','2026-10-03T12:35:00Z','2026-10-03T12:34:00Z');
 const next=livePublicationWindow(schedule,new Date('2026-10-03T12:55:00Z'));
 const prepared=await prepareV3Window(store,'feed-1',next,'2026-10-03T12:55:00Z');
 expect(prepared.input.articles.some(a=>a.publishedAt==='2026-10-03T12:24:00Z')).toBe(true);
},30000);

it('an empty scheduled window with delayed collection is deferred, not falsely complete or fabricated',async()=>{
 const schedule={durationMinutes:30 as const,timezone:'UTC',clockStartAt:'2026-10-03T12:08:00Z'},closed=livePublicationWindow(schedule,new Date('2026-10-03T12:25:00Z'));
 await store.registerFeed({...feedFixture,revision:2,createdAt:schedule.clockStartAt,briefingFrequency:'30M',briefingSchedule:schedule});
 env={...env,SOURCE_QUEUE_SCHEDULING_ENABLED:'true'};
 vi.spyOn(collectionCoverage,'pendingWindowCollections').mockResolvedValue({pending:0,sources:[],continuing:0,continuingSources:[],unavailable:0,unavailableSources:[],deadlineReleased:1,deadlineReleasedSources:['Busy source']});
 const seen:string[]=[],message={type:'v1_briefing' as const,feedId:'feed-1',window:closed};
 expect(await processV1Briefing(env,message,()=>closed.scheduledFor!,undefined,fetcher(seen) as typeof fetch)).toBeUndefined();
 expect(seen).toHaveLength(0);expect(await store.list('feed-1','editions')).toHaveLength(0);
 expect(await store.read<any>('feed-1','briefing_requests',await windowIdentity('feed-1',closed))).toMatchObject({state:'DONE',result:'DEFERRED',reason:'INCOMPLETE_INTAKE_COVERAGE',coverage:{state:'INCOMPLETE',failures:[{kind:'COLLECTION',code:'COLLECTION_DEFERRED_AT_REPORTING_CUTOFF',count:1}]}});
},30000);

it('novelty prompt version is explicit and default routing remains the qualified baseline',()=>{
 expect(productV3PromptVersion({})).toBe(4);expect(productV3PromptVersion({BRIEFING_PROMPT_VERSION:'4'})).toBe(4);expect(productV3PromptVersion({BRIEFING_PROMPT_VERSION:'5'})).toBe(5);expect(productV3PromptVersion({BRIEFING_PROMPT_VERSION:'6'})).toBe(6);
 expect(()=>productV3PromptVersion({BRIEFING_PROMPT_VERSION:'invalid' as '5'})).toThrow('INVALID_BRIEFING_PROMPT_VERSION');
});
it('freezes opt-in novelty policy for a new window without changing models or already saved work',async()=>{
 await article();env={...env,BRIEFING_PROMPT_VERSION:'5'};
 const seen:string[]=[],transport=fetcher(seen) as typeof fetch,id=await windowIdentity('feed-1',window);
 expect((await processV1Briefing(env,{type:'v1_briefing',feedId:'feed-1',window},()=>window.end,undefined,transport))?.engine).toBe('v3');
 expect(await store.read<any>('feed-1','v3_window_inputs',id)).toMatchObject({promptVersion:5,models:{editor:'openai/gpt-4.1',verifier:'openai/gpt-4.1-mini'}});
 expect(seen).toHaveLength(2);expect(seen.every(raw=>JSON.parse(raw).messages[0].content.includes('the union of all ALREADY TOLD items'))).toBe(true);
 env={...env,BRIEFING_PROMPT_VERSION:'4'};
 await processV1Briefing(env,{type:'v1_briefing',feedId:'feed-1',window},()=> '2026-10-03T12:31:00Z',undefined,transport);expect(seen).toHaveLength(2);
 expect((await store.read<any>('feed-1','v3_window_inputs',id)).promptVersion).toBe(5);
},30000);

it('accounts the citation correction separately and reuses all settled calls on duplicate delivery',async()=>{
 await article();let calls=0;const requests:any[]=[];
 const provider=async(_url:unknown,init?:RequestInit)=>{
  const request=JSON.parse(init!.body as string);requests.push(request);calls++;
  const content=calls===1?{items:[{headline:'Banking reform approved',body:'Presidential approval is still required.',sources:['publisher-1'],relation:'new',importance:1}]}:request.messages[0].content.includes('meticulous fact-checker')?{results:[{i:0,verdict:'ok',issues:[]}]}:{items:[{headline:'Banking reform approved',body:'Presidential approval is still required.',sources:['S1'],relation:'new',importance:1}]};
  return Response.json({id:'gen-citation-'+calls,choices:[{message:{content:JSON.stringify(content)},finish_reason:'stop'}],usage:{prompt_tokens:100,completion_tokens:50,cost:0.001}});
 };
 const message={type:'v1_briefing' as const,feedId:'feed-1',window};
 await processV1Briefing(env,message,()=>window.end,undefined,provider as typeof fetch);
 expect(calls).toBe(3);expect(requests[1].messages[1].content).toContain('INVALID_ARTICLE_CITATIONS');
 expect(await store.list('feed-1','semantic_results')).toHaveLength(3);expect(await store.list('feed-1','editions')).toHaveLength(1);
 const paid=await ctx.db.prepare('SELECT COUNT(*) AS n,SUM(s.cost_usd) AS cost,SUM(s.reported) AS reported FROM v1_model_spending_reservations r JOIN v1_model_spending_settlements s ON s.id=r.id WHERE r.feed_id=?').bind('feed-1').first<any>();
 expect(paid).toMatchObject({n:3,reported:3});expect(paid.cost).toBeCloseTo(0.003);
 await processV1Briefing(env,message,()=>window.end,undefined,provider as typeof fetch);
 expect(calls).toBe(3);expect(await store.list('feed-1','editions')).toHaveLength(1);expect(await store.list('feed-1','delivery_jobs')).toHaveLength(1);
},30000);

it('never persists empty success after two invalid-citation replies and never repays them on recovery',async()=>{
 await article();let calls=0;
 const provider=async()=>{calls++;return Response.json({id:'gen-bad-citation-'+calls,choices:[{message:{content:JSON.stringify({items:[{headline:'Banking reform approved',body:'Presidential approval is still required.',sources:['publisher-1'],relation:'new',importance:1}]} )},finish_reason:'stop'}],usage:{prompt_tokens:100,completion_tokens:50,cost:0.001}})};
 const message={type:'v1_briefing' as const,feedId:'feed-1',window};
 await expect(processV1Briefing(env,message,()=>window.end,undefined,provider as typeof fetch)).rejects.toThrow();
 expect(calls).toBe(2);expect(await store.list('feed-1','v3_window_results')).toHaveLength(0);expect(await store.list('feed-1','editions')).toHaveLength(0);
 await expect(processV1Briefing(env,message,()=>window.end,undefined,provider as typeof fetch)).rejects.toThrow();expect(calls).toBe(2);
},30000);
it('delivers a verified frozen window despite subsequently pending acquisition, without completing that job',async()=>{
 const schedule={durationMinutes:30 as const,timezone:'UTC',clockStartAt:'2026-10-03T12:08:00Z'},closed=livePublicationWindow(schedule,new Date('2026-10-03T12:25:00Z'));
 await store.registerFeed({...feedFixture,revision:2,createdAt:schedule.clockStartAt,briefingFrequency:'30M',briefingSchedule:schedule});
 await article(1,'2026-10-03T12:15:00Z','2026-10-03T12:20:00Z');
 const message={type:'v1_briefing' as const,feedId:'feed-1',window:closed},seen:string[]=[],provider=fetcher(seen) as typeof fetch;
 await processV1Briefing(env,message,()=>closed.end,undefined,provider);expect(seen).toHaveLength(2);
 const pending={id:'late-acquisition',kind:'ACQUIRE',state:'PENDING',attempts:0};
 await ctx.db.prepare('INSERT INTO v1_jobs(id,feed_source_id,json) VALUES(?,?,?)').bind(pending.id,'feed-source-1',JSON.stringify(pending)).run();
 const dispatched:unknown[]=[];env={...env,PROCESSING_QUEUE:{send:async(body:unknown)=>{dispatched.push(body)}}} as unknown as Env;
 await dispatchV1Intelligence(env,new Date(closed.scheduledFor!));expect(dispatched).toContainEqual(message);
 const edition=await processV1Briefing(env,message,()=>closed.scheduledFor!,undefined,provider);
 expect(edition).toMatchObject({scheduledFor:closed.scheduledFor});expect(seen).toHaveLength(2);
 const id=await windowIdentity('feed-1',closed);expect(await store.read('feed-1','briefing_requests',id)).toMatchObject({state:'DONE',result:'PUBLISHED',coverage:{state:'INCOMPLETE',deferredJobs:1,failures:[{kind:'ACQUIRE',code:'INTAKE_DEFERRED_AT_CUTOFF',count:1}]}});
 expect(JSON.parse((await ctx.db.prepare('SELECT json FROM v1_jobs WHERE id=?').bind(pending.id).first<{json:string}>())!.json)).toEqual(pending);
 await processV1Briefing(env,message,()=>closed.scheduledFor!,undefined,provider);expect(await store.list('feed-1','delivery_jobs')).toHaveLength(1);expect(seen).toHaveLength(2);
},30000);
it('prepared-delivery readiness rejects early, manual, V2, mismatched and stale results',async()=>{
 const {preparedV3Delivery}=await import('./window-coverage'),schedule={durationMinutes:30 as const,timezone:'UTC',clockStartAt:'2026-10-03T12:08:00Z'},closed=livePublicationWindow(schedule,new Date('2026-10-03T12:25:00Z'));
 await store.registerFeed({...feedFixture,revision:2,createdAt:schedule.clockStartAt,briefingFrequency:'30M',briefingSchedule:schedule});await article(1,'2026-10-03T12:15:00Z','2026-10-03T12:20:00Z');
 const message={type:'v1_briefing' as const,feedId:'feed-1',window:closed},seen:string[]=[];await processV1Briefing(env,message,()=>closed.end,undefined,fetcher(seen) as typeof fetch);
 const id=await windowIdentity('feed-1',closed),at=Date.parse(closed.scheduledFor!);
 expect(await preparedV3Delivery(ctx.db,'feed-1',id,at-1)).toBe(false);expect(await preparedV3Delivery(ctx.db,'feed-1',id,at)).toBe(true);
 const originalRequest=await store.read<any>('feed-1','briefing_requests',id),originalInput=await store.read<any>('feed-1','v3_window_inputs',id),originalResult=await store.read<any>('feed-1','v3_window_results',id);
 for(const mode of ['manual','v2','rejected','mismatched','stale']){
  const key=id+'-'+mode,request=structuredClone(originalRequest),input=structuredClone(originalInput),result=structuredClone(originalResult);
  request.id=input.id=result.id=key;
  if(mode==='manual')delete request.window.scheduledFor;
  if(mode==='v2')request.engine='v2';
  if(mode==='rejected')result.result.status='rejected';
  if(mode==='mismatched')result.inputId='wrong';
  if(mode==='stale')input.feedRevision=1;
  for(const [kind,value] of [['briefing_requests',request],['v3_window_inputs',input],['v3_window_results',result]])await ctx.db.prepare('INSERT INTO v1_feed_documents(kind,id,feed_id,json) VALUES(?,?,?,?)').bind(kind,key,'feed-1',JSON.stringify(value)).run();
  expect(await preparedV3Delivery(ctx.db,'feed-1',key,at),mode).toBe(false);
 }
},30000);

it('freezes opt-in V6 prompts and reuses the persisted window after configuration changes',async()=>{
 await article();env={...env,BRIEFING_PROMPT_VERSION:'6'};
 const seen:string[]=[],transport=fetcher(seen) as typeof fetch,id=await windowIdentity('feed-1',window);
 expect((await processV1Briefing(env,{type:'v1_briefing',feedId:'feed-1',window},()=>window.end,undefined,transport))?.engine).toBe('v3');
 expect(await store.read<any>('feed-1','v3_window_inputs',id)).toMatchObject({promptVersion:6,models:{editor:'openai/gpt-4.1',verifier:'openai/gpt-4.1-mini'}});
 expect(seen).toHaveLength(2);expect(JSON.parse(seen[0]).messages[0].content).toContain('Your job is not to rewrite news posts');expect(JSON.parse(seen[1]).messages[0].content).toContain('You are an independent factual verifier.');
 env={...env,BRIEFING_PROMPT_VERSION:'4'};
 await processV1Briefing(env,{type:'v1_briefing',feedId:'feed-1',window},()=> '2026-10-03T12:31:00Z',undefined,transport);
 expect(seen).toHaveLength(2);expect((await store.read<any>('feed-1','v3_window_inputs',id)).promptVersion).toBe(6);
},30000);
it('retains diagnostic unaccounted refs without blocking publication or repeating settled work',async()=>{
 await article(1);
 await acceptEvidence(store,2,'The electricity authority announced a separate transmission maintenance programme affecting coastal substations next month.','publisher-1','2026-10-03T12:10:00Z','en','2026-10-03T12:05:00Z','Separate electricity decision','https://publisher.example/maintenance-2');
 await processV1Reassessment(env,JSON.stringify(['REASSESS','observation-2','']),'2026-10-03T12:10:00Z');
 const id=await windowIdentity('feed-1',window),seen:string[]=[],transport=fetcher(seen) as typeof fetch,message={type:'v1_briefing' as const,feedId:'feed-1',window};
 const edition=await processV1Briefing(env,message,()=>window.end,undefined,transport);
 expect(edition?.engine).toBe('v3');expect(seen).toHaveLength(3);
 const saved=await store.read<any>('feed-1','v3_window_results',id);
 expect(saved.result.unaccounted).toHaveLength(1);expect(saved.result.unaccounted[0].ref).toBe('S2');expect(saved.result.unaccounted[0].sourceIds).toHaveLength(1);
 expect(saved.result.omitted).toEqual([]);expect(await publicV1Edition(ctx.db,edition!.id)).toBeDefined();
 await processV1Briefing(env,message,()=> '2026-10-03T12:31:00Z',undefined,transport);
 expect(seen).toHaveLength(3);expect((await store.read<any>('feed-1','v3_window_results',id)).result.unaccounted).toEqual(saved.result.unaccounted);
},30000);
it.each(['evidence-first-v1','evidence-first-v2'] as const)('persists an opt-in evidence-agent edition through native durable operations and replays without new work (%s)',async(architecture)=>{
 await article();const id=await windowIdentity('feed-1',window);
 const legacy=await prepareV3Window(store,'feed-1',window,window.end);
 const prepared={...await prepareV3Window(store,'feed-1',window,window.end,legacy.models,4,architecture),id};
 const other=await prepareV3Window(store,'feed-1',window,window.end,legacy.models,4,architecture==='evidence-first-v1'?'evidence-first-v2':'evidence-first-v1');expect(other.fingerprint).not.toBe(prepared.fingerprint);
 expect(legacy).not.toHaveProperty('architecture');expect(legacy.input.articles[0]).not.toHaveProperty('revision');
 expect(prepared.fingerprint).not.toBe(legacy.fingerprint);expect(prepared.input.articles[0].revision?.evidenceId).toBeTruthy();
 await feedTransact(store,'feed-1',async tx=>{await tx.write('briefing_requests',id,{id,feedId:'feed-1',window,state:'PENDING',attempts:0,createdAt:window.end,engine:'v3'});await tx.write('v3_window_inputs',id,prepared)});
 const requests:any[]=[];
 const provider=(async(_url:unknown,init?:RequestInit)=>{
  const request=JSON.parse(init!.body as string);requests.push(request);const editor=requests.length===1;
  const content=editor?{items:[{developmentId:'D1',headline:'Parliament approves banking reform; presidential approval still required',body:''}],developments:[{id:'D1',occurrence:'Parliament vote on banking reform',relation:'new',updates:null,importance:1,essentialClaims:[{id:'C1',statement:'Parliament approved legislation subject to presidential approval',conditions:['Presidential approval required'],attribution:null,uncertainty:null,temporalStatus:'completed',time:null,evidence:[{passages:['S1.B1'],quote:'The measure still requires presidential approval.'}]}]}],left_out:[]}:{results:[{i:0,verdict:'ok',issues:[]}],coverage:{status:'complete',issues:[]}};
  if(editor&&architecture==='evidence-first-v2')delete (content as any).developments[0].essentialClaims[0].evidence[0].quote;
  return Response.json({id:`gen-evidence-${requests.length}`,choices:[{message:{content:JSON.stringify(content)},finish_reason:'stop'}],usage:{prompt_tokens:100,completion_tokens:50,cost:0.001}});
 }) as typeof fetch;
 const message={type:'v1_briefing' as const,feedId:'feed-1',window};
 const edition=await processV1Briefing(env,message,()=>window.end,undefined,provider);
 expect(edition).toBeDefined();expect(requests).toHaveLength(2);
 const saved=(await store.list<any>('feed-1','v3_window_results'))[0];expect(saved.result.evidenceAgent).toMatchObject({architecture,semanticTruthEstablished:false,acceptedDevelopmentIds:['D1']});
 expect(saved.operationIds).toHaveLength(2);const operations=await store.list<any>('feed-1','semantic_results');expect(operations).toHaveLength(2);for(const operation of operations){expect(operation.status).toBe('SUCCEEDED');expect(operation.usage).toMatchObject({calls:1,reported:true,costUsd:0.001});}
 const readback=await publicV1Edition(ctx.db,id);expect(readback).toBeDefined();expect(JSON.stringify(readback)).toContain('presidential approval still required');
 const before=await store.getFeed('feed-1');await processV1Briefing(env,message,()=> '2026-10-03T12:31:00Z',undefined,provider);
 expect(requests).toHaveLength(2);expect(await store.list('feed-1','editions')).toHaveLength(1);expect(await store.list('feed-1','delivery_jobs')).toHaveLength(1);expect(await store.getFeed('feed-1')).toEqual(before);
},30000);
it('keeps v2 malformed-record evidence recoverable after partial publication without replaying accepted sources',async()=>{
 await article(1);await article(2);const id=await windowIdentity('feed-1',window);
 const prepared={...await prepareV3Window(store,'feed-1',window,window.end,undefined,4,'evidence-first-v2'),id};expect(prepared.input.articles).toHaveLength(2);
 await feedTransact(store,'feed-1',async tx=>{await tx.write('briefing_requests',id,{id,feedId:'feed-1',window,state:'PENDING',attempts:0,createdAt:window.end,engine:'v3'});await tx.write('v3_window_inputs',id,prepared)});
 let calls=0;
 const provider=(async(_url:unknown,init?:RequestInit)=>{
  const request=JSON.parse(String(init?.body)),payload=JSON.parse(request.messages[1].content);calls++;
  const claim=(passage:string)=>({id:'C1',statement:'Presidential approval remains required',conditions:[],attribution:null,uncertainty:null,temporalStatus:'reported',time:null,evidence:[{passages:[passage]}]});
  const content=calls===1?{items:[{developmentId:'D1',headline:'Banking reform requires presidential approval',body:''},{developmentId:'D2',headline:'Another record requiring review',body:''}],developments:[{id:'D1',occurrence:'Banking reform',relation:'new',updates:null,importance:1,essentialClaims:[claim('S1.B1')]},{id:'D2',occurrence:'Unresolved record',relation:'update',updates:null,importance:2,essentialClaims:[claim('S2.B1')]}],left_out:[]}:{results:payload.items.map((item:any)=>({i:item.i,verdict:'ok',issues:[]})),coverage:{status:'complete',issues:[]}};
  return Response.json({id:'gen-v2-partial-'+calls,choices:[{message:{content:JSON.stringify(content)},finish_reason:'stop'}],usage:{prompt_tokens:100,completion_tokens:50,cost:.001}});
 }) as typeof fetch;
 const message={type:'v1_briefing' as const,feedId:'feed-1',window};const edition=await processV1Briefing(env,message,()=>window.end,undefined,provider);expect(edition?.stories).toHaveLength(1);expect(calls).toBe(2);
 expect(edition?.evidenceRevisionIds).toEqual([prepared.input.articles[0].id]);
 const carried=await store.carryEvidenceIds('feed-1',prepared.evidenceRevisionIds);expect([...carried]).toEqual([prepared.input.articles[1].id]);
 const next=await prepareV3Window(store,'feed-1',{...window,start:window.end,end:'2026-10-03T13:00:00Z'},'2026-10-03T13:00:00Z',undefined,4,'evidence-first-v2');expect(next.input.articles.map(a=>a.id)).toEqual([prepared.input.articles[1].id]);
 await processV1Briefing(env,message,()=> '2026-10-03T12:31:00Z',undefined,provider);expect(calls).toBe(2);expect(await store.list('feed-1','editions')).toHaveLength(1);expect(await store.list('feed-1','delivery_jobs')).toHaveLength(1);
},30000);

it('hydrates frozen V3 publication evidence in batches instead of one database request per revision',async()=>{
 for(let n=1;n<=3;n++)await article(n);
 const pointReads=vi.spyOn(V1FeedStore.prototype,'revision'),seen:string[]=[];
 const edition=await processV1Briefing(env,{type:'v1_briefing',feedId:'feed-1',window},()=>window.end,undefined,fetcher(seen) as typeof fetch);
 expect(edition?.engine).toBe('v3');
 expect(edition?.evidenceRevisionIds).toHaveLength(3);
 expect(pointReads).not.toHaveBeenCalled();
});

async function missedWindowEvidence(resultParts:(id:string)=>Record<string,unknown>,resultEnd='2026-10-03T12:00:00Z'){
 await article(1,'2026-10-03T11:40:00Z','2026-10-03T11:45:00Z','2026-10-03T11:44:00Z');
 const revision=(await store.currentEvidence('feed-1'))[0].revision.id,oldWindow={...window,start:'2026-10-03T11:30:00Z',end:'2026-10-03T12:00:00Z'},oldId=await windowIdentity('feed-1',oldWindow);
 await feedTransact(store,'feed-1',async tx=>{
  await tx.write('briefing_requests',oldId,{id:oldId,feedId:'feed-1',window:oldWindow,engine:'v3',state:'DONE',result:'DEFERRED',reason:'SUPERSEDED_BY_LATER_WINDOW',attempts:0,createdAt:oldWindow.end});
  await tx.write('v3_window_results','prior-decision',{id:'prior-decision',feedId:'feed-1',windowEnd:resultEnd,result:{status:'published',items:[],skipped:[],omitted:[],dropped:[],...resultParts(revision)}});
 });return revision;
}
it.each(['skip','omit','redundant'] as const)('does not reoffer an unchanged %s source through a superseded reporting window',async kind=>{
 const revision=await missedWindowEvidence(id=>kind==='skip'?{skipped:[{id,reason:'already known'}]}:kind==='omit'?{omitted:[{stage:'editor',sourceIds:[id],reason:'no meaningful development'}]}:{dropped:[{headline:'Old story',sourceIds:[id],reason:'redundant',carry:false}]});
 const prepared=await prepareV3Window(store,'feed-1',window,window.end);
 expect(prepared.evidenceRevisionIds).not.toContain(revision);
 expect(prepared.input.articles).toEqual([]);
});
it.each(['verification','unaccounted','unpublished'] as const)('retains the explicit %s recovery despite an older reporting window',async kind=>{
 const revision=await missedWindowEvidence(id=>kind==='verification'?{omitted:[{stage:'editor',sourceIds:[id],reason:'another development omitted'}],dropped:[{headline:'Needs verification',sourceIds:[id],reason:'not confirmed',carry:true}]}:kind==='unaccounted'?{unaccounted:[{ref:'S1',sourceIds:[id]}]}:{items:[{headline:'Verified but not delivered',sourceIds:[id]}]});
 const prepared=await prepareV3Window(store,'feed-1',window,window.end);
 expect(prepared.evidenceRevisionIds).toContain(revision);
 expect(prepared.admissionPolicy).toBe('PUBLICATION_DATE_WITH_EXPLICIT_RECOVERY_V1');
 expect(prepared.admissions).toContainEqual(expect.objectContaining({revisionId:revision,reason:kind==='verification'?'VERIFICATION_RETRY':kind==='unpublished'?'VERIFIED_UNPUBLISHED':'UNRESOLVED_WINDOW',publishedAt:'2026-10-03T11:40:00Z'}));
});
it('a later result cannot suppress an earlier chronological recovery input',async()=>{
 const revision=await missedWindowEvidence(id=>({skipped:[{id,reason:'later decision'}]}),'2026-10-03T13:00:00Z');
 expect((await prepareV3Window(store,'feed-1',window,window.end)).evidenceRevisionIds).toContain(revision);
});
it('a changed source revision remains eligible after its predecessor was explicitly omitted',async()=>{
 const revision=await missedWindowEvidence(id=>({omitted:[{stage:'editor',sourceIds:[id],reason:'previous information'}]}));
 const changed=await supersedeFrozenRevision(revision,{acceptedAt:'2026-10-03T12:10:00Z',body:'Parliament corrected the vote result and announced a new decision.',contentHash:'changed-source-content'});
 const prepared=await prepareV3Window(store,'feed-1',window,window.end);
 expect(prepared.evidenceRevisionIds).toContain(changed);expect(prepared.evidenceRevisionIds).not.toContain(revision);
 expect(prepared.input.articles[0].publishedAt).toBe('2026-10-03T11:40:00Z');
});
it.each([['2026-10-03T12:00:00Z',true],['2026-10-03T12:30:00Z',false],['2026-10-03T12:30:00.001Z',false],['2026-10-03T11:59:59.999Z',true]] as const)('uses publication-time boundaries without rewriting %s to acquisition time',async(publishedAt,eligible)=>{
 await article(1,publishedAt,'2026-10-03T12:10:00Z','2026-10-03T12:09:00Z');
 const prepared=await prepareV3Window(store,'feed-1',window,window.end);
 expect(prepared.input.articles.length>0).toBe(eligible);
 if(eligible){expect(prepared.input.articles[0].publishedAt).toBe(publishedAt);expect(prepared.admissions?.[0]).toMatchObject({publishedAt,reason:publishedAt.startsWith('2026-10-03T12:')?'PUBLICATION_WINDOW':'LATE_DISCOVERY'});}
});

it('labels a changed previously communicated revision as source revision rather than discovery',async()=>{
 await article();const seen:string[]=[],edition=await processV1Briefing(env,{type:'v1_briefing',feedId:'feed-1',window},()=>window.end,undefined,fetcher(seen) as typeof fetch);
 const old=edition!.evidenceRevisionIds[0],changed=await supersedeFrozenRevision(old,{acceptedAt:'2026-10-03T12:40:00Z',body:'Parliament corrected its decision and announced the revised result.',contentHash:'corrected-source'});
 const next={...window,start:window.end,end:'2026-10-03T13:00:00Z'},prepared=await prepareV3Window(store,'feed-1',next,next.end);
 expect(prepared.admissions).toContainEqual(expect.objectContaining({revisionId:changed,reason:'SOURCE_REVISION',publishedAt:'2026-10-03T12:05:00Z'}));
});

it('freezes the unusable editor chunk policy for new inputs and keeps legacy snapshots unchanged',async()=>{
 await article();
 const fresh=await prepareV3Window(store,'feed-1',window,window.end);
 expect(fresh.editorFailurePolicy).toBe('isolate-unusable-chunks-v1');
 const {editorFailurePolicy:_,editorAccountingPolicy:__,...legacy}=fresh;
 // Store an already frozen input under the canonical window id; it must replay
 // its original bytes rather than silently acquiring the new failure policy.
 const id=await windowIdentity('feed-1',window);
 const frozen={...legacy,id};
 await feedTransact(store,'feed-1',tx=>tx.write('v3_window_inputs',id,frozen));
 const seen:string[]=[];await processV1Briefing(env,{type:'v1_briefing',feedId:'feed-1',window},()=>window.end,undefined,fetcher(seen) as typeof fetch);
 expect(await store.read('feed-1','v3_window_inputs',id)).toEqual(frozen);
});

it('freezes complete accounting in new inputs and persists every source decision through duplicate delivery',async()=>{
 await article();
 const fresh=await prepareV3Window(store,'feed-1',window,window.end);
 expect(fresh.editorAccountingPolicy).toBe('complete-source-decisions-v1');
 const seen:string[]=[],message={type:'v1_briefing' as const,feedId:'feed-1',window};
 const edition=await processV1Briefing(env,message,()=>window.end,undefined,fetcher(seen) as typeof fetch);
 expect(edition).toBeDefined();
 const id=await windowIdentity('feed-1',window),snapshot=await store.read<any>('feed-1','v3_window_inputs',id),saved=await store.read<any>('feed-1','v3_window_results',id);
 expect(snapshot.editorAccountingPolicy).toBe('complete-source-decisions-v1');
 expect(saved.result.sourceDecisions).toHaveLength(snapshot.input.articles.length);
 expect(saved.result.sourceDecisions[0].outcomes).toContainEqual(expect.objectContaining({stage:'final',decision:'selected'}));
 expect(seen[0]).toContain('SOURCE ACCOUNTING CONTRACT');
 await processV1Briefing(env,message,()=>window.end,undefined,fetcher(seen) as typeof fetch);
 expect(seen).toHaveLength(2);expect(await store.read('feed-1','v3_window_results',id)).toEqual(saved);
});

it('reports exhausted accounting as an accounting deferral rather than a quiet or verifier decision',async()=>{
 await article();const seen:string[]=[],provider=(async(_url:unknown,init?:RequestInit)=>{seen.push(String(init?.body));return Response.json({id:`gen-accounting-${seen.length}`,choices:[{message:{content:'{"items":[]}'},finish_reason:'stop'}],usage:{prompt_tokens:100,completion_tokens:10,cost:.001}})}) as typeof fetch;
 const message={type:'v1_briefing' as const,feedId:'feed-1',window},id=await windowIdentity('feed-1',window);
 expect(await processV1Briefing(env,message,()=>window.end,undefined,provider)).toBeUndefined();
 expect(await store.read('feed-1','briefing_requests',id)).toMatchObject({state:'DONE',result:'DEFERRED',reason:'V3_EDITOR_ACCOUNTING_INCOMPLETE'});
 const saved=await store.read<any>('feed-1','v3_window_results',id);
 expect(saved.result.status).toBe('rejected');expect(saved.result.sourceDecisions[0].outcomes[0].decision).toBe('deferred');expect(saved.result.dropped[0].carry).toBe(true);expect(seen).toHaveLength(2);
 await processV1Briefing(env,message,()=>window.end,undefined,provider);expect(seen).toHaveLength(2);
});
