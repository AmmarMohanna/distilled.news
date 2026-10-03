import {beforeEach,expect,it,vi} from 'vitest';
import type {Env} from '../types';
import type {AcquisitionClaim} from './acquisition';
const mocks=vi.hoisted(()=>({feed:vi.fn(),workflow:vi.fn(),acquire:vi.fn(),lifecycle:vi.fn()}));
vi.mock('../v1-intelligence/store',()=>({V1FeedStore:class {getFeed=mocks.feed}}));
vi.mock('../web-operator-workflow-store',()=>({D1WorkflowRepository:class {getActiveWorkflow=mocks.workflow}}));
vi.mock('../web-operator-runtime',()=>({createWorkerContainerPublicWebOperatorLifecycle:mocks.lifecycle}));
import {createV1BrowserStages} from './browser-stages';
const url='https://publisher.example/article';
const claim={input:{observation:{id:'observation',feedId:'feed',feedSourceId:'approved-source',sourceItemKey:'item',canonicalUrl:url,sourceId:'publisher'}},candidate:{id:'candidate'},job:{id:'job'},token:'lease'} as AcquisitionClaim;
const env={DB:{},V1_BROWSER_ACQUISITION_ENABLED:'true',DISTILLED_BROWSER_PROVIDER:'cloudflare_container',AUTHENTICATED_BROWSER_CONTAINER:{},DISTILLED_LIVE_OPENROUTER_MODEL:'model',DISTILLED_LIVE_OPENROUTER_PROVIDER:'provider',OPENROUTER_API_KEY:'test-key',OPENAI_INPUT_PRICE_USD_PER_MILLION_TOKENS:'1',OPENAI_OUTPUT_PRICE_USD_PER_MILLION_TOKENS:'2'} as unknown as Env;
beforeEach(()=>{vi.resetAllMocks();mocks.feed.mockResolvedValue({ownerId:'owner',paused:false});mocks.lifecycle.mockReturnValue({acquire:mocks.acquire})});
it('keeps the optional browser adapter disabled by default',()=>{
 expect(createV1BrowserStages({...env,V1_BROWSER_ACQUISITION_ENABLED:undefined},claim)).toEqual({});expect(mocks.lifecycle).not.toHaveBeenCalled();
});
it('converts independently accepted exact candidate content with acquisition evidence and bounded policy',async()=>{
 mocks.acquire.mockImplementation(async request=>({state:'ACQUIRED',acquiredContent:{candidateId:'candidate',tenantId:'owner',resourceId:request.resourceId,canonicalUrl:url,finalUrl:url,title:'Development',body:'Parliament approved the reform.',publisherTimestamp:'2026-10-03T10:00:00Z',acceptedAt:'2026-10-03T12:00:00Z',acceptanceId:'accepted',observationId:'browser-observation',rawArtifactRef:'raw-artifact'}}));
 const result=await createV1BrowserStages(env,claim).webOperator!({} as never);
 expect(result).toMatchObject({stage:'WEB_OPERATOR',status:'SUCCESS',result:{coverage:{rangeCovered:false},items:[{sourceResource:expect.any(String),canonicalItemUrl:url,acquisitionEvidence:{acceptanceId:'accepted',observationId:'browser-observation',rawArtifactRef:'raw-artifact'}}]}});
 expect(mocks.lifecycle).toHaveBeenCalledWith(env,expect.objectContaining({exactCandidateOnly:true,sourceUrl:url}));
 expect(mocks.acquire.mock.calls[0][0]).toMatchObject({candidate:{candidateId:'candidate',canonicalUrl:url},budgetLimits:{modelCalls:3,pages:1,modelCostUsd:.05}});
});
it('rejects a runtime result for a sibling candidate and never reuses another owner workflow',async()=>{
 mocks.acquire.mockResolvedValue({state:'ACQUIRED',acquiredContent:{candidateId:'other'}});
 expect(await createV1BrowserStages(env,claim).webOperator!({} as never)).toMatchObject({status:'POLICY_DENIED'});
 mocks.workflow.mockResolvedValue({id:'workflow',version:1,tenantId:'another-owner',candidate:{canonicalUrl:url}});
 expect(await createV1BrowserStages(env,claim).lookupActiveWorkflow!({} as never)).toBeUndefined();
});
