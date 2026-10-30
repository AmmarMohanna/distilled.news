import type {Env} from './types';
/** Fixed authenticated helper route; return capacity metadata, never targets,
 * sessions, upstream exception text, credentials or arbitrary helper fields. */
export async function sourceExecutionStatus(env:Pick<Env,'SOURCE_EXECUTION_URL'|'SOURCE_EXECUTION_TOKEN'|'SOURCE_EXECUTION_SERVICE'>){
 if(!env.SOURCE_EXECUTION_URL||!env.SOURCE_EXECUTION_TOKEN||!env.SOURCE_EXECUTION_SERVICE)return {state:'NOT_CONFIGURED' as const};
 try{
  const url=new URL(env.SOURCE_EXECUTION_URL);url.pathname='/v1/source-execution/status';url.search='';url.hash='';
  const signal=AbortSignal.timeout(60000),bounded=async<T>(operation:Promise<T>):Promise<T>=>{signal.throwIfAborted();let abort:()=>void=()=>{};const deadline=new Promise<never>((_,reject)=>{abort=()=>reject(Error('STATUS_TIMEOUT'));signal.addEventListener('abort',abort,{once:true});});try{return await Promise.race([operation,deadline]);}finally{signal.removeEventListener('abort',abort);}};
  const response=await bounded(env.SOURCE_EXECUTION_SERVICE.fetch(url.href,{method:'GET',redirect:'manual',headers:{authorization:`Bearer ${env.SOURCE_EXECUTION_TOKEN}`},signal}));
  if(response.status!==200){void response.body?.cancel();return {state:'UNAVAILABLE' as const,httpStatus:response.status};}
  const reader=response.body?.getReader(),chunks:Uint8Array[]=[];let size=0;
  try{if(reader)for(;;){const r=await bounded(reader.read());if(r.done)break;size+=r.value.length;if(size>16000)return {state:'INVALID_STATUS' as const};chunks.push(r.value);}}finally{void reader?.cancel().catch(()=>{});reader?.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}const text=new TextDecoder().decode(bytes);
  const raw=JSON.parse(text),integer=(x:unknown)=>typeof x==='number'&&Number.isSafeInteger(x)&&x>=0;
  if(!integer(raw.active)||!integer(raw.maxConcurrent)||raw.maxConcurrent<1||raw.maxConcurrent>32||!Array.isArray(raw.requests))return {state:'INVALID_STATUS' as const};
  const kinds=['feedparser','telethon','telegram_resolve','google_resolve','google_feed','public_article','extract','playwright','unparsed'];
  const requests=raw.requests.slice(0,32).map((r:any)=>({kind:kinds.includes(r?.kind)?r.kind:'unknown',phase:['READING_INPUT','EXECUTING'].includes(r?.phase)?r.phase:'unknown',elapsedMs:integer(r?.elapsedMs)?r.elapsedMs:null}));
  return {state:'AVAILABLE' as const,active:raw.active,maxConcurrent:raw.maxConcurrent,activeTelegram:integer(raw.activeTelegram)?raw.activeTelegram:null,telegramWaiting:integer(raw.telegramWaiting)?raw.telegramWaiting:null,requests};
 }catch{return {state:'UNAVAILABLE' as const};}
}
