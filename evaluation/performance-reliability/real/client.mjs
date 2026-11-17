import {mkdirSync,appendFileSync,writeFileSync,readFileSync,existsSync,lstatSync,renameSync,openSync,closeSync,unlinkSync} from 'node:fs';
import {resolve,dirname,sep} from 'node:path';
import {createHash} from 'node:crypto';
export const hash=s=>createHash('sha256').update(s).digest('hex');
export function privateDirectory(runId,root=process.cwd()){
 if(!/^[a-z0-9]{8,24}$/.test(runId))throw Error('RUN_ID');
 const base=resolve(root,'.local-reports'),dir=resolve(base,'real-campaigns',runId);
 if(!dir.startsWith(base+sep))throw Error('PRIVATE_PATH');
 for(let p=dir;p!==resolve(root);p=dirname(p))if(existsSync(p)&&lstatSync(p).isSymbolicLink())throw Error('SYMLINK_NOT_ALLOWED');
 mkdirSync(dir,{recursive:true,mode:0o700});return dir;
}
export function writePrivate(dir,name,data){
 if(!/^[a-z0-9_.-]+$/i.test(name)||name.includes('..'))throw Error('PRIVATE_FILENAME');
 const target=resolve(dir,name),tmp=target+'.tmp';writeFileSync(tmp,JSON.stringify(data,null,2)+'\n',{mode:0o600});renameSync(tmp,target);
}
export function journal(dir,event){appendFileSync(resolve(dir,'journal.jsonl'),JSON.stringify({at:new Date().toISOString(),...event})+'\n',{mode:0o600});}
export function readRegistry(dir){return JSON.parse(readFileSync(resolve(dir,'registry.private.json'),'utf8'));}
export class ApplicationClient{
 constructor(manifest,dir,{fetcher=fetch,onRequest=()=>{}}={}){this.m=manifest;this.dir=dir;this.fetcher=fetcher;this.onRequest=onRequest;const path=resolve(dir,'http-budget.private.json');this.count=existsSync(path)?JSON.parse(readFileSync(path,'utf8')).controlRequests:0;}
 async request(path,{method='GET',cookie,body,expected=[200],category='read'}={}){
  if(!path.startsWith('/')||path.startsWith('//')||path.includes('://')||/\r|\n/.test(path))throw Error('RELATIVE_APPLICATION_PATH_REQUIRED');
  const cleanup=['archive-feed','disable-owned-source','disable-owned-account','cleanup-read','fault-restore'].includes(category);
  if(++this.count>this.m.requestBudget-this.m.trafficRequests-(cleanup?0:this.m.cleanupReserveRequests))throw Error('CONTROL_REQUEST_BUDGET');
  writePrivate(this.dir,'http-budget.private.json',{controlRequests:this.count,trafficReservedRequests:this.m.trafficRequests});
  journal(this.dir,{category,method,routeHash:hash(path),outcome:'REQUEST_STARTED',requestNumber:this.count});
  const traceId=hash(this.m.runId+':'+this.count).slice(0,32),spanId=hash(traceId+':http').slice(0,16);
  journal(this.dir,{category:'requested-trace-context',traceId,requestNumber:this.count,observedTrace:false});
  this.onRequest();const started=performance.now();let response;
  try{response=await this.fetcher(this.m.origin+path,{method,redirect:'manual',signal:AbortSignal.timeout(15000),headers:{accept:'application/json',Origin:this.m.origin,'X-Distilled-Campaign':this.m.runId,traceparent:'00-'+traceId+'-'+spanId+'-00',...(cookie?{cookie}:{}),...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});}
  catch{journal(this.dir,{category,method,routeHash:hash(path),outcome:method==='GET'?'READ_UNAVAILABLE':'MUTATION_OUTCOME_UNKNOWN',elapsedMs:performance.now()-started});throw Error(method==='GET'?'READ_UNAVAILABLE':'MUTATION_OUTCOME_UNKNOWN_DO_NOT_RESEND');}
  const reader=response.body?.getReader();let text='',bytes=0;const decoder=new TextDecoder();
  if(reader)try{while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>2_000_000)throw Error('APPLICATION_RESPONSE_LIMIT');text+=decoder.decode(part.value,{stream:true});}text+=decoder.decode();}finally{await reader.cancel();}
  if(Buffer.byteLength(text)>2_000_000)throw Error('APPLICATION_RESPONSE_LIMIT');
  let value;try{value=JSON.parse(text)}catch{value=null;}
  journal(this.dir,{category,method,routeHash:hash(path),status:response.status,expected:expected.includes(response.status),elapsedMs:performance.now()-started,responseHash:hash(text),cfRay:response.headers.get('cf-ray'),returnedTraceparent:response.headers.get('traceparent')});
  if(!expected.includes(response.status))throw Error('APPLICATION_HTTP_'+response.status);
  const set=response.headers.getSetCookie?.()??[response.headers.get('set-cookie')].filter(Boolean);
  const session=set.map(s=>s.split(';')[0]).find(s=>/^dn_session=/.test(s));
  return {status:response.status,value,cookie:session,elapsedMs:performance.now()-started};
 }
}
export async function bounded(items,limit,fn){
 if(!Number.isSafeInteger(limit)||limit<1||limit>3)throw Error('BOUNDED_CONCURRENCY_REQUIRED');
 let next=0;const out=Array(items.length);await Promise.allSettled(Array.from({length:Math.min(limit,items.length)},async()=>{while(next<items.length){const i=next++;try{out[i]={status:'fulfilled',value:await fn(items[i],i)}}catch(e){out[i]={status:'rejected',reason:e.message};}}}));return out;
}

/** A stale lock requires operator reconciliation; never auto-delete another run. */
export function lockRun(dir){const path=resolve(dir,'active.lock');let fd;try{fd=openSync(path,'wx',0o600)}catch{throw Error('RUN_LOCKED_RECONCILE_BEFORE_RESTART')}writeFileSync(fd,String(process.pid));return ()=>{closeSync(fd);unlinkSync(path)};}
