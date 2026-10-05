import {expect,it} from 'vitest';
import {createIntakeDatabase} from './v1-intake/test-utils';
import {D1Repository} from './repository';
import {createApp} from './app';
import {createSession} from './auth';
import {productRuntimeEnv} from './product-feeds';
import {V1IntakeStore} from './v1-intake/store';
import type {Env} from './types';

it('saves explicit owner sources into connector approval, retries without duplicates and fences edits',async()=>{
 const ctx=await createIntakeDatabase({product:true});
 try {
  const repo=new D1Repository(ctx.db),owner=await repo.createAccount({email:'product@example.com',username:'product',role:'user',passwordHash:'unused',emailVerifiedAt:new Date().toISOString()});
  const env={DB:ctx.db,ADMIN_SESSION_SECRET:'test-secret',PRODUCT_FEEDS_ENABLED:'true',V1_DOWNSTREAM_ENABLED:'true',SOURCE_CONNECTORS_ENABLED:'true'} as Env;
  const app=createApp({repository:repo});const cookie=`dn_session=${await createSession(env.ADMIN_SESSION_SECRET!,owner)}`;
  const input={id:'product-feed',title:'Lebanon News',interestProfile:'Lebanon infrastructure',sourceInputs:['https://example.com/rss.xml'],publicFeedEnabled:false,updateIntervalMinutes:1440,briefingTimeOfDay:'08:00',briefingTimezone:'Asia/Beirut',language:'en'};
  const save=(body:unknown)=>app.request('/api/me/feeds',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify(body)},env);
  const created=await save(input);expect(created.status).toBe(200);expect(await created.json()).toMatchObject({briefing:{slug:'lebanon-news',publicFeedEnabled:false,updateIntervalMinutes:1440,briefingTimeOfDay:'08:00'}});
  expect((await save(input)).status).toBe(200);
  const sources=await repo.listSources(input.id);expect(sources).toHaveLength(1);
  expect(await ctx.db.prepare('SELECT collection_owner FROM sources WHERE id=?').bind(sources[0].id).first()).toEqual({collection_owner:'connector'});
  const before=await new V1IntakeStore(ctx.db).getScope(sources[0].id);expect(before?.enabled).toBe(true);
  expect((await productRuntimeEnv(env)).V1_DOWNSTREAM_FEED_SOURCE_IDS).toBe(sources[0].id);
  expect((await save({...input,updateIntervalMinutes:120,language:'fr'})).status).toBe(200);
  const after=await new V1IntakeStore(ctx.db).getScope(sources[0].id);expect(after!.feedRevision).toBeGreaterThan(before!.feedRevision);
  expect((await save({...input,sourceInputs:[]})).status).toBe(400);
  expect((await save({...input,sourceInputs:['infrastructure']})).status).toBe(400);
  expect((await save({...input,sourceInputs:['https://127.0.0.1/rss.xml']})).status).toBe(400);
  expect((await app.request('/api/feed/product/lebanon-news',{},env)).status).toBe(404);
  expect((await app.request('/api/me/sources/recommend',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({title:'News',description:'Lebanon'})},env)).status).toBe(503);
 }finally{await ctx.dispose()}
},60000);
