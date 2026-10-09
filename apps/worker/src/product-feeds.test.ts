import {expect,it} from 'vitest';
import {createIntakeDatabase} from './v1-intake/test-utils';
import {D1Repository} from './repository';
import {createApp} from './app';
import {createSession} from './auth';
import {prepareProductSourceInput,productRuntimeEnv,productPublicationState} from './product-feeds';
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
  const health=await app.request(`/api/me/sources/${encodeURIComponent(sources[0].id)}/connector-health?briefingId=${encodeURIComponent(input.id)}`,{headers:{cookie}},env);
  expect(health.status).toBe(200);
  expect(await health.json()).toMatchObject({sourceId:sources[0].id,health:{lastCheckedAt:null,providerFailures:0}});
  expect(await ctx.db.prepare('SELECT collection_owner FROM sources WHERE id=?').bind(sources[0].id).first()).toEqual({collection_owner:'connector'});
  const before=await new V1IntakeStore(ctx.db).getScope(sources[0].id);expect(before?.enabled).toBe(true);
  expect((await productRuntimeEnv(env)).V1_DOWNSTREAM_FEED_SOURCE_IDS).toBe(sources[0].id);
  expect(await productPublicationState(env,input.id)).toBe('waiting');
  await ctx.db.prepare("INSERT INTO v1_feed_documents(kind,id,feed_id,json) VALUES('briefing_requests','quiet-test',?,?)").bind(input.id,JSON.stringify({id:'quiet-test',state:'DONE',createdAt:new Date().toISOString()})).run();
  expect(await productPublicationState(env,input.id)).toBe('quiet');
  await ctx.db.prepare("INSERT INTO v1_feed_documents(kind,id,feed_id,json) VALUES('briefing_requests','failed-test',?,?)").bind(input.id,JSON.stringify({id:'failed-test',state:'FAILED',createdAt:new Date(Date.now()+1000).toISOString()})).run();
  expect(await productPublicationState(env,input.id)).toBe('failed');
  expect((await save({...input,updateIntervalMinutes:120,language:'fr'})).status).toBe(200);
  const after=await new V1IntakeStore(ctx.db).getScope(sources[0].id);expect(after!.feedRevision).toBeGreaterThan(before!.feedRevision);
  expect((await save({...input,sourceInputs:[]})).status).toBe(400);
  expect(prepareProductSourceInput('infrastructure').detected.kind).toBe('google_news');
  expect((await save({...input,sourceInputs:['https://127.0.0.1/rss.xml']})).status).toBe(400);
  const paused=await repo.upsertConfiguredSource({briefingId:input.id,title:'Paused source',provider:'rss',kind:'rss_feed',sourceUrl:'https://example.com/paused.xml',input:'https://example.com/paused.xml',enabled:false});
  expect((await save(input)).status).toBe(200);
  expect((await repo.getSource(paused.id))?.enabled).toBe(false);
  expect((await app.request('/api/feed/product/lebanon-news',{},env)).status).toBe(404);
  expect((await app.request('/api/me/sources/recommend',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({title:'News',description:'Lebanon'})},env)).status).toBe(503);
 }finally{await ctx.dispose()}
},60000);

it('approves supported connector inputs without a paid fetch and retains their identity on edit',async()=>{
 const ctx=await createIntakeDatabase({product:true});
 try {
  const repo=new D1Repository(ctx.db),owner=await repo.createAccount({email:'sources@example.com',username:'sources',role:'user',passwordHash:'unused',emailVerifiedAt:new Date().toISOString()});
  const env={DB:ctx.db,ADMIN_SESSION_SECRET:'test-secret',PRODUCT_FEEDS_ENABLED:'true',V1_DOWNSTREAM_ENABLED:'true',SOURCE_CONNECTORS_ENABLED:'true'} as Env;
  const app=createApp({repository:repo});const cookie=`dn_session=${await createSession(env.ADMIN_SESSION_SECRET!,owner)}`;
  const sourceInputs=['rss: https://www.jpl.nasa.gov/feeds/news/','news: Lebanon electricity','https://x.com/NASA','x: climate technology','linkedin: https://www.linkedin.com/company/nasa/'];
  const input={id:'mixed-feed',title:'Mixed News',interestProfile:'Space and energy',sourceInputs,publicFeedEnabled:false,updateIntervalMinutes:120,briefingTimezone:'Asia/Beirut',language:'en'};
  const save=(body:unknown)=>app.request('/api/me/feeds',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify(body)},env);
  expect((await save(input)).status).toBe(200);
  const first=await repo.listSources(input.id);
  expect(first.map(source=>source.kind).sort()).toEqual(['google_news','linkedin_company','rss_feed','x_profile','x_search']);
  expect(first.find(source=>source.kind==='google_news')?.input).toBe(sourceInputs[1]);
  expect(first.find(source=>source.kind==='rss_feed')?.input).toBe(sourceInputs[0]);
  expect(first.find(source=>source.kind==='x_search')?.sourceUrl).toBeUndefined();
  expect(first.find(source=>source.kind==='x_profile')?.actorId).toBeTruthy();
  expect((await productRuntimeEnv(env)).V1_DOWNSTREAM_FEED_SOURCE_IDS?.split(',')).toHaveLength(5);
  expect((await save(input)).status).toBe(200);
  expect((await repo.listSources(input.id)).map(source=>source.id).sort()).toEqual(first.map(source=>source.id).sort());
  expect((await save({...input,sourceInputs:['https://t.me/examplechannel']})).status).toBe(400);
  expect((await save({...input,sourceInputs:['https://example.com/story']})).status).toBe(400);
  expect(prepareProductSourceInput('Lebanon electricity').detected.kind).toBe('google_news');
  expect((await save({...input,sourceInputs:['news: Lebanon electricity','x: climate technology']})).status).toBe(200);
  expect((await repo.listSources(input.id)).map(source=>source.kind).sort()).toEqual(['google_news','x_search']);
  env.SOURCE_EXECUTION_TOKEN='test-execution-token';
  env.SOURCE_EXECUTION_SERVICE={} as Env['SOURCE_EXECUTION_SERVICE'];
  expect((await save({...input,sourceInputs:['https://example.com/story']})).status).toBe(200);
  expect((await repo.listSources(input.id)).map(source=>source.kind)).toEqual(['web_page']);
  expect((await save({...input,sourceInputs:['https://example.com/story']})).status).toBe(200);
  expect((await repo.listSources(input.id))).toHaveLength(1);
 }finally{await ctx.dispose()}
},60000);

it('resolves public Telegram usernames privately and keeps source identity stable',async()=>{
 const ctx=await createIntakeDatabase({product:true});
 try{
  const repo=new D1Repository(ctx.db),owner=await repo.createAccount({email:'telegram@example.com',username:'telegram-owner',role:'user',passwordHash:'unused',emailVerifiedAt:new Date().toISOString()});
  const requests:string[]=[];
  const service={fetch:async (_url:RequestInfo|URL,init?:RequestInit)=>{
   const payload=JSON.parse(String(init?.body));requests.push(payload.kind);
   expect(payload.input.username).toBe('examplechannel');
   return new Response(JSON.stringify({channelId:'-1001234567890',username:'examplechannel'}),{status:200});
  }} as Env['SOURCE_EXECUTION_SERVICE'];
  const env={DB:ctx.db,ADMIN_SESSION_SECRET:'test-secret',PRODUCT_FEEDS_ENABLED:'true',V1_DOWNSTREAM_ENABLED:'true',SOURCE_CONNECTORS_ENABLED:'true',
   SOURCE_EXECUTION_URL:'http://127.0.0.1:8790/v1/source-execution',SOURCE_EXECUTION_TOKEN:'a'.repeat(32),SOURCE_EXECUTION_SERVICE:service} as Env;
  const app=createApp({repository:repo});const cookie=`dn_session=${await createSession(env.ADMIN_SESSION_SECRET!,owner)}`;
  const input={id:'telegram-feed',title:'Telegram News',interestProfile:'Technology',sourceInputs:['https://t.me/examplechannel'],publicFeedEnabled:false,
   updateIntervalMinutes:120,briefingTimezone:'Asia/Beirut',language:'en'};
  const save=(body:unknown)=>app.request('/api/me/feeds',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify(body)},env);
  expect((await save(input)).status).toBe(200);
  const first=(await repo.listSources(input.id))[0];
  expect(first).toMatchObject({kind:'telegram_channel',provider:'telegram',sourceUrl:'https://t.me/examplechannel'});
  expect(JSON.parse(first.input!)).toEqual({channelId:'-1001234567890',username:'examplechannel',public:true});
  expect((await save({...input,sourceInputs:['@examplechannel']})).status).toBe(200);
  expect((await repo.listSources(input.id)).map(s=>s.id)).toEqual([first.id]);
  expect(requests).toEqual(['telegram_resolve','telegram_resolve']);
 }finally{await ctx.dispose()}
},60000);
