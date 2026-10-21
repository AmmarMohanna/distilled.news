import {expect,it} from 'vitest';
import {sourceAvailability,feedSourceAvailability} from './connector-availability';
import type {Env} from './types';
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
