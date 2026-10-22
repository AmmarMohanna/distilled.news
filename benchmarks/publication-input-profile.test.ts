import {it,expect,vi} from 'vitest';
import {DatabaseSync,type SQLInputValue} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {V1FeedStore,FeedTransaction} from '../apps/worker/src/v1-intelligence/store';
import * as currentPublication from '../apps/worker/src/v1-intelligence/publication';
// Benchmark-only Vite alias loads the exact committed function, never production.
// @ts-expect-error benchmark-only trusted virtual module
import {profileSelectionInput as beforeInput} from 'virtual:baseline-publication';

// Same immutable local history, serial alternating pairs, no remote access or
// artificial provider/network delay. Measures only the two replaced input reads.
it.skipIf(!process.env.PUBLICATION_PROFILE_DB)('compares publication identity reads with complete retained-input equality',async()=>{
 vi.stubGlobal('fetch',()=>{throw Error('BENCHMARK_NETWORK_FORBIDDEN')});
 const sqlite=new DatabaseSync(process.env.PUBLICATION_PROFILE_DB!,{readOnly:true});sqlite.exec('PRAGMA query_only=ON');
 let queries=0,bindingCalls=0,sqlMs=0,payloadBytes=0,payloadByTable:Record<string,number>={};
 class Statement {
  constructor(readonly sql:string,readonly args:SQLInputValue[]=[]){if(!/^\s*SELECT\b/i.test(sql))throw Error('BENCHMARK_WRITE_FORBIDDEN')}
  bind(...args:SQLInputValue[]){return new Statement(this.sql,args)}
  rows(){const start=performance.now(),rows=sqlite.prepare(this.sql).all(...this.args);sqlMs+=performance.now()-start;queries++;const bytes=Buffer.byteLength(JSON.stringify(rows));payloadBytes+=bytes;const table=this.sql.match(/\bFROM\s+(\w+)/i)?.[1]??'other',kind=table==='v1_feed_documents'?this.args.find(a=>['shortlists','editorial_plans','memberships','ledger_entries','editions','events','event_versions','propositions','state_slots','entities','event_semantic_states','storyline_versions'].includes(String(a))):undefined,label=table+(kind?':'+kind:'');payloadByTable[label]=(payloadByTable[label]??0)+bytes;return rows}
  async all(){bindingCalls++;return this.batchAll()}
  async batchAll(){return {success:true,results:this.rows(),meta:{changes:0}}}
  async first(){bindingCalls++;return this.rows()[0]??null}
 }
 try{
  const feedId=process.env.PUBLICATION_PROFILE_FEED!;if(!feedId)throw Error('OWNED_FEED_REQUIRED');
  const db={prepare:(sql:string)=>new Statement(sql),batch:(ss:Statement[])=>{bindingCalls++;return Promise.all(ss.map(s=>s.batchAll()))}} as unknown as D1Database;
  const store=new V1FeedStore(db),snapshot=await store.snapshot(feedId);
  const ledger=await store.list<any>(feedId,'ledger_entries'),ids=[...new Set<string>(ledger.flatMap(e=>e.evidenceRevisionIds??[]))];
  expect(ids.length).toBeGreaterThan(0);
  const samples:any[]=[];
  for(let round=0;round<6;round++)for(const variant of round%2?['after','before']:['before','after']){
   const tx=new FeedTransaction(store,snapshot);queries=0;bindingCalls=0;sqlMs=0;payloadBytes=0;
   const start=performance.now(),cpu=process.cpuUsage();let active:Set<string>,history:Map<string,string|undefined>;
   if(variant==='before'){
    active=new Set((await store.currentEvidence(feedId)).map(e=>e.revision.id));
    await tx.preloadRevisions(ids);
    history=new Map(await Promise.all(ids.map(async id=>[id,(await tx.revision(id))?.evidenceId] as const)));
   }else{
    active=await store.activeEvidenceRevisionIds(feedId);history=await store.revisionEvidenceIds(feedId,ids);
   }
   const usage=process.cpuUsage(cpu),wallMs=performance.now()-start;
   const fingerprint=createHash('sha256').update(JSON.stringify({active:[...active].sort(),history:ids.map(id=>[id,history.get(id)]).sort()})).digest('hex');
   samples.push({round,variant,warmup:round===0,wallMs,cpuMs:(usage.user+usage.system)/1000,sqlMs,queries,bindingCalls,payloadBytes,fingerprint,activeIds:active.size,historyIds:ids.length});
  }
  expect(new Set(samples.map(s=>s.fingerprint)).size).toBe(1);
  const fullInput:any[]=[],selectionId=process.env.PUBLICATION_PROFILE_SELECTION;
  if(selectionId){
   const selection=await store.read<any>(feedId,'selections',selectionId);expect(selection).toBeDefined();
   for(let round=0;round<11;round++)for(const variant of round%2?['after','before']:['before','after']){
    const tx=new FeedTransaction(store,snapshot);queries=0;bindingCalls=0;sqlMs=0;payloadBytes=0;payloadByTable={};
    const start=performance.now(),cpu=process.cpuUsage();
    const result=await (variant==='before'?beforeInput:Reflect.get(currentPublication,'profileSelectionInput'))(tx,selection);
    const usage=process.cpuUsage(cpu),wallMs=performance.now()-start;
    fullInput.push({round,variant,warmup:round===0,wallMs,cpuMs:(usage.user+usage.system)/1000,sqlMs,queries,bindingCalls,payloadBytes,payloadByTable,fingerprint:createHash('sha256').update(JSON.stringify(result)).digest('hex'),stories:result.stories.length,stagedWrites:tx.writes.size});
   }
   expect(new Set(fullInput.map(s=>s.fingerprint)).size).toBe(1);
  }
  const report={scope:'Two replaced input reads and optional full selection input load; not complete publication, D1 network or provider latency',environment:'local-readonly-node-sqlite',baseline:'2e46fa9 input-read algorithm; full input uses exact git function',providerCalls:0,remoteChanges:0,samples,fullInput};
  if(process.env.PUBLICATION_PROFILE_OUTPUT)writeFileSync(process.env.PUBLICATION_PROFILE_OUTPUT,JSON.stringify(report,null,2),{flag:'wx'});
  console.info(JSON.stringify(report));
 }finally{sqlite.close();vi.unstubAllGlobals()}
},120000);
