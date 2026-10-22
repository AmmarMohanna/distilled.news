import {it,expect,vi} from 'vitest';
import {createHash} from 'node:crypto';
import {Session} from 'node:inspector';
import {DatabaseSync,type SQLInputValue} from 'node:sqlite';
import {writeFileSync} from 'node:fs';
import {V1FeedStore,FeedTransaction} from '../apps/worker/src/v1-intelligence/store';
import {shortlistInTransaction} from '../apps/worker/src/v1-intelligence/shortlist';
import * as editorialModule from '../apps/worker/src/v1-intelligence/editorial';
import type {PublicationWindow} from '../apps/worker/src/v1-intelligence/scoring';

// Explicit opt-in benchmark, outside the normal Worker test discovery. No model,
// network or canonical commit is available through this read-only adapter.
it.skipIf(!process.env.V1_RETAINED_PROFILE_DB)('replays retained deterministic shortlist inputs without provider calls',async()=>{
 const path=process.env.V1_RETAINED_PROFILE_DB!,feedId=process.env.V1_RETAINED_PROFILE_FEED!,requestId=process.env.V1_RETAINED_PROFILE_REQUEST!;
 if(!feedId||!requestId)throw Error('PROFILE_FEED_AND_REQUEST_REQUIRED');
 const activeBaseline=Reflect.get(editorialModule,'RETAINED_PROFILE_BASELINE_REF');
 expect(activeBaseline).toBe(process.env.V1_RETAINED_PROFILE_BASELINE_REF);
 vi.stubGlobal('fetch',()=>{throw Error('PROFILE_NETWORK_DENIED')});
 const sqlite=new DatabaseSync(path,{readOnly:true});sqlite.exec('PRAGMA query_only=ON');
 const session=new Session(),capture=process.env.V1_RETAINED_CPU_PROFILE;let queries=0,sqlMs=0;
 const post=(method:'Profiler.enable'|'Profiler.start'|'Profiler.stop')=>new Promise<any>((resolve,reject)=>session.post(method,(error,data)=>error?reject(error):resolve(data)));
 class Statement {
  constructor(readonly sql:string,readonly args:SQLInputValue[]=[]){if(!/^\s*SELECT\b/i.test(sql))throw Error('PROFILE_SQL_WRITE_DENIED')}
  bind(...args:SQLInputValue[]){return new Statement(this.sql,args)}
  rows(){const started=performance.now(),rows=sqlite.prepare(this.sql).all(...this.args);queries++;sqlMs+=performance.now()-started;return rows}
  async all(){return {success:true,results:this.rows(),meta:{changes:0}}}
  async first(column?:string){const row=this.rows()[0];return row?(column?row[column]:row):null}
 }
 const db={prepare:(sql:string)=>new Statement(sql),batch:(statements:Statement[])=>Promise.all(statements.map(s=>s.all()))} as unknown as ConstructorParameters<typeof V1FeedStore>[0];
 try{
  const row=sqlite.prepare("SELECT json_extract(json,'$.window') window FROM v1_feed_documents WHERE kind='briefing_requests' AND id=? AND feed_id=?").get(requestId,feedId);
  if(!row||typeof row.window!=='string')throw Error('PROFILE_OWNED_WINDOW_NOT_FOUND');
  const window=JSON.parse(row.window) as PublicationWindow,now=process.env.V1_RETAINED_PROFILE_NOW??window.end;
  const store=new V1FeedStore(db),tx=new FeedTransaction(store,await store.snapshot(feedId));
  // Drain the runner's start notification before CPU-bound sampling. This delay
  // is outside the measured region and performs no product/provider operation.
  await new Promise(resolve=>setTimeout(resolve,100));
  if(capture){session.connect();await post('Profiler.enable');await post('Profiler.start')}
  const started=performance.now(),cpu=process.cpuUsage();
  const result=await shortlistInTransaction(tx,window,now,undefined,{collectOnly:true}),usage=process.cpuUsage(cpu),durationMs=performance.now()-started;
  if(capture){const data=await post('Profiler.stop');writeFileSync(capture,JSON.stringify(data.profile),{flag:'wx'})}
  const fingerprint=createHash('sha256').update(JSON.stringify(result)).digest('hex');
  if(process.env.V1_RETAINED_PROFILE_EXPECTED_SHA256)expect(fingerprint).toBe(process.env.V1_RETAINED_PROFILE_EXPECTED_SHA256);
  console.info(JSON.stringify({type:'RETAINED_SHORTLIST_PROFILE',environment:'local-readonly-sqlite-binding',baselineRef:activeBaseline,durationMs,cpuMs:(usage.user+usage.system)/1000,semanticFingerprint:fingerprint,candidates:result.candidates.length,facts:result.candidates.reduce((n,c)=>n+c.facts.length,0),unresolvedTargets:result.unresolvedTargets?.length??0,stagedWrites:tx.writes.size,queries,sqlMs,metrics:tx.metrics,providerCalls:0,remoteChanges:0}));
 }finally{if(capture)session.disconnect();sqlite.close();vi.unstubAllGlobals()}
},180000);
