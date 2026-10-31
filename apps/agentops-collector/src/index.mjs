import {collectSnapshot} from './snapshot.mjs';
import {sendMetrics} from './otlp.mjs';

export async function collectAndExport(env,{now=Date.now,fetcher=fetch}={}) {
  if(env.COLLECTOR_ENABLED!=='true')return {state:'DISABLED'};
  const at=now();let snapshot;
  try{snapshot=await collectSnapshot(env.DB,env.COLLECTOR_FEED_ID,at);}
  catch{return {state:'OBSERVER_FAILED',...await sendMetrics(env,{observer_up:0,projection_timestamp_seconds:at/1000},at,fetcher)};}
  return {state:'EXPORTED',work:snapshot.work,...await sendMetrics(env,snapshot.values,at,fetcher)};
}
export default {
  // No public metrics, mutation endpoint, account cookies or source access.
  fetch(){return new Response(null,{status:404});},
  scheduled(_event,env,ctx){ctx.waitUntil(collectAndExport(env));},
};
