/** Offline preparation / explicitly authorized qualification. Never runs on import. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {openAiCompatibleModel,UsageMeter,callJson,type ModelRequest} from '../../packages/briefing/src/model';
import {verifySourceBoundClaims} from '../../packages/briefing/src/source-bound-claims';
import {VERIFY_SYSTEM} from '../../packages/briefing/src/prompts';
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const write=(file:string,v:unknown)=>fs.writeFileSync(file,JSON.stringify(v,null,2)+'\n',{flag:'wx'});
const [mode,dirArg]=process.argv.slice(2),dir=path.resolve(dirArg||'.local-reports/integration/source-bindings-q1');
type Case={id:string;kind:string;language:string;items:Array<{headline:string;body:string;refs:string[]}>;sources:Array<{ref:string;text:string;title?:string}>;prior:unknown[];context:string;expected:Record<number,'ok'|'reject'>;rationale:string;original?:ModelRequest};
if(mode==='summarize'){
 fs.mkdirSync(dir,{recursive:true});const runs=[];
 for(const runDir of process.argv.slice(4)){
  const read=(name:string)=>JSON.parse(fs.readFileSync(path.join(runDir,name),'utf8'));
  const plan=read('plan.json'),cases=read('cases.json') as Case[],outcomes=read('outcomes.json');
  if(hash(cases)!==plan.casesHash)throw Error('CASE_HASH_MISMATCH');
  const ledger=fs.readFileSync(path.join(runDir,'ledger.jsonl'),'utf8').trim().split('\n').map(l=>JSON.parse(l));
  const reservations=ledger.filter(r=>r.state==='RESERVED'),receipts=ledger.filter(r=>r.state==='SETTLED');
  if(new Set(reservations.map(r=>r.id)).size!==reservations.length||new Set(receipts.map(r=>r.id)).size!==receipts.length)throw Error('DUPLICATE_PAID_RECORD');
  let held=0;
  for(const r of reservations){
   if(hash(read(r.id+'.request.json'))!==r.hash)throw Error('REQUEST_HASH_MISMATCH');
   const receipt=receipts.find(v=>v.id===r.id);
   if(receipt){const raw=read(r.id+'.response.json');if(raw.id!==receipt.generationId||raw.usage.cost!==receipt.costUsd)throw Error('RECEIPT_MISMATCH')}
   else held+=r.reserveUsd;
  }
  const settled=receipts.reduce((sum,r)=>sum+r.costUsd,0),totals=read('totals.json');
  if(Math.abs(settled-(totals.newSettledUsd??totals.settledUsd))>1e-10||Math.abs(held-totals.outstandingReservedUsd)>1e-10)throw Error('TOTALS_MISMATCH');
  runs.push({run:path.basename(runDir),plan:{...plan,priorDir:plan.priorDir?path.basename(plan.priorDir):undefined},totals,
   inputFileHash:hash(cases),ledgerFileHash:hash(fs.readFileSync(path.join(runDir,'ledger.jsonl'),'utf8')),
   cases:cases.map(c=>({id:c.id,kind:c.kind,language:c.language,expected:c.expected,rationale:c.rationale,itemsHash:hash(c.items),sourcesHash:hash(c.sources),priorHash:hash(c.prior)})),
   controlledCases:cases.filter(c=>c.kind==='constructed-control'),outcomes,
   operations:reservations.map(r=>({...r,receipt:receipts.find(v=>v.id===r.id),responseHash:fs.existsSync(path.join(runDir,r.id+'.response.json'))?hash(read(r.id+'.response.json')):null}))});
 }
 write(path.join(dir,'measurements.json'),{scope:'Development qualification only. Exact request/response payloads retained privately; immutable hashes and provider receipts below. Hashes use SHA256(JSON.stringify(parsed JSON)); ledger hashes use SHA256(JSON.stringify(raw UTF8 text)). Failed inventories are NOT true-positive factual detections.',runs});
 console.log('Validated every reservation, request hash, receipt, cost and held operation; wrote public measurements.');
}else if(mode==='followup'){
 const priorDir=path.resolve(process.argv[4]||'');
 const priorPlan=JSON.parse(fs.readFileSync(path.join(priorDir,'plan.json'),'utf8'));
 const totals=JSON.parse(fs.readFileSync(path.join(priorDir,'totals.json'),'utf8'));
 if(totals.unresolved||totals.outstandingReservedUsd!==0)throw Error('PRIOR_UNRESOLVED_STOP');
 const cases=JSON.parse(fs.readFileSync(path.join(priorDir,'cases.json'),'utf8'));
 if(hash(cases)!==priorPlan.casesHash)throw Error('PRIOR_CASES_CHANGED');
 fs.mkdirSync(dir,{recursive:true});write(path.join(dir,'cases.json'),cases);
 write(path.join(dir,'plan.json'),{...priorPlan,version:'source-bindings-q2-gap-diagnostics',candidateCommit:'53cfb6eb plus exact missing-span correction diagnostics',systems:['candidate'],priorDir,priorLedgerHash:hash(fs.readFileSync(path.join(priorDir,'ledger.jsonl'),'utf8')),priorSettledUsd:totals.settledUsd,normalCalls:cases.length*2,maxCalls:cases.length*4,change:'Same cases and labels. Only exact missing-span diagnostics added to the bounded parser correction; assertions and first request prompts unchanged. Original results remain negative.'});
 console.log('Frozen candidate-only development follow-up; prior charges count against the same $2.');
}else if(mode==='prepare'){
 fs.mkdirSync(dir,{recursive:true});
 const trace='.local-reports/integration/prod-quality-review/trace',cases:Case[]=[];
 for(const [id,needle] of [['retained-name','نجيب سلام'],['retained-role','قائد الجيش جوزيف عون']]){
  const records=fs.readdirSync(trace).filter(f=>f.startsWith('semantic_intents-')).map(f=>JSON.parse(fs.readFileSync(path.join(trace,f),'utf8')));
  const record=records.find(j=>j.input.state.request.system.startsWith('You are a meticulous fact-checker')&&j.input.state.request.user.split('ITEMS TO CHECK:')[1]?.split('\n\nCheck EACH')[0].includes(needle));
  if(!record)throw Error('RETAINED_REQUEST_NOT_FOUND');
  const original=record.input.state.request as ModelRequest,u=original.user;
  const sourceText=u.split('\nSOURCES:\n')[1].split('\nITEMS TO CHECK:')[0];
  const sources=[...sourceText.matchAll(/\[(S\d+)\]([^\n]*)\n([\s\S]*?)(?=\n\n---\n\n\[S|$)/g)].map(m=>({ref:m[1],title:m[2].split(' | title: ')[1]??'',text:m[3].trim()}));
  const itemText=u.split('\nITEMS TO CHECK:\n')[1].split('\n\nCheck EACH')[0].split('\n\nPREVIOUS REVIEW')[0];
  const items=[...itemText.matchAll(/#(\d+) \[[^\]]+\] cites ([^\n]+)\n  headline: ([^\n]*)\n  body: ([\s\S]*?)(?=\n#\d+ \[|$)/g)].map(m=>({headline:m[3],body:m[4].split('\n  automated hints:')[0].trim(),refs:m[2].split(', ')}));
  const target=items.findIndex(i=>(i.headline+' '+i.body).includes(needle));
  if(target<0||!sources.length||items.some(i=>i.refs.some(r=>!sources.some(s=>s.ref===r))))throw Error('RETAINED_PARSE_FAILED');
  const priorText=u.split('ALREADY TOLD TO THE READER:\n')[1].split('\nSOURCES:')[0];
  const prior=[...priorText.matchAll(/\[([^\]]+)\] ([^|\n]+) \| ([^\n]*)/g)].map(m=>({id:m[1],publishedAt:m[2].trim(),headline:m[3],body:''}));
  const context=u.split('\nSOURCES:')[0]+'\nSource publication metadata (not event times):\n'+sourceText.split('\n').filter(line=>/^\[S\d+\]/.test(line)).join('\n');
  cases.push({id,kind:'retained-production',language:'ar',items,sources,prior,context,expected:{[target]:'reject'},rationale:id==='retained-name'?'Cited posts identify only سلام; the added full name نجيب سلام is unsupported.':'Cited text explicitly identifies الرئيس جوزيف عون, not army commander.',original});
  const correct=(text:string)=>text.replaceAll('نجيب سلام','سلام').replaceAll('قائد الجيش جوزيف عون','الرئيس جوزيف عون');
  const corrected={...items[target],headline:correct(items[target].headline),body:correct(items[target].body)};
  cases.push({id:id+'-identity-only-control',kind:'source-derived-control',language:'ar',items:[corrected],sources:sources.filter(s=>corrected.refs.includes(s.ref)),prior:[],context,expected:{0:'ok'},rationale:'Only the unsupported identity/role is removed. The selected source text must support all remaining claims.'});
 }
 function add(id:string,language:string,text:string,headline:string,expected:'ok'|'reject',rationale:string){cases.push({id,kind:'constructed-control',language,items:[{headline,body:'',refs:['S1']}],sources:[{ref:'S1',text}],prior:[],context:'BRIEFING REPORTING CUTOFF: 2026-11-18T12:00:00Z',expected:{0:expected},rationale})}
 add('ar-compound-valid','ar','أعلن الرئيس عبد الفتاح السيسي قراراً بتعليق الرسوم لمدة ثلاثة أشهر.','الرئيس عبد الفتاح السيسي يعلن تعليق الرسوم لثلاثة أشهر.','ok','Exact complete identity, action and duration; ordinary paraphrase.');
 add('ar-compound-substitution','ar','أعلن الرئيس عبد الفتاح السيسي قراراً بتعليق الرسوم لمدة ثلاثة أشهر.','الرئيس عبد الفتاح الوحش يعلن تعليق الرسوم لثلاثة أشهر.','reject','The final surname is changed while the two-token prefix matches.');
 add('en-valid-qualification','en','The council said the bridge may reopen on Friday, subject to a safety inspection.','Council: bridge may reopen Friday if it passes a safety inspection.','ok','Attribution, possibility, date and condition preserved.');
 add('en-quantity-substitution','en','The authority approved a grant of $5 million for the hospital.','Authority approves $15 million hospital grant.','reject','Amount changes from 5 to 15 million.');
 add('fr-valid-translation','fr','The mayor said the library will close for two days for repairs.','Selon le maire, la bibliothèque fermera deux jours pour des travaux.','ok','Legitimate English-to-French translation with attribution and duration intact.');
 add('fr-valid-uncertainty','fr','La préfecture indique que trois personnes auraient été blessées. Ce bilan reste provisoire.','Selon la préfecture, trois personnes auraient été blessées ; bilan provisoire.','ok','Reported provisional figure remains provisional, not established as certainty.');
 const plan={version:'source-bindings-q1',candidateCommit:'53cfb6eb',ceilingUsd:2,authorization:'Explicit new $2 maximum from user, including unresolved reservations; no deployment.',model:'openai/gpt-4.1-mini',plannedCases:cases.length,normalCalls:cases.length*3,maxCalls:cases.length*6,estimatedUsd:'$0.10–$0.60; hard cumulative settled + outstanding ceiling $2',stopGo:'No known-fault approval; no false withholding on valid controls; no unusable final decisions. Any failure blocks rollout pending diagnosis. Small exposed/control sample cannot establish general accuracy.',labels:'Frozen from retained source text / constructed source facts before outputs; sibling claims in retained batches unlabelled. Related corrected controls are not independent events.',historicalHolds:'All historical holds remain unchanged and outside this new campaign; never replay their operation IDs.',casesHash:hash(cases)};
 write(path.join(dir,'cases.json'),cases);write(path.join(dir,'plan.json'),plan);console.log(JSON.stringify({plan,cases:cases.map(c=>({id:c.id,items:c.items.length,sources:c.sources.length,expected:c.expected}))},null,2));
}else if(mode==='run'){
 const plan=JSON.parse(fs.readFileSync(path.join(dir,'plan.json'),'utf8')),cases=JSON.parse(fs.readFileSync(path.join(dir,'cases.json'),'utf8')) as Case[];
 if(plan.ceilingUsd!==2||hash(cases)!==plan.casesHash)throw Error('FROZEN_PLAN_CHANGED');
 const journal=path.join(dir,'ledger.jsonl');
 // Single-process, append-only campaign. A restart never resends anything.
 const lock=fs.openSync(path.join(dir,'run.lock'),'wx');fs.closeSync(lock);
 if(fs.existsSync(journal))throw Error('CAMPAIGN_ALREADY_STARTED_NO_REPLAY');
 const append=(v:unknown)=>{const fd=fs.openSync(journal,'a');try{fs.writeSync(fd,JSON.stringify(v)+'\n');fs.fsyncSync(fd)}finally{fs.closeSync(fd)}};
 const file=path.resolve('../../apps/worker/.dev.vars.staging');
 const line=fs.readFileSync(file,'utf8').split(/\r?\n/).find(l=>/^\s*OPENROUTER_API_KEY\s*=/.test(l));
 let key=line?.slice(line.indexOf('=')+1).trim();if(key&&(key[0]==='"'||key[0]==="'"))key=key.slice(1,key.lastIndexOf(key[0]));if(!key?.startsWith('sk-or-'))throw Error('KEY_NOT_CONFIGURED');
 const models=await (await fetch('https://openrouter.ai/api/v1/models')).json() as any;
 const pricing=models.data.find((v:any)=>v.id===plan.model)?.pricing;
 if(!pricing||Number(pricing.prompt)>0.4e-6||Number(pricing.completion)>1.6e-6)throw Error('PRICING_CEILING_CHANGED');
 write(path.join(dir,'pricing.json'),{at:new Date().toISOString(),model:plan.model,pricing});
 if(plan.priorDir&&hash(fs.readFileSync(path.join(plan.priorDir,'ledger.jsonl'),'utf8'))!==plan.priorLedgerHash)throw Error('PRIOR_LEDGER_CHANGED');
 let settled=plan.priorSettledUsd??0,held=0,calls=0,unresolved=false;const outcomes=[];
 const portFor=(caseId:string,system:string)=>({complete:async(request:ModelRequest)=>{
  if(unresolved)throw Error('UNKNOWN_OPERATION_STOP');
  const reserve=Math.ceil(((Buffer.byteLength(JSON.stringify(request),'utf8')+4096)*0.4e-6+request.maxTokens*1.6e-6)*1e6)/1e6;
  if(settled+held+reserve>2||calls>=plan.maxCalls)throw Error('CAMPAIGN_CEILING');
  const id=randomUUID(),started=Date.now();calls++;held+=reserve;
  write(path.join(dir,id+'.request.json'),request);append({id,caseId,system,state:'RESERVED',reserveUsd:reserve,hash:hash(request),at:new Date().toISOString()});
  let received:any;const inner=openAiCompatibleModel({url:'https://openrouter.ai/api/v1/chat/completions',apiKey:key!,reportCost:true,retries:0,timeoutMs:90000,
   onResponseHeaders:async r=>append({id,state:'HEADERS',status:r.status}),
   onResponseBody:async raw=>{received=raw;write(path.join(dir,id+'.response.json'),raw);const cost=received?.usage?.cost;
    if(!received.id||!Number.isFinite(cost)||cost<0){unresolved=true;append({id,state:'UNKNOWN',reason:'missing receipt or cost'});throw Error('MISSING_RECEIPT_OR_COST')}
    held-=reserve;settled+=cost;append({id,state:'SETTLED',generationId:received.id,costUsd:cost,reserveUsd:reserve,latencyMs:Date.now()-started,inputTokens:received.usage.prompt_tokens,outputTokens:received.usage.completion_tokens});if(cost>reserve){unresolved=true;throw Error('RESERVATION_OVERAGE')}
   }});
  try{return await inner.complete(request)}catch(error){if(!received){unresolved=true;append({id,state:'UNKNOWN',reserveUsd:reserve,error:String(error)})}throw error}
 }});
 campaign:for(const c of cases)for(const system of plan.systems??['current','candidate']){
  const meter=new UsageMeter(),start=Date.now();let decisions:unknown,error:string|undefined;
  try{const port=portFor(c.id,system);
   if(system==='candidate')decisions=Object.fromEntries(await verifySourceBoundClaims(port,meter,{model:plan.model,language:c.language,items:c.items,sources:c.sources,prior:c.prior,context:c.context}));
   else{const req=c.original??{model:plan.model,system:VERIFY_SYSTEM,user:JSON.stringify({language:c.language,items:c.items.map((i,index)=>({...i,i:index})),sources:c.sources,prior:c.prior,context:c.context}),maxTokens:3000};
    decisions=await callJson(port,meter,req,raw=>{const rows=(raw as any)?.results;if(!Array.isArray(rows)||rows.length!==c.items.length)throw Error('MISSING_ITEM');const out:Record<number,unknown>={};for(const r of rows){if(!Number.isInteger(r.i)||r.i<0||r.i>=c.items.length||out[r.i]||!['ok','fix','drop','redundant'].includes(r.verdict)||r.issues!==undefined&&(!Array.isArray(r.issues)||r.issues.some((x:unknown)=>typeof x!=='string')))throw Error('INVALID_DECISION');out[r.i]=r}return out});
   }
  }catch(e){error=String(e)}
  const row={caseId:c.id,system,decisions,error,usage:meter.usage,latencyMs:Date.now()-start};outcomes.push(row);write(path.join(dir,c.id+'.'+system+'.outcome.json'),row);console.log(JSON.stringify({caseId:c.id,system,error,usage:meter.usage,latencyMs:row.latencyMs}));
  if(unresolved)break campaign;
 }
 write(path.join(dir,'outcomes.json'),outcomes);write(path.join(dir,'totals.json'),{settledUsd:settled,newSettledUsd:settled-(plan.priorSettledUsd??0),outstandingReservedUsd:held,calls,unresolved,ceilingUsd:2});
 console.log(JSON.stringify({settledUsd:settled,outstandingReservedUsd:held,calls,unresolved}));
}else throw Error('Use prepare or run, followed by a new output directory.');
