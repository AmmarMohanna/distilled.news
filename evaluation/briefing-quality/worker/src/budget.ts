import {type Request,check,hash} from './protocol';
export interface Budget {dailyMicro:number;maxCalls:number;maxBytes:number;maxTokens:number;inputPrice:number;outputPrice:number;model:string}
export function money(value:number){check(Number.isFinite(value)&&value>=0,'INVALID_MONEY');const result=Math.ceil(value*1e6);check(Number.isSafeInteger(result),'MONEY_OVERFLOW');return result}
function positive(value:string,integer=false){const n=Number(value);check(Number.isFinite(n)&&n>0&&(!integer||Number.isSafeInteger(n)),'INVALID_BUDGET_CONFIG');return n}
export function budget(env:Env):Budget{return {dailyMicro:money(positive(env.DAILY_BUDGET_USD)),maxCalls:positive(env.MAX_CALLS_PER_DAY,true),maxBytes:positive(env.MAX_REQUEST_BYTES,true),maxTokens:positive(env.MAX_OUTPUT_TOKENS,true),inputPrice:positive(env.INPUT_USD_PER_MILLION_CEILING),outputPrice:positive(env.OUTPUT_USD_PER_MILLION_CEILING),model:env.JUDGE_MODEL}}
export function admission(request:Request,b:Budget){const bytes=new TextEncoder().encode(JSON.stringify(request)).length;check(bytes<=b.maxBytes,'FULL_EVIDENCE_REQUEST_LIMIT');return money(((bytes+4096)*b.inputPrice+b.maxTokens*b.outputPrice)/1e6)}
export interface ProviderResponse {id:string;choices:Array<{finish_reason:string;message:{content:string}}> ;usage:{prompt_tokens:number;completion_tokens:number;cost:number}}
export async function boundedJson(response:Response,maxBytes:number):Promise<unknown>{check(response.body,'MISSING_BODY');const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;check(size<=maxBytes,'RESPONSE_LIMIT');chunks.push(value)}}finally{await reader.cancel().catch(()=>{})}const all=new Uint8Array(size);let offset=0;for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.length}return JSON.parse(new TextDecoder().decode(all))}
export function usage(raw:unknown):ProviderResponse {check(raw&&typeof raw==='object','INVALID_PROVIDER_RESPONSE');const value=raw as ProviderResponse;check(typeof value.id==='string'&&value.id.length>0,'MISSING_PROVIDER_ID');check(value.usage&&Number.isSafeInteger(value.usage.prompt_tokens)&&value.usage.prompt_tokens>=0&&Number.isSafeInteger(value.usage.completion_tokens)&&value.usage.completion_tokens>=0,'UNKNOWN_USAGE');money(value.usage.cost);return value}
export async function reserve(db:D1Database,id:string,jobId:string,stage:string,request:Request,b:Budget,now:string){
 const held=admission(request,b),requestHash=await hash(request),day=now.slice(0,10);
 // One SQLite statement makes concurrent consumers share the exact same cap.
 // Unknown/reserved outcomes across ANY day fence all new sends until reconciled.
 const result=await db.prepare(`INSERT OR IGNORE INTO eval_calls(id,job_id,stage,day_utc,state,reservation_micro,request_hash,created_at)
 SELECT ?,?,?,?,'RESERVED',?,?,? WHERE
 NOT EXISTS(SELECT 1 FROM eval_calls WHERE state IN ('RESERVED','UNKNOWN','OVERAGE'))
 AND (SELECT COALESCE(SUM(COALESCE(cost_micro,reservation_micro)),0) FROM eval_calls WHERE day_utc=?) + ? <= ?
 AND (SELECT COUNT(*) FROM eval_calls WHERE day_utc=?) < ?`).bind(id,jobId,stage,day,held,requestHash,now,day,held,b.dailyMicro,day,b.maxCalls).run();
 if(!result.meta.changes){const fence=await db.prepare("SELECT id FROM eval_calls WHERE state IN ('RESERVED','UNKNOWN','OVERAGE') LIMIT 1").first();check(!fence,'UNKNOWN_PROVIDER_OUTCOME_FENCE');const duplicate=await db.prepare('SELECT id FROM eval_calls WHERE id=?').bind(id).first();check(!duplicate,'CALL_ALREADY_STARTED');throw Error('DAILY_BUDGET_EXHAUSTED')}
 return held;
}
export async function judge(env:Env,jobId:string,stage:string,request:Request,fetcher:typeof fetch=fetch):Promise<unknown>{
 const b=budget(env),requestHash=await hash(request),id=await hash({jobId,stage,requestHash,model:b.model});
 const previous=await env.EVAL_DB.prepare("SELECT state,response_key,request_hash FROM eval_calls WHERE id=?").bind(id).first<{state:string;response_key:string|null;request_hash:string}>();
 if(previous){check(previous.state==='SETTLED'&&previous.response_key&&previous.request_hash===requestHash,'CALL_ALREADY_STARTED_OR_UNKNOWN');const object=await env.EVIDENCE.get(previous.response_key);check(object,'SETTLED_RESPONSE_MISSING');check(object.size<=2_000_000,'RESPONSE_LIMIT');return parseReply(await object.json<ProviderResponse>())}
 check(env.EVALUATION_OPENROUTER_KEY,'EVALUATION_KEY_MISSING');
 const held=await reserve(env.EVAL_DB,id,jobId,stage,request,b,new Date().toISOString());
 try {
  // Explicit model + provider price ceilings, no client transport retries or web tools.
  const response=await fetcher('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:{authorization:`Bearer ${env.EVALUATION_OPENROUTER_KEY}`,'content-type':'application/json'},body:JSON.stringify({model:b.model,messages:[{role:'system',content:request.system},{role:'user',content:request.user}],max_tokens:b.maxTokens,response_format:{type:'json_object'},provider:{allow_fallbacks:false,require_parameters:true,max_price:{prompt:b.inputPrice,completion:b.outputPrice}}}),signal:AbortSignal.timeout(90000)});
  // Non-2xx bodies may be ambiguous/billed. Preserve the hold; never retry blindly.
  check(response.ok,'PROVIDER_HTTP_FAILURE');const value=usage(await boundedJson(response,2_000_000)),cost=money(value.usage.cost);
  const key=`calls/${id}.json`;await env.EVIDENCE.put(key,JSON.stringify(value));
  const state=cost>held?'OVERAGE':'SETTLED';
  await env.EVAL_DB.prepare('UPDATE eval_calls SET state=?,cost_micro=?,response_key=?,provider_id=?,input_tokens=?,output_tokens=? WHERE id=? AND state=\'RESERVED\'').bind(state,cost,key,value.id,value.usage.prompt_tokens,value.usage.completion_tokens,id).run();
  check(state!=='OVERAGE','PROVIDER_COST_EXCEEDED_RESERVATION');return parseReply(value);
 }catch(error){await env.EVAL_DB.prepare("UPDATE eval_calls SET state='UNKNOWN' WHERE id=? AND state='RESERVED'").bind(id).run();throw error}
}
function parseReply(value:ProviderResponse){check(value.choices?.[0]?.finish_reason==='stop','TRUNCATED_OR_REFUSED_RESPONSE');check(typeof value.choices[0].message.content==='string','MISSING_REVIEW_TEXT');return JSON.parse(value.choices[0].message.content)}
