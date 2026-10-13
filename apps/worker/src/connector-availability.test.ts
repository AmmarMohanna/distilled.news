import {expect,it} from 'vitest';
import {sourceAvailability} from './connector-availability';
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
