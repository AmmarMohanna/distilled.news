/** Isolated model replay: imports the actual engine, never Worker/runtime bindings. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {generateBriefing} from '../../packages/briefing/src/engine';
import {prepareArticles, selectPrior, chunkArticles} from '../../packages/briefing/src/prepare';
import {EDITOR_SYSTEM, editorUser} from '../../packages/briefing/src/prompts';
import type {BriefingInput, PriorItem, BriefingItem} from '../../packages/briefing/src/types';
import type {ModelPort, ModelRequest, ModelResponse} from '../../packages/briefing/src/model';

export const hash=(x:string|Buffer)=>createHash('sha256').update(x).digest('hex');
export const MODELS={editor:'openai/gpt-4.1',verifier:'openai/gpt-4.1-mini'};
const ROOT=path.dirname(fileURLToPath(import.meta.url));
const REPO=path.resolve(ROOT,'../..');
const json=(p:string)=>JSON.parse(fs.readFileSync(p,'utf8'));
const write=(p:string,v:unknown)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n',{flag:'wx'});

export function adapt(c:any, prior:PriorItem[]):BriefingInput {
  return {feed:{interest:c.interestProfile,language:c.language,windowMinutes:c.intervalMinutes},
    articles:c.articles.map((a:any)=>({id:a.id,source:a.sourceId??a.provenance.feedSourceId,title:a.title??undefined,
      url:a.url??undefined,publishedAt:a.publishedAt??'',text:a.text})),prior,
    windowStart:c.windowStart,windowEnd:c.windowEnd};
}

export function admit(input:BriefingInput, maxRequestBytes:number, single=false) {
  for(const a of input.articles) {
    if(typeof a.text!=='string'||a.text.length>250_000) throw Error('FULL_EVIDENCE_LIMIT:'+a.id);
  }
  if(single && Buffer.byteLength(JSON.stringify(input),'utf8')>maxRequestBytes-8192) throw Error('SINGLE_FULL_INPUT_LIMIT');
}

export function requestAdmission(r:ModelRequest, limit:number) {
  if(!Number.isSafeInteger(limit)||limit<=0)throw Error('INVALID_REQUEST_LIMIT');
  if(!Number.isSafeInteger(r.maxTokens)||r.maxTokens<=0)throw Error('INVALID_OUTPUT_TOKENS');
  if(![MODELS.editor,MODELS.verifier].includes(r.model))throw Error('MODEL_ROUTE_NOT_ALLOWED');
  const bytes=Buffer.byteLength(r.system+r.user,'utf8');
  if(bytes>limit)throw Error('FULL_REQUEST_LIMIT');
  // UTF-8 byte count plus chat overhead deliberately overestimates input tokens.
  const price=r.model===MODELS.editor?{input:2,output:8}:{input:.4,output:1.6};
  return {bytes,reservationUsd:((bytes+512)*price.input+r.maxTokens*price.output)/1e6};
}

export function publishHistory(prior:PriorItem[], items:BriefingItem[], status:string, system:string, caseId:string, at:string) {
  if(status!=='published')return [...prior];
  return [...prior,...items.map((a,i)=>({id:`${system}:${caseId}:${i}`,at,headline:a.headline,body:a.body}))];
}

export async function runOne(c:any, system:string, prior:PriorItem[], port:ModelPort, limit:number) {
  const input=adapt(c,prior);
  admit(input,limit,system==='single-llm');
  if(system==='v3')return generateBriefing(input,port,MODELS,{now:()=>new Date(c.windowEnd)});
  if(system!=='single-llm')throw Error('UNKNOWN_SYSTEM');
  if(!input.articles.length)return {status:'empty',items:[]};
  // No semantic or near-duplicate removal for this baseline: all full source bodies.
  const sources=input.articles.map((a,i)=>({...a,ref:`S${i+1}`,alsoIds:[],similarRefs:[]}));
  const selected=selectPrior(prior,sources,new Date(c.windowEnd));
  const request={model:MODELS.editor,system:EDITOR_SYSTEM,
    user:editorUser({feed:input.feed,windowStart:input.windowStart,windowEnd:input.windowEnd,prior:selected,articles:sources,promptVersion:3}),maxTokens:4000};
  requestAdmission(request,limit);
  const response=await port.complete(request); // exactly one call; malformed output fails, no repair
  if(response.finishReason==='length')throw Error('SINGLE_OUTPUT_TRUNCATED');
  const raw=JSON.parse(response.text);
  if(!Array.isArray(raw.items))throw Error('SINGLE_ITEMS_MISSING');
  const items=raw.items.map((r:any)=>{
    if(typeof r.headline!=='string'||!r.headline.trim()||typeof r.body!=='string'||!r.body.trim()||!Array.isArray(r.sources)||!r.sources.length)throw Error('SINGLE_INVALID_ITEM');
    const ids=r.sources.map((s:any)=>{
      const a=sources.find(a=>a.ref===s);
      if(!a)throw Error('SINGLE_INVALID_CITATION');
      return a.id;
    });
    return {headline:r.headline,body:r.body,sourceIds:[...new Set(ids)],relation:r.relation,importance:r.importance};
  });
  return {status:items.length?'published':'empty',items};
}

/** Conservative local reservation journal, independent of production ledgers.
 * A new output directory is mandatory. Existing runs, especially UNKNOWN, cannot restart.
 */
export function budgetPort(manifest:any, dir:string, send:(r:ModelRequest)=>Promise<ModelResponse>, context:()=>any=()=>({})):ModelPort & {drain:()=>Promise<void>} {
  for(const field of ['maxCalls','maxUsd','maxPerCallUsd','maxOutputTokens','maxRequestUtf8Bytes']) {
    if(!Number.isFinite(manifest[field])||manifest[field]<0)throw Error('INVALID_BUDGET:'+field);
  }
  for(const field of ['maxCalls','maxOutputTokens','maxRequestUtf8Bytes'])if(!Number.isSafeInteger(manifest[field]))throw Error('INVALID_BUDGET:'+field);
  if(manifest.maxRequestUtf8Bytes===0)throw Error('INVALID_BUDGET:maxRequestUtf8Bytes');
  let reserved=0,calls=0,stopped=false;
  let queue:Promise<unknown>=Promise.resolve();
  const log=(v:any)=>fs.appendFileSync(path.join(dir,'calls.jsonl'),JSON.stringify({...context(),...v,at:new Date().toISOString()})+'\n');
  return {drain:async()=>{await queue.catch(()=>{});},complete(r) {
    const task=queue.then(async()=>{
      if(stopped)throw Error('RUN_FENCED');
      const admission=requestAdmission(r,manifest.maxRequestUtf8Bytes);
      if(r.maxTokens>manifest.maxOutputTokens || calls>=manifest.maxCalls || admission.reservationUsd>manifest.maxPerCallUsd || reserved+admission.reservationUsd>manifest.maxUsd) {
        stopped=true; throw Error('BUDGET_REFUSED_BEFORE_SEND');
      }
      const id=++calls, started=Date.now();
      reserved+=admission.reservationUsd;
      // Persist reservation BEFORE sending; a process crash leaves it unresolved.
      log({id,state:'RESERVED',model:r.model,reservationUsd:admission.reservationUsd,requestSha256:hash(JSON.stringify(r)),
        correctiveRetry:r.user.includes('Your previous reply could not be used')});
      write(path.join(dir,`request-${id}.json`),r);
      try {
        const response=await send(r);
        if(!Number.isFinite(response.costUsd)||response.costUsd!<0||!Number.isSafeInteger(response.inputTokens)||response.inputTokens<0||!Number.isSafeInteger(response.outputTokens)||response.outputTokens<0)throw Error('USAGE_UNKNOWN');
        write(path.join(dir,`response-${id}.json`),response);
        log({id,state:'SETTLED',model:r.model,latencyMs:Date.now()-started,...response,text:undefined});
        reserved+=response.costUsd!-admission.reservationUsd;
        if(response.costUsd!>admission.reservationUsd){stopped=true;throw Error('PROVIDER_COST_EXCEEDED_RESERVATION');}
        return response;
      } catch(error) {
        stopped=true; // no automatic transport retries, including ambiguous 5xx/timeouts
        log({id,state:'UNKNOWN_OR_TERMINAL_FAILURE',latencyMs:Date.now()-started,reservationUsd:admission.reservationUsd,error:String(error)});
        throw error;
      }
    });
    queue=task.catch(()=>{});
    return task;
  }};
}

async function main() {
  const [mode,prepared,output,approvedHash]=process.argv.slice(2);
  if(!['--preflight','--paid'].includes(mode)||!prepared||!output)throw Error('Usage: replay.ts --preflight|--paid PREPARED PRIVATE_NEW_OUTPUT [APPROVED_MANIFEST_SHA256]');
  const manifestPath=path.resolve(prepared,'paid-run.proposed.json');
  const manifestBytes=fs.readFileSync(manifestPath), manifest=JSON.parse(manifestBytes.toString());
  const manifestHash=hash(manifestBytes);
  if(mode==='--paid' && approvedHash!==manifestHash)throw Error('EXPLICIT_APPROVAL_OF_EXACT_MANIFEST_REQUIRED');
  const dir=path.resolve(output),privateRoot=path.join(ROOT,'private')+path.sep;
  if(!dir.startsWith(privateRoot))throw Error('PRIVATE_OUTPUT_REQUIRED');
  execFileSync('git',['check-ignore','--quiet',path.join(dir,'sentinel.json')],{cwd:REPO});
  const currentRevision=execFileSync('git',['rev-parse','HEAD'],{cwd:REPO,encoding:'utf8'}).trim();
  if(currentRevision!==manifest.gitRevision)throw Error('GIT_REVISION_CHANGED');
  for(const [name,digest] of Object.entries(manifest.sourceHashes)) {
    if(hash(fs.readFileSync(path.join(REPO,name)))!==digest)throw Error('SOURCE_CHANGED:'+name);
  }
  const dataset=path.resolve(prepared,'archive/dataset');
  const dataManifest=json(path.join(dataset,'manifest.json'));
  const splits=json(path.join(prepared,'splits.provisional.json')).assignments;
  const cases=manifest.cases.map((name:string)=>{
    const raw=fs.readFileSync(path.join(dataset,name));
    if(hash(raw)!==dataManifest.files.find((f:any)=>f.file===name)?.sha256)throw Error('INPUT_HASH_MISMATCH');
    if(splits[name].split!=='development')throw Error('ONLY_DEVELOPMENT_AUTHORIZABLE');
    return {...JSON.parse(raw.toString()),_file:name};
  }).sort((a:any,b:any)=>a.provenance.trackId.localeCompare(b.provenance.trackId)||Date.parse(a.windowStart)-Date.parse(b.windowStart));
  fs.mkdirSync(dir,{recursive:false});
  write(path.join(dir,'manifest.json'),{...manifest,manifestSha256:manifestHash,mode,startedAt:new Date().toISOString(),
    engineScope:'Actual core V3 editor/verifier/repair. Excludes scheduler freshness, pending carry, account ledger, storage and notification; no production behavior altered.'});
  if(mode==='--preflight') {
    const entries=cases.map((c:any)=>{
      const input=adapt(c,[]);admit(input,manifest.maxRequestUtf8Bytes);
      const prepared=prepareArticles(input.articles);
      let singleAdmission;
      try{admit(input,manifest.maxRequestUtf8Bytes,true);singleAdmission='eligible_without_history';}catch(e){singleAdmission=String(e);}
      return {caseId:c._file,language:c.language,articles:input.articles.length,bodyUtf8Bytes:input.articles.reduce((n,a)=>n+Buffer.byteLength(a.text),0),
        preparedArticles:prepared.prepared.length,skipped:prepared.skipped,singleAdmission,
        editorChunks:chunkArticles(prepared.prepared,90000).length,actualPriorMayIncreaseRequest:true};
    });
    const fullInputBytes=entries.reduce((n:any,e:any)=>n+e.bodyUtf8Bytes,0);
    const nonempty=entries.filter((e:any)=>e.articles>0).length;
    // Explicit planning assumptions: 3 UTF-8 bytes/token, 3k prompt overhead per call,
    // 800 output tokens per call. Actual history, verification evidence and repairs vary.
    const roughUsd=(fullInputBytes/3*(2+2+.4)+nonempty*3000*(2+2+.4)+nonempty*800*(8+8+1.6))/1e6;
    write(path.join(dir,'preflight.json'),{entries,paidCalls:0,qualityStatus:'NOT MEASURED',
      estimatedNormalCalls:nonempty*3,estimatedNormalUsd:roughUsd,estimateAssumptions:'3 UTF-8 bytes/token; 3000 overhead tokens and 800 output tokens/call; 1 single, 1 edit, 1 verify per nonempty window. No repair or chunk allowance; use hard caps.',
      maxUsd:manifest.maxUsd,maxCalls:manifest.maxCalls,sourceHashes:manifest.sourceHashes});
    console.log(JSON.stringify({manifestSha256:manifestHash,cases:cases.length,paidCalls:0}));return;
  }
  // Credentials are intentionally separate from production OPENROUTER_API_KEY.
  const key=process.env.BRIEFING_EVAL_OPENROUTER_KEY;
  if(!key)throw Error('DEDICATED_EVALUATION_CREDENTIAL_REQUIRED');
  let current:any={};
  const port=budgetPort(manifest,dir,async r=>{
    const response=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',
      headers:{authorization:`Bearer ${key}`,'content-type':'application/json'},signal:AbortSignal.timeout(90000),
      body:JSON.stringify({model:r.model,temperature:.1,max_tokens:r.maxTokens,response_format:{type:'json_object'},usage:{include:true},
        messages:[{role:'system',content:r.system},{role:'user',content:r.user}]})});
    if(!response.ok)throw Error(`PROVIDER_HTTP_${response.status}`);
    const raw:any=await response.json();
    if(!raw.usage||typeof raw.choices?.[0]?.message?.content!=='string')throw Error('UNKNOWN_RESPONSE');
    return {text:raw.choices[0].message.content,inputTokens:raw.usage.prompt_tokens,outputTokens:raw.usage.completion_tokens,
      costUsd:raw.usage.cost,finishReason:raw.choices[0].finish_reason,
      resolvedModel:raw.model??null,providerResponseId:raw.id??null,systemFingerprint:raw.system_fingerprint??null};
  },()=>current);
  const histories=new Map<string,PriorItem[]>();
  let stop=false;
  for(const system of manifest.systems) {
    for(const c of cases) {
      if(stop)break;
      const tid=c.provenance.trackId,key=`${system}:${tid}`;
      current={caseId:c._file,system,language:c.language,trackId:tid};
      const track=dataManifest.tracks.find((t:any)=>t.id===tid);
      const prior=histories.get(key)??structuredClone(track.initialHistory??[]);
      const start=Date.now(),startedAt=new Date().toISOString();
      try {
        const result=await runOne(c,system,prior,port,manifest.maxRequestUtf8Bytes);
        await port.drain();
        const history=publishHistory(prior,result.items as BriefingItem[],result.status,system,c._file,c.windowEnd);
        histories.set(key,history);
        write(path.join(dir,`${system}-${c._file}`),{caseId:c._file,trackId:tid,system,language:c.language,split:'development',cluster:splits[c._file].group,
          result,historyBefore:prior,historyAfter:history,deliberateColdStart:track.initialHistory===null,
          startedAt,endedAt:new Date().toISOString(),latencyMs:Date.now()-start,inputSha256:hash(JSON.stringify(adapt(c,prior))),
          measurementClass:'isolated_model_replay',publication:'local artifact only'});
      }catch(error){
        await port.drain();
        write(path.join(dir,`${system}-${c._file}`),{caseId:c._file,trackId:tid,system,language:c.language,split:'development',
          status:'failed',error:String(error),historyBefore:prior,historyAfter:prior,startedAt,latencyMs:Date.now()-start});
        stop=true; // retain evidence; manual reconciliation and new authorization required
      }
    }
    if(stop)break;
  }
  console.log(JSON.stringify({output:dir,stoppedOnFailure:stop}));
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
