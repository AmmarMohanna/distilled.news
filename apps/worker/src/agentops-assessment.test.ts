import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {createIntakeDatabase} from './v1-intake/test-utils';
import {campaignAssessmentFetcher} from './agentops-assessment';
import {isolateExpiredModelExecutions} from './v1-intelligence/model-capacity-recovery';
import {authorizeModelSpending} from './v1-intelligence/model-spending';
import type {Env} from './types';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>;
beforeEach(async()=>{ctx=await createIntakeDatabase({modelSpending:false})});afterEach(async()=>ctx.dispose());
async function fixture(){const now=Date.now();await authorizeModelSpending(ctx.db,{id:'pilot-authorized',accountId:'pilot-provider',validFrom:new Date(now-1000).toISOString(),validUntil:new Date(now+3600000).toISOString(),modelIds:['openai/gpt-4.1-mini'],maxExposureUsd:1,maxConcurrentOperations:3,maxOperations:2,feedIds:['assessment:owner']});const objects=new Map<string,string>();const env={DB:ctx.db,ENVIRONMENT:'staging',AGENTOPS_CAMPAIGN_ENABLED:'true',AGENTOPS_CAMPAIGN_ISOLATED:'true',RAW_ARCHIVE:{put:async(k:string,v:string)=>{objects.set(k,v)},get:async(k:string)=>objects.has(k)?{json:async()=>JSON.parse(objects.get(k)!)}:null}} as unknown as Env;return {env,objects}}
const url='https://openrouter.ai/api/v1/chat/completions',init={method:'POST',body:JSON.stringify({model:'openai/gpt-4.1-mini',max_tokens:300,messages:[{role:'user',content:'retained evidence'}]})};
const searchInit={...init,body:JSON.stringify({...JSON.parse(init.body),max_tool_calls:1,tools:[{type:'openrouter:web_search',parameters:{engine:'exa',mode:'fast',max_uses:1,max_results:25,max_total_results:25,max_characters:1000}}]})};
it('reserves search fees and retrieved input before invoking the provider and reuses its receipt',async()=>{
 const {env}=await fixture();let held=0;
 const remote=vi.fn(async()=>{held=Number(await ctx.db.prepare('SELECT reserved_cost_usd FROM v1_model_spending_reservations').first('reserved_cost_usd'));return Response.json({id:'search-generation',usage:{cost:.01},choices:[]});});
 const paid=campaignAssessmentFetcher(env,'owner',remote as typeof fetch);
 await paid(url,searchInit);await paid(url,searchInit);
 expect(held).toBeGreaterThan(.75);expect(remote).toHaveBeenCalledOnce();
});
it('rejects unbounded search parameters before any reservation or provider call',async()=>{
 const {env}=await fixture(),remote=vi.fn();const body=JSON.parse(searchInit.body);body.tools[0].parameters.max_uses=2;
 await expect(campaignAssessmentFetcher(env,'owner',remote as typeof fetch)(url,{...init,body:JSON.stringify(body)})).rejects.toThrow('ASSESSMENT_UNBOUNDED_SEARCH');
 expect(remote).not.toHaveBeenCalled();expect(await ctx.db.prepare('SELECT COUNT(*) n FROM v1_model_spending_reservations').first('n')).toBe(0);
});
it('retains the hold and never retries when a search receipt exceeds its bounded size',async()=>{
 const {env}=await fixture(),remote=vi.fn(async()=>new Response('x'.repeat(262145))),paid=campaignAssessmentFetcher(env,'owner',remote as typeof fetch);
 await expect(paid(url,searchInit)).rejects.toThrow('ASSESSMENT_RECEIPT_TOO_LARGE');
 await expect(paid(url,searchInit)).rejects.toThrow('UNCERTAIN_ASSESSMENT_NO_RESEND');expect(remote).toHaveBeenCalledOnce();
});
it('records real usage once and replays a saved response without another paid request',async()=>{const {env}=await fixture(),remote=vi.fn(async()=>Response.json({id:'real-provider-generation',usage:{cost:.001},choices:[]})),paid=campaignAssessmentFetcher(env,'owner',remote as typeof fetch);expect((await paid(url,init)).status).toBe(200);expect((await paid(url,init)).status).toBe(200);expect(remote).toHaveBeenCalledTimes(1);expect(await ctx.db.prepare('SELECT cost_usd,reported FROM v1_model_spending_settlements').first()).toEqual({cost_usd:.001,reported:1})});
it('an uncertain request retains its reservation and cannot be resent',async()=>{const {env}=await fixture(),remote=vi.fn(async()=>{throw Error('connection lost')}),paid=campaignAssessmentFetcher(env,'owner',remote as typeof fetch);await expect(paid(url,init)).rejects.toThrow('connection lost');await expect(paid(url,init)).rejects.toThrow('UNCERTAIN_ASSESSMENT_NO_RESEND');expect(remote).toHaveBeenCalledTimes(1);expect(await ctx.db.prepare('SELECT COUNT(*) n FROM v1_model_spending_reservations').first('n')).toBe(1)});
it('ordinary deployments retain their existing transport and scope mismatch never calls a provider',async()=>{const remote=vi.fn();expect(campaignAssessmentFetcher({} as Env,undefined,remote as typeof fetch)).toBe(remote);const {env}=await fixture();await expect(campaignAssessmentFetcher(env,'foreign',remote as typeof fetch)(url,init)).rejects.toThrow('ACCOUNT_FEED_SCOPE_DENIED');expect(remote).not.toHaveBeenCalled()});

it('accounts for opted-in QA assessment without taking the scheduled briefing slot',async()=>{
 const {env}=await fixture(),remote=vi.fn<typeof fetch>();
 const guarded=campaignAssessmentFetcher({...env,ENVIRONMENT:'qa',SOURCE_ASSESSMENT_SHARED_MODEL_CAPACITY_ENABLED:'true',V1_PROVIDER_MAX_CONCURRENCY:'1'},'owner',remote);
 await expect(guarded(url,init)).rejects.toThrow('PROVIDER_RESOURCE_WAIT');
 expect(remote).not.toHaveBeenCalled();
 expect(await ctx.db.prepare('SELECT COUNT(*) n FROM v1_model_spending_reservations').first('n')).toBe(0);
});

it('lets an uncertain QA assessment release its execution slot without losing the hold or allowing replay',async()=>{
 const {env}=await fixture(),remote=vi.fn(async()=>{throw Error('body lost')});
 const guarded=campaignAssessmentFetcher({...env,ENVIRONMENT:'qa',SOURCE_ASSESSMENT_SHARED_MODEL_CAPACITY_ENABLED:'true'},'owner',remote as typeof fetch);
 await expect(guarded(url,init)).rejects.toThrow('body lost');
 expect(await isolateExpiredModelExecutions(ctx.db,'isolate-after-5m-v1',new Date(Date.now()+8*60_000))).toBe(1);
 expect(await ctx.db.prepare('SELECT COUNT(*) n FROM v1_model_spending_reservations').first('n')).toBe(1);
 expect(await ctx.db.prepare('SELECT COUNT(*) n FROM v1_model_spending_settlements').first('n')).toBe(0);
 await expect(guarded(url,init)).rejects.toThrow('UNCERTAIN_ASSESSMENT_NO_RESEND');
 expect(remote).toHaveBeenCalledOnce();
});
