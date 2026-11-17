import type {Env} from './types';

/** Per-job capabilities only. Never install these limits into deployment budgets. */
export function unpaidSourceRecoveryEnv(env:Env):Env {
 return {...env,TWITTERAPI_IO_API_KEY:undefined,APIFY_API_TOKEN:undefined,ZYTE_API_KEY:undefined,
  SOURCE_EXECUTION_URL:undefined,SOURCE_EXECUTION_TOKEN:undefined,SOURCE_EXECUTION_SERVICE:undefined,
  SOURCE_NATIVE_EXECUTION_ENABLED:'true',SOURCE_GOOGLE_RESOLUTION_ENABLED:'false',
  SOURCE_OPERATION_CEILINGS_JSON:'{}',SOURCE_PROVIDER_BUDGETS_JSON:'{}',SOURCE_PER_PROVIDER_BUDGET_USD:'0'};
}
export const unpaidPollRecoveryId=(kind:'rss'|'provider',jobId:string)=>JSON.stringify(['unpaid-poll-recovery',kind,jobId]);
