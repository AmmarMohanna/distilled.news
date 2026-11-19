import {expect,it} from 'vitest';
import {stagingMission,stagingMissionRssUrl,stagingMissionScope,stagingMissionVerificationEnabled} from './staging-mission';
it('can qualify the new verifier inside the private operator mission while leaving normal staging routing disabled',()=>{
 const env={BRIEFING_SOURCE_BINDINGS_ENABLED:'false',STAGING_MISSION_SOURCE_BINDINGS_ENABLED:'true'};
 expect(stagingMissionVerificationEnabled(env)).toBe('true');expect(env.BRIEFING_SOURCE_BINDINGS_ENABLED).toBe('false');
 expect(stagingMissionVerificationEnabled({BRIEFING_SOURCE_BINDINGS_ENABLED:'false'})).toBe('false');
 expect(stagingMissionVerificationEnabled({BRIEFING_SOURCE_BINDINGS_ENABLED:'true'})).toBe('true');
});
it('gives a continuation fresh markers and source identity without changing the original feed or attempt',()=>{
 expect(stagingMissionScope('staging-fresh-fixture')).toEqual({prefix:'staging-fresh-fixture:',sourceId:'staging-fresh-fixture-rss'});
 expect(stagingMissionScope('staging-fresh-fixture','reader-v3')).toEqual({prefix:'staging-fresh-fixture:reader-v3:',sourceId:'staging-fresh-fixture-rss-reader-v3'});
 expect(()=>stagingMissionScope('staging-fresh-fixture','../old')).toThrow('INVALID_STAGING_ATTEMPT');
 expect(()=>stagingMissionScope('normal-feed','reader-v3')).toThrow('INVALID_STAGING_ATTEMPT');
});
it('refuses continuation without an explicit new attempt before database access',async()=>{
 const env={STAGING_MISSION_FEED_ID:'staging-fresh-fixture',STAGING_MISSION_TOKEN:'secret',DB:new Proxy({},{get(){throw Error('UNAUTHORIZED_DB_ACCESS')}})} as any;
 const r=await stagingMission(new Request('https://staging.invalid/__staging/mission/continue',{method:'POST',headers:{authorization:'Bearer secret'}}),env);
 expect(r.status).toBe(409);expect(await r.json()).toEqual({error:'FRESH_ATTEMPT_REQUIRED'});
});
it.each([['paid','PAID_PUBLICATION_RESUME_FORBIDDEN'],['repeated','UNPAID_RESUME_ALREADY_STARTED_OR_ORIGINAL_MISSING'],['missing','UNPAID_RESUME_ALREADY_STARTED_OR_ORIGINAL_MISSING'],['closed','FROZEN_UNPAID_REQUEST_REQUIRED']] as const)('refuses a %s publication resume without changing records or sending a provider request',async(state,error)=>{
 const sqls:string[]=[],feed='staging-fresh-fixture',window={start:'2026-11-18T12:00:00Z',end:'2026-11-18T12:01:00Z',kind:'HOURLY'};
 const db={prepare:(sql:string)=>{sqls.push(sql);return {bind:(...p:unknown[])=>({all:async()=>{
  let results:unknown[]=[];
  if(sql.includes('SELECT public_feed_enabled'))results=[{public_feed_enabled:0}];
  else if(sql.includes('COUNT(*)'))results=[{n:state==='paid'?1:0}];
  else if(sql.startsWith('SELECT feed_id,json'))results=[{feed_id:feed,json:JSON.stringify(p[0]==='briefing_requests'?{state:'DONE',engine:'v3'}:{})}];
  else if(String(p[1]).endsWith(':prepared'))results=[{json:JSON.stringify({start:window.start})}];
  else if(String(p[1]).endsWith(':reviewed'))results=[{json:JSON.stringify({at:window.end})}];
  else if(String(p[1]).endsWith(':publication-start')&&state!=='missing')results=[{json:JSON.stringify({window})}];
  else if(String(p[1]).endsWith(':publication-resume-unpaid-start')&&state==='repeated')results=[{json:'{}'}];
  return {results,meta:{}};
 }})}}};
 const env={DB:db,PROCESSING_QUEUE:{},STAGING_MISSION_FEED_ID:feed,STAGING_MISSION_ATTEMPT_ID:'reader-v3',STAGING_MISSION_TOKEN:'secret'} as any;
 const r=await stagingMission(new Request('https://staging.invalid/__staging/mission/publish-resume-unpaid',{method:'POST',headers:{authorization:'Bearer secret'}}),env);
 expect(r.status).toBe(409);expect(await r.json()).toMatchObject({error});expect(sqls.every(sql=>!/^INSERT|^UPDATE|^DELETE/.test(sql))).toBe(true);
});
it.each([['started',0,'ATTEMPT_ALREADY_STARTED_NO_RESET'],['unpaid',1,'PAID_MISSION_CONTINUATION_FORBIDDEN']] as const)('does not mutate a %s predecessor or replay its paid work',async(state,paid,error)=>{
 const sqls:string[]=[];const db={prepare:(sql:string)=>{sqls.push(sql);return {bind:(...params:unknown[])=>({all:async()=>({results:sql.includes('SELECT public_feed_enabled')?[{public_feed_enabled:0}]:sql.includes('COUNT(*)')?[{n:paid}]:sql.startsWith('SELECT id')?[{id:'original'}]:state==='started'?[{json:'{}'}]:[],meta:{}})})}}};
 const env={DB:db,PROCESSING_QUEUE:{},STAGING_MISSION_FEED_ID:'staging-fresh-fixture',STAGING_MISSION_ATTEMPT_ID:'reader-v3',STAGING_MISSION_TOKEN:'secret'} as any;
 const r=await stagingMission(new Request('https://staging.invalid/__staging/mission/continue',{method:'POST',headers:{authorization:'Bearer secret'}}),env);
 expect(r.status).toBe(409);expect(await r.json()).toMatchObject({error});expect(sqls.every(sql=>!/^INSERT|^UPDATE|^DELETE/.test(sql))).toBe(true);
});
it('lets an authorized fresh mission select a public HTTPS RSS source instead of requiring a blocked publisher',()=>{
 expect(stagingMissionRssUrl({})).toBe('https://techcrunch.com/category/artificial-intelligence/feed');
 expect(stagingMissionRssUrl({STAGING_MISSION_RSS_URL:'https://feeds.bbci.co.uk/news/technology/rss.xml'})).toBe('https://feeds.bbci.co.uk/news/technology/rss.xml');
 expect(()=>stagingMissionRssUrl({STAGING_MISSION_RSS_URL:'http://feeds.example/feed'})).toThrow('INVALID_STAGING_RSS_URL');
 expect(()=>stagingMissionRssUrl({STAGING_MISSION_RSS_URL:'https://user:pass@feeds.example/feed'})).toThrow('INVALID_STAGING_RSS_URL');
});
import {STAGING_GROUPING_RUN_POLICY,STAGING_DISPOSITION_ATTEMPT_ID,STAGING_GROUPING_CALL_LIMITS} from './staging-grouping-run-policy';
it('keeps the staging mission default-off and rejects unauthorized access before any database use',async()=>{
 const deniedDb=new Proxy({},{get(){throw Error('UNAUTHORIZED_DB_ACCESS')}});
 expect((await stagingMission(new Request('https://staging.invalid/__staging/mission/prepare',{method:'POST'}),{} as any)).status).toBe(404);
 const env={DB:deniedDb,STAGING_MISSION_FEED_ID:'staging-fresh-fixture',STAGING_MISSION_TOKEN:'secret'} as any;
 expect((await stagingMission(new Request('https://staging.invalid/__staging/mission/status'),env)).status).toBe(404);
 expect((await stagingMission(new Request('https://staging.invalid/__staging/mission/prepare',{headers:{authorization:'Bearer secret'}}),env)).status).toBe(400);
});
it('activates only the fresh disposition routes and blocks legacy paid actions before DB access',async()=>{
 const env={DB:new Proxy({},{get(){throw Error('UNAUTHORIZED_DB_ACCESS')}}),STAGING_MISSION_FEED_ID:'staging-fresh-fixture',STAGING_MISSION_TOKEN:'secret',STAGING_GROUPING_RUN_POLICY} as any;
 for(const action of ['review','review-contract-v2','publish']){const r=await stagingMission(new Request('https://staging.invalid/__staging/mission/'+action,{method:'POST',headers:{authorization:'Bearer secret'}}),env);expect(await r.json()).toEqual({error:'NEW_ATTEMPT_ACTION_REQUIRED'})}
 expect(STAGING_GROUPING_CALL_LIMITS['openai/gpt-4.1-mini']-15).toBe(5);
});
it('rejects an already-started fresh immutable scope without invoking review',async()=>{
 const feedId='staging-fresh-fixture',db={prepare:(sql:string)=>({bind:(...params:unknown[])=>({all:async()=>({results:sql.includes('SELECT public_feed_enabled')?[{public_feed_enabled:0}]:[{json:JSON.stringify(params[1]===feedId+':prepared'?{start:'2026-10-19T12:00:00Z'}:{attemptId:STAGING_DISPOSITION_ATTEMPT_ID})}],meta:{}})})})};
 const env={DB:db,PROCESSING_QUEUE:{},STAGING_MISSION_FEED_ID:feedId,STAGING_MISSION_TOKEN:'secret',STAGING_GROUPING_RUN_POLICY} as any;
 const r=await stagingMission(new Request('https://staging.invalid/__staging/mission/review-disposition-v1',{method:'POST',headers:{authorization:'Bearer secret'}}),env);expect(r.status).toBe(409);expect(await r.json()).toMatchObject({error:'CONTRACT_REVIEW_ALREADY_STARTED_NO_RETRY'});
});

it('requires the separate new-run activation before any paid rematch access',async()=>{
 const deniedDb=new Proxy({},{get(){throw Error('UNAUTHORIZED_DB_ACCESS')}});
 const env={DB:deniedDb,STAGING_MISSION_FEED_ID:'staging-fresh-fixture',STAGING_MISSION_TOKEN:'secret'} as any;
 const request=new Request('https://staging.invalid/__staging/mission/review-contract-v2',{method:'POST',headers:{authorization:'Bearer secret'}});
 const response=await stagingMission(request,env);expect(response.status).toBe(409);expect(await response.json()).toEqual({error:'NEW_RUN_NOT_ACTIVATED'});
});

it('creates a separate immutable authorized request without resetting old retry history',async()=>{
 const {freshStagingRematch}=await import('./staging-grouping-run-policy');const original={id:'old-request',feedId:'staging-fresh-fixture',jobId:'job',evidenceRevisionId:'revision',createdAt:'2026-10-19T12:00:00Z',policyVersion:'semantic-rematch-continuation-v2'},before=JSON.stringify(original);
 const fresh=await freshStagingRematch(original,STAGING_DISPOSITION_ATTEMPT_ID,'2026-10-19T16:30:00Z');expect(fresh.id).not.toBe(original.id);expect(fresh).toMatchObject({jobId:'job',evidenceRevisionId:'revision',previousRequestId:original.id,operatorAttemptScope:STAGING_DISPOSITION_ATTEMPT_ID});expect(await freshStagingRematch(original,STAGING_DISPOSITION_ATTEMPT_ID,'2026-10-19T16:30:00Z')).toEqual(fresh);expect(JSON.stringify(original)).toBe(before);
});
