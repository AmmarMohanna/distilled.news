import {mkdirSync,readFileSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {Miniflare} from 'miniflare';
import {expect,vi} from 'vitest';
import {handoffConnectorBatch,type CollectionCoverage} from '@distilled/contracts';
import type {ConnectorBatch} from '@distilled/connectors';
import {CANARY_SOURCES,freezeRssCorpus,type CanaryItem} from './rss-canary';
import {prepareRssHandoff} from '../v1-intake/rss-handoff';
import {V1IntakeStore} from '../v1-intake/store';
import {createCandidateIntakePort} from '../v1-intake/intake';
import {createV1RuntimePolicy,processV1Acquisition} from '../v1-downstream-runtime';
import {enrollV1Source} from './product';
import {processV1Reassessment} from './runtime';
import {V1FeedStore} from './store';
import type {Env} from '../types';
type Corpus=Awaited<ReturnType<typeof freezeRssCorpus>>;
export async function database(label:string,corpus:Corpus){
 // Keep Windows SQLite journal paths below MAX_PATH; retain failed older runs.
 const directory=new URL(`../../../../.local-reports/rcdb/${label}-v4/`,import.meta.url);mkdirSync(directory,{recursive:true});
 const mf=new Miniflare({modules:true,script:"export default {fetch(){return new Response('ok')}}",d1Databases:['DB'],r2Buckets:['RAW_ARCHIVE'],d1Persist:fileURLToPath(new URL('d1/',directory)),r2Persist:fileURLToPath(new URL('r2/',directory))});
 const db=await mf.getD1Database('DB') as unknown as D1Database,bucket=await mf.getR2Bucket('RAW_ARCHIVE') as unknown as R2Bucket;
 for(const name of readdirSync(new URL('../../migrations/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort()){
  const sql=readFileSync(new URL(`../../migrations/${name}`,import.meta.url),'utf8').replace(/^\s*--[^\n]*$/gm,'').replace(/\r?\n/g,' ').trim();if(sql)await db.exec(sql);
 }
 const now=corpus.start;
 await db.prepare("INSERT INTO accounts(id,email,normalized_email,username,role,password_hash,email_verified_at,created_at,updated_at) VALUES('owner-canary','canary@example.invalid','canary@example.invalid','canary','user','fixture',?,?,?)").bind(now,now,now).run();
 await db.prepare("INSERT INTO briefings(id,owner_account_id,slug,title,interest_profile,public_feed_enabled,language,created_at,updated_at) VALUES('feed-canary','owner-canary','world','World news canary','world news',1,'en',?,?)").bind(now,now).run();
 const scopes=new Map<string,Awaited<ReturnType<typeof enrollV1Source>>>();
 for(const source of CANARY_SOURCES){
  await db.prepare("INSERT INTO sources(id,briefing_id,title,type,provider,kind,source_url,enabled,last_seen_at,created_at,updated_at) VALUES(?,'feed-canary',?,'channel','rss','rss_feed',?,1,?,?,?)").bind(source.id,source.title,source.url,now,now,now).run();
 }
 // Complete source configuration before enrollment: product source insertion
 // intentionally invalidates previously enrolled scopes. Reconcile all scopes
 // to the final Feed revision through the existing enrollment API.
 for(let pass=0;pass<2;pass++)for(const source of CANARY_SOURCES)scopes.set(source.id,await enrollV1Source(db,source.id,'owner-canary',now));
 const env={DB:db,RAW_ARCHIVE:bucket,V1_DOWNSTREAM_ENABLED:'true',V1_DOWNSTREAM_FEED_SOURCE_IDS:CANARY_SOURCES.map(s=>s.id).join(',')} as Env;
 return {mf,db,bucket,scopes,env,store:new V1FeedStore(db)};
}
export async function ingest(context:Awaited<ReturnType<typeof database>>,item:CanaryItem,index:number,sourceInfo:any){
 const now=item.publishedAt!,source=context.scopes.get(item.canarySourceId!)!;
 // Stable fixture UUIDs bind exactly the same evidence/Event IDs across replay
 // histories; no production identifier allocator is replaced or claimed.
 let counter=0;const uuid=vi.spyOn(crypto,'randomUUID').mockImplementation(()=>`00000000-0000-4000-8000-${((index+1)*1000+(++counter)).toString(16).padStart(12,'0')}`);
 vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date(now));
 try {
  const coverage:CollectionCoverage={id:`coverage-${index}`,feedId:'feed-canary',feedSourceId:item.canarySourceId!,fetchRunId:`frozen-${index}`,fetchStartSequence:index+1,requestedBounds:{},observedBounds:{startTime:now,endTime:now},status:'PARTIAL',continuationState:'NONE',createdAt:now};
  const batch:ConnectorBatch={connector:'rss',observations:[item],coverage:{completeness:'partial',reason:'frozen_corpus_replay'},retry:{kind:'none'},telemetry:{requests:0,latencyMs:0,providerCostUsd:0}};
  const request=await prepareRssHandoff(batch,{scope:source.scope,coverage,languageHint:sourceInfo.language},context.bucket);
  const policy={...createV1RuntimePolicy(),now:()=>now};
  const response=await handoffConnectorBatch(createCandidateIntakePort(new V1IntakeStore(context.db),policy),request);
  expect(response.receipts[0].decision).toMatch(/ACCEPTED|REPLAY/);
  await processV1Acquisition(context.env,JSON.stringify(['ACQUIRE',request.observations[0].id,'']));
  await processV1Reassessment(context.env,JSON.stringify(['REASSESS',request.observations[0].id,'']),now);
  return {index,sourceItemKey:item.upstreamId,source:item.canarySourceId,simulatedArrivalAt:now,request,response};
 }finally{vi.useRealTimers();uuid.mockRestore()}
}
export async function exportState(context:Awaited<ReturnType<typeof database>>){
 const state:Record<string,unknown[]>={};
 const actual=(await context.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all<{name:string}>()).results.map(r=>r.name);
 for(const table of actual.filter(t=>t.startsWith('v1_')&&!t.endsWith('_guards'))){state[table]=(await context.db.prepare(`SELECT * FROM ${table}`).all()).results}
 // Table names come exclusively from sqlite_master, never external evidence.
 return state;
}
