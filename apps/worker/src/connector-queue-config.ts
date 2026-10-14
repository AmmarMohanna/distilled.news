import type {Env} from './types';

/** Queue mode requires explicit isolation; a missing binding must never send
 * acquisition or editorial work into another lane or the legacy backlog. */
export function requireConnectorQueues(env:Env):void {
 if(env.SOURCE_QUEUE_SCHEDULING_ENABLED!=='true')return;
 for(const binding of ['SOURCE_COLLECTION_QUEUE','V1_PROCESSING_QUEUE','V1_ACQUISITION_QUEUE'] as const){
  if(!env[binding])throw Error(binding+'_REQUIRED');
 }
}
