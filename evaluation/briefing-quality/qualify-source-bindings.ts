/** Offline preparation / explicitly authorized qualification. Never runs on import. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {openAiCompatibleModel,UsageMeter,callJson,extractJson,type ModelRequest} from '../../packages/briefing/src/model';
import {consistentReview,mappedReviewRequest,consistencySchema} from './worker/src/review-consistency';
import {auditOmissionHistory,omissionHistorySchema} from './worker/src/omission-history';
import {groundedReviewRequest,groundedReview,groundedMetrics} from './worker/src/grounding';
import {groundedReviewSchema,claimInventoryAuditSchema} from './worker/src/schema';
import {assessClaimInventory} from './worker/src/claim-inventory';
import {verifySourceBoundClaims} from '../../packages/briefing/src/source-bound-claims';
import {VERIFY_SYSTEM} from '../../packages/briefing/src/prompts';
import {generateBriefing} from '../../packages/briefing/src/engine';
import {auditRepairCoverage} from '../../packages/briefing/src/verification-recovery';
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const write=(file:string,v:unknown)=>fs.writeFileSync(file,JSON.stringify(v,null,2)+'\n',{flag:'wx'});
const [mode,dirArg]=process.argv.slice(2),dir=path.resolve(dirArg||'.local-reports/integration/source-bindings-q1');
type Case={id:string;kind:string;language:string;items:Array<{headline:string;body:string;refs:string[]}>;sources:Array<{ref:string;text:string;title?:string}>;prior:unknown[];context:string;expected:Record<number,'ok'|'reject'>;rationale:string;original?:ModelRequest;engineSnapshot?:any;coverageProbe?:boolean};
function settledSeeds(runDir:string){
 const events=fs.readFileSync(path.join(runDir,'ledger.jsonl'),'utf8').trim().split('\n').map(l=>JSON.parse(l));
 return events.filter(e=>e.state==='SETTLED').flatMap(e=>{const file=path.join(runDir,e.id+'.response.json');if(!fs.existsSync(file))return [];const raw=JSON.parse(fs.readFileSync(file,'utf8')),choice=raw.choices?.[0];if(typeof choice?.message?.content!=='string'||!choice.message.content.trim()||raw.id!==e.generationId||raw.usage.cost!==e.costUsd)return [];
  return [{id:e.id,request:JSON.parse(fs.readFileSync(path.join(runDir,e.id+'.request.json'),'utf8')),response:{text:choice.message.content,inputTokens:e.inputTokens,outputTokens:e.outputTokens,costUsd:e.costUsd,finishReason:choice.finish_reason},originalUsage:{costUsd:e.costUsd,reported:true,generationId:raw.id}}];
 });
}
if(mode==='coverage-prepare'){
 const previous=path.resolve(process.argv[4]),totals=JSON.parse(fs.readFileSync(path.join(previous,'totals.json'),'utf8'));if(totals.unresolved)throw Error('PRIOR_UNKNOWN_STOP');
 const source='The army arrested a wanted suspect in Rehab, Baabda for kidnapping, armed robbery, shooting and drug trafficking. It also detained three Lebanese for unlicensed pistols, one Palestinian for failing to obey checkpoint orders, and 123 Syrians for illegal entry and lack of legal papers. Investigations are supervised by the competent judiciary.';
 const texts=[['incomplete-core','Army reports arresting a wanted suspect in Rehab, Baabda','reject'],['complete-core','Army arrests a wanted suspect in Rehab, Baabda for kidnapping, armed robbery, shooting and drug trafficking; also detains three Lebanese for unlicensed pistols, one Palestinian for failing to obey checkpoint orders, and 123 Syrians for illegal entry and lack of legal papers. Investigations are supervised by the competent judiciary.','ok']];
 const cases=texts.map(([id,headline,expected])=>({id,kind:'constructed-material-coverage-regression',coverageProbe:true,language:'en',items:[{headline,body:'',refs:['S1']}],sources:[{ref:'S1',text:source}],prior:[],context:'Source-derived regression; independent groups and their grounds must remain; omit ambiguous aggregate total.',expected:{0:expected},rationale:'Source explicitly reports four distinct material groups; a wanted-suspect-only core loses the large independently supported detention operation.'}));
 fs.mkdirSync(dir,{recursive:true});write(path.join(dir,'cases.json'),cases);write(path.join(dir,'plan.json'),{version:'beta-material-coverage-v2',ceilingUsd:5,model:'openai/gpt-4.1',systems:['coverage'],casesHash:hash(cases),maxCalls:4,priorSettledUsd:totals.settledUsd,priorHeldUsd:totals.outstandingReservedUsd});console.log('Frozen incomplete/complete source-derived material-retention controls.');
}else if(mode==='engine-prepare'||mode==='engine-followup-prepare'||mode==='engine-resume-prepare'){
 const previous=path.resolve(process.argv[4]),totals=JSON.parse(fs.readFileSync(path.join(previous,'totals.json'),'utf8'));
 if(totals.unresolved)throw Error('PRIOR_UNKNOWN_STOP');
 const trace='.local-reports/integration/prod-quality-review/trace',cases:Case[]=[];
 for(const id of ['827b1694b5fea1a0b59da150d9b393de317faaab24e84fdb7af426e4b4a5bb1d','72bf6cacbbf523fa73528cf2d6f62aa71f6d7ac2641abe2eec634b2f0526236e']){
  const snapshot=JSON.parse(fs.readFileSync(path.join(trace,'v3_window_inputs-'+id+'.json'),'utf8'));
  cases.push({id,kind:'retained-full-engine-replay',language:snapshot.input.feed.language,items:[],sources:[],prior:[],context:'Original frozen source evidence/history/options; isolated candidate identity policy and verifier model.',expected:{},rationale:'Actual generateBriefing, original V4 writer prompt/options. Reuse completed writer response only on exact request equality; real verifier/repair calls. No public publication.',engineSnapshot:snapshot});
 }
 const historical=[];
 for(const file of fs.readdirSync(trace).filter(f=>f.startsWith('semantic_intents-'))){const intent=JSON.parse(fs.readFileSync(path.join(trace,file),'utf8')),request=intent.input.state.request;
  if(!request.system.startsWith('You are the editor'))continue;
  const result=JSON.parse(fs.readFileSync(path.join(trace,'semantic_results-'+intent.id+'.json'),'utf8'));
  if(result.usage?.reported===true&&typeof result.value?.text==='string')historical.push({id:intent.id,request,response:result.value,originalUsage:result.usage});
 }
 if(mode==='engine-followup-prepare'||mode==='engine-resume-prepare'){
  const priorOutcomes=JSON.parse(fs.readFileSync(path.join(previous,'outcomes.json'),'utf8'));
  const selected=cases.filter(c=>priorOutcomes.some((o:any)=>o.caseId===c.id&&o.engineResult?.dropped?.some((d:any)=>(mode==='engine-resume-prepare'||String(d.reason).includes('RECOVERY_COVERAGE')))));cases.splice(0,cases.length,...selected);
  historical.push(...settledSeeds(previous));if(!cases.length)throw Error('NO_COVERAGE_FAILURE_TO_REPLAY');
 }
 fs.mkdirSync(dir,{recursive:true});write(path.join(dir,'cases.json'),cases);write(path.join(dir,'historical-writers.json'),historical);
 write(path.join(dir,'plan.json'),{version:'beta-full-engine-replay-v2',ceilingUsd:5,model:'openai/gpt-4.1',systems:['engine'],casesHash:hash(cases),historicalWritersHash:hash(historical),maxCalls:60,priorSettledUsd:totals.settledUsd,priorHeldUsd:totals.outstandingReservedUsd,forbiddenRequestHashes:['bc6f0ce8d2714fb6b074b4176850f9565b6abc4bde7abab6ac0b987d041b5971'],scope:'Two immutable production inputs; original options and reader history. New v2 identity policy / GPT-4.1 verifier. No production writes or live publication.'});
 console.log('Frozen two full-engine replays with exact historical writer reuse and the remaining shared $5 ceiling.');
}else
if(mode==='reconcile-refusals'){
 const ledgerFile=path.join(dir,'ledger.jsonl'),events=fs.readFileSync(ledgerFile,'utf8').trim().split('\n').map(l=>JSON.parse(l));
 const reconciled=[];
 for(const r of events.filter(r=>r.state==='RESERVED')){
  if(events.some(e=>e.id===r.id&&['SETTLED','REFUSED','REFUSAL_RECONCILED'].includes(e.state)))continue;
  const header=events.find(e=>e.id===r.id&&e.state==='HEADERS'&&e.status===429),failure=events.find(e=>e.id===r.id&&e.state==='UNKNOWN'&&String(e.error).startsWith('BriefingModelError: provider HTTP 429:'));
  if(!header||!failure)continue;
  const record={id:r.id,state:'REFUSAL_RECONCILED',costUsd:0,reserveUsd:r.reserveUsd,evidence:{header,failure},reason:'Explicit recorded HTTP 429 provider refusal; the existing transport classifies this as retryable and not uncertain. Original UNKNOWN record retained.'};
  const fd=fs.openSync(ledgerFile,'a');try{fs.writeSync(fd,JSON.stringify(record)+'\n');fs.fsyncSync(fd)}finally{fs.closeSync(fd)}reconciled.push(record);
 }
 if(!reconciled.length)throw Error('NO_PROVEN_REFUSALS');
 const totals=JSON.parse(fs.readFileSync(path.join(dir,'totals.json'),'utf8'));
 const after=[...events,...reconciled],pending=after.filter(r=>r.state==='RESERVED'&&!after.some(e=>e.id===r.id&&['SETTLED','REFUSED','REFUSAL_RECONCILED'].includes(e.state)));
 write(path.join(dir,'reconciled-totals.json'),{...totals,outstandingReservedUsd:(totals.historicalHeldUsd??0)+pending.reduce((s,r)=>s+r.reserveUsd,0),unresolved:pending.length>0,refusalEvidence:reconciled});
 console.log('Appended proven refusal acknowledgements; original paid records and historical unknown hold unchanged.');
}else if(mode==='beta-prepare'||mode==='beta-name-prepare'||mode==='beta-remaining-prepare'){
 const source=path.resolve(process.argv[4]);const cases=JSON.parse(fs.readFileSync(path.join(source,'cases.json'),'utf8'));
 const previous=process.argv[5]?path.resolve(process.argv[5]):undefined;
 const totals=previous?JSON.parse(fs.readFileSync(path.join(previous,fs.existsSync(path.join(previous,'reconciled-totals.json'))?'reconciled-totals.json':'totals.json'),'utf8')):undefined;
 if(totals?.unresolved)throw Error('NEW_UNKNOWN_STOP');
 if(mode==='beta-name-prepare'||mode==='beta-remaining-prepare'){
  for(const [id,language,source,headline,expected,rationale]of [
   ['ar-invented-name','ar','قال سلام إن الجسر سيفتح بعد الفحص.','نجيب قنديل: الجسر سيفتح بعد الفحص.','reject','No cited source establishes the invented full identity.'],
   ['ar-surname-valid','ar','قال نواف سلام إن الجسر سيفتح بعد الفحص.','سلام: الجسر سيفتح بعد الفحص.','ok','Surname-only reference is supported by the full source identity.'],
   ['ar-transliteration-valid','ar','John Smith said the bridge will open after inspection.','جون سميث: الجسر سيفتح بعد الفحص.','ok','Legitimate cross-script name translation preserves the statement and condition.'],
   ['fr-surname-valid','fr','Emmanuel Macron a annoncé la réouverture du pont après inspection.','Macron annonce la réouverture du pont après inspection.','ok','Legitimate shortened person reference, action and condition unchanged.']
  ])cases.push({id,kind:'constructed-name-regression',language,items:[{headline,body:'',refs:['S1']}],sources:[{ref:'S1',text:source}],prior:[],context:'Reporting cutoff: 2026-11-18T12:00:00Z',expected:{0:expected},rationale});
 }
 if(mode==='beta-remaining-prepare'){
  if(!previous)throw Error('PRIOR_RUN_REQUIRED');const done=JSON.parse(fs.readFileSync(path.join(previous,'outcomes.json'),'utf8'));
  const remaining=cases.filter((c:Case)=>!done.some((o:any)=>o.caseId===c.id&&!o.error));cases.splice(0,cases.length,...remaining);
 }
 fs.mkdirSync(dir,{recursive:true});write(path.join(dir,'cases.json'),cases);
 write(path.join(dir,'plan.json'),{version:'beta-reader-person-bindings-v2',candidateCommit:'f0a6dc53 plus deterministic reader/source bindings and complete person-name comparison',ceilingUsd:5,authorization:'Explicit new $5 beta fix and verification allowance.',model:process.argv[6]??'openai/gpt-4.1-mini',systems:['candidate'],casesHash:hash(cases),maxCalls:cases.length*6,priorSettledUsd:totals?.settledUsd??0,priorHeldUsd:.012416,forbiddenRequestHashes:['bc6f0ce8d2714fb6b074b4176850f9565b6abc4bde7abab6ac0b987d041b5971'],stopGo:'No faulty approvals, no valid control withholding, complete evidence assessments; earlier results unchanged. This is development qualification, not general beta certification.'});
 console.log('Frozen new $5 campaign; historical unknown held and exact ambiguous request hash forbidden.');
}else if(mode==='summarize'){
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
   else if(!ledger.some(e=>e.id===r.id&&['REFUSED','REFUSAL_RECONCILED'].includes(e.state)))held+=r.reserveUsd;
  }
  const settled=receipts.reduce((sum,r)=>sum+r.costUsd,0),originalTotals=read('totals.json'),totals=fs.existsSync(path.join(runDir,'reconciled-totals.json'))?read('reconciled-totals.json'):originalTotals;
  if(Math.abs(settled-(totals.newSettledUsd??totals.settledUsd))>1e-10||Math.abs(held+(totals.historicalHeldUsd??0)-totals.outstandingReservedUsd)>1e-10)throw Error('TOTALS_MISMATCH');
  runs.push({run:path.basename(runDir),plan:{...plan,priorDir:plan.priorDir?path.basename(plan.priorDir):undefined},totals,originalTotals,
   inputFileHash:hash(cases),ledgerFileHash:hash(fs.readFileSync(path.join(runDir,'ledger.jsonl'),'utf8')),
   cases:cases.map(c=>({id:c.id,kind:c.kind,language:c.language,expected:c.expected,rationale:c.rationale,itemsHash:hash(c.items),sourcesHash:hash(c.sources),priorHash:hash(c.prior),engineSnapshotHash:c.engineSnapshot?hash(c.engineSnapshot):undefined})),
   controlledCases:cases.filter(c=>c.kind==='constructed-control'),outcomes,
   operations:reservations.map(r=>({...r,receipt:receipts.find(v=>v.id===r.id),refusal:ledger.find(e=>e.id===r.id&&['REFUSED','REFUSAL_RECONCILED'].includes(e.state)),responseHash:fs.existsSync(path.join(runDir,r.id+'.response.json'))?hash(read(r.id+'.response.json')):null})),reuses:ledger.filter(e=>['REUSED','HISTORICAL_REUSE'].includes(e.state))});
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
 write(path.join(dir,'plan.json'),{...priorPlan,version:'source-bindings-q2-gap-diagnostics',candidateCommit:'53cfb6eb plus exact missing-span correction diagnostics',systems:['candidate'],priorDir,priorLedgerHash:hash(fs.readFileSync(path.join(priorDir,'ledger.jsonl'),'utf8')),priorSettledUsd:totals.settledUsd,normalCalls:cases.length*2,maxCalls:cases.length*6,change:'Same cases and labels. Only exact missing-span diagnostics added to the bounded parser correction; assertions and first request prompts unchanged. Original results remain negative.'});
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
 if(![2,5].includes(plan.ceilingUsd)||hash(cases)!==plan.casesHash)throw Error('FROZEN_PLAN_CHANGED');
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
 const rates=plan.model==='openai/gpt-4.1'?{input:2e-6,output:8e-6}:plan.model==='openai/gpt-4.1-mini'?{input:.4e-6,output:1.6e-6}:undefined;
 if(!rates||!pricing||Number(pricing.prompt)>rates.input||Number(pricing.completion)>rates.output)throw Error('PRICING_CEILING_CHANGED');
 write(path.join(dir,'pricing.json'),{at:new Date().toISOString(),model:plan.model,pricing});
 if(plan.priorDir&&hash(fs.readFileSync(path.join(plan.priorDir,'ledger.jsonl'),'utf8'))!==plan.priorLedgerHash)throw Error('PRIOR_LEDGER_CHANGED');
 let settled=plan.priorSettledUsd??0,held=plan.priorHeldUsd??0,calls=0,unresolved=false;const outcomes=[];
 const responseCache=new Map<string,{id:string;response:Awaited<ReturnType<ReturnType<typeof openAiCompatibleModel>['complete']>>}>();let nextDispatch=0;
 const historical=plan.historicalWritersHash?JSON.parse(fs.readFileSync(path.join(dir,'historical-writers.json'),'utf8')):[];
 if(plan.historicalWritersHash&&hash(historical)!==plan.historicalWritersHash)throw Error('HISTORICAL_WRITER_CHANGED');
 const campaignInFlight=new Set<Promise<unknown>>();let providerTurn:Promise<unknown>=Promise.resolve();
 const sequenced=<T>(work:()=>Promise<T>):Promise<T>=>{const task=providerTurn.then(work);providerTurn=task.catch(()=>{});campaignInFlight.add(task);void task.then(()=>campaignInFlight.delete(task),()=>campaignInFlight.delete(task));return task};
 const portFor=(caseId:string,system:string)=>({complete:(request:ModelRequest)=>sequenced(async()=>{
  if(unresolved)throw Error('UNKNOWN_OPERATION_STOP');
  const requestHash=hash(request),cached=responseCache.get(requestHash);
  if(plan.forbiddenRequestHashes?.includes(requestHash))throw Error('HISTORICAL_UNKNOWN_REQUEST_FORBIDDEN');
  if(cached){append({state:'REUSED',caseId,system,requestHash,originalId:cached.id});return {...cached.response,costUsd:0}}
  const old=historical.find((v:any)=>['model','system','user','maxTokens','responseSchema'].every(k=>JSON.stringify(v.request[k]??null)===JSON.stringify((request as any)[k]??null)));
  if(old){append({state:'HISTORICAL_REUSE',caseId,system,requestHash,originalId:old.id,originalRequestHash:hash(old.request),originalReportedCostUsd:old.originalUsage.costUsd});return {...old.response,costUsd:0}}
  const reserve=Math.ceil(((Buffer.byteLength(JSON.stringify(request),'utf8')+4096)*rates.input+request.maxTokens*rates.output)*1e6)/1e6;
  if(settled+held+reserve>plan.ceilingUsd||calls>=plan.maxCalls)throw Error('CAMPAIGN_CEILING');
  if(plan.forbiddenRequestHashes?.includes(hash(request)))throw Error('HISTORICAL_UNKNOWN_REQUEST_FORBIDDEN');
  const id=randomUUID(),started=Date.now();calls++;held+=reserve;
  write(path.join(dir,id+'.request.json'),request);append({id,caseId,system,state:'RESERVED',reserveUsd:reserve,hash:hash(request),at:new Date().toISOString()});
  const dispatchAt=Math.max(Date.now(),nextDispatch);nextDispatch=dispatchAt+4500;
  if(Date.now()<dispatchAt)await new Promise(resolve=>setTimeout(resolve,dispatchAt-Date.now()));
  append({id,state:'DISPATCHED',at:new Date().toISOString()});
  let received:any,status:number|undefined;const inner=openAiCompatibleModel({url:'https://openrouter.ai/api/v1/chat/completions',apiKey:key!,reportCost:true,retries:0,timeoutMs:90000,
   onResponseHeaders:async r=>{status=r.status;append({id,state:'HEADERS',status:r.status,...(r.headers.get('x-generation-id')?{generationId:r.headers.get('x-generation-id')}:{})});if(!r.ok)write(path.join(dir,id+'.refusal-response.json'),{status:r.status,body:await r.clone().text()})},
   onResponseBody:async raw=>{received=raw;write(path.join(dir,id+'.response.json'),raw);const cost=received?.usage?.cost;
    if(!received.id||!Number.isFinite(cost)||cost<0){unresolved=true;append({id,state:'UNKNOWN',reason:'missing receipt or cost'});throw Error('MISSING_RECEIPT_OR_COST')}
    held-=reserve;settled+=cost;append({id,state:'SETTLED',generationId:received.id,costUsd:cost,reserveUsd:reserve,latencyMs:Date.now()-started,inputTokens:received.usage.prompt_tokens,outputTokens:received.usage.completion_tokens});if(cost>reserve){unresolved=true;throw Error('RESERVATION_OVERAGE')}
   }});
  try{const response=await inner.complete(request);responseCache.set(requestHash,{id,response});return response}catch(error){
   if(!received&&status!==undefined&&(status<500||status===503)&&(error as any)?.uncertain===false){held-=reserve;append({id,state:'REFUSED',status,costUsd:0,reserveUsd:reserve,error:String(error)});if(status===429)nextDispatch=Date.now()+45000}
   else if(!received){unresolved=true;append({id,state:'UNKNOWN',reserveUsd:reserve,error:String(error)})}throw error}
 })});
 campaign:for(const c of cases)for(const system of (c as any).systems??plan.systems??['current','candidate']){
  const meter=new UsageMeter(),start=Date.now();let decisions:unknown,error:string|undefined,engineResult:any;
  try{const port=portFor(c.id,system);
   if(system==='consistency'||system==='history'||system==='review-engine'){
    const spec=c as any,assessment=structuredClone(spec.assessmentCase),inventory=spec.inventory;
    if(system==='review-engine'){
     const generated=(outcomes.find((r:any)=>r.caseId===spec.engineCaseId&&r.system==='engine')??spec.retainedEngineOutcome) as any;
     if(!generated?.engineResult||generated.error)throw Error('ENGINE_RESULT_UNAVAILABLE');
     assessment.items=generated.engineResult.items.map((i:any)=>({headline:i.headline,body:i.body,sourceIds:i.sourceIds}));assessment.pipelineStatus=generated.engineResult.status;
    }
    const send=async(q:any)=>{const response=await port.complete({model:plan.model,system:q.system,user:q.user,maxTokens:10000,responseSchema:q.schemaPolicy==='review-consistency-v2'?consistencySchema(q.user):q.schemaPolicy==='claim-inventory-audit-v1'?claimInventoryAuditSchema(q.user):q.schemaPolicy==='omission-history-v1'?omissionHistorySchema(q.user):groundedReviewSchema(q.user)});meter.add(response);if(response.finishReason==='length')throw Error('TRUNCATED_ASSESSMENT');return extractJson(response.text)};
    if(system==='consistency')decisions=await consistentReview(assessment,inventory,spec.rawReview,send);
    else if(system==='history')decisions=await auditOmissionHistory(assessment,inventory,spec.rawReview,send);
    else {const response=await send(mappedReviewRequest(assessment,inventory)),review=await consistentReview(assessment,inventory,response,send),history=await auditOmissionHistory(assessment,inventory,review.review,send);const metrics=groundedMetrics(history.review,inventory,assessment),eligible=new Set(inventory.developments.filter((d:any)=>d.importance>=2&&d.relation!=='already_reported'&&!history.review.coverage.some((v:any)=>v.developmentId===d.id&&v.status==='already_reported')).map((d:any)=>d.id)),rows=history.review.coverage.filter((v:any)=>eligible.has(v.developmentId)),covered=rows.filter((v:any)=>v.status==='covered').length,uncertain=rows.filter((v:any)=>v.status==='uncertain').length;decisions={...review,preHistoryReview:review.review,...history,metrics:{...metrics,completionConditionedDevelopmentRecall:metrics.importantDevelopmentRecall,importantDevelopmentRecall:{numerator:covered,denominator:rows.length,value:rows.length?covered/rows.length:null},importantDevelopmentRecallBounds:{lower:rows.length?covered/rows.length:null,upper:rows.length?(covered+uncertain)/rows.length:null},recallAggregationPolicy:'uncertainty-in-denominator-v1'}};}
    if(system==='review-engine'&&plan.claimInventoryAudit)(decisions as any).claimInventoryAudit=await assessClaimInventory(assessment,(decisions as any).review,send);
   }else if(system==='coverage'){
    const input:any={feed:{interest:'Lebanese security developments',language:'en',windowMinutes:120,identityFidelityPolicy:'source-bound-claims-v2'},windowStart:'2026-11-18T00:00:00Z',windowEnd:'2026-11-18T02:00:00Z',articles:[],prior:[]};
    const blocked=await auditRepairCoverage(port,meter,plan.model,input,c.items.map((item,index)=>({...item,index,history:[{headline:'Army arrests wanted suspect and detains several other groups',body:'Previous reader draft is not current reader evidence.',issues:['Keep independently supported groups and grounds.']}]})),c.sources.map((s,i)=>({...s,id:s.ref,alsoIds:[],similarRefs:[],source:'Army statement',publishedAt:input.windowStart})));
    decisions=Object.fromEntries(c.items.map((_,i)=>[i,{verdict:blocked.has(i)?'fix':'ok',issues:blocked.has(i)?[blocked.get(i)]:[]} ]));
   }else if(system==='engine'){
    const frozen=c.engineSnapshot;if(!frozen)throw Error('ENGINE_SNAPSHOT_REQUIRED');
    engineResult=await generateBriefing({...frozen.input,feed:{...frozen.input.feed,...(plan.verificationOutputPolicy?{verificationOutputPolicy:plan.verificationOutputPolicy}:{}),identityFidelityPolicy:plan.preserveFrozenInput?frozen.input.feed.identityFidelityPolicy:plan.atomicReaderAssertions?'source-bound-claims-v3':'source-bound-claims-v2'}},port,{...frozen.models,verifier:plan.model},{editorSourcePolicy:frozen.editorSourcePolicy,editorAccountingPolicy:frozen.editorAccountingPolicy,editorFailurePolicy:frozen.editorFailurePolicy,...(plan.engineOptions??{}),citationCoverage:frozen.citationCoverage,noveltyGuard:frozen.noveltyGuard,noveltyPolicy:frozen.noveltyPolicy,...(frozen.architecture?{architecture:frozen.architecture}:{}),promptVersion:frozen.promptVersion??1,now:()=>new Date(frozen.input.windowEnd),prepare:{maxArticleChars:Number.MAX_SAFE_INTEGER,minChars:1,nearDuplicate:1.01}});
   }else if(system==='candidate')decisions=Object.fromEntries(await verifySourceBoundClaims(port,meter,{model:plan.model,independentSourceBindings:true,atomicReaderAssertions:plan.atomicReaderAssertions===true,language:c.language,items:c.items,sources:c.sources,prior:c.prior,context:c.context}));
   else{const req=c.original??{model:plan.model,system:VERIFY_SYSTEM,user:JSON.stringify({language:c.language,items:c.items.map((i,index)=>({...i,i:index})),sources:c.sources,prior:c.prior,context:c.context}),maxTokens:3000};
    decisions=await callJson(port,meter,req,raw=>{const rows=(raw as any)?.results;if(!Array.isArray(rows)||rows.length!==c.items.length)throw Error('MISSING_ITEM');const out:Record<number,unknown>={};for(const r of rows){if(!Number.isInteger(r.i)||r.i<0||r.i>=c.items.length||out[r.i]||!['ok','fix','drop','redundant'].includes(r.verdict)||r.issues!==undefined&&(!Array.isArray(r.issues)||r.issues.some((x:unknown)=>typeof x!=='string')))throw Error('INVALID_DECISION');out[r.i]=r}return out});
   }
  }catch(e){error=String(e)}
  while(campaignInFlight.size)await Promise.allSettled([...campaignInFlight]);
  const journalRows=fs.existsSync(journal)?fs.readFileSync(journal,'utf8').trim().split('\n').map(line=>JSON.parse(line)):[],ids=new Set(journalRows.filter(r=>r.state==='RESERVED'&&r.caseId===c.id&&r.system===system).map(r=>r.id)),receipts=journalRows.filter(r=>r.state==='SETTLED'&&ids.has(r.id)),paidUsage={calls:receipts.length,inputTokens:receipts.reduce((n,r)=>n+r.inputTokens,0),outputTokens:receipts.reduce((n,r)=>n+r.outputTokens,0),costUsd:receipts.reduce((n,r)=>n+r.costUsd,0)};
  const row={caseId:c.id,system,decisions,error,engineResult,usage:engineResult?.usage??meter.usage,paidUsage,latencyMs:Date.now()-start};outcomes.push(row);write(path.join(dir,c.id+'.'+system+'.outcome.json'),row);console.log(JSON.stringify({caseId:c.id,system,error,usage:row.usage,paidUsage,status:engineResult?.status,items:engineResult?.items?.length,latencyMs:row.latencyMs}));
  if(unresolved)break campaign;
 }
 write(path.join(dir,'outcomes.json'),outcomes);write(path.join(dir,'totals.json'),{settledUsd:settled,newSettledUsd:settled-(plan.priorSettledUsd??0),outstandingReservedUsd:held,historicalHeldUsd:plan.priorHeldUsd??0,calls,unresolved,ceilingUsd:plan.ceilingUsd});
 console.log(JSON.stringify({settledUsd:settled,outstandingReservedUsd:held,calls,unresolved}));
}else throw Error('Use prepare or run, followed by a new output directory.');
