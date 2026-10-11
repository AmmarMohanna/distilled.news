import {beforeEach,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({collect:vi.fn(),budgets:vi.fn(),scope:vi.fn(),source:vi.fn(),maintenance:vi.fn(),sync:vi.fn(),recover:vi.fn(),acquisitions:vi.fn(),intelligence:vi.fn()}));
vi.mock('./staging',()=>({default:{fetch:()=>new Response('site'),scheduled:vi.fn(),queue:vi.fn()}}));
vi.mock('./v1-intelligence/product',()=>({synchronizeV1ProductSource:mocks.sync}));
vi.mock('./qa-provider-recovery',()=>({recoverQaProviderBatch:mocks.recover}));
vi.mock('./v1-downstream-runtime',()=>({dispatchV1Acquisitions:mocks.acquisitions}));
vi.mock('./v1-intelligence/runtime',()=>({dispatchV1Intelligence:mocks.intelligence}));
vi.mock('./index',()=>({runScheduledMaintenance:mocks.maintenance}));
vi.mock('./product-feeds',()=>({productRuntimeEnv:async(env:unknown)=>env}));
vi.mock('./connector-runtime',()=>({createConnectorRuntime:()=>({collect:mocks.collect}),configureConnectorBudgets:mocks.budgets}));
vi.mock('./connector-source',()=>({productConnectorSource:mocks.source}));
vi.mock('./v1-intake/store',()=>({V1IntakeStore:class{getScope=mocks.scope;}}));
import qa from './sources-qa';
import type {Env} from './types';
const token='test-maintenance-token-01234567890123456789';
let env:Env,first:ReturnType<typeof vi.fn>;
beforeEach(()=>{
 vi.clearAllMocks();mocks.sync.mockReset().mockResolvedValue(undefined);first=vi.fn(async()=>({briefing_id:'feed'}));
 env={SOURCE_QA_MAINTENANCE_TOKEN:token,DB:{prepare:()=>({bind:()=>({first})})}} as unknown as Env;
 mocks.scope.mockResolvedValue({feedId:'feed',sourceId:'canonical-source',feedRevision:3,enabled:true});
 mocks.source.mockReturnValue({source:{family:'linkedin_company',locator:'https://www.linkedin.com/company/nasa/'},limit:20});
 mocks.collect.mockResolvedValue({state:'FETCH_FAILED',attempts:[]});
});
function probe(providerId:string,authorization='Bearer '+token,extra:Record<string,unknown>={}){return qa.fetch(new Request('https://qa.invalid/_qa/collect-provider',{method:'POST',headers:{authorization,'content-type':'application/json'},body:JSON.stringify({sourceId:'source',providerId,probeId:'controlled-run',...extra})}),env,{} as ExecutionContext);}
it('denies unauthenticated probes before any database or provider access',async()=>{
 expect((await probe('linkedin_apify','Bearer wrong')).status).toBe(404);
 expect(first).not.toHaveBeenCalled();expect(mocks.collect).not.toHaveBeenCalled();
});
it('denies disabled sources and scopes before configuring paid dispatch',async()=>{
 first.mockResolvedValue(null);expect((await probe('linkedin_apify')).status).toBe(404);
 first.mockResolvedValue({briefing_id:'feed'});mocks.scope.mockResolvedValue({feedId:'feed',enabled:false});
 expect((await probe('linkedin_apify')).status).toBe(404);expect(mocks.budgets).not.toHaveBeenCalled();
});
it('cannot invoke a website provider against an approved LinkedIn source',async()=>{
 expect((await probe('website_zyte')).status).toBe(404);expect(mocks.collect).not.toHaveBeenCalled();
});
it.each(['x_twitterapi_io','x_apify'])('cannot invoke %s against an approved LinkedIn source',async provider=>{
 expect((await probe(provider)).status).toBe(404);expect(mocks.budgets).not.toHaveBeenCalled();expect(mocks.collect).not.toHaveBeenCalled();
});
it('rejects an unbounded or mismatched continuation before paid dispatch',async()=>{
 expect((await probe('linkedin_apify',undefined,{pageIndex:11})).status).toBe(400);
 expect((await probe('linkedin_apify',undefined,{pageIndex:1})).status).toBe(400);
 expect((await probe('linkedin_apify',undefined,{pageIndex:1,continuation:{providerId:'website_zyte',token:'other'}})).status).toBe(400);
 expect(mocks.collect).not.toHaveBeenCalled();
});
it.each([['linkedin_apify','linkedin_company'],['google_rss','google_news'],['website_playwright','website'],['x_twitterapi_io','x_profile'],['x_twitterapi_io','x_search'],['x_apify','x_profile'],['x_apify','x_search']])('admits an approved %s probe with its exact provider and feed revision',async(provider,family)=>{
 mocks.source.mockReturnValue({source:{family,locator:'approved-input'},limit:20});
 expect((await probe(provider)).status).toBe(200);expect(mocks.budgets).toHaveBeenCalledOnce();
 expect(mocks.collect).toHaveBeenCalledWith(expect.objectContaining({scope:{feedId:'feed',feedSourceId:'source',sourceId:'canonical-source'},configurationRevision:3,limit:20}),[provider],0);
});
it('replays a saved snapshot slice under the same run without a new provider page',async()=>{
 mocks.collect.mockResolvedValue({state:'HANDED_OFF',providerId:'linkedin_apify',request:{observations:[],proposals:[]},checkpoint:'UNCHANGED',nextOffset:40});
 const initial=await probe('linkedin_apify');const run=mocks.collect.mock.calls[0][0].runId;
 expect(await initial.json()).toMatchObject({nextOffset:40});
 expect((await probe('linkedin_apify',undefined,{snapshotOffset:20})).status).toBe(200);
 expect(mocks.collect.mock.calls[1]).toEqual([expect.objectContaining({runId:run}),['linkedin_apify'],20]);
 for(const snapshotOffset of [-1,1,10001,'20'])expect((await probe('linkedin_apify',undefined,{snapshotOffset})).status).toBe(400);
 expect(mocks.collect).toHaveBeenCalledTimes(2);
});

import {HandoffError} from '@distilled/contracts';
it('reports typed intake failures without exposing arbitrary exception text',async()=>{
 mocks.collect.mockRejectedValue(new HandoffError('INVALID_REQUEST'));
 expect(await (await probe('linkedin_apify')).json()).toEqual({error:'INVALID_REQUEST'});
 mocks.collect.mockRejectedValue(new Error('provider response contains a private token'));
 expect(await (await probe('linkedin_apify')).json()).toEqual({error:'PROBE_FAILED'});
});

it('bounds Telegram repairs to the approved channel and rejects other provider repairs',async()=>{
 expect((await probe('linkedin_apify',undefined,{recheckItemKeys:['telegram:-100123:5']})).status).toBe(400);
 mocks.source.mockReturnValue({source:{family:'telegram',channelId:'-100123',locator:'SpaceXFeed'},limit:3});
 expect((await probe('telegram_telethon',undefined,{recheckItemKeys:['telegram:-100123:5']})).status).toBe(200);
 expect(mocks.collect).toHaveBeenCalledWith(expect.objectContaining({recheckItemKeys:['telegram:-100123:5']}),['telegram_telethon'],0);
 for(const keys of [['telegram:-100999:5'],['telegram:-100123:5','telegram:-100123:5'],['telegram:-100123:0'],[]])
   expect((await probe('telegram_telethon',undefined,{recheckItemKeys:keys})).status).toBe(400);
});

it('synchronizes source revision before freezing a paid probe request',async()=>{
 mocks.sync.mockImplementation(async()=>mocks.scope.mockResolvedValue({feedId:'feed',sourceId:'canonical-source',feedRevision:10,enabled:true}));
 expect((await probe('linkedin_apify')).status).toBe(200);
 expect(mocks.collect).toHaveBeenCalledWith(expect.objectContaining({configurationRevision:10}),['linkedin_apify'],0);
});
it('cached recovery invokes current-policy intake without the live collector',async()=>{
 mocks.recover.mockResolvedValue({receipts:[{decision:'ACCEPTED'}]});
 const response=await probe('linkedin_apify',undefined,{replayBatchKey:'a'.repeat(64)});
 expect(response.status).toBe(200);expect(await response.json()).toMatchObject({recovered:true,receipts:1});
 expect(mocks.collect).not.toHaveBeenCalled();
 expect(mocks.recover).toHaveBeenCalledWith(env,expect.objectContaining({configurationRevision:3}),'linkedin_apify','a'.repeat(64));
});

it('downstream-only relay stays within approved feed sources and does not collect',async()=>{
 const relayEnv={...env,V1_DOWNSTREAM_FEED_SOURCE_IDS:'allowed-source',DB:{prepare:()=>({bind:()=>({all:async()=>({results:[{id:'allowed-source'},{id:'unapproved-source'}]})})})}} as unknown as Env;
 mocks.acquisitions.mockResolvedValue(5);mocks.intelligence.mockResolvedValue(2);
 const request=()=>new Request('https://qa.invalid/_qa/drain-feed',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({feedId:'feed'})});
 const response=await qa.fetch(request(),relayEnv,{} as ExecutionContext);
 expect(await response.json()).toEqual({acquisitions:5,intelligence:2});
 expect(mocks.acquisitions).toHaveBeenCalledWith(expect.objectContaining({V1_DOWNSTREAM_FEED_SOURCE_IDS:'allowed-source'}));
 expect(mocks.intelligence).toHaveBeenCalledWith(expect.objectContaining({V1_DOWNSTREAM_FEED_SOURCE_IDS:'allowed-source'}));
 expect(mocks.collect).not.toHaveBeenCalled();expect(mocks.maintenance).not.toHaveBeenCalled();
 const denied=await qa.fetch(request(),{...relayEnv,V1_DOWNSTREAM_FEED_SOURCE_IDS:'other'} as Env,{} as ExecutionContext);
 expect(denied.status).toBe(404);expect(mocks.acquisitions).toHaveBeenCalledTimes(1);
});
