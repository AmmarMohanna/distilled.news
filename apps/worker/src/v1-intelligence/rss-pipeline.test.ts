import {readFileSync,readdirSync} from 'node:fs';
import {Miniflare} from 'miniflare';
import {expect,it} from 'vitest';
import {fetchRssCandidates} from '@distilled/connectors';
import {handoffConnectorBatch,isIntakePrefixResolved,type CollectionCoverage} from '@distilled/contracts';
import {prepareRssHandoff,rssLanguageHint} from '../v1-intake/rss-handoff';
import {createCandidateIntakePort} from '../v1-intake/intake';
import {V1IntakeStore} from '../v1-intake/store';
import {createV1RuntimePolicy,processV1Acquisition} from '../v1-downstream-runtime';
import {enrollV1Source} from './product';
import {processV1Briefing,processV1Reassessment} from './runtime';
import {publicV1Edition,publicV1Evidence,withdrawV1Edition} from './public-read';
import {V1FeedStore} from './store';
import type {Env} from '../types';

const FEED_URL='https://feeds.bbci.co.uk/news/world/rss.xml';
const SYNTHETIC_RSS='<rss><channel><language>en</language><item><guid>rss-1</guid><title>Parliament approves reform</title><description>Parliament approved banking reform legislation after a public vote.</description><link>https://www.bbc.com/news/reform</link><pubDate>Sat, 03 Oct 2026 10:00:00 GMT</pubDate></item></channel></rss>';
async function proof(live:boolean) {
 const mf=new Miniflare({modules:true,script:"export default {fetch(){return new Response('ok')}}",d1Databases:['DB'],r2Buckets:['RAW_ARCHIVE']});
 try {
  const db=await mf.getD1Database('DB') as unknown as D1Database,bucket=await mf.getR2Bucket('RAW_ARCHIVE') as unknown as R2Bucket;
  for(const name of readdirSync(new URL('../../migrations/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort()) {
   const sql=readFileSync(new URL(`../../migrations/${name}`,import.meta.url),'utf8').replace(/^\s*--[^\n]*$/gm,'').replace(/\r?\n/g,' ').trim();if(sql) await db.exec(sql);
  }
  const now=new Date().toISOString();
  await db.prepare("INSERT INTO accounts(id,email,normalized_email,username,role,password_hash,email_verified_at,created_at,updated_at) VALUES('owner-1','owner@example.invalid','owner@example.invalid','owner','user','hash',?,?,?)").bind(now,now,now).run();
  await db.prepare("INSERT INTO briefings(id,owner_account_id,slug,title,interest_profile,public_feed_enabled,language,created_at,updated_at) VALUES('feed-1','owner-1','news','World news','world news',1,'en',?,?)").bind(now,now).run();
  await db.prepare("INSERT INTO sources(id,briefing_id,title,type,provider,kind,source_url,enabled,last_seen_at,created_at,updated_at) VALUES('feed-source-1','feed-1','World RSS','channel','rss','rss_feed',?,1,?,?,?)").bind(FEED_URL,now,now,now).run();
  const enrolled=await enrollV1Source(db,'feed-source-1','owner-1',now),intake=new V1IntakeStore(db);
  // Test connector-owned durable run allocator and checkpoint CAS fixture. No
  // production connector allocator/scheduler implementation is claimed here.
  await db.exec('CREATE TABLE proof_connector_state(id TEXT PRIMARY KEY,sequence INTEGER,checkpoint_version INTEGER,cursor TEXT);');
  await db.prepare("INSERT INTO proof_connector_state VALUES('feed-source-1',0,0,NULL)").run();
  const sequence=(await db.prepare("UPDATE proof_connector_state SET sequence=sequence+1 WHERE id='feed-source-1' RETURNING sequence").first<{sequence:number}>())!.sequence;
  let language:string|undefined,fetches=0;
  const batch=await fetchRssCandidates({url:FEED_URL,resourceId:enrolled.source.id,checkpoint:{version:'0'},maxItems:live?2:10},{get:async()=>{
   fetches++;let text:string;
   if(live) {const {WorkerPublicSourceFetch}=await import('../public-source-fetch');text=(await new WorkerPublicSourceFetch(FEED_URL).get(FEED_URL)).body}
   else text=SYNTHETIC_RSS;
   language=rssLanguageHint(text);
   const headers:Record<string,string>=live?{}:{etag:'synthetic-etag-1'};return {status:200,body:text,headers};
  }});
  expect(batch.observations.length).toBeGreaterThan(0);expect(batch.observations.length).toBeLessThanOrEqual(live?2:10);
  const runId=crypto.randomUUID(),coverage:CollectionCoverage={id:crypto.randomUUID(),feedId:'feed-1',feedSourceId:'feed-source-1',fetchRunId:runId,fetchStartSequence:sequence,requestedBounds:{},observedBounds:{},status:'PARTIAL',continuationState:batch.coverage.reason==='item_limit'?'PENDING':'NONE',createdAt:now};
  const request=await prepareRssHandoff(batch,{scope:enrolled.scope,coverage,languageHint:language},bucket);
  await db.exec('CREATE TABLE proof_connector_runs(id TEXT PRIMARY KEY,json TEXT NOT NULL);');
  await db.prepare('INSERT INTO proof_connector_runs VALUES(?,?)').bind(runId,JSON.stringify(request)).run();
  const response=await handoffConnectorBatch(createCandidateIntakePort(intake,createV1RuntimePolicy()),request);
  expect(isIntakePrefixResolved(response,request.observations.map(o=>o.id))).toBe(true);
  if(batch.checkpointProposal) {
   const updated=await db.prepare("UPDATE proof_connector_state SET checkpoint_version=checkpoint_version+1,cursor=? WHERE id='feed-source-1' AND checkpoint_version=0").bind(JSON.stringify(batch.checkpointProposal)).run();expect(updated.meta.changes).toBe(1);
  }
  const env={DB:db,RAW_ARCHIVE:bucket,V1_DOWNSTREAM_ENABLED:'true',V1_DOWNSTREAM_FEED_SOURCE_IDS:'feed-source-1'} as Env;
  for(const observation of request.observations) {
   await processV1Acquisition(env,JSON.stringify(['ACQUIRE',observation.id,'']));
   await processV1Reassessment(env,JSON.stringify(['REASSESS',observation.id,'']));
  }
  if(live) console.info('Live RSS representation diagnostics',{declaredLanguage:language??'UNKNOWN',items:batch.observations.map(o=>({bodyCharacters:o.text.length,completeness:o.contentCompleteness}))});
  const asOf=new Date(Date.now()+1000),edition=await processV1Briefing(env,{type:'v1_briefing',feedId:'feed-1',window:{start:new Date(Date.parse(now)-3600000).toISOString(),end:asOf.toISOString(),kind:'HOURLY'}},()=>asOf.toISOString());
  expect(edition?.stories.length).toBeGreaterThan(0);expect(edition!.generation.model).toBe('deterministic-extractive-editorial-v2');expect(edition!.generation.promptVersion).toBe('full-context-extractive-editorial-v2');
  const publicEdition=await publicV1Edition(db,edition!.id);expect(publicEdition?.citations.length).toBeGreaterThan(0);
  expect(await handoffConnectorBatch(createCandidateIntakePort(new V1IntakeStore(db),createV1RuntimePolicy()),request)).toEqual(response);
  expect(await new V1FeedStore(db).list('feed-1','editions')).toHaveLength(1);expect(fetches).toBe(1);
  await db.prepare("DELETE FROM briefings WHERE id='feed-1'").run();
  expect(await publicV1Edition(db,edition!.id)).toEqual(publicEdition);
  for(const id of edition!.evidenceRevisionIds) expect((await publicV1Evidence(db,edition!.id,id))?.id).toBe(id);
  await expect(withdrawV1Edition(db,edition!.id,'other-owner','OWNER_REQUEST',asOf.toISOString())).rejects.toMatchObject({code:'SCOPE_DENIED'});
  await withdrawV1Edition(db,edition!.id,'owner-1','POLICY_REQUIRED',asOf.toISOString());
  expect(await publicV1Edition(db,edition!.id)).toBeUndefined();expect(await new V1FeedStore(db).read('feed-1','editions',edition!.id)).toEqual(edition);
  if(live) console.info('Bounded local live RSS proof',{transport:'REAL_PUBLIC_HTTPS',storage:'LOCAL_MINIFLARE_D1_R2',connectorItems:request.observations.length,evidenceRevisions:edition!.evidenceRevisionIds.length,groundedStories:edition!.stories.length,modelCalls:0,coverage:coverage.status,checkpointAdvanced:Boolean(batch.checkpointProposal),replayIdempotent:true,retainedSupportAfterFeedDeletion:true,withdrawal:true});
 } finally {await mf.dispose()}
}
it('existing RSS connector to durable handoff, acquired revisions, intelligence, grounded edition and retained citations',()=>proof(false),30000);
it('RSS language metadata supports plain and CDATA BCP47 values and never guesses a missing language',()=>{
 expect(rssLanguageHint('<language>en-GB</language>')).toBe('en');expect(rssLanguageHint('<language><![CDATA[en-gb]]></language>')).toBe('en');expect(rssLanguageHint('<channel></channel>')).toBeUndefined();
});
it.runIf(process.env.DISTILLED_V1_LIVE_RSS_PROOF==='true')('bounded real RSS connector to grounded edition on local D1/R2',()=>proof(true),45000);
