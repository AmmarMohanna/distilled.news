import {createServer} from 'node:http';
import {afterEach,beforeEach,expect,it} from 'vitest';
import {createApp} from '../app';
import {createSession} from '../auth';
import {D1Repository} from '../repository';
import type {Env} from '../types';
import {V1IntakeStore} from '../v1-intake/store';
import {createIntakeDatabase,seedIntakeScope} from '../v1-intake/test-utils';
import {publicV1Edition} from './public-read';
import {processV1Briefing,processV1Reassessment,windowIdentity} from './runtime';
import {feedTransact,V1FeedStore} from './store';
import {acceptEvidence,feedFixture} from './test-utils';
import type {BriefingEditionRecord} from './publication';
import {reviewDigest} from './v5-review-contract';
import {v5WorkbenchScript} from './v5-workbench';

const window={start:'2026-10-03T12:00:00Z',end:'2026-10-03T12:30:00Z',kind:'30M' as const};
const approvalProof='Presidential approval is still required.';
const origin='https://beta.test';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,env:Env,store:V1FeedStore,windowId:string;
let session:string,foreignSession:string,requests:string[];

beforeEach(async()=>{
  ctx=await createIntakeDatabase({product:true});
  store=new V1FeedStore(ctx.db);
  await seedIntakeScope(new V1IntakeStore(ctx.db));
  await store.registerFeed({...feedFixture,createdAt:'2026-10-03T11:00:00Z',briefingFrequency:'30M'});
  await ctx.db.exec("INSERT INTO accounts(id,email,normalized_email,username,role,password_hash,email_verified_at,created_at,updated_at) VALUES('owner-1','owner@example.invalid','owner@example.invalid','owner','admin','fixture','2026-10-03','2026-10-03','2026-10-03'),('other','other@example.invalid','other@example.invalid','other','admin','fixture','2026-10-03','2026-10-03','2026-10-03'); INSERT INTO briefings(id,owner_account_id,slug,title,interest_profile,public_feed_enabled,created_at,updated_at) VALUES('feed-1','owner-1','review','Review','banking reform',1,'2026-10-03','2026-10-03');");
  const repo=new D1Repository(ctx.db);
  env={DB:ctx.db,ADMIN_SESSION_SECRET:'local-integration-fixture',BRIEFING_ENGINE:'v3',V1_DOWNSTREAM_ENABLED:'true',
    V1_DOWNSTREAM_FEED_SOURCE_IDS:'feed-source-1',OPENROUTER_API_KEY:'fixture',BRIEFING_SOURCE_BINDINGS_ENABLED:'true',
    BRIEFING_V5_GENERATION_PROFILE:'gemini-ai-studio-flex',BRIEFING_V5_EDITOR_REVIEW_ENABLED:'true'} as Env;
  session=await createSession(env.ADMIN_SESSION_SECRET!, (await repo.getAccountById('owner-1'))!);
  foreignSession=await createSession(env.ADMIN_SESSION_SECRET!, (await repo.getAccountById('other'))!);
  const acquiredAt='2026-10-03T12:10:00Z';
  await acceptEvidence(store,1,'Parliament approved banking reform legislation. '+approvalProof,'publisher-1',acquiredAt,'en','2026-10-03T12:05:00Z');
  await processV1Reassessment(env,JSON.stringify(['REASSESS','observation-1','']),acquiredAt);
  windowId=await windowIdentity('feed-1',window);
  requests=[];
});
afterEach(async()=>ctx?.dispose());

const app=createApp({now:()=>new Date('2026-10-03T12:32:00Z')});
const fetchReview=(method:string,body?:unknown,settings:Partial<Env>={},cookie=session,requestOrigin=origin,pathSuffix=windowId)=>
  app.fetch(new Request(origin+'/api/admin/v5-editorial/feed-1/'+pathSuffix,{
    method,headers:{cookie:'dn_session='+cookie,origin:requestOrigin,'content-type':'application/json'},
    ...(body===undefined?{}:{body:JSON.stringify(body)}),
  }),{...env,...settings});
const canPublish={BRIEFING_V5_EDITOR_PUBLICATION_ENABLED:'true'};

async function shadow(transportFailure=false){
  const provider=(async(_url:unknown,init?:RequestInit)=>{
    const body=JSON.parse(String(init?.body)),system:string=body.messages[0].content;
    requests.push(system);
    if(transportFailure&&!system.startsWith('You are the editor'))return new Response('Rejected by fixture provider',{status:400});
    const content=system.startsWith('You are the editor')?{items:[{headline:'Banking reform in Parliament',body:approvalProof,
      sources:['S1'],relation:'new',updates:null,importance:1}],source_decisions:{S1:{decision:'selected',why:'Approval still required'}}}:
      {unusable:[]};
    return Response.json({id:'gen-editor-workflow-'+requests.length,choices:[{message:{content:JSON.stringify(content)},finish_reason:'stop'}],
      usage:{prompt_tokens:100,completion_tokens:50,cost:.001}});
  }) as typeof fetch;
  const result=await processV1Briefing(env,{type:'v1_briefing',feedId:'feed-1',window},()=>window.end,undefined,provider);
  expect(result).toBeUndefined();
  expect(requests.some(system=>system.startsWith('Independently'))).toBe(true);
  expect(await store.list('feed-1','editions')).toEqual([]);
  expect(await store.list('feed-1','delivery_jobs')).toEqual([]);
  const response=await fetchReview('GET');
  expect(response.status).toBe(200);
  expect(response.headers.get('Cache-Control')).toContain('no-store');
  const view=await response.json<any>();
  expect(view.candidates).toContainEqual(expect.objectContaining({stage:'writer',candidates:[
    expect.objectContaining({headline:'Banking reform in Parliament',sourceIds:[view.sources[0].id]}),
  ]}));
  expect(view.review.failure).toBeTruthy();
  expect(view.operations.some((row:any)=>row.originalWriterReply?.includes(approvalProof))).toBe(true);
  if(transportFailure){
    expect(view.usage.knownBilledUsd).toBeCloseTo(.001);
    expect(view.usage.unresolved).toBeGreaterThan(0);
    expect(view.usage.unresolvedReserveUsd).toBeGreaterThan(0);
  }else{
    expect(view.candidates).toContainEqual(expect.objectContaining({stage:'verification_flagged',reasons:[
      expect.objectContaining({reason:expect.stringContaining('SOURCE_BINDING_ASSESSMENT_UNRESOLVED')}),
    ]}));
    expect(view.usage.knownBilledUsd).toBeCloseTo(requests.length*.001);
  }
  return view;
}

const story=(source:string,body=approvalProof)=>({
  headline:'Banking bill still awaits presidential approval',body,relation:'new',
  support:[{evidenceRevisionId:source,quote:approvalProof}],
});
const save=(view:any,stories:unknown[],version=0)=>fetchReview('POST',{
  action:'save',version,historyDigest:view.historyDigest,stories,
});
async function approve(view:any,stories:unknown[]){
  expect((await save(view,stories)).status).toBe(200);
  const updated=await (await fetchReview('GET')).json<any>();
  expect(updated.revision.stories).toEqual(stories);
  const response=await fetchReview('POST',{action:'approve',version:updated.state.version,digest:updated.revision.digest,attested:true});
  expect(response.status).toBe(200);
  return {action:'publish',version:(await response.json<any>()).version,digest:updated.revision.digest};
}

it('retains failed drafts, checks permissions, and publishes only the exact approved revision once',async()=>{
  const view=await shadow();
  expect((await fetchReview('GET',undefined,{},foreignSession)).status).toBe(404);
  expect((await fetchReview('GET',undefined,{BRIEFING_V5_EDITOR_REVIEW_ENABLED:'false'})).status).toBe(404);
  expect((await fetchReview('POST',{action:'reject',version:0,note:'unauthorized'},{},session,'https://other.test')).status).toBe(403);
  expect((await fetchReview('POST',{action:'publish',version:1,digest:'0'.repeat(64)},canPublish)).status).toBe(409);
  expect((await save(view,[story('foreign-source')])).status).toBe(409);
  const bad=story(view.sources[0].id);
  bad.support[0].quote='A claim absent from the frozen source.';
  expect((await save(view,[bad])).status).toBe(400);
  expect((await save(view,[story(view.sources[0].id,'Words '.repeat(120).trim())])).status).toBe(400);
  const approved=await approve(view,[story(view.sources[0].id)]);
  expect((await fetchReview('POST',approved)).status).toBe(403);
  expect(await store.publishedEditionHistory('feed-1')).toHaveLength(0);
  expect(await publicV1Edition(ctx.db,windowId)).toBeUndefined();
  expect(await store.list('feed-1','delivery_jobs')).toHaveLength(0);

  // An edit invalidates earlier approval. Saving and approval write audit rows,
  // and neither one is a publication action.
  const body='Parliament passed the bill. '+approvalProof;
  expect((await save(view,[story(view.sources[0].id,body)],approved.version)).status).toBe(200);
  expect((await fetchReview('POST',approved,canPublish)).status).toBe(409);
  const edited=await (await fetchReview('GET')).json<any>();
  const disallowed=await fetchReview('POST',{action:'publish',version:edited.state.version,digest:edited.revision.digest},canPublish);
  expect(disallowed.status).toBe(409);
  const reapproval=await fetchReview('POST',{action:'approve',version:edited.state.version,digest:edited.revision.digest,attested:true});
  expect(reapproval.status).toBe(200);
  const request={action:'publish',version:(await reapproval.json<any>()).version,digest:edited.revision.digest};
  const [result,retry]=await Promise.all([fetchReview('POST',request,canPublish),fetchReview('POST',request,canPublish)]);
  expect(result.status).toBe(200);
  expect(retry.status).toBe(200);
  const receipt=await result.json<any>();
  expect(await retry.json()).toEqual(receipt);
  const publicEdition=await publicV1Edition(ctx.db,windowId);
  const [edition]=await store.publishedEditionHistory('feed-1');
  expect(publicEdition?.stories[0].claims[0]).toMatchObject({text:story(view.sources[0].id).headline+'\n'+body,
    support:[{evidenceRevisionId:view.sources[0].id,quote:approvalProof}]});
  expect(receipt.publishedDigest).toBe(await reviewDigest(edition));
  expect(edition.editorialApprovalId).toBe(receipt.decisionId);
  expect(await store.list('feed-1','delivery_jobs')).toHaveLength(1);
  expect(await store.list('feed-1','v5_review_decisions')).toHaveLength(2);
  expect(await store.list('feed-1','v5_review_revisions')).toHaveLength(2);

  const forged={...edition,id:'manual-bypass',editorialApprovalId:undefined} as BriefingEditionRecord;
  await expect(feedTransact(store,'feed-1',tx=>tx.write('editions',forged.id,forged))).rejects.toMatchObject({code:'SCOPE_DENIED'});
},60_000);

it('rejects an edition without delivery and holds approval after evidence is revoked',async()=>{
  const view=await shadow();
  const approved=await approve(view,[story(view.sources[0].id)]);
  expect((await fetchReview('POST',{action:'reject',version:approved.version,note:'Evidence needs further reporting.'})).status).toBe(200);
  expect((await fetchReview('POST',approved,canPublish)).status).toBe(409);
  const rejected=await (await fetchReview('GET')).json<any>();
  expect(rejected.state.status).toBe('rejected');
  expect(rejected.decisions.at(-1)).toMatchObject({decision:'reject',editorId:'owner-1'});
  expect((await save(view,[story(view.sources[0].id)],rejected.state.version)).status).toBe(200);
  const revised=await (await fetchReview('GET')).json<any>();
  const reapproval=await fetchReview('POST',{action:'approve',version:revised.state.version,digest:revised.revision.digest,attested:true});
  expect(reapproval.status).toBe(200);
  const publish={action:'publish',version:(await reapproval.json<any>()).version,digest:revised.revision.digest};
  // Seed an earlier edition that reached the reader after the editor approved.
  await ctx.db.prepare("INSERT INTO v1_feed_documents(kind,id,feed_id,json) VALUES('editions','earlier-archive','feed-1',?)")
    .bind(JSON.stringify({id:'earlier-archive',feedId:'feed-1',createdAt:window.start,windowEnd:window.start,
      evidenceRevisionIds:[],stories:[{candidateId:'earlier-story',claims:[{text:'Earlier reporting'}]}]})).run();
  await ctx.db.prepare("INSERT INTO v1_feed_documents(kind,id,feed_id,json) VALUES('publication_status','earlier-archive','feed-1',?)")
    .bind(JSON.stringify({id:'earlier-archive',feedId:'feed-1',status:'PUBLISHED',publishedAt:window.start})).run();
  const stale=await fetchReview('POST',publish,canPublish);
  expect(stale.status).toBe(409);
  expect(await stale.json()).toEqual({error:'STALE_REVIEW_TEXT_OR_HISTORY'});
  await ctx.db.prepare("UPDATE v1_feed_documents SET json=json_set(json,'$.status','WITHDRAWN') WHERE kind='publication_status' AND id='earlier-archive'").run();
  await ctx.db.prepare("UPDATE v1_intake_scopes SET json=json_set(json,'$.enabled',0),epoch=epoch+1 WHERE id='feed-source-1'").run();
  expect((await fetchReview('POST',publish,canPublish)).status).toBe(409);
  const after=await (await fetchReview('GET')).json<any>();
  expect(after.sources).toEqual([]);
  expect(after.operations.every((row:any)=>row.originalWriterReply===undefined)).toBe(true);
  expect(await store.list('feed-1','delivery_jobs')).toHaveLength(0);
  expect(await store.publishedEditionHistory('feed-1')).toHaveLength(0);
},60_000);

it('leaves a rejected downstream request and its financial exposure recoverable without reissuing it',async()=>{
  const view=await shadow(true);
  expect(view.candidates).toContainEqual(expect.objectContaining({stage:'verify',failure:expect.any(String)}));
  expect((await save(view,[story(view.sources[0].id)])).status).toBe(200);
  const calls=requests.length;
  await processV1Briefing(env,{type:'v1_briefing',feedId:'feed-1',window},()=>window.end,undefined,
    (async()=>{requests.push('unexpected restart');return new Response(null,{status:500});}) as typeof fetch);
  expect(requests).toHaveLength(calls);
  expect(await store.publishedEditionHistory('feed-1')).toHaveLength(0);
},60_000);

it('returns a valid workbench script behind the same admin session and feature flag',async()=>{
  expect(()=>new Function(v5WorkbenchScript)).not.toThrow();
  const request=(path:string,cookie:string)=>new Request(origin+path,{headers:{cookie:'dn_session='+cookie}});
  const server=createServer((incoming,outgoing)=>{
    const headers=new Headers();
    for(const [key,value] of Object.entries(incoming.headers))if(typeof value==='string')headers.set(key,value);
    void Promise.resolve(app.fetch(new Request(origin+incoming.url,{headers}),env)).then(async response=>{
      outgoing.writeHead(response.status,Object.fromEntries(response.headers));
      outgoing.end(await response.text());
    }).catch(()=>{outgoing.statusCode=500;outgoing.end();});
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const address=server.address();
    if(!address||typeof address==='string')throw Error('Loopback server unavailable');
    const response=await fetch('http://127.0.0.1:'+address.port+'/api/admin/v5-editor/workbench',{
      headers:{cookie:'dn_session='+session},
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
    expect(await response.text()).toContain('Approve saved copy');
  }finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
  expect((await app.fetch(request('/api/admin/v5-editor/workbench.js','invalid'),env)).status).toBe(401);
},30_000);
