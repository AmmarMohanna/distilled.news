import worker from './index';
/** Same application and ingestion handlers; no second collector Worker or public execution proxy. */
export default {
 ...worker,
 fetch: ((request:Request,env:Parameters<typeof worker.fetch>[1],ctx:ExecutionContext)=>{
  if(new URL(request.url).pathname==='/')return new Response('Distilled.news staging',{headers:{'content-type':'text/plain'}});
  return worker.fetch(request,env,ctx);
 })
};
