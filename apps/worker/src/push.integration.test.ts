import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createIntakeDatabase,seedIntakeScope,testPolicy} from './v1-intake/test-utils';
import {V1IntakeStore} from './v1-intake/store';
import {V1FeedStore,feedTransact} from './v1-intelligence/store';
import {feedFixture,seedIntelligence} from './v1-intelligence/test-utils';
import {processV1Briefing} from './v1-intelligence/runtime';
import {readEditionDelivery} from './v1-intelligence/delivery-status';
import {sendBriefingNotifications} from './push';
import {recordPushAcceptance,settlePushOutbox} from './push-outbox';
import {createApp} from './app';
import {createSession} from './auth';
import {D1Repository} from './repository';
import type {Env} from './types';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,store:V1FeedStore,env:Env,editionId:string;
const endpoint='https://fcm.googleapis.com/fcm/send/integration',cutoff='2026-10-03T11:00:00Z';
let subscription:string;
beforeEach(async()=>{
 ctx=await createIntakeDatabase({product:true});store=new V1FeedStore(ctx.db);
 await ctx.db.prepare("INSERT INTO accounts(id,email,normalized_email,username,role,password_hash,email_verified_at,created_at,updated_at) VALUES('owner-1','owner@example.invalid','owner@example.invalid','owner','user','hash',?,?,?)").bind(cutoff,cutoff,cutoff).run();
 await ctx.db.prepare("INSERT INTO briefings(id,owner_account_id,slug,title,interest_profile,public_feed_enabled,created_at,updated_at) VALUES('feed-1','owner-1','news','News','banking reform',1,?,?)").bind(cutoff,cutoff).run();
 await ctx.db.prepare("INSERT INTO username_aliases(username,account_id,is_current,created_at) VALUES('owner','owner-1',1,?)").bind(cutoff).run();
 await seedIntakeScope(new V1IntakeStore(ctx.db));await store.registerFeed({...feedFixture,briefingFrequency:'HOURLY'});await seedIntelligence(store,1,'Lebanon Parliament approved banking reform legislation.','publisher-1','2026-10-03T12:00:00Z','en','2026-10-03T12:00:00Z');
 const keys=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
 const browser=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
 subscription=JSON.stringify({endpoint,expirationTime:null,keys:{p256dh:Buffer.from(await crypto.subtle.exportKey('raw',browser.publicKey)).toString('base64url'),auth:Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64url')}});
 env={DB:ctx.db,BRIEFING_ENGINE:'v3',OPENROUTER_API_KEY:'test-only',PRODUCT_FEEDS_ENABLED:'true',V1_DOWNSTREAM_ENABLED:'true',V1_DOWNSTREAM_FEED_SOURCE_IDS:'feed-source-1',V1_EDITORIAL_PLAN_ENABLED:'true',VAPID_PUBLIC_KEY:Buffer.from(await crypto.subtle.exportKey('raw',keys.publicKey)).toString('base64url'),VAPID_PRIVATE_KEY:(await crypto.subtle.exportKey('jwk',keys.privateKey)).d!,VAPID_SUBJECT:'https://distilled.news'} as unknown as Env;
 await ctx.db.prepare('INSERT INTO push_subscriptions(endpoint,account_id,subscription_json,language,last_notified_at,created_at,notification_version) VALUES(?,?,?,?,?,?,?)').bind(endpoint,'owner-1',subscription,'en',cutoff,cutoff,'subscription-v1').run();
 const edition=await processV1Briefing(env,{type:'v1_briefing',feedId:'feed-1',window:{start:cutoff,end:'2026-10-03T13:00:00Z',kind:'HOURLY'}},()=> '2026-10-03T13:00:00Z',undefined,async(_url,init)=>{
  const request=JSON.parse(String(init?.body));
  const value=request.messages[0].content.includes('meticulous fact-checker')?{results:[{i:0,verdict:'ok',issues:[]}]}:{items:[{headline:'Banking reform approved',body:'Lebanon Parliament approved banking reform legislation.',sources:['S1'],relation:'new',importance:1}]};
  return Response.json({id:'push-integration-model',choices:[{message:{content:JSON.stringify(value)},finish_reason:'stop'}],usage:{prompt_tokens:100,completion_tokens:30,cost:.001}});
 });expect(edition?.engine).toBe('v3');editionId=edition!.id;
},60000);
afterEach(async()=>{vi.unstubAllGlobals();await ctx?.dispose()});
it('connects verified editorial publication, actual frontend retrieval and push-service acceptance without replay',async()=>{
 const response=await createApp().request('/api/feed/owner/news',{},env);expect(response.status).toBe(200);
 const payload=await response.json() as {editions:{id:string;sections:{summary:string}[]}[]};expect(payload.editions).toHaveLength(1);expect(payload.editions[0].sections[0].summary).toContain('banking reform');
 expect(await readEditionDelivery(store,'feed-1',editionId)).toMatchObject({verified:true,publiclyReadable:true,push:{state:'NOT_STARTED'}});
 const send=vi.fn(async()=>new Response(null,{status:201}));vi.stubGlobal('fetch',send);
 await sendBriefingNotifications(env);await sendBriefingNotifications(env);
 expect(send).toHaveBeenCalledOnce();expect(await store.list('feed-1','browser_push_receipts')).toHaveLength(1);
 expect(await readEditionDelivery(store,'feed-1',editionId)).toMatchObject({push:{state:'DELIVERED',jobState:'DONE',attempts:1}});
 expect((await readEditionDelivery(store,'feed-1',editionId)).push.note).toContain('device receipt');
},30000);
for(const change of ['withdrawn','unverified','unprojected','private','disabled'] as const)it(`never notifies an edition that is ${change}`,async()=>{
 if(change==='withdrawn')await feedTransact(store,'feed-1',async tx=>{const p=await tx.read<any>('publication_status',editionId);await tx.write('publication_status',editionId,{...p,status:'WITHDRAWN',reason:'test withdrawal'})});
 if(change==='unverified')await ctx.db.prepare("DELETE FROM v1_feed_documents WHERE kind='fidelity_results'").run();
 if(change==='unprojected')await ctx.db.prepare("DELETE FROM v1_feed_documents WHERE kind='ledger_projections'").run();
 if(change==='private')await ctx.db.prepare("UPDATE briefings SET public_feed_enabled=0").run();
 if(change==='disabled')await ctx.db.prepare("UPDATE accounts SET disabled_at=?").bind(testPolicy.now()).run();
 const send=vi.fn();vi.stubGlobal('fetch',send);await sendBriefingNotifications(env);expect(send).not.toHaveBeenCalled();expect(await store.list('feed-1','browser_push_receipts')).toHaveLength(0);expect(await store.read('feed-1','delivery_jobs',editionId)).toMatchObject({state:'PENDING'});
},30000);
it('cannot acknowledge a replaced subscription or an expired lease',async()=>{
 const now=new Date().toISOString(),future=new Date(Date.now()+60000).toISOString();
 await ctx.db.prepare('UPDATE push_subscriptions SET lease_until=?,lease_token=? WHERE endpoint=?').bind(future,'new-owner',endpoint).run();
 const row={endpoint,account_id:'owner-1',subscription_json:subscription,notification_version:'subscription-v1',last_notified_at:cutoff,newest:'2026-10-03T13:00:00Z'};
 await recordPushAcceptance(ctx.db,row,'old-owner',now);expect(await store.list('feed-1','browser_push_receipts')).toHaveLength(0);
 await ctx.db.prepare('UPDATE push_subscriptions SET lease_until=? WHERE endpoint=?').bind(cutoff,endpoint).run();
 await recordPushAcceptance(ctx.db,row,'new-owner',now);expect(await store.list('feed-1','browser_push_receipts')).toHaveLength(0);
 await ctx.db.prepare('UPDATE push_subscriptions SET lease_until=?,notification_version=? WHERE endpoint=?').bind(future,'subscription-v2',endpoint).run();
 await recordPushAcceptance(ctx.db,row,'new-owner',now);await settlePushOutbox(ctx.db,now);expect(await store.read('feed-1','delivery_jobs',editionId)).toMatchObject({state:'PENDING'});
},30000);
it('recovers a lost receipt acknowledgement without another external push',async()=>{
 const send=vi.fn(async()=>new Response(null,{status:201}));vi.stubGlobal('fetch',send);
 const original=ctx.db.batch.bind(ctx.db);let lost=false;
 const batch=vi.spyOn(ctx.db,'batch').mockImplementation(async statements=>{const result=await original(statements);if(!lost){lost=true;throw new Error('acknowledgement lost after commit')}return result});
 await sendBriefingNotifications(env);batch.mockRestore();await sendBriefingNotifications(env);
 expect(send).toHaveBeenCalledOnce();expect(await store.read('feed-1','delivery_jobs',editionId)).toMatchObject({state:'DONE'});
},30000);
it('does not call missing subscriptions or label absent configuration as delivered',async()=>{
 const send=vi.fn();vi.stubGlobal('fetch',send);await sendBriefingNotifications({...env,VAPID_PRIVATE_KEY:undefined});expect(send).not.toHaveBeenCalled();
 await ctx.db.prepare('DELETE FROM push_subscriptions').run();await sendBriefingNotifications(env);expect(send).not.toHaveBeenCalled();expect(await store.read('feed-1','delivery_jobs',editionId)).toMatchObject({state:'PENDING'});
},30000);
it('a rejected push remains pending and retries only after its lease expires',async()=>{
 const send=vi.fn(async()=>new Response(null,{status:503}));vi.stubGlobal('fetch',send);
 await sendBriefingNotifications(env);await sendBriefingNotifications(env);expect(send).toHaveBeenCalledOnce();expect(await store.read('feed-1','delivery_jobs',editionId)).toMatchObject({state:'PENDING'});
 await ctx.db.prepare('UPDATE push_subscriptions SET lease_until=?').bind(cutoff).run();send.mockImplementation(async()=>new Response(null,{status:201}));await sendBriefingNotifications(env);expect(send).toHaveBeenCalledTimes(2);expect(await store.read('feed-1','delivery_jobs',editionId)).toMatchObject({state:'DONE'});
},30000);

it('waits for every current subscriber, then drains receipts without resending successful recipients',async()=>{
 const second='https://fcm.googleapis.com/fcm/send/integration-second';
 await ctx.db.prepare('INSERT INTO push_subscriptions(endpoint,account_id,subscription_json,language,last_notified_at,created_at,notification_version) VALUES(?,?,?,?,?,?,?)').bind(second,'owner-1',subscription.replace(endpoint,second),'fr',cutoff,cutoff,'subscription-v2').run();
 const send=vi.fn(async(input:string|URL|Request)=>new Response(null,{status:String(input)===second?503:201}));vi.stubGlobal('fetch',send);
 await sendBriefingNotifications(env);expect(send).toHaveBeenCalledTimes(2);expect(await store.read('feed-1','delivery_jobs',editionId)).toMatchObject({state:'PENDING'});
 await ctx.db.prepare('UPDATE push_subscriptions SET lease_until=? WHERE endpoint=?').bind(cutoff,second).run();send.mockImplementation(async()=>new Response(null,{status:201}));
 await sendBriefingNotifications(env);expect(send).toHaveBeenCalledTimes(3);expect(await store.list('feed-1','browser_push_receipts')).toHaveLength(2);expect(await store.read('feed-1','delivery_jobs',editionId)).toMatchObject({state:'DONE'});
},30000);
it('does not starve complete jobs behind more than forty partially acknowledged jobs',async()=>{
 const second='https://fcm.googleapis.com/fcm/send/integration-second',now=new Date().toISOString();
 await ctx.db.prepare('INSERT INTO push_subscriptions(endpoint,account_id,subscription_json,language,last_notified_at,created_at,notification_version) VALUES(?,?,?,?,?,?,?)').bind(second,'owner-1',subscription.replace(endpoint,second),'en',cutoff,cutoff,'subscription-v2').run();
 const edition=await store.read<any>('feed-1','editions',editionId),job=await store.read<any>('feed-1','delivery_jobs',editionId),publication=await store.read<any>('feed-1','publication_status',editionId);
 const pending=Array.from({length:41},(_,i)=>`blocked-${i}`);
 const inserts=[];
 for(const id of [...pending,'ready-last']){
  const at=id==='ready-last'?'2026-10-03T13:00:00Z':'2026-10-03T12:00:00Z';
  for(const [kind,key,json] of [['editions',id,{...edition,id}],['delivery_jobs',id,{...job,editionId:id}],['publication_status',id,{...publication,editionId:id,publishedAt:at}],['ledger_projections',JSON.stringify([id,'grounded-communication-ledger-v1']),{}]] as const)
   inserts.push(ctx.db.prepare('INSERT INTO v1_feed_documents(kind,id,feed_id,json) VALUES(?,?,?,?)').bind(kind,key,'feed-1',JSON.stringify(json)));
  for(const version of id==='ready-last'?['subscription-v1','subscription-v2']:['subscription-v1'])inserts.push(ctx.db.prepare("INSERT INTO v1_feed_documents(kind,id,feed_id,json) VALUES('browser_push_receipts',?,'feed-1',?)").bind(JSON.stringify([id,version]),JSON.stringify({editionId:id,subscriptionVersion:version,state:'ACCEPTED_BY_PUSH_SERVICE',acceptedAt:now})));
 }
 for(let i=0;i<inserts.length;i+=50)await ctx.db.batch(inserts.slice(i,i+50));
 await settlePushOutbox(ctx.db,now);
 expect(await store.read('feed-1','delivery_jobs','ready-last')).toMatchObject({state:'DONE'});
 expect(await store.read('feed-1','delivery_jobs',pending[0])).toMatchObject({state:'PENDING'});
},30000);
it('notifies an older edition whose ledger projection becomes available after a newer edition',async()=>{
 const older=await store.read<any>('feed-1','editions',editionId),job=await store.read<any>('feed-1','delivery_jobs',editionId),publication=await store.read<any>('feed-1','publication_status',editionId);
 for(const [kind,id,json] of [['editions','later-edition',{...older,id:'later-edition'}],['delivery_jobs','later-edition',{...job,editionId:'later-edition'}],['publication_status','later-edition',{...publication,editionId:'later-edition',publishedAt:'2026-10-03T14:00:00Z'}],['ledger_projections',JSON.stringify(['later-edition','grounded-communication-ledger-v1']),{}]] as const)
  await ctx.db.prepare('INSERT INTO v1_feed_documents(kind,id,feed_id,json) VALUES(?,?,?,?)').bind(kind,id,'feed-1',JSON.stringify(json)).run();
 const projection=JSON.stringify([editionId,'grounded-communication-ledger-v1']);await ctx.db.prepare("DELETE FROM v1_feed_documents WHERE kind='ledger_projections' AND id=?").bind(projection).run();
 const send=vi.fn(async()=>new Response(null,{status:201}));vi.stubGlobal('fetch',send);await sendBriefingNotifications(env);
 expect(await store.read('feed-1','delivery_jobs','later-edition')).toMatchObject({state:'DONE'});expect(await store.read('feed-1','delivery_jobs',editionId)).toMatchObject({state:'PENDING'});
 await ctx.db.prepare("INSERT INTO v1_feed_documents(kind,id,feed_id,json) VALUES('ledger_projections',?,'feed-1','{}')").bind(projection).run();await sendBriefingNotifications(env);await sendBriefingNotifications(env);
 expect(send).toHaveBeenCalledTimes(2);expect(await store.read('feed-1','delivery_jobs',editionId)).toMatchObject({state:'DONE'});
},30000);

it('the authenticated subscription API renews identity and fences an in-flight old acknowledgement',async()=>{
 env.ADMIN_SESSION_SECRET='integration-session-fixture';const repo=new D1Repository(ctx.db),owner=(await repo.getAccountById('owner-1'))!;
 const cookie='dn_session='+await createSession(env.ADMIN_SESSION_SECRET,owner),app=createApp();
 const token='old-lease',future=new Date(Date.now()+60000).toISOString();await ctx.db.prepare('UPDATE push_subscriptions SET lease_until=?,lease_token=? WHERE endpoint=?').bind(future,token,endpoint).run();
 const headers={'content-type':'application/json',cookie};
 const response=await app.request('/api/me/push',{method:'POST',headers,body:JSON.stringify({subscription:JSON.parse(subscription),language:'ar'})},env);expect(response.status).toBe(200);
 const row=await ctx.db.prepare('SELECT * FROM push_subscriptions WHERE endpoint=?').bind(endpoint).first<any>();expect(row.notification_version).not.toBe('subscription-v1');expect(row).toMatchObject({language:'ar',lease_until:null,lease_token:null});
 await recordPushAcceptance(ctx.db,{endpoint,account_id:'owner-1',subscription_json:subscription,notification_version:'subscription-v1',last_notified_at:cutoff,newest:'2026-10-03T13:00:00Z'},token,new Date().toISOString());
 expect(await store.list('feed-1','browser_push_receipts')).toHaveLength(0);
 const removed=await app.request('/api/me/push',{method:'DELETE',headers,body:JSON.stringify({endpoint})},env);expect(removed.status).toBe(200);expect(await ctx.db.prepare('SELECT endpoint FROM push_subscriptions WHERE endpoint=?').bind(endpoint).first()).toBeNull();
},30000);
