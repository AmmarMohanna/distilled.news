import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {validateManifest,preflight,admit,digest,budgetStop,PROFILES} from './manifest.mjs';
import {ApplicationClient,bounded,lockRun} from './client.mjs';
import {CampaignObservation,quantile} from './observer.mjs';
import {metricsPayload} from './telemetry.mjs';
import {reconcileAccounting} from './accounting.mjs';
import {renderReport} from './report.mjs';
const manifest=()=>JSON.parse(readFileSync(new URL('./manifests/load.draft.json',import.meta.url),'utf8'));
const temp=()=>mkdtempSync(resolve(tmpdir(),'distilled-contract-'));
// Synthetic contract tests only. These are never real staging measurements.
for(const profile of PROFILES)test('draft validates, does not authorize '+profile,()=>{
 const m=JSON.parse(readFileSync(new URL('./manifests/'+profile+'.draft.json',import.meta.url),'utf8'));assert.equal(validateManifest(m),m);const pf=preflight(m,{});assert.equal(pf.status,'BLOCKED');assert.throws(()=>admit(m,pf,{},'setup'));
});
test('reject production and malformed dimensions before network',()=>{
 for(const change of [{origin:'https://distilled.news'},{users:1},{feedsPerUser:100},{notifications:true},{cleanup:'delete'},{cleanupReserveRequests:0},{deadlineGraceMs:-1},{faults:[{kind:'duplicate-delivery',afterSeconds:0,seconds:10}]}])assert.throws(()=>validateManifest({...manifest(),...change}));
});
test('approval binds exact input, phase, expiry and exposure',()=>{
 const m=manifest(),pf={schemaVersion:'distilled-real-preflight.v1',status:'READY',blockers:[],manifestHash:digest(m),revision:m.revision};const now=Date.now(),a={schemaVersion:'distilled-real-approval.v1',manifestHash:digest(m),preflightHash:digest(pf),revision:m.revision,phases:['setup'],issuedAt:new Date(now-1).toISOString(),expiresAt:new Date(now+1000).toISOString(),maximumUsd:2,maximumRequests:2512,maximumModelCalls:40};
 assert.equal(admit(m,pf,a,'setup',now),true);assert.throws(()=>admit(m,pf,a,'campaign',now));assert.throws(()=>admit(m,pf,a,'setup',now+2000));assert.throws(()=>admit({...m,users:3},pf,a,'setup',now));
});
test('uncertain exposure, missing financial coverage and queue ages stop',()=>{
 const m=manifest(),s={settledUsd:0,outstandingReservedUsd:0,modelCalls:0,uncertainOperations:0,backlog:0,oldestPendingMs:0,safetyViolations:0,coverageComplete:true,financialCoverageComplete:true};assert.deepEqual(budgetStop(m,s),[]);
 assert.ok(budgetStop(m,{...s,uncertainOperations:1}).includes('UNCERTAIN_PAID_OUTCOME'));assert.ok(budgetStop(m,{...s,settledUsd:1.6}).includes('SPENDING_DRAIN_THRESHOLD'));assert.ok(budgetStop(m,{...s,financialCoverageComplete:false}).includes('FINANCIAL_OBSERVATION_INCOMPLETE'));assert.ok(budgetStop(m,{...s,backlog:1,oldestPendingMs:null}).includes('PENDING_AGE_UNOBSERVABLE'));
});
test('client uses real session, origin, no redirects and no auth bypass',async()=>{
 const dir=temp();try{let seen;const c=new ApplicationClient(manifest(),dir,{fetcher:async(url,options)=>{seen={url,options};return new Response('{"authenticated":true}',{headers:{'set-cookie':'dn_session=private; HttpOnly; Secure'}})}});const r=await c.request('/api/auth/session',{cookie:'dn_session=private'});assert.equal(r.cookie,'dn_session=private');assert.equal(seen.options.redirect,'manual');assert.equal(seen.options.headers.Origin,manifest().origin);await assert.rejects(c.request('//evil.test'));assert.ok(existsSync(resolve(dir,'journal.jsonl')));}finally{rmSync(dir,{recursive:true,force:true});}
});
test('unknown mutations never retry and cleanup has reserved capacity',async()=>{
 const dir=temp();try{let calls=0;const m=manifest();m.requestBudget=100;m.trafficRequests=10;m.cleanupReserveRequests=60;const c=new ApplicationClient(m,dir,{fetcher:async()=>{calls++;throw Error('network')}});await assert.rejects(c.request('/api/me/feeds',{method:'POST',body:{}}),/UNKNOWN_DO_NOT_RESEND/);assert.equal(calls,1);c.count=29;await assert.rejects(c.request('/api/auth/session'),/READ_UNAVAILABLE/);await assert.rejects(c.request('/api/auth/session'),/CONTROL_REQUEST_BUDGET/);await assert.rejects(c.request('/api/auth/session',{category:'cleanup-read'}),/READ_UNAVAILABLE/);assert.equal(calls,3);}finally{rmSync(dir,{recursive:true,force:true});}
});
test('exclusive run lock and bounded deterministic results',async()=>{
 const dir=temp();try{const release=lockRun(dir);assert.throws(()=>lockRun(dir),/RUN_LOCKED/);release();let active=0,peak=0;const r=await bounded([3,2,1],2,async x=>{active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,x));active--;if(x===2)throw Error('CONTROL');return x;});assert.equal(peak,2);assert.equal(r[0].value,3);assert.equal(r[1].status,'rejected');assert.equal(r[2].value,1);}finally{rmSync(dir,{recursive:true,force:true});}
});
test('independent denominator includes missing jobs and quiet outcomes',()=>{
 const m=manifest(),window={start:'2026-10-01T00:00:00Z',end:'2026-10-01T00:25:00Z',scheduledFor:'2026-10-01T00:30:00Z'},plan={opportunities:[{id:'one',feedId:'f',window},{id:'two',feedId:'f',window}]},o=new CampaignObservation(m,plan);
 o.accept({schemaVersion:'distilled-real-snapshot.v1',runId:m.runId,observedAt:window.end,work:{},coverageComplete:true,items:[{id:'one',feedId:'f',window,state:'DONE',result:'QUIET',completedAt:'2026-10-01T00:31:00Z',operations:[],citationCount:0,duplicateEditions:0,unownedCitations:0}],feeds:[]});const s=o.summary(Date.parse('2026-10-01T01:00:00Z'));assert.equal(s.offered,2);assert.equal(s.completed,1);assert.equal(s.byDeadlineRate,null);assert.deepEqual(s.byDeadlineBounds,{lower:.5,upper:1});assert.equal(s.coverageComplete,false);assert.equal(s.publicationLatencyMs.p95,null);assert.equal(s.factualAccuracy,null);
});
test('duplicate receipts and changed settlements are safety violations',()=>{
 const m=manifest(),window={start:'2026-10-01T00:00:00Z',end:'2026-10-01T00:30:00Z'},o=new CampaignObservation(m,{opportunities:[{id:'one',feedId:'f',window}]});const s={schemaVersion:'distilled-real-snapshot.v1',runId:m.runId,observedAt:window.end,work:{},coverageComplete:true,feeds:[],items:[{id:'one',feedId:'f',window,operations:[{id:'paid',reported:true,settledUsd:.01}],paymentEvidence:[{operationId:'paid',generationIds:['g1','g2']}],duplicateEditions:1,unownedCitations:1}]};o.accept(s);s.items[0].operations[0].settledUsd=.02;o.accept(s);assert.deepEqual(o.violations.map(v=>v.kind).sort(),['CITATION_OWNERSHIP','DUPLICATE_PUBLICATION','MULTIPLE_GENERATIONS_ONE_PAID_IDENTITY','SETTLEMENT_MUTATED']);
});
test('all-stage accounting prevents double count and unknown categories',()=>{
 const external=['source-assessment','artwork','browser-tools','external-collectors'].map(kind=>({kind,evidenceHash:'proof',coverage:'COMPLETE',includedInModelLedger:true,settledUsd:0,heldUsd:0,uncertainOperations:0}));const data={observedAt:new Date().toISOString(),modelLedger:[{id:'op',reservedUsd:.02,reported:true,settledUsd:.01,calls:1}],external};assert.equal(reconcileAccounting(data).settledUsd,.01);assert.throws(()=>reconcileAccounting({...data,external:external.slice(1)}));assert.throws(()=>reconcileAccounting({...data,modelLedger:[...data.modelLedger,...data.modelLedger]}));
});
test('Grafana labels exclude correlation IDs; missing values omitted',()=>{
 const m=manifest(),payload=metricsPayload(m,{offered:2,byDeadlineRate:null,settledUsd:0,financialCoverageComplete:true});const json=JSON.stringify(payload);assert.ok(!json.includes(m.runId));assert.ok(!json.includes('by_deadline_ratio'));assert.ok(json.includes('settled_usd'));assert.ok(!json.includes('feed_id'));assert.equal(quantile([], .95),null);assert.equal(quantile([10,20],.5),15);
});
test('unexecuted reports say NOT RUN, escape private input',()=>{const html=renderReport({...manifest(),profile:'<script>'},null,null);assert.match(html,/NOT RUN/);assert.ok(!html.includes('<script>'));assert.match(html,/No capacity conclusion/);});
import {setup,archive} from './lifecycle.mjs';
import {inspectResources} from './resources.mjs';
import {reserveControlPlane} from './control-budget.mjs';
import {configure,bridge} from './adapter.mjs';
test('ordinary account/feed lifecycle orders admission before paid setup and archives without deletion (fixture)',async()=>{
 const dir=temp(),m=manifest(),events=[],owned=new Map();
 try{
  const client={request:async(path,o={})=>{
   events.push({path,...o});const slot=o.cookie?.match(/offline-(\d+)/)?.[1],owner='owner-'+slot;
   if(path==='/api/auth/register')return {value:{ok:true}};
   if(path==='/api/auth/verify-email'){const i=o.body.token;return {cookie:'dn_session=offline-'+i,value:{account:{id:'owner-'+i,username:`qa${m.runId}u${i}`}}};}
   if(path==='/api/auth/login'){const i=o.body.email.match(/-u(\d+)@/)[1];return {cookie:'dn_session=offline-'+i,value:{account:{id:'owner-'+i}}};}
   if(path==='/api/auth/session')return {value:{authenticated:true,account:{id:owner}}};
   if(path==='/api/me/briefings'&&o.method!=='POST')return {value:{briefings:owned.get(owner)??[]}};
   if(path.endsWith('/register'))return {value:{registered:true}};
   if(path==='/api/me/feeds'){const f={...o.body,ownerAccountId:owner,slug:o.body.id};owned.set(owner,[...(owned.get(owner)??[]),f]);return {value:{briefing:f}};}
   if(path.startsWith('/api/me/sources?'))return {value:{sources:[]}};
   if(path==='/api/me/briefings'&&o.method==='POST')return {value:{briefing:o.body}};
   if(path.startsWith('/api/admin/accounts/'))return {value:{ok:true}};
   throw Error('UNPLANNED_FIXTURE_REQUEST');
  }};
  const registry=await setup(m,client,dir,{emailDomain:'example.test',adminCookie:'dn_session=offline-admin',challenge:async()=> 'offline-only',mailbox:async({email})=>email.match(/-u(\d+)@/)[1],authorizeAccount:async({user})=>{events.push({path:'ADMISSION',id:user.id});return {runId:m.runId,accountId:user.id,authoritative:true,maximumUsd:.6,evidenceHash:'offline-proof'};}});
  assert.equal(registry.users.length,2);assert.equal(registry.users.flatMap(u=>u.feeds).length,4);
  for(const u of registry.users){const firstFeed=events.findIndex(e=>e.path==='/api/me/feeds'&&e.cookie===u.cookie),admission=events.findIndex(e=>e.path==='ADMISSION'&&e.id===u.id);assert.ok(admission<firstFeed);}
  const result=await archive(m,client,dir,{adminCookie:'dn_session=offline-admin'});assert.ok(result.users.every(u=>u.state==='ARCHIVED'));assert.ok(events.every(e=>e.method!=='DELETE'));assert.equal(events.filter(e=>e.category==='archive-feed').length,4);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('Cloudflare authentication failure stays UNKNOWN rather than zero or absent resource',async()=>{
 const m=manifest(),env={CAMPAIGN_CLOUDFLARE_ACCOUNT:'a'.repeat(32),CAMPAIGN_CLOUDFLARE_TOKEN:'offline-only'};let calls=0;
 const result=await inspectResources(m,env,async()=>{calls++;return new Response('{}',{status:401})});assert.equal(calls,2);assert.equal(result.accountUsage,null);assert.equal(result.worker.exists,null);assert.equal(result.worker.status,'UNVERIFIED');
});
test('private QA bridge denies unapproved origins before sending credentials',async()=>{
 const dir=temp();try{const m=manifest();configure(m,dir);let calls=0;await assert.rejects(bridge('MAILBOX',{}, {CAMPAIGN_MAILBOX_URL:'https://wrong.test/token',CAMPAIGN_PRIVATE_API_ORIGINS:'https://approved.test',CAMPAIGN_PRIVATE_API_TOKEN:'offline-only'},async()=>{calls++;}),/AUTHORIZED_PRIVATE_QA_API_REQUIRED/);assert.equal(calls,0);}finally{rmSync(dir,{recursive:true,force:true});}
});
test('control-plane requests persist and fail closed at exact ceiling',()=>{
 const dir=temp();try{const m={...manifest(),controlPlaneRequestBudget:1};reserveControlPlane(m,dir,'offline-read');assert.throws(()=>reserveControlPlane(m,dir,'offline-read'),/CONTROL_PLANE_REQUEST_BUDGET/);}finally{rmSync(dir,{recursive:true,force:true});}
});
test('in-flight reservations remain exposure without inventing an uncertain charge',()=>{
 const external=['source-assessment','artwork','browser-tools','external-collectors'].map(kind=>({kind,evidenceHash:'offline-proof',coverage:'COMPLETE',includedInModelLedger:true,settledUsd:0,heldUsd:0,uncertainOperations:0}));const modelLedger=[{id:'reserved',reservedUsd:.02,reported:false,calls:0,outcome:'IN_FLIGHT'}];
 const result=reconcileAccounting({observedAt:new Date().toISOString(),modelLedger,external});assert.equal(result.uncertainOperations,0);assert.equal(result.outstandingReservedUsd,.02);assert.equal(result.settledUsd,0);
});
import {seal,unseal} from './artifact-crypto.mjs';
test('private artifacts authenticate ciphertext and never contain their key',()=>{
 const key='12'.repeat(32),plain=Buffer.from('OFFLINE ONLY credentials/result fixture'),box=seal(plain,key);assert.deepEqual(unseal(box,key),plain);assert.ok(!JSON.stringify(box).includes(key));assert.ok(!JSON.stringify(box).includes(plain.toString()));assert.throws(()=>unseal({...box,tag:'00'.repeat(16)},key));
});
import {assertStartupFresh} from './manifest.mjs';
import {readViolation} from './journeys.mjs';
test('cleanup may quiesce its scope after capacity evidence ages, but work cannot',()=>{
 const now=Date.now(),pf={observedAt:new Date(now-7200000).toISOString()};assert.throws(()=>assertStartupFresh(pf,'campaign',now),/FRESH_INITIAL_PREFLIGHT_REQUIRED/);assert.doesNotThrow(()=>assertStartupFresh(pf,'cleanup',now));
 // This exception never changes the admission check on authorization expiry.
 const m=manifest(),p={schemaVersion:'distilled-real-preflight.v1',status:'READY',blockers:[],manifestHash:digest(m),revision:m.revision};
 assert.throws(()=>admit(m,p,{schemaVersion:'distilled-real-approval.v1',manifestHash:digest(m),preflightHash:digest(p),revision:m.revision,phases:['cleanup'],issuedAt:new Date(now-10000).toISOString(),expiresAt:new Date(now-1).toISOString()},'cleanup',now),/APPROVAL_EXPIRED/);
});
test('successful HTTP cannot hide wrong account/feed data or private Explore entries',()=>{
 const user={id:'owner'},feed={id:'owned'};assert.equal(readViolation('account',200,{account:{id:'other'}},user,feed),'ACCOUNT_RESPONSE_MISMATCH');assert.equal(readViolation('feed',200,{briefing:{id:'other',ownerAccountId:'owner'}},user,feed),'FEED_RESPONSE_MISMATCH');assert.equal(readViolation('owned-feeds',200,{},user,feed),'OWNED_FEED_SCOPE_MISMATCH');assert.equal(readViolation('explore',200,{feeds:[{id:'private',ownerAccountId:'other',publicFeedEnabled:false}]},user,feed),'EXPLORE_VISIBILITY_MISMATCH');assert.equal(readViolation('feed',200,{briefing:{id:'owned',ownerAccountId:'owner'}},user,feed),null);assert.equal(readViolation('explore',200,{feeds:[]},user,feed),null);
});
