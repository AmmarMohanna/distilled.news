import {readFileSync,readdirSync,mkdirSync,writeFileSync} from 'node:fs';
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
import {OpenRouterJudgmentClient,JevSalienceScorer,GptSalienceScorer,type SalienceInput} from './salience';
import type {EventVersion} from '@distilled/contracts';

const FEED_URL='https://feeds.bbci.co.uk/news/world/rss.xml';
const SYNTHETIC_RSS='<rss><channel><language>en</language><item><guid>rss-1</guid><title>Parliament approves reform</title><description>Parliament approved banking reform legislation after a public vote.</description><link>https://www.bbc.com/news/reform</link><pubDate>Sat, 03 Oct 2026 10:00:00 GMT</pubDate></item></channel></rss>';
async function proof(live:boolean,paid=false) {
 if(paid && !process.env.OPENROUTER_API_KEY) throw Error('LIVE_PROOF_REQUIRES_LOCAL_OPENROUTER_KEY');
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
  const env={DB:db,RAW_ARCHIVE:bucket,V1_DOWNSTREAM_ENABLED:'true',V1_DOWNSTREAM_FEED_SOURCE_IDS:'feed-source-1',...(paid?{V1_SYNTHESIS_MODEL_ENABLED:'true',DISTILLED_LLM_API_GATEWAY:'openrouter',OPENROUTER_API_KEY:process.env.OPENROUTER_API_KEY,DISTILLED_LIVE_OPENROUTER_MODEL:'openai/gpt-4.1-mini'}:{})} as Env;
  for(const observation of request.observations) {
   await processV1Acquisition(env,JSON.stringify(['ACQUIRE',observation.id,'']));
   await processV1Reassessment(env,JSON.stringify(['REASSESS',observation.id,'']));
  }
  if(live) console.info('Live RSS representation diagnostics',{declaredLanguage:language??'UNKNOWN',items:batch.observations.map(o=>({bodyCharacters:o.text.length,completeness:o.contentCompleteness}))});
  const asOf=new Date(Date.now()+1000),edition=await processV1Briefing(env,{type:'v1_briefing',feedId:'feed-1',window:{start:new Date(Date.parse(now)-3600000).toISOString(),end:asOf.toISOString(),kind:'HOURLY'}},()=>asOf.toISOString());
  expect(edition?.stories.length).toBeGreaterThan(0);expect(edition!.generation.model).toBe(paid?'openai/gpt-4.1-mini':'deterministic-approved-facts-v3');expect(edition!.generation.promptVersion).toBe(paid?'approved-fact-spans-editorial-v18':'approved-fact-spans-v3');
  const publicEdition=await publicV1Edition(db,edition!.id);expect(publicEdition?.citations.length).toBeGreaterThan(0);
  if(paid) {
   const store=new V1FeedStore(db),version=await store.read<EventVersion>('feed-1','event_versions',edition!.eventVersionIds[0]);
   expect(version).toBeDefined();
   const input:SalienceInput={feedId:'feed-1',feedRevision:edition!.feedRevision,targetType:'EVENT',targetVersionId:version!.id,text:version!.state.slice(0,6000),version:version!.version,independentSupport:1,persistence:0,recency:1};
   const jev=new JevSalienceScorer(new OpenRouterJudgmentClient({kind:'JEV',apiKey:process.env.OPENROUTER_API_KEY!,model:'typesafe/jev-1.13',maxCalls:1,maxCostUsd:.02,maxCallCostUsd:.02}));
   const gpt=new GptSalienceScorer(new OpenRouterJudgmentClient({kind:'GPT',apiKey:process.env.OPENROUTER_API_KEY!,model:'openai/gpt-4.1-mini',maxCalls:1,maxCostUsd:.02,maxCallCostUsd:.02}));
   const judgments={JEV:await jev.score(input),GPT:await gpt.score(input)};
   const replay=await processV1Briefing(env,{type:'v1_briefing',feedId:'feed-1',window:{start:new Date(Date.parse(now)-3600000).toISOString(),end:asOf.toISOString(),kind:'HOURLY'}},()=>asOf.toISOString());
   expect(replay).toEqual(edition);
   const executions=await store.list('feed-1','model_executions');
   expect(executions.length).toBeLessThanOrEqual(2);
   const report={proof:'REAL_BBC_RSS_AND_OPENROUTER_LOCAL_END_TO_END',source:FEED_URL,observedAt:now,storage:'LOCAL_MINIFLARE_D1_R2',sourceRepresentation:'ARTICLE_EXCERPT_FROM_REAL_RSS_NOT_FULL_ARTICLE',productionScoring:'DETERMINISTIC',sources:request.observations.map(o=>({title:o.titleHint,url:o.canonicalUrl,publishedAt:o.publishedAtHint})),edition:publicEdition,generation:edition!.generation,executions,judgmentInput:input,judgments,maximumProviderCalls:4,maximumReservedCostUsd:.12,replayIdempotent:true,humanQuality:'PENDING_HUMAN_LABELS'};
   const directory=new URL('../../../../.local-reports/',import.meta.url);mkdirSync(directory,{recursive:true});writeFileSync(new URL('live-bbc-openrouter.json',directory),JSON.stringify(report,null,2));
   console.info('LIVE_END_TO_END_REPORT',JSON.stringify(report));
  }
  expect(await handoffConnectorBatch(createCandidateIntakePort(new V1IntakeStore(db),createV1RuntimePolicy()),request)).toEqual(response);
  expect(await new V1FeedStore(db).list('feed-1','editions')).toHaveLength(1);expect(fetches).toBe(1);
  await db.prepare("DELETE FROM briefings WHERE id='feed-1'").run();
  expect(await publicV1Edition(db,edition!.id)).toEqual(publicEdition);
  for(const id of edition!.evidenceRevisionIds) expect((await publicV1Evidence(db,edition!.id,id))?.id).toBe(id);
  await expect(withdrawV1Edition(db,edition!.id,'other-owner','OWNER_REQUEST',asOf.toISOString())).rejects.toMatchObject({code:'SCOPE_DENIED'});
  await withdrawV1Edition(db,edition!.id,'owner-1','POLICY_REQUIRED',asOf.toISOString());
  expect(await publicV1Edition(db,edition!.id)).toBeUndefined();expect(await new V1FeedStore(db).read('feed-1','editions',edition!.id)).toEqual(edition);
  if(live) console.info('Bounded local live RSS proof',{transport:'REAL_PUBLIC_HTTPS',storage:'LOCAL_MINIFLARE_D1_R2',connectorItems:request.observations.length,evidenceRevisions:edition!.evidenceRevisionIds.length,groundedStories:edition!.stories.length,modelCalls:paid?(await new V1FeedStore(db).list('feed-1','model_executions')).length+2:0,coverage:coverage.status,checkpointAdvanced:Boolean(batch.checkpointProposal),replayIdempotent:true,retainedSupportAfterFeedDeletion:true,withdrawal:true});
 } finally {await mf.dispose()}
}
it('existing RSS connector to durable handoff, acquired revisions, intelligence, grounded edition and retained citations',()=>proof(false),30000);
it('RSS language metadata supports plain and CDATA BCP47 values and never guesses a missing language',()=>{
 expect(rssLanguageHint('<language>en-GB</language>')).toBe('en');expect(rssLanguageHint('<language><![CDATA[en-gb]]></language>')).toBe('en');expect(rssLanguageHint('<channel></channel>')).toBeUndefined();
});
it.runIf(process.env.DISTILLED_V1_LIVE_RSS_PROOF==='true')('bounded real RSS connector to grounded edition on local D1/R2',()=>proof(true),45000);
it.runIf(process.env.DISTILLED_V1_LIVE_RSS_OPENROUTER_PROOF==='true')('bounded real RSS to actual OpenRouter briefing and grounded citations on local D1/R2',()=>proof(true,true),120000);
it.runIf(process.env.DISTILLED_V1_SAVED_ARTICLE_PROBE==='true')('checks saved real article pages with the existing HTTP extractor',async()=>{
 const path=new URL('../../../../.local-reports/live-bbc-openrouter.json',import.meta.url),report=JSON.parse(readFileSync(path,'utf8'));
 const {WorkerPublicSourceFetch}=await import('../public-source-fetch');
 const {parseStructuredHtmlArticle}=await import('@distilled/agent-runtime/public-source-stages');
 const results=[];
 for(const source of report.sources.slice(0,2)) {
  try {
   const response=await new WorkerPublicSourceFetch(source.url).get(source.url),article=parseStructuredHtmlArticle(response.body,response.url,source.url);
   results.push({url:source.url,status:response.status,htmlCharacters:response.body.length,fullArticleExtracted:Boolean(article),articleCharacters:article?.text?.length,canonicalUrl:article?.canonicalItemUrl});
  } catch(error) {results.push({url:source.url,fullArticleExtracted:false,failure:error instanceof Error?error.name:'UNKNOWN'})}
 }
 report.articlePageProbe=results;writeFileSync(path,JSON.stringify(report,null,2));
 expect(results).toHaveLength(2);console.info('REAL_ARTICLE_PAGE_PROBE',JSON.stringify(results));
},45000);
