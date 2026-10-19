import {expect,it} from 'vitest';
import {stagingMission} from './staging-mission';
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
 expect(STAGING_GROUPING_CALL_LIMITS['openai/gpt-4.1-mini']-12).toBe(5);
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
