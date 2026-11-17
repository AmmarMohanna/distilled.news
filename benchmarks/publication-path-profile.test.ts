import {it,expect,vi} from 'vitest';
import {writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createIntakeDatabase,seedIntakeScope,testPolicy} from '../apps/worker/src/v1-intake/test-utils';
import {V1IntakeStore} from '../apps/worker/src/v1-intake/store';
import {V1FeedStore,type FeedTransaction} from '../apps/worker/src/v1-intelligence/store';
import {feedFixture,seedIntelligence} from '../apps/worker/src/v1-intelligence/test-utils';
import {scoreAndSelect,DEFAULT_BRIEFING_BUDGET} from '../apps/worker/src/v1-intelligence/scoring';
import {publishSelection,type BriefingModelPort} from '../apps/worker/src/v1-intelligence/publication';
import {withIntelligenceTurn} from '../apps/worker/src/connector-intelligence-turn';
import {withLatency} from '../apps/worker/src/v1-intelligence/latency';
const window={start:'2026-10-03T00:00:00Z',end:'2026-10-04T00:00:00Z',kind:'DAILY' as const};
it.skipIf(!process.env.PUBLICATION_PATH_OUTPUT)('measures local serialized publication, repeated reads and a fenced CAS retry with zero inference',async()=>{
 const rows:any[]=[];
 for(const conflict of [false,true]){
  const ctx=await createIntakeDatabase({product:true});const records:any[]=[],log=vi.spyOn(console,'info').mockImplementation((raw)=>{try{records.push(JSON.parse(String(raw)));}catch{}});
  try{
   await ctx.db.exec("INSERT INTO accounts(id,email,normalized_email,username,role,password_hash,email_verified_at,created_at,updated_at) VALUES('owner-1','profile@example.invalid','profile@example.invalid','profile-owner','user','hash','2026-10-03','2026-10-03','2026-10-03'); INSERT INTO briefings(id,owner_account_id,slug,title,interest_profile,public_feed_enabled,created_at,updated_at) VALUES('feed-1','owner-1','profile','Profile','news',1,'2026-10-03','2026-10-03');");
   await seedIntakeScope(new V1IntakeStore(ctx.db));const seedStore=new V1FeedStore(ctx.db);await seedStore.registerFeed(feedFixture);await seedIntelligence(seedStore);
   const selected=await scoreAndSelect(seedStore,'feed-1',window,DEFAULT_BRIEFING_BUDGET,testPolicy.now());
   const queries=new Map<string,any>();let bindings=0,sqlMs=0,payloadBytes=0;
   const record=(sql:string,start:number,value:any)=>{const key=createHash('sha256').update(sql).digest('hex'),q=queries.get(key)??{sqlHash:key,verb:sql.trim().split(/\s/)[0],calls:0,wallMs:0,rowBytes:0,reportedSqlMs:0};q.calls++;q.wallMs+=performance.now()-start;const bytes=Buffer.byteLength(JSON.stringify(value?.results??value??null));q.rowBytes+=bytes;payloadBytes+=bytes;const cpu=value?.meta?.timings?.sql_duration_ms??0;q.reportedSqlMs+=cpu;sqlMs+=cpu;queries.set(key,q);};
   const statement=(sql:string,s:any):any=>({bind:(...args:any[])=>statement(sql,s.bind(...args)),all:async()=>{bindings++;const start=performance.now(),r=await s.all();record(sql,start,r);return r;},first:async(column?:string)=>{bindings++;const start=performance.now(),r=await s.all();record(sql,start,r);const row=r.results[0]??null;return column?row?.[column]??null:row;},run:async()=>{bindings++;const start=performance.now(),r=await s.run();record(sql,start,r);return r;},_raw:s,_sql:sql});
   const db={prepare:(sql:string)=>statement(sql,ctx.db.prepare(sql)),batch:async(ss:any[])=>{bindings++;const start=performance.now(),rs=await ctx.db.batch(ss.map(s=>s._raw));for(let i=0;i<rs.length;i++)record(ss[i]._sql,start,rs[i]);return rs;}} as unknown as D1Database;
   let injected=false;
   class ProfileStore extends V1FeedStore{override async commit(tx:FeedTransaction){if(conflict&&!injected&&tx.writes.size){injected=true;await ctx.db.prepare('UPDATE v1_feeds SET epoch=epoch+1 WHERE id=?').bind(feedFixture.id).run();}return super.commit(tx);}}
   const store=new ProfileStore(db);let calls=0;
   const model:BriefingModelPort={model:'controlled-profile',provider:'SYNTHETIC',maxCallCostUsd:.01,synthesize:async input=>{calls++;return {draft:{language:'en',stories:input.stories.map(s=>({candidateId:s.candidate.id,claims:[{text:s.evidence[0].body!,support:[{evidenceRevisionId:s.evidence[0].id,quote:s.evidence[0].body!}]}]}))},usage:{tokensIn:10,tokensOut:10,cost:.001,confirmed:true}};},verify:async claims=>{calls++;return {supportedClaimIds:claims.map(c=>c.id),preservedFactIds:claims.flatMap(c=>(c.requiredFacts??[]).map(f=>f.id)),usage:{tokensIn:10,tokensOut:10,cost:.001,confirmed:true}};}};
   const start=performance.now();
   const edition=await withLatency({feedId:feedFixture.id,phase:'PUBLICATION'},()=>withIntelligenceTurn({DB:db,SOURCE_QUEUE_SCHEDULING_ENABLED:'true'} as any,{type:'v1_briefing',feedId:feedFixture.id,window},()=>publishSelection(store,feedFixture.id,selected.id,{now:testPolicy.now,model})));
   const wallMs=performance.now()-start;expect(edition.stories).toHaveLength(1);expect(calls).toBe(2);expect(injected).toBe(conflict);
   const publicationStats={bindings,payloadBytes,reportedLocalSqlMs:sqlMs||null,queryShapes:[...queries.values()].map(q=>({...q})).sort((a,b)=>b.wallMs-a.wallMs)};
   const afterCalls=calls,again=await publishSelection(store,feedFixture.id,selected.id,{now:testPolicy.now,model});expect(again).toEqual(edition);expect(calls).toBe(afterCalls);
   rows.push({variant:process.env.VALIDATION_TIMING_BASELINE?'baseline':'current',forcedConflict:conflict,wallMs,...publicationStats,reuseAdditionalBindings:bindings-publicationStats.bindings,controlledPortCalls:calls,actualProviderCalls:0,records:records.filter(r=>r.type==='V1_PIPELINE_LATENCY')});
  }finally{log.mockRestore();await ctx.dispose();}
 }
 writeFileSync(process.env.PUBLICATION_PATH_OUTPUT!,JSON.stringify({scope:'Local one-story publication under a real D1 feed turn; zero-latency synthetic ports; not live D1 or end-to-end observation latency. Batch statement wall times overlap; do not sum.',rows},null,2),{flag:'wx'});
},120000);
