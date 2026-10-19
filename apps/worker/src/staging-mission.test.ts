import {expect,it} from 'vitest';
import {stagingMission} from './staging-mission';
it('keeps the staging mission default-off and rejects unauthorized access before any database use',async()=>{
 const deniedDb=new Proxy({},{get(){throw Error('UNAUTHORIZED_DB_ACCESS')}});
 expect((await stagingMission(new Request('https://staging.invalid/__staging/mission/prepare',{method:'POST'}),{} as any)).status).toBe(404);
 const env={DB:deniedDb,STAGING_MISSION_FEED_ID:'staging-fresh-fixture',STAGING_MISSION_TOKEN:'secret'} as any;
 expect((await stagingMission(new Request('https://staging.invalid/__staging/mission/status'),env)).status).toBe(404);
 expect((await stagingMission(new Request('https://staging.invalid/__staging/mission/prepare',{headers:{authorization:'Bearer secret'}}),env)).status).toBe(400);
});
