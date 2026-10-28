import {expect,it} from 'vitest';
import {unpaidSourceRecoveryEnv,unpaidPollRecoveryId} from './unpaid-source-recovery';
import type {Env} from './types';
it('removes paid and remote execution capabilities without mutating deployment settings',()=>{
 const env={ZYTE_API_KEY:'fixture',APIFY_API_TOKEN:'fixture',TWITTERAPI_IO_API_KEY:'fixture',SOURCE_EXECUTION_URL:'https://helper.example',SOURCE_EXECUTION_TOKEN:'fixture',SOURCE_EXECUTION_SERVICE:{fetch},SOURCE_PROVIDER_BUDGETS_JSON:'{"zyte":20}',SOURCE_OPERATION_CEILINGS_JSON:'{"zyte":1}',SOURCE_NATIVE_EXECUTION_ENABLED:'false'} as Env;
 const free=unpaidSourceRecoveryEnv(env);
 for(const key of ['ZYTE_API_KEY','APIFY_API_TOKEN','TWITTERAPI_IO_API_KEY','SOURCE_EXECUTION_URL','SOURCE_EXECUTION_TOKEN','SOURCE_EXECUTION_SERVICE'] as const)expect(free[key]).toBeUndefined();
 expect(free.SOURCE_NATIVE_EXECUTION_ENABLED).toBe('true');expect(free.SOURCE_PROVIDER_BUDGETS_JSON).toBe('{}');expect(free.SOURCE_OPERATION_CEILINGS_JSON).toBe('{}');expect(env.ZYTE_API_KEY).toBe('fixture');expect(env.SOURCE_PROVIDER_BUDGETS_JSON).toBe('{"zyte":20}');
 expect(unpaidPollRecoveryId('rss','id')).not.toBe(unpaidPollRecoveryId('provider','id'));
});
