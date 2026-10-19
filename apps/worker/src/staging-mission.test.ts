import {expect,it} from 'vitest';
import {stagingMission} from './staging-mission';
it('keeps the staging mission default-off and rejects unauthorized access before any database use',async()=>{
 const deniedDb=new Proxy({},{get(){throw Error('UNAUTHORIZED_DB_ACCESS')}});
 expect((await stagingMission(new Request('https://staging.invalid/__staging/mission/prepare',{method:'POST'}),{} as any)).status).toBe(404);
 const env={DB:deniedDb,STAGING_MISSION_FEED_ID:'staging-fresh-fixture',STAGING_MISSION_TOKEN:'secret'} as any;
 expect((await stagingMission(new Request('https://staging.invalid/__staging/mission/status'),env)).status).toBe(404);
 expect((await stagingMission(new Request('https://staging.invalid/__staging/mission/prepare',{headers:{authorization:'Bearer secret'}}),env)).status).toBe(400);
});

it('requires the separate new-run activation before any paid rematch access',async()=>{
 const deniedDb=new Proxy({},{get(){throw Error('UNAUTHORIZED_DB_ACCESS')}});
 const env={DB:deniedDb,STAGING_MISSION_FEED_ID:'staging-fresh-fixture',STAGING_MISSION_TOKEN:'secret'} as any;
 const request=new Request('https://staging.invalid/__staging/mission/review-contract-v2',{method:'POST',headers:{authorization:'Bearer secret'}});
 const response=await stagingMission(request,env);expect(response.status).toBe(409);expect(await response.json()).toEqual({error:'NEW_RUN_NOT_ACTIVATED'});
});
