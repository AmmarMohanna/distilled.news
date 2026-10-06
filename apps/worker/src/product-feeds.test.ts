import {expect,it} from 'vitest';
import {createIntakeDatabase} from './v1-intake/test-utils';
import {D1Repository} from './repository';
import {createApp} from './app';
import {createSession} from './auth';
import {productRuntimeEnv,productPublicationState} from './product-feeds';
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
  expect(await productPublicationState(env,input.id)).toBe('waiting');
  await ctx.db.prepare("INSERT INTO v1_feed_documents(kind,id,feed_id,json) VALUES('briefing_requests','quiet-test',?,?)").bind(input.id,JSON.stringify({id:'quiet-test',state:'DONE',createdAt:new Date().toISOString()})).run();
  expect(await productPublicationState(env,input.id)).toBe('quiet');
  await ctx.db.prepare("INSERT INTO v1_feed_documents(kind,id,feed_id,json) VALUES('briefing_requests','failed-test',?,?)").bind(input.id,JSON.stringify({id:'failed-test',state:'FAILED',createdAt:new Date(Date.now()+1000).toISOString()})).run();
  expect(await productPublicationState(env,input.id)).toBe('failed');
  await ctx.db.prepare("INSERT INTO v1_feed_documents(kind,id,feed_id,json) VALUES('correction_obligations','pending-correction',?,?)").bind(input.id,JSON.stringify({id:'pending-correction',state:'OPEN'})).run();
  expect(await productPublicationState(env,input.id)).toBe('correction_pending');
  await ctx.db.prepare("INSERT INTO v1_feed_documents(kind,id,feed_id,json) VALUES('correction_resolutions','resolved-correction',?,?)").bind(input.id,JSON.stringify({id:'resolved-correction',obligationId:'pending-correction'})).run();
  expect(await productPublicationState(env,input.id)).toBe('failed');
  expect((await save({...input,updateIntervalMinutes:120,language:'fr'})).status).toBe(200);
  const after=await new V1IntakeStore(ctx.db).getScope(sources[0].id);expect(after!.feedRevision).toBeGreaterThan(before!.feedRevision);
  expect((await save({...input,sourceInputs:[]})).status).toBe(400);
  expect((await save({...input,sourceInputs:['infrastructure']})).status).toBe(400);
  expect((await save({...input,sourceInputs:['https://127.0.0.1/rss.xml']})).status).toBe(400);
  const paused=await repo.upsertConfiguredSource({briefingId:input.id,title:'Paused source',provider:'rss',kind:'rss_feed',sourceUrl:'https://example.com/paused.xml',input:'https://example.com/paused.xml',enabled:false});
  expect((await save(input)).status).toBe(200);
  expect((await repo.getSource(paused.id))?.enabled).toBe(false);
  // Read-path fixture, not a synthesis proof: already-published correction
  // prose must not pass through the old RSS section-selection heuristics.
  const publishedText='A prior Distilled briefing was withdrawn. An earlier source report shows bodycam footage in which a police officer finds a gun in Mangione\'s backpack several days after the killing of UnitedHealthcare CEO Brian Thompson.';
  const published={id:'verified-correction',feedId:input.id,feedRevision:before!.feedRevision,language:'en',windowStart:'2026-10-06T00:00:00Z',windowEnd:'2026-10-06T01:00:00Z',createdAt:'2026-10-06T01:01:00Z',evidenceRevisionIds:[],stories:[{candidateId:'story',claims:[{id:'claim',text:publishedText,support:[]}]}]};
  await ctx.db.prepare("INSERT INTO v1_feed_documents(kind,id,feed_id,json) VALUES('editions',?,?,?)").bind(published.id,input.id,JSON.stringify(published)).run();
  await ctx.db.prepare("INSERT INTO v1_feed_documents(kind,id,feed_id,json) VALUES('publication_status',?,?,?)").bind(published.id,input.id,JSON.stringify({id:published.id,status:'PUBLISHED',publishedAt:published.createdAt})).run();
  for(const path of ['/api/feed/product/lebanon-news','/api/feed/product/lebanon-news/editions/verified-correction','/api/feed/product/lebanon-news/search?q=Mangione']){
   const response=await app.request(path,{headers:{cookie}},env);expect(response.status).toBe(200);
   const body=await response.json() as {edition?:{sections:{summary:string}[]};editions?:{sections:{summary:string}[]}[]};
   expect((body.edition??body.editions?.[0])?.sections[0].summary).toBe(publishedText);
  }
  expect((await app.request('/api/feed/product/lebanon-news',{},env)).status).toBe(404);
  expect((await app.request('/api/me/sources/recommend',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({title:'News',description:'Lebanon'})},env)).status).toBe(503);
 }finally{await ctx.dispose()}
},60000);
