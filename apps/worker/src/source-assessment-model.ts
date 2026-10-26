/** Bound both response headers and JSON consumption, including transports that
 * ignore cancellation. Collector submissions are deliberately outside this helper. */
export async function assessmentModelPayload(fetcher:typeof fetch,url:string,init:RequestInit,timeoutMs=10_000):Promise<{ok:boolean;payload?:unknown}>{
 const signal=AbortSignal.any([AbortSignal.timeout(timeoutMs),...(init.signal?[init.signal]:[])]);
 let abort:()=>void=()=>{};
 const deadline=new Promise<never>((_resolve,reject)=>{abort=()=>reject(Error('ASSESSMENT_MODEL_TIMEOUT'));if(signal.aborted)abort();else signal.addEventListener('abort',abort,{once:true});});
 const work=async()=>{
  signal.throwIfAborted();
  const response=await fetcher(url,{...init,signal});
  if(!response.ok){void response.body?.cancel().catch(()=>{});return {ok:false};}
  const reader=response.body?.getReader();if(!reader)throw Error('ASSESSMENT_MODEL_EMPTY_RESPONSE');
  const cancel=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener('abort',cancel,{once:true});
  const chunks:Uint8Array[]=[];let size=0;
  try{
   for(;;){signal.throwIfAborted();const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>16_384)throw Error('ASSESSMENT_MODEL_OVERSIZED_RESPONSE');chunks.push(part.value);}
  }finally{signal.removeEventListener('abort',cancel);cancel();}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  return {ok:true,payload:JSON.parse(new TextDecoder().decode(bytes)) as unknown};
 };
 try{return await Promise.race([deadline,work()]);}finally{signal.removeEventListener('abort',abort);}
}
