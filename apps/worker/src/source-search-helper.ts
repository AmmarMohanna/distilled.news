import {SourceProviderError} from '@distilled/connectors';
import {admittedSourceExecution} from './source-execution-admission';

/** Request-local queue for the helper's two slots. Per-article timeouts start
 * after this queue; the batch stays bounded. Only a local admission refusal
 * may be retried, never an external request. */
export function searchArticleChecks(env:{DB?:D1Database;SOURCE_EXECUTION_SERVICE?:Pick<Fetcher,'fetch'>},deadline:number){
 const active=new Set<Promise<void>>();
 const fetcher:typeof fetch=async(target,init)=>{
  for(;;){
   init?.signal?.throwIfAborted();
   if(Date.now()>=deadline)throw Error('SEARCH_HELPER_DEADLINE');
   try{
    const run=()=>env.SOURCE_EXECUTION_SERVICE!.fetch(target,init);
    return env.DB?await admittedSourceExecution(env.DB,run):await run();
   }catch(error){
    if(!(error instanceof SourceProviderError)||error.code!=='BACKPRESSURE'||error.diagnostic?.detail!=='HELPER_LOCAL_CAPACITY_BUSY')throw error;
    // No request was sent. Wait for another search/collection to release a slot.
    await new Promise<void>((resolve,reject)=>{
     const signal=init?.signal;
     const abort=()=>{clearTimeout(timer);reject(signal?.reason??Error('SEARCH_HELPER_ABORTED'));};
     const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},Math.min(500,Math.max(1,deadline-Date.now())));
     if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
    });
   }
  }
 };
 return async<T>(run:(fetcher:typeof fetch)=>Promise<T>):Promise<T>=>{
  while(active.size>=2)await Promise.race(active);
  if(Date.now()>=deadline)throw Error('SEARCH_HELPER_DEADLINE');
  let release!:()=>void;
  const slot=new Promise<void>(resolve=>{release=resolve;});active.add(slot);
  try{return await run(fetcher);}finally{active.delete(slot);release();}
 };
}
