import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({load:vi.fn(),save:vi.fn(),authorize:vi.fn(),accept:vi.fn()}));
vi.mock('@distilled/connectors',()=>({sourceSqlFromD1:()=>({}),D1ProviderSourceRepository:class{loadProviderBatch=m.load;saveProviderReceipts=m.save;}}));
vi.mock('./connector-runtime',()=>({authorizeConnectorSource:m.authorize}));
vi.mock('./v1-downstream-runtime',()=>({acceptV1Handoff:m.accept}));
import {recoverQaProviderBatch} from './qa-provider-recovery';
import type {Env} from './types';
import type {SourceFetchRequest} from '@distilled/connectors';
const current:SourceFetchRequest={scope:{feedId:'feed',feedSourceId:'source',sourceId:'canonical'},configurationRevision:10,runId:'repair',source:{family:'x_profile',locator:'SpaceX'},requestedBounds:{},limit:20};
const saved={providerId:'x_twitterapi_io',originalRequest:{...current,configurationRevision:8},request:{handoffId:'original-immutable-handoff'}};
beforeEach(()=>{vi.clearAllMocks();m.load.mockResolvedValue(saved);m.authorize.mockResolvedValue(true);m.accept.mockResolvedValue({receipts:[]});});
it('re-evaluates immutable saved data under current approval without executing a provider',async()=>{
 await recoverQaProviderBatch({DB:{}} as Env,current,'x_twitterapi_io','batch');
 expect(m.accept).toHaveBeenCalledWith(expect.anything(),saved.request,10);
 expect(m.save).toHaveBeenCalledWith(saved,{receipts:[]});
});
it.each(['scope','source','requestedBounds','limit'])('refuses a saved batch after %s approval changes',async field=>{
 const changed={...saved.originalRequest,[field]:field==='limit'?30:field==='scope'?{...current.scope,feedId:'other'}:field==='source'?{family:'x_profile',locator:'other'}:{startCursor:'other'}};
 m.load.mockResolvedValue({...saved,originalRequest:changed});
 await expect(recoverQaProviderBatch({DB:{}} as Env,current,'x_twitterapi_io','batch')).rejects.toMatchObject({code:'SCOPE_DENIED'});
 expect(m.accept).not.toHaveBeenCalled();expect(m.save).not.toHaveBeenCalled();
});
it('refuses disabled/currently unauthorized sources and another provider batch',async()=>{
 m.authorize.mockResolvedValue(false);
 await expect(recoverQaProviderBatch({DB:{}} as Env,current,'x_twitterapi_io','batch')).rejects.toMatchObject({code:'SCOPE_DENIED'});
 m.authorize.mockResolvedValue(true);
 await expect(recoverQaProviderBatch({DB:{}} as Env,current,'x_apify','batch')).rejects.toMatchObject({code:'SCOPE_DENIED'});
 expect(m.accept).not.toHaveBeenCalled();
});
