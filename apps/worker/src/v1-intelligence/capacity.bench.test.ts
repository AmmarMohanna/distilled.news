import {it,expect} from 'vitest';
import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync,statfsSync,readFileSync} from 'node:fs';
import {createIntakeDatabase,scopeFixture} from '../v1-intake/test-utils';
import {V1FeedStore} from './store';
import {feedFixture} from './test-utils';
import {prepareV3Window} from './v3-window';
import {processV1Briefing,windowIdentity} from './runtime';
import {publicV1Edition} from './public-read';
import {dispatchConnectorFeeds} from '../connector-scheduling';
import {sha256} from '@distilled/contracts';
import type {Env} from '../types';

// Explicit opt-in: this is a synthetic local capacity experiment, not ordinary CI or editorial evaluation.
it.runIf(process.env.RUN_V3_CAPACITY==='1')('measures thousand-feed database work and bounded durable publication',async()=>{
 const count=Number(process.env.V3_CAPACITY_FEEDS??1000);if(!Number.isSafeInteger(count)||count<12||count>1000)throw Error('INVALID_CAPACITY_FEED_COUNT');
 const disk=statfsSync('.');if(disk.bavail*disk.bsize<2*1024**3)throw Error('INSUFFICIENT_LOCAL_BENCHMARK_DISK');
 const dir=new URL('../../../../.local-reports/v3-capacity/',import.meta.url);mkdirSync(dir,{recursive:true});
 const report:any={scope:'Synthetic local Miniflare, actual SQL/schema and application paths; no Cloudflare load, paid inference or notifications. Not a production throughput or semantic-quality qualification.',feeds:count,startedAt:new Date().toISOString(),stages:[],provider:{maxConcurrent:6,requestsPerMinute:20},failures:[]};
 const save=()=>writeFileSync(new URL(`capacity-${count}.json`,dir),JSON.stringify(report,null,2));save();
 const ctx=await createIntakeDatabase({product:true});let phase='seed';
 type Metric={queries:number;rowsRead:number;rowsWritten:number;returnedBytes:number;sqlDurationMs:number;wallMs:number;errors:number};
 const metrics=new Map<string,Metric>();const originals=new WeakMap<object,D1PreparedStatement>();
 const timed=async<T>(sql:string,run:()=>Promise<T>)=>{const key=phase+':'+sql.replace(/\s+/g,' ').slice(0,240),m=metrics.get(key)??{queries:0,rowsRead:0,rowsWritten:0,returnedBytes:0,sqlDurationMs:0,wallMs:0,errors:0};metrics.set(key,m);m.queries++;const start=performance.now();try{const r:any=await run();for(const item of Array.isArray(r)?r:[r]){m.rowsRead+=item?.meta?.rows_read??0;m.rowsWritten+=item?.meta?.rows_written??0;m.sqlDurationMs+=item?.meta?.duration??0;m.returnedBytes+=Buffer.byteLength(JSON.stringify(item?.results??null));}return r;}catch(e){m.errors++;throw e;}finally{m.wallMs+=performance.now()-start;}};
 const wrap=(s:D1PreparedStatement,sql:string):D1PreparedStatement=>{const proxy=new Proxy(s,{get(t,k){if(k==='bind')return (...args:any[])=>wrap(t.bind(...args),sql);if(k==='first')return async(column?:string)=>{const r=await timed(sql,()=>t.all());const row=r.results[0];if(!row)return null;if(column===undefined)return row;if(!(column in row))throw Error('D1_COLUMN_NOTFOUND');return row[column];};if(k==='all'||k==='run')return ()=>timed(sql,()=>t[k]());const v=Reflect.get(t,k);return typeof v==='function'?v.bind(t):v;}});originals.set(proxy,s);return proxy;};
 const db=new Proxy(ctx.db,{get(t,k){if(k==='prepare')return (sql:string)=>wrap(t.prepare(sql),sql);if(k==='batch')return (ss:D1PreparedStatement[])=>timed('BATCH '+ss.length,()=>t.batch(ss.map(s=>originals.get(s)??s)));const v=Reflect.get(t,k);return typeof v==='function'?v.bind(t):v;}});
 const window={start:'2026-10-28T12:00:00.000Z',end:'2026-10-28T12:30:00.000Z',kind:'30M' as const};
 const now='2026-10-28T12:34:00.000Z',oldAt='2026-08-01T12:30:00.000Z';
 const body='Synthetic capacity fixture. Parliament approved banking reform legislation; presidential approval is still required. '+ 'Supporting source-grounded background. '.repeat(210);
 const hash=await sha256(body);const fixtures=Array.from({length:count},(_,i)=>({id:`capacity-feed-${String(i).padStart(4,'0')}`,scope:`capacity-source-${String(i).padStart(4,'0')}`,history:[0,96,480][i%3],articles:i%5===0?0:i%5===4?20:3}));
 try{
 await ctx.db.prepare("INSERT INTO accounts(id,email,normalized_email,username,role,password_hash,email_verified_at,created_at,updated_at) VALUES('capacity-owner','capacity@example.invalid','capacity@example.invalid','capacity','user','synthetic','2026-08-01','2026-08-01','2026-08-01')").run();
 await ctx.db.exec('CREATE TABLE capacity_fixture_feeds(id TEXT PRIMARY KEY,history INTEGER); CREATE TABLE capacity_fixture_numbers(n INTEGER PRIMARY KEY);');
 await ctx.db.prepare('INSERT INTO capacity_fixture_numbers WITH RECURSIVE numbers(n) AS (SELECT 0 UNION ALL SELECT n+1 FROM numbers WHERE n<479) SELECT n FROM numbers').run();
 let statements:D1PreparedStatement[]=[];const flush=async()=>{if(statements.length){await ctx.db.batch(statements);statements=[];}};
 for(const f of fixtures){const feed={...feedFixture,id:f.id,ownerId:'capacity-owner',createdAt:'2026-08-01T00:00:00.000Z',updatedAt:now,briefingFrequency:'30M',briefingSchedule:{durationMinutes:30,timezone:'Asia/Beirut',originAt:'2026-08-01T00:00:00.000Z'}};
 statements.push(ctx.db.prepare('INSERT INTO briefings(id,owner_account_id,slug,title,interest_profile,public_feed_enabled,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').bind(f.id,'capacity-owner',f.id,'Synthetic capacity fixture','banking reform',1,feed.createdAt,now),ctx.db.prepare('INSERT INTO v1_feeds(id,json) VALUES(?,?)').bind(f.id,JSON.stringify(feed)),ctx.db.prepare('INSERT INTO v1_intake_scopes(id,feed_id,source_id,json) VALUES(?,?,?,?)').bind(f.scope,f.id,f.scope,JSON.stringify({...scopeFixture,feedId:f.id,feedSourceId:f.scope,sourceId:f.scope})),ctx.db.prepare('INSERT INTO connector_feed_schedule(feed_id) VALUES(?)').bind(f.id),ctx.db.prepare('INSERT INTO capacity_fixture_feeds VALUES(?,?)').bind(f.id,f.history));
 for(let a=-1;a<f.articles;a++){const id=f.id+':revision:'+a,observation=id+':observation',evidence=id+':evidence';const revision={id,evidenceId:evidence,feedId:f.id,revision:1,sourceObservationId:observation,acquiredContentId:id+':content',representation:'ARTICLE_EXCERPT',contentCompleteness:'COMPLETE',title:'Banking reform '+a,body,contentHash:hash,fetchStartSequence:1,acceptedAt:a<0?oldAt:'2026-10-28T12:10:00.000Z',publishedAt:a<0?oldAt:'2026-10-28T12:05:00.000Z',canonicalUrl:'https://example.invalid/'+id};
 statements.push(ctx.db.prepare('INSERT INTO v1_revisions(id,feed_source_id,json) VALUES(?,?,?)').bind(id,f.scope,JSON.stringify(revision)),ctx.db.prepare('INSERT INTO v1_inputs(id,feed_source_id,json) VALUES(?,?,?)').bind(observation,f.scope,JSON.stringify({observation:{id:observation,feedId:f.id,publisherId:f.scope,sourceId:f.scope,observedAt:revision.acceptedAt}})));
 if(a>=0)statements.push(ctx.db.prepare('INSERT INTO v1_evidence(id,feed_source_id,item_key,json) VALUES(?,?,?,?)').bind(evidence,f.scope,id,JSON.stringify({id:evidence,feedId:f.id,feedSourceId:f.scope,sourceId:f.scope,sourceItemKey:id,state:'ACTIVE',currentRevisionId:id,currentObservationId:observation,currentFetchStartSequence:1,firstSeenAt:revision.acceptedAt,updatedAt:revision.acceptedAt})));
 if(statements.length>=60)await flush();}
 await flush();}
 // Raw fixture insertion deliberately avoids measuring acquisition or inventing real source evidence.
 for(const kind of ['editions','publication_status','briefing_requests','v3_window_results']){
 const values:Record<string,string>={editions:"json_object('id',f.id||':past:'||n.n,'createdAt',?,'windowEnd',?,'evidenceRevisionIds',json_array(f.id||':revision:-1'),'stories',json_array(json_object('candidateId','old','claims',json_array(json_object('text','Older synthetic reporting. '||substr(printf('%01024d',0),1,1024))))))",publication_status:"json_object('id',f.id||':past:'||n.n,'status','PUBLISHED')",briefing_requests:"json_object('id',f.id||':past:'||n.n,'state','DONE','result','PUBLISHED','window',json_object('start',?,'end',?,'kind','30M'))",v3_window_results:"json_object('id',f.id||':past:'||n.n,'windowEnd',?,'result',json_object('items',json_array(),'skipped',json_array(),'omitted',json_array(),'dropped',json_array()))"};
 const args=kind==='editions'||kind==='briefing_requests'?[oldAt,oldAt]:kind==='v3_window_results'?[oldAt]:[];
 await ctx.db.prepare(`INSERT INTO v1_feed_documents(kind,id,feed_id,json) SELECT ?,f.id||':past:'||n.n,f.id,${values[kind]} FROM capacity_fixture_feeds f CROSS JOIN capacity_fixture_numbers n WHERE n.n<f.history`).bind(kind,...args).run();}
 report.fixture={articles:fixtures.reduce((n,f)=>n+f.articles,0),historyEditions:fixtures.reduce((n,f)=>n+f.history,0),articleChars:body.length,seededRows:(await ctx.db.prepare('SELECT COUNT(*) n FROM v1_feed_documents').first<{n:number}>())!.n};save();
 phase='dispatch';const delivered:string[]=[];const queue={sendBatch:async(messages:any[])=>{for(const m of messages)delivered.push(m.body.feedId)},send:async()=>{throw Error('UNEXPECTED_QUEUE_SEND')}};
 const dispatchEnv={DB:db,SOURCE_QUEUE_SCHEDULING_ENABLED:'true',SOURCE_CONNECTORS_ENABLED:'true',V1_DOWNSTREAM_ENABLED:'true',SOURCE_COLLECTION_QUEUE:queue,V1_PROCESSING_QUEUE:queue,V1_ACQUISITION_QUEUE:queue} as unknown as Env;
 const rounds=[];for(let round=0;round<Math.ceil(count/100);round++){const at=performance.now(),n=await dispatchConnectorFeeds(dispatchEnv,Date.parse(now));rounds.push({round,sent:n,ms:performance.now()-at});}
 expect(new Set(delivered).size).toBe(count);expect(delivered).toHaveLength(count);expect(await dispatchConnectorFeeds(dispatchEnv,Date.parse(now))).toBe(0);
 report.dispatch={rounds,unique:new Set(delivered).size,note:'Real bounded dispatcher with controlled queue send; downstream collection/relay not run. All dispatch calls use the same instant to isolate one due cohort without expiring delivery leases. Real cron drain time is modeled separately; consumers are not simulated.'};save();
 const preparation:any[]=[];const store=new V1FeedStore(db);
 for(const f of fixtures){phase=`prepare:history=${f.history}:articles=${f.articles}`;const at=performance.now();const prepared=await prepareV3Window(store,f.id,window,now);expect(prepared.input.articles).toHaveLength(f.articles);expect(prepared.evidenceRevisionIds.every(id=>id.startsWith(f.id+':revision:'))).toBe(true);expect(prepared.input.prior).toHaveLength(0);preparation.push({feed:f.id,history:f.history,articles:f.articles,ms:performance.now()-at});if(preparation.length%50===0){report.preparationProgress=preparation.length;save();}}
 report.preparation=preparation;save();
 // Bound actual full-pipeline trials; keep production default 20 RPM and observe admission waits.
 phase='publication';let calls=0;const publication:any[]=[];const selected=fixtures.slice(0,Math.min(24,count));
 const fetcher=(async(_url:any,init:any)=>{calls++;const request=JSON.parse(init.body);const verify=request.messages[0].content.includes('meticulous fact-checker');const content=verify?{results:[{i:0,verdict:'ok',issues:[]}]}:{items:[{headline:'Banking reform approved',body:'Parliament approved banking reform legislation; presidential approval is still required.',sources:['S1'],relation:'new',importance:1}]};return Response.json({id:'gen-capacity-'+calls,choices:[{message:{content:JSON.stringify(content)},finish_reason:'stop'}],usage:{prompt_tokens:100,completion_tokens:50,cost:0}})}) as typeof fetch;
 for(const f of selected){const env={DB:db,V1_DOWNSTREAM_ENABLED:'true',V1_DOWNSTREAM_FEED_SOURCE_IDS:f.scope,BRIEFING_ENGINE:'v3',BRIEFING_EDITOR_MODEL:'openai/gpt-4.1',BRIEFING_VERIFIER_MODEL:'openai/gpt-4.1-mini',V1_PROVIDER_MAX_CONCURRENCY:'6',OPENROUTER_API_KEY:'test-only-no-network'} as Env;const at=performance.now(),before=calls;try{const edition=await processV1Briefing(env,{type:'v1_briefing',feedId:f.id,window},()=>now,undefined,fetcher);const state=await store.read<any>(f.id,'briefing_requests',await windowIdentity(f.id,window));if(edition){const read=await publicV1Edition(db,edition.id);expect(read?.id).toBe(edition.id);const replay=await processV1Briefing(env,{type:'v1_briefing',feedId:f.id,window},()=>now,undefined,fetcher);expect(replay?.id).toBe(edition.id);expect(calls-before).toBe(2);}if(!f.articles)expect(calls-before).toBe(0);publication.push({feed:f.id,articles:f.articles,ms:performance.now()-at,calls:calls-before,persisted:Boolean(edition),state:state?.state,result:state?.result,reason:state?.reason});}catch(e){report.failures.push({stage:phase,feed:f.id,error:String(e)});}report.publication=publication;report.mockCalls=calls;save();}
 report.finishedAt=new Date().toISOString();report.metrics=[...metrics].filter(([key])=>!key.startsWith('seed:')).map(([query,value])=>({query,...value}));assertCapacityOutcomes(publication,selected,calls);report.publicationOutcomesVerified=true;report.providerRateLimitReached=calls===20;report.actualPaidCalls=0;report.actualCostUsd=0;report.readme='Model tokens/cost and zero latency are synthetic response fields, NOT model performance estimates. Only 24 or fewer feeds exercise full publication; all feeds exercise preparation and dispatcher. Fixture history shares one historical revision per feed, so historical identity diversity and large carry payloads are underrepresented. No real collection, cloud queues, signed-in HTTP users or fresh acquisition-to-publication measurement.';save();expect(calls).toBeLessThanOrEqual(20);expect(report.failures).toEqual([]);
 }finally{await ctx.dispose()}
},1800000);

// A deferred or empty run must never be reported as successful publication or proven rate limiting.
it('requires positive publication and terminal quiet outcomes, rejecting false success',()=>{
 const published={articles:3,calls:2,persisted:true,state:'DONE',result:'PUBLISHED'};
 const quiet={articles:0,calls:0,persisted:false,state:'DONE',result:'QUIET'};
 expect(()=>assertCapacityOutcomes([published,quiet],[{articles:3},{articles:0}],2)).not.toThrow();
 expect(()=>assertCapacityOutcomes([{...published,calls:0,persisted:false,state:'PENDING',result:undefined}],[{articles:3}],0)).toThrow();
 expect(()=>assertCapacityOutcomes([{...quiet,state:'PENDING',result:undefined}],[{articles:0}],0)).toThrow();
 const saturated=Array.from({length:11},(_,i)=>i<10?published:{articles:3,calls:0,persisted:false,state:'PENDING',reason:'PROVIDER_RESOURCE_WAIT'});
 expect(()=>assertCapacityOutcomes(saturated,Array.from({length:11},()=>({articles:3})),20)).not.toThrow();
 expect(()=>assertCapacityOutcomes(saturated.map((p,i)=>i<10?p:{...p,reason:'UNKNOWN'}),Array.from({length:11},()=>({articles:3})),20)).toThrow();
});

it.runIf(process.env.V3_CAPACITY_REPLAY==='1')('validates exact retained capacity outcomes without rerunning inference or seeding',()=>{
 const dir=new URL('../../../../.local-reports/v3-capacity/',import.meta.url),validated=[];
 for(const n of [12,1000]){const raw=readFileSync(new URL('capacity-'+n+'.json',dir),'utf8'),j=JSON.parse(raw);expect(j.feeds).toBe(n);expect(j.preparation).toHaveLength(n);expect(j.dispatch.unique).toBe(n);expect(j.failures).toEqual([]);expect(j.actualPaidCalls).toBe(0);
 const selected=Array.from({length:Math.min(24,n)},(_,i)=>({articles:i%5===0?0:i%5===4?20:3}));assertCapacityOutcomes(j.publication,selected,j.mockCalls);
 validated.push({feeds:n,sha256:createHash('sha256').update(raw).digest('hex'),publications:j.publication.filter((p:any)=>p.persisted).length,quiet:j.publication.filter((p:any)=>p.result==='QUIET').length,backpressure:j.publication.filter((p:any)=>p.reason==='PROVIDER_RESOURCE_WAIT').length,mockCalls:j.mockCalls});}
 writeFileSync(new URL('validated-outcomes.json',dir),JSON.stringify({at:new Date().toISOString(),validated},null,2));
});

function assertCapacityOutcomes(publication:any[],selected:{articles:number}[],calls:number){
 const nonempty=selected.filter(f=>f.articles>0).length,expectedPublished=Math.min(nonempty,10),expectedQuiet=selected.length-nonempty;
 expect(publication).toHaveLength(selected.length);expect(calls).toBe(expectedPublished*2);expect(publication.filter(p=>p.persisted)).toHaveLength(expectedPublished);
 expect(publication.filter(p=>!p.articles)).toHaveLength(expectedQuiet);
 for(const p of publication){if(p.persisted){expect(p).toMatchObject({state:'DONE',result:'PUBLISHED',calls:2});expect(p.articles).toBeGreaterThan(0);}else if(!p.articles)expect(p).toMatchObject({state:'DONE',result:'QUIET',calls:0});else expect(p).toMatchObject({state:'PENDING',reason:'PROVIDER_RESOURCE_WAIT',calls:0});}
}
