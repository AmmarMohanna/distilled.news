import {it,expect,vi} from 'vitest';
import {createSourceBackend,type SourceBackendEnv} from './source-backend';
import {addSourceFromInput,refreshEnabledSources,enqueueDueSourceRefreshJobs,pollApifySourceRuns,type SourceRefreshInput} from './sources';
const env={DB:{},RAW_ARCHIVE:{}} as SourceBackendEnv;
it('staging legacy fence prevents secret presence from enabling another collection path',async()=>{
  const fetcher=vi.fn(),input={env:{SOURCE_LEGACY_POLLING_ENABLED:'false',APIFY_API_TOKEN:'synthetic-only'},fetcher} as unknown as SourceRefreshInput;
  await expect(addSourceFromInput({...input,sourceInput:'https://example.com/feed'})).rejects.toThrow('LEGACY_COLLECTION_DISABLED');
  expect(await refreshEnabledSources(input)).toEqual([]);
  expect(await enqueueDueSourceRefreshJobs(input as never)).toBe(0);
  await pollApifySourceRuns(input);
  expect(fetcher).not.toHaveBeenCalled();
});
it('denies unapproved source collection before storage or network access',async()=>{
  const fetcher=vi.fn(),acceptBatch=vi.fn();
  const backend=createSourceBackend(env,{intake:{acceptBatch},authorize:async()=>false,fetcher});
  await expect(backend.collect({scope:{feedId:'f',feedSourceId:'fs',sourceId:'s'},runId:'r',
    source:{family:'rss',locator:'https://example.com/feed'},requestedBounds:{},limit:10})).rejects.toThrow('SOURCE_NOT_APPROVED');
  expect(fetcher).not.toHaveBeenCalled();expect(acceptBatch).not.toHaveBeenCalled();
});
it('rejects invalid paid ceilings during composition',()=>{
  for(const value of ['{"apify":-1}','{"apify":"1"}','{"unknown":1}'])expect(()=>createSourceBackend({...env,SOURCE_OPERATION_CEILINGS_JSON:value},
    {intake:{acceptBatch:vi.fn()},authorize:async()=>true})).toThrow('INVALID_SOURCE_CEILINGS');
});
