import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {assertCampaignFeed,campaignAvailable,scheduledOpportunities,registerCampaignFeed,snapshotCampaign,campaignEvidence,campaignSourceProbe} from './agentops-campaign';
import {campaignInterruptAfterResult} from './agentops-campaign-fault';
import {createIntakeDatabase} from './v1-intake/test-utils';
import {createApp} from './app';
import {hashPassword} from './auth';
import {D1Repository,InMemoryRepository} from './repository';
import {applyTestMigration} from './test-migrations';
import type {Env,Repository} from './types';
import type {BriefingConfig} from '@distilled/core';
const run='contract001',id='qa_contract001_u0_f0';
const feed={id,ownerAccountId:'owner',ownerUsername:'qacontract001u0',updateIntervalMinutes:30,briefingTimezone:'UTC',briefingTimeOfDay:'00:00',briefingScheduleClockStartAt:'2026-10-31T19:05:40.000Z',briefingSchedulePolicy:'clock-aligned-delivery-v2',slug:'qa',publicFeedEnabled:false,language:'en'} as BriefingConfig;
describe('private campaign guards (offline)',()=>{
 it('is completely off for ordinary and production environments',async()=>{
  const prepare=vi.fn(()=>{throw Error('UNEXPECTED_QUERY')});const env={DB:{prepare}} as unknown as Env;
  expect(campaignAvailable(env)).toBe(false);await campaignInterruptAfterResult(env,id);expect(prepare).not.toHaveBeenCalled();
  expect(campaignAvailable({...env,ENVIRONMENT:'production',AGENTOPS_CAMPAIGN_ENABLED:'true',AGENTOPS_CAMPAIGN_ISOLATED:'true'})).toBe(false);
  expect(campaignAvailable({...env,ENVIRONMENT:'staging',AGENTOPS_CAMPAIGN_ENABLED:'true',AGENTOPS_CAMPAIGN_ISOLATED:'true',VAPID_PRIVATE_KEY:'present'})).toBe(false);
 });
 it('uses existing admin authentication and refuses cross-origin/default-off requests',async()=>{
  const repo=new InMemoryRepository(),app=createApp({repository:repo});
  const config={ADMIN_SESSION_SECRET:'offline-test-secret',ENVIRONMENT:'staging',AGENTOPS_CAMPAIGN_ENABLED:'true',AGENTOPS_CAMPAIGN_ISOLATED:'true'} as Env;
  const route='/api/admin/agentops/campaigns/'+run+'/snapshot';
  expect((await app.request(route,{method:'POST'},config)).status).toBe(401);
  for(const role of ['user','admin'] as const){
   await repo.createAccount({email:role+'@example.test',username:'offline-'+role,role,passwordHash:await hashPassword('offline-test-password'),emailVerifiedAt:new Date().toISOString()});
   const login=await app.request('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:role+'@example.test',password:'offline-test-password'})},config);
   expect(login.status).toBe(200);const cookie=login.headers.get('set-cookie')!.split(';')[0];
   const options={method:'POST',headers:{cookie,origin:'http://localhost','content-type':'application/json'},body:'{bad'};
   if(role==='user')expect((await app.request(route,options,config)).status).toBe(401);
   else{
    expect((await app.request(route,options,{...config,AGENTOPS_CAMPAIGN_ENABLED:'false'})).status).toBe(404);
    expect((await app.request(route,{...options,headers:{...options.headers,origin:'https://other.test'}},config)).status).toBe(403);
    expect((await app.request(route,options,config)).status).toBe(400);
   }
  }
 });
 it('rejects foreign feed namespaces' ,()=>{expect(()=>assertCampaignFeed(run,'existing-user-feed')).toThrow('SCOPE_DENIED');expect(()=>assertCampaignFeed(run,'qa_other001_u0_f0')).toThrow();expect(()=>assertCampaignFeed(run,id)).not.toThrow();});
 it('uses the actual persisted schedule for complete consecutive opportunities',()=>{
  const out=scheduledOpportunities(feed,'2026-10-31T19:05:40.000Z','2026-10-31T20:30:00.000Z');expect(out.map(o=>o.window.scheduledFor)).toEqual(['2026-10-31T19:30:00.000Z','2026-10-31T20:00:00.000Z','2026-10-31T20:30:00.000Z']);expect(out[0].window.start).toBe(feed.briefingScheduleClockStartAt);expect(out[0].window.end).toBe('2026-10-31T19:25:00.000Z');expect(out[1].window.start).toBe(out[0].window.end);expect(out[2].window.start).toBe(out[1].window.end);
 });
 it('rejects unregistered ownership without writing anything',async()=>{
  const env={DB:{prepare:vi.fn()}} as unknown as Env;const repo={getAccountById:async()=>({id:'foreign',role:'user',username:'other',emailVerifiedAt:'now'})} as unknown as Repository;
  await expect(registerCampaignFeed(env,repo,run,id,'foreign')).rejects.toThrow('SCOPE_DENIED');expect(env.DB.prepare).not.toHaveBeenCalled();
 });
});
describe('campaign-only schema and interruption (local D1)',()=>{
 let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>;
 beforeEach(async()=>{ctx=await createIntakeDatabase({product:true});await applyTestMigration(ctx.db,readFileSync(new URL('../../../ops/performance/0001_campaign_controls.sql',import.meta.url),'utf8'));});
 afterEach(async()=>{await ctx?.dispose();});
 it('performs bounded actual SQL reads for owned feeds and rejects forged windows',async()=>{
  const repo=new D1Repository(ctx.db),account=await repo.createAccount({email:'qa@example.test',username:'qacontract001u0',role:'user',passwordHash:'offline-only',emailVerifiedAt:new Date().toISOString()});
  const config=await repo.upsertBriefing({...feed,ownerAccountId:account.id,title:'Offline QA',stars:0,interestProfile:'Offline contract test',paused:false,intensity:'medium',briefingCadence:'hourly',retentionDays:7} as BriefingConfig);
  const env={DB:ctx.db} as Env;await registerCampaignFeed(env,repo,run,id,account.id);
  const opportunity=scheduledOpportunities(config,'2026-10-31T19:05:40.000Z','2026-10-31T19:30:00.000Z')[0];
  const snapshot=await snapshotCampaign(env,repo,run,{opportunities:[opportunity]});
  const evidence=await campaignEvidence(env,repo,run,opportunity);expect(evidence.input).toBeNull();expect(evidence.result).toBeNull();expect(evidence.operations).toEqual([]);
  expect(snapshot.items[0].state).toBe('NOT_CREATED');expect(snapshot.items[0].operations).toEqual([]);expect(snapshot.financial).toHaveLength(1);expect(snapshot.work.queries).toBeLessThan(15);expect(snapshot.work.rowsRead).toBeLessThan(100);
  await expect(snapshotCampaign(env,repo,run,{opportunities:[{...opportunity,window:{...opportunity.window,scheduledFor:'2026-10-31T19:31:00.000Z'}}]})).rejects.toThrow('CAMPAIGN_SCOPE_DENIED');
  expect(await ctx.db.prepare('SELECT count(*) AS n FROM v1_model_spending_reservations').first('n')).toBe(0);
  await ctx.db.prepare('INSERT INTO v1_feeds(id,json) VALUES(?,?)').bind(id,JSON.stringify({id,revision:1})).run();
  const {windowIdentity}=await import('./v1-intelligence/runtime'),windowId=await windowIdentity(id,opportunity.window),operation='observed-editor';
  await ctx.db.prepare("INSERT INTO v1_feed_documents(kind,id,feed_id,json) VALUES('semantic_intents',?,?,?)").bind(operation,id,JSON.stringify({id:operation,input:{budgetKey:'v3:'+windowId},reservedCostUsd:.05})).run();
  for(const [key,billing,ownedFeed] of [['semantic_intents:'+operation,'provider-billing',id],['unrelated-owner-row',account.id,'not-campaign-feed']])await ctx.db.prepare('INSERT INTO v1_model_spending_reservations VALUES(?,?,NULL,?,?,?,?,?,?,?)').bind(key,billing,'token','openai/gpt-4.1',ownedFeed,.05,0,'2026-10-31T19:25:00Z','{}').run();
  await ctx.db.prepare('INSERT INTO v1_model_spending_settlements VALUES(?,?,?,?)').bind('semantic_intents:'+operation,'token',.012,1).run();
  const actual=await snapshotCampaign(env,repo,run,{opportunities:[opportunity]});
  expect(actual.financial[0].reservations).toEqual([{id:'semantic_intents:'+operation,billingAccountId:'provider-billing',model:'openai/gpt-4.1',reservedUsd:.05,settledUsd:.012,reported:true}]);

 });
 it('interrupts only the explicitly scoped unexpired control and leaves it durable',async()=>{
  const until=new Date(Date.now()+60000).toISOString();await ctx.db.prepare('INSERT INTO agentops_campaign_feeds(feed_id,run_id,owner_id,created_at,interrupt_until) VALUES(?,?,?,?,?)').bind(id,run,'owner',new Date().toISOString(),until).run();
  const env={DB:ctx.db,ENVIRONMENT:'staging',AGENTOPS_CAMPAIGN_ENABLED:'true',AGENTOPS_CAMPAIGN_ISOLATED:'true',AGENTOPS_CAMPAIGN_ALLOW_FAULTS:'true'} as Env;
  await expect(campaignInterruptAfterResult(env,id)).rejects.toThrow('CAMPAIGN_INJECTED_AFTER_DURABLE_RESULT');
  await expect(campaignInterruptAfterResult({...env,AGENTOPS_CAMPAIGN_ALLOW_FAULTS:'false'},id)).resolves.toBeUndefined();
  await ctx.db.prepare('UPDATE agentops_campaign_feeds SET interrupt_until=? WHERE feed_id=?').bind('2020-01-01T00:00:00Z',id).run();await expect(campaignInterruptAfterResult(env,id)).resolves.toBeUndefined();
  expect(await ctx.db.prepare('SELECT count(*) AS n FROM agentops_campaign_feeds').first('n')).toBe(1);
 });
});

describe('sanitized campaign source diagnostic',()=>{
 const base={ENVIRONMENT:'staging',AGENTOPS_CAMPAIGN_ENABLED:'true',AGENTOPS_CAMPAIGN_ISOLATED:'true',SOURCE_EXECUTION_URL:'http://127.0.0.1/v1/source-execution',SOURCE_EXECUTION_TOKEN:'x'.repeat(32)};
 it('distinguishes failed HTTP runtime execution from capacity without returning sensitive prose',async()=>{
  const fetch=vi.fn(async()=>new Response(JSON.stringify({error:'EXECUTION_FAILED',detail:'private-session-secret'}),{status:502}));
  const result=await campaignSourceProbe({...base,SOURCE_EXECUTION_SERVICE:{fetch}} as unknown as Env,'lebanonnews2');
  expect(result.ok).toBe(false);expect(result.steps[0]).toMatchObject({kind:'telegram_resolve',status:502,code:'EXECUTION_FAILED'});
  expect(result).toMatchObject({code:'SOURCE_EXECUTION_UNAVAILABLE'});expect(JSON.stringify(result)).not.toContain('private-session-secret');expect(fetch).toHaveBeenCalledTimes(1);
 });
 it('preserves public channel records and exposes only freshness bounds',async()=>{
  const fetch=vi.fn(async(_url:unknown,init:any)=>new Response(JSON.stringify(JSON.parse(init.body).kind==='telegram_resolve'?{channelId:'-100123',username:'lebanonnews2'}:{channelId:'-100123',records:[{id:1,text:'private raw source body',publishedAt:'2026-11-02T12:00:00Z'}]})));
  const result=await campaignSourceProbe({...base,SOURCE_EXECUTION_SERVICE:{fetch}} as unknown as Env,'lebanonnews2');
  expect(result).toMatchObject({ok:true,records:1,latestPublishedAt:'2026-11-02T12:00:00Z'});expect(fetch).toHaveBeenCalledTimes(2);expect(JSON.stringify(result)).not.toContain('private raw source body');
 });
 it('remains unavailable outside isolated campaigns and reports format failures honestly',async()=>{
  await expect(campaignSourceProbe({} as Env,'lebanonnews2')).rejects.toThrow('CAMPAIGN_SCOPE_DENIED');
  const fetch=vi.fn(async()=>new Response(JSON.stringify({channelId:'123',username:'lebanonnews2'})));
  expect(await campaignSourceProbe({...base,SOURCE_EXECUTION_SERVICE:{fetch}} as unknown as Env,'lebanonnews2')).toMatchObject({ok:false,code:'TELEGRAM_IDENTITY_UNVERIFIED'});
 });
});
