import {expect,it,vi} from 'vitest';
const built=vi.hoisted(()=>({data:[] as string[]}));
vi.mock('@block65/webcrypto-web-push',async importOriginal=>{
 const actual=await importOriginal<typeof import('@block65/webcrypto-web-push')>();
 return {...actual,buildPushPayload:async(...args:Parameters<typeof actual.buildPushPayload>)=>{built.data.push(String(args[0].data));return actual.buildPushPayload(...args);}};
});
import {sendBriefingNotifications} from './push';
import {Miniflare} from 'miniflare';
import {briefingPushPreview,readBriefingPushPreview} from './push-preview';

const edition=(headlines:string[],language='en')=>({engine:'v3',language,stories:headlines.map(headline=>({claims:[{text:headline+'\nSupported details.'}]}))});
it('uses the final lead headline verbatim and counts only that edition’s remaining items',()=>{
  expect(briefingPushPreview(edition(['EDL to cut power to unpaid public entities from November 2','Airstrike warning','Qantara explosion','Barashit strike']),'en')).toBe('EDL to cut power to unpaid public entities from November 2 · 3 more updates');
  expect(briefingPushPreview(edition(['A reported warning']),'en')).toBe('A reported warning');
});
it('keeps conditions, negation and attribution without shortening the headline',()=>{
  const headline='Ministry: water is not safe unless boiled';
  expect(briefingPushPreview(edition([headline]),'en')).toBe(headline);
  const long='Officials say the plan will proceed only if '+('the required conditions remain satisfied '.repeat(8));
  expect(briefingPushPreview(edition([long]),'en')).toBe('A new briefing is ready in your feeds.');
});
it('uses the briefing language for update counts, including Arabic with English UI',()=>{
  expect(briefingPushPreview(edition(['قرار جديد','خبر آخر'],'ar'),'en')).toBe('قرار جديد · ومستجد آخر');
  expect(briefingPushPreview(edition(['Décision','Autre nouvelle'],'fr'),'en')).toBe('Décision · 1 autre actualité');
});
it('falls back safely for legacy or malformed edition formats',()=>{
  for(const value of [null,{}, {engine:'v2',stories:[]},edition([]),{engine:'v3',stories:[{claims:[]}]}])expect(briefingPushPreview(value,'en')).toBe('A new briefing is ready in your feeds.');
});

it('reads only published, verified, projected, public evidence-backed edition records and respects subscription receipts/cutoff',async()=>{
 const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("local")}}',d1Databases:['DB']});
 try{
  const db=await mf.getD1Database('DB') as unknown as D1Database;
  await db.exec('CREATE TABLE accounts(id TEXT PRIMARY KEY,disabled_at TEXT); CREATE TABLE briefings(id TEXT PRIMARY KEY,owner_account_id TEXT,public_feed_enabled INTEGER); CREATE TABLE v1_feed_documents(kind TEXT,id TEXT,feed_id TEXT,json TEXT,PRIMARY KEY(kind,id));');
  await db.prepare("INSERT INTO accounts VALUES('owner',NULL)").run();await db.prepare("INSERT INTO briefings VALUES('feed','owner',1)").run();
  const documents=[['editions','edition',edition(['Supported headline'])],['publication_status','edition',{status:'PUBLISHED',publishedAt:'2026-10-23T17:00:00Z'}],['delivery_jobs','edition',{state:'PENDING'}],['fidelity_results','edition',{passed:true}],['ledger_projections',JSON.stringify(['edition','grounded-communication-ledger-v1']),{}]] as const;
  for(const [kind,id,json]of documents)await db.prepare('INSERT INTO v1_feed_documents VALUES(?,?,?,?)').bind(kind,id,'feed',JSON.stringify(kind==='editions'?{...json,selectionId:'edition'}:json)).run();
  const sub={account_id:'owner',last_notified_at:'2026-10-23T16:00:00Z',newest:'2026-10-23T17:00:00Z',notification_version:'v1',language:'en'};
  expect(await readBriefingPushPreview(db,sub)).toBe('Supported headline');
  const fallback='A new briefing is ready in your feeds.';
  await db.prepare("UPDATE briefings SET public_feed_enabled=0").run();expect(await readBriefingPushPreview(db,sub)).toBe(fallback);await db.prepare("UPDATE briefings SET public_feed_enabled=1").run();
  await db.prepare("UPDATE v1_feed_documents SET json=json_set(json,'$.passed',0) WHERE kind='fidelity_results'").run();expect(await readBriefingPushPreview(db,sub)).toBe(fallback);await db.prepare("UPDATE v1_feed_documents SET json=json_set(json,'$.passed',1) WHERE kind='fidelity_results'").run();
  await db.prepare("UPDATE v1_feed_documents SET json=json_set(json,'$.status','WITHDRAWN') WHERE kind='publication_status'").run();expect(await readBriefingPushPreview(db,sub)).toBe(fallback);await db.prepare("UPDATE v1_feed_documents SET json=json_set(json,'$.status','PUBLISHED') WHERE kind='publication_status'").run();
  expect(await readBriefingPushPreview(db,{...sub,account_id:'someone-else'})).toBe(fallback);
  await db.prepare("UPDATE accounts SET disabled_at='2026-10-23T17:01:00Z'").run();expect(await readBriefingPushPreview(db,sub)).toBe(fallback);await db.prepare('UPDATE accounts SET disabled_at=NULL').run();
  await db.prepare("DELETE FROM v1_feed_documents WHERE kind='ledger_projections'").run();expect(await readBriefingPushPreview(db,sub)).toBe(fallback);
  await db.prepare("INSERT INTO v1_feed_documents VALUES('ledger_projections',?,'feed','{}')").bind(JSON.stringify(['edition','grounded-communication-ledger-v1'])).run();
  expect(await readBriefingPushPreview(db,{...sub,last_notified_at:sub.newest})).toBe(fallback);
  await db.prepare("INSERT INTO v1_feed_documents VALUES('browser_push_receipts','receipt','feed',?)").bind(JSON.stringify({editionId:'edition',subscriptionVersion:'v1'})).run();expect(await readBriefingPushPreview(db,sub)).toBe(fallback);
  await db.prepare("DELETE FROM v1_feed_documents WHERE kind='browser_push_receipts'").run();
  await db.exec('CREATE TABLE push_subscriptions(endpoint TEXT PRIMARY KEY,account_id TEXT,subscription_json TEXT,language TEXT,last_notified_at TEXT,created_at TEXT,notification_version TEXT,lease_until TEXT,lease_token TEXT);');
  const keys=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
  const client=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
  const subscription={endpoint:'https://fcm.googleapis.com/fcm/send/local-test',expirationTime:null,keys:{p256dh:Buffer.from(await crypto.subtle.exportKey('raw',client.publicKey)).toString('base64url'),auth:Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64url')}};
  await db.prepare('INSERT INTO push_subscriptions(endpoint,account_id,subscription_json,language,last_notified_at,created_at,notification_version) VALUES(?,?,?,?,?,?,?)').bind(subscription.endpoint,'owner',JSON.stringify(subscription),'en',sub.last_notified_at,sub.last_notified_at,'v1').run();
  const send=vi.fn(async()=>new Response(null,{status:201}));
  vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-23T18:00:00Z'));vi.stubGlobal('fetch',send);
  try{
   await sendBriefingNotifications({DB:db,VAPID_PUBLIC_KEY:Buffer.from(await crypto.subtle.exportKey('raw',keys.publicKey)).toString('base64url'),VAPID_PRIVATE_KEY:(await crypto.subtle.exportKey('jwk',keys.privateKey)).d!,VAPID_SUBJECT:'https://example.invalid'} as import('./types').Env);
   expect(send).toHaveBeenCalledOnce();
   expect(JSON.parse(built.data[built.data.length-1])).toMatchObject({body:'Supported headline',url:'/'});
   expect((await db.prepare("SELECT json FROM v1_feed_documents WHERE kind='delivery_jobs' AND id='edition'").first<{json:string}>())?.json).toContain('"state":"DONE"');
   expect((await db.prepare("SELECT COUNT(*) AS n FROM v1_feed_documents WHERE kind='browser_push_receipts'").first<{n:number}>())?.n).toBe(1);
  }finally{vi.unstubAllGlobals();vi.useRealTimers();built.data.length=0;}

 }finally{await mf.dispose();}
});
