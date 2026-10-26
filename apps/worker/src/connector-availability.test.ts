import {expect,it} from 'vitest';
import {sourceAvailability,feedSourceAvailability,collectionFailureReason} from './connector-availability';
import type {Env} from './types';
it('unlimited collection does not surface historical app budget exhaustion as a current block',async()=>{
 const DB={prepare:(sql:string)=>({bind(){return this},async all(){return {results:sql.includes('FROM sources')?[{id:'x',title:'@test',provider:'twitterapi_io',kind:'x_profile',source_url:'https://x.com/test',input:JSON.stringify({username:'test'}),actor_id:null}]:[]}},async first(){return sql.includes('connector_provider_operations')?null:{state:'BLOCKED',last_error:'BUDGET_EXCEEDED',result:null}}})};
 const env={DB,SOURCE_CONNECTORS_ENABLED:'true',SOURCE_QUEUE_SCHEDULING_ENABLED:'true',SOURCE_COLLECTION_BUDGET_MODE:'unlimited',SOURCE_PER_PROVIDER_BUDGET_USD:'0',SOURCE_PROVIDER_BUDGETS_JSON:'{"x_twitterapi_io":15}',SOURCE_OPERATION_CEILINGS_JSON:'{"twitterApiIo":0.01}',TWITTERAPI_IO_API_KEY:'test'} as unknown as Env;
 expect((await feedSourceAvailability(env,'feed'))[0]).toMatchObject({state:'AVAILABLE',providers:['x_twitterapi_io']});
});
it('zero budgets or missing credentials explicitly deny paid sources while free news remains available',()=>{
 const env={SOURCE_CONNECTORS_ENABLED:'true',SOURCE_PROVIDER_BUDGETS_JSON:'{}',SOURCE_OPERATION_CEILINGS_JSON:'{}'} as Env;
 expect(sourceAvailability(env,'x_profile')).toMatchObject({state:'UNAVAILABLE',providers:[]});
 expect(sourceAvailability(env,'linkedin_profile').state).toBe('UNAVAILABLE');
 expect(sourceAvailability(env,'rss').state).toBe('AVAILABLE');
 expect(sourceAvailability(env,'google_news').providers).toEqual(['google_rss']);
});
it('independent funded X primary and fallback are both available without exposing keys',()=>{
 const env={SOURCE_CONNECTORS_ENABLED:'true',SOURCE_PROVIDER_BUDGETS_JSON:'{"x_twitterapi_io":100,"x_apify":100}',SOURCE_OPERATION_CEILINGS_JSON:'{"twitterApiIo":0.1,"apify":0.25}',TWITTERAPI_IO_API_KEY:'primary-private',APIFY_API_TOKEN:'fallback-private',SOURCE_PER_PROVIDER_BUDGET_USD:'15'} as Env;
 const result=sourceAvailability(env,'x_search');
 expect(result.providers).toEqual(['x_twitterapi_io','x_apify']);expect(JSON.stringify(result)).not.toContain('private');
 delete env.TWITTERAPI_IO_API_KEY;expect(sourceAvailability(env,'x_search').providers).toEqual(['x_apify']);
});
it('missing private execution is reported instead of pretending Telegram or website collection succeeded',()=>{
 const env={SOURCE_CONNECTORS_ENABLED:'true'} as Env;
 expect(sourceAvailability(env,'telegram').reason).toBe('PRIVATE_SERVICE_UNAVAILABLE');
 expect(sourceAvailability(env,'website').state).toBe('UNAVAILABLE');
});
it('native public extraction enables websites without pretending Telegram sessions or browsers exist',()=>{
 const env={SOURCE_CONNECTORS_ENABLED:'true',SOURCE_NATIVE_EXECUTION_ENABLED:'true'} as Env;
 expect(sourceAvailability(env,'website')).toEqual({state:'AVAILABLE',providers:['website_http']});
 expect(sourceAvailability(env,'telegram').state).toBe('UNAVAILABLE');
});
it('reports article failures and pending work without leaking stored diagnostics',async()=>{
 const DB={prepare:(sql:string)=>({bind(){return this},async all(){return {results:sql.includes('FROM v1_jobs')?[{feed_source_id:'rss',state:'FAILED',failure:'AUTH_REQUIRED',count:2},{feed_source_id:'rss',state:'PENDING',failure:null,count:1}]:[{id:'rss',title:'News',provider:'rss',kind:'rss',source_url:'https://example.com/rss',input:null,actor_id:null}]}},async first(){return {state:'DONE',last_error:null,result:JSON.stringify({state:'FETCH_FAILED',attempts:[{failure:'TRANSIENT',secret:'never-public'}]})}}})};
 const result=await feedSourceAvailability({DB,SOURCE_CONNECTORS_ENABLED:'true'} as unknown as Env,'feed');
 expect(result[0]).toMatchObject({acquisition:{completed:0,pending:1,failed:2},warning:'ARTICLE_AUTH_REQUIRED',collectionError:'TRANSIENT'});
 expect(JSON.stringify(result)).not.toContain('never-public');
});
it('does not describe a mixed failure count as entirely authentication failures',async()=>{
 const DB={prepare:(sql:string)=>({bind(){return this},async all(){return {results:sql.includes('FROM v1_jobs')?[{feed_source_id:'rss',state:'FAILED',failure:'AUTH_REQUIRED',count:2},{feed_source_id:'rss',state:'FAILED',failure:'POLICY_DENIED',count:3}]:[{id:'rss',title:'News',provider:'rss',kind:'rss',source_url:'https://example.com/rss',input:null,actor_id:null}]}},async first(){return null}})};
 expect((await feedSourceAvailability({DB,SOURCE_CONNECTORS_ENABLED:'true'} as unknown as Env,'feed'))[0]).toMatchObject({acquisition:{failed:5},warning:'ARTICLE_ACQUISITION_FAILED'});
});
it('retains the provider cause behind a retry-limit warning without exposing arbitrary errors',()=>{
 expect(collectionFailureReason({last_error:'RETRY_LIMIT:RATE_LIMIT',result:null})).toBe('RATE_LIMIT');
 expect(collectionFailureReason({last_error:'RETRY_LIMIT',result:JSON.stringify({coverage:{failureReason:'RATE_LIMIT'}})})).toBe('RATE_LIMIT');
 expect(collectionFailureReason({last_error:'sensitive provider text',result:null})).toBeUndefined();
});
it('a newly pending poll does not erase the last blocked collection outcome',async()=>{
 let query='';const DB={prepare:(sql:string)=>({bind(){return this},async all(){return {results:sql.includes('FROM v1_jobs')?[]:[{id:'rss',title:'News',provider:'rss',kind:'rss_feed',source_url:'https://example.com/rss',input:null,actor_id:null}]}},async first(){query=sql;return {state:'BLOCKED',last_error:'RETRY_LIMIT:RATE_LIMIT',result:null}}})};
 expect((await feedSourceAvailability({DB,SOURCE_CONNECTORS_ENABLED:'true'} as unknown as Env,'feed'))[0]).toMatchObject({state:'UNAVAILABLE',reason:'COLLECTION_BLOCKED',collectionError:'RATE_LIMIT'});
 expect(query).toContain("state IN ('DONE','BLOCKED')");
});
