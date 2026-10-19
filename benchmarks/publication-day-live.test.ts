import {it,expect} from 'vitest';
import {readFileSync,writeFileSync,existsSync,openSync,fsyncSync,closeSync} from 'node:fs';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {evaluationD1} from '../scripts/validation-evaluation-d1.mjs';
import {createStoredEvidenceModel} from '../apps/worker/src/v1-intelligence/model';
import {reserveModelSpending,settleModelSpending} from '../apps/worker/src/v1-intelligence/model-spending';
import {decidePublicationPackets} from '../apps/worker/src/v1-intelligence/publication-validation';
import {withProviderReceiptSink,type ProviderReceipt} from '../apps/worker/src/provider-receipt';
const root='.local-reports/publication-day/v5/',hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
function durable(path:string,value:unknown){writeFileSync(path,JSON.stringify(value,null,2));const fd=openSync(path,'r+');try{fsyncSync(fd);}finally{closeSync(fd);}}
it.skipIf(process.env.PUBLICATION_DAY_PAID_AUTHORITY!=='ONE_BATCH_V5_MAX_0.058222')('executes one specifically authorized batch with raw output and reported accounting, never reissuing an intent',async()=>{
 const manifest=JSON.parse(readFileSync(root+'batch-manifest.json','utf8'));
 expect(manifest.requestHash).toBe('1a590e3c1dfe4ec061935a345bc9bba2cf912672cdd89c834084c48bd5a0aabd');expect(manifest.admission.reservationCostUsd).toBeLessThanOrEqual(.058222);expect(manifest.maxCalls).toBe(1);
 const intentPath=root+'batch-intent.json';if(existsSync(intentPath))throw Error('PRIOR_INTENT_NO_REISSUE');
 const varsPath=process.env.DISTILLED_EVALUATION_VARS_FILE;if(!varsPath)throw Error('EXPLICIT_STAGING_VARS_REQUIRED');
 const vars=readFileSync(varsPath,'utf8'),key=vars.match(/^\s*OPENROUTER_API_KEY\s*=\s*(.*?)\s*$/m)?.[1].trim().replace(/^(['"])(.*)\1$/,'$2');if(!key)throw Error('STAGING_KEY_REQUIRED');
 const token=readFileSync(join(process.env.APPDATA!,'xdg.config/.wrangler/config/default.toml'),'utf8').match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1],db=evaluationD1(token) as unknown as D1Database;
 let calls=0,headersMs:number|undefined,rawCapture:Promise<void>|undefined;const receipts:ProviderReceipt[]=[];
 const model=createStoredEvidenceModel({V1_SYNTHESIS_MODEL_ENABLED:'true',V1_PUBLICATION_VALIDATION_CONTRACT:manifest.contract,DISTILLED_LLM_API_GATEWAY:'openrouter',OPENROUTER_API_KEY:key,DISTILLED_LIVE_OPENROUTER_MODEL:manifest.model} as any,async(url,init)=>{
  expect(String(url)).toBe('https://openrouter.ai/api/v1/chat/completions');expect(++calls).toBe(1);expect(createHash('sha256').update(String(init?.body)).digest('hex')).toBe(manifest.requestHash);const start=performance.now(),response=await fetch(url,init);headersMs=performance.now()-start;
  const copy=response.clone();rawCapture=(async()=>{const reader=copy.body?.getReader();if(!reader)throw Error('RAW_BODY_UNAVAILABLE');const chunks:Uint8Array[]=[];let size=0;try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2000000)throw Error('RAW_OUTPUT_LIMIT');chunks.push(value);}const raw=Buffer.concat(chunks);writeFileSync(root+'batch-raw-provider-response.txt',raw,{flag:'wx'});durable(root+'batch-raw-hash.json',{requestHash:manifest.requestHash,sha256:createHash('sha256').update(raw).digest('hex'),bytes:size});}finally{await reader.cancel().catch(()=>{});}})();rawCapture.catch(()=>{});return response;
 })!;
 expect(model.promptVersion).toBe(manifest.promptVersion);expect(hash(manifest.claims)).toBe(manifest.questionHash);expect(hash(model.verificationPayload!(manifest.claims))).toBe(manifest.wireHash);expect(await model.verificationRequestHash!(manifest.claims,manifest.admission.maxOutputTokens)).toBe(manifest.requestHash);
 const reservation={id:'reader-anchor-eval:'+manifest.requestHash,accountId:'openrouter-distilled-news-staging',model:manifest.model,feedId:'reader-anchor-evaluation:'+manifest.requestHash.slice(0,16),token:randomUUID(),reservedCostUsd:manifest.admission.reservationCostUsd,leaseUntil:Date.now()+240000,createdAt:new Date().toISOString()};
 durable(intentPath,{requestHash:manifest.requestHash,reservation,state:'PREPARED'});await reserveModelSpending(db,reservation);durable(intentPath,{requestHash:manifest.requestHash,reservation,state:'ADMITTED'});
 const started=performance.now();let result:any,errorCode:string|undefined;
 try{result=await withProviderReceiptSink(async receipt=>{receipts.push(receipt);durable(root+'batch-receipts.json',{requestHash:manifest.requestHash,receipts});},()=>model.verify!(manifest.claims,{maxOutputTokens:manifest.admission.maxOutputTokens,signal:AbortSignal.timeout(180000)}));}catch(e){errorCode=e instanceof Error?e.message:'UNKNOWN_FAILURE';}
 const wallMs=performance.now()-started,usage=model.usage!(),receipt=receipts.find(r=>r.stage==='USAGE'&&r.generationId&&r.reportedCostUsd!==undefined),confirmed=Boolean(receipt&&usage.confirmed&&usage.cost===receipt.reportedCostUsd);
 const project=(claims:any[])=>{const ids=new Set(claims.map(c=>c.id)),owners=new Set(claims.map(c=>c.candidateId)),facts=new Set(claims.flatMap(c=>[...(c.requiredFacts??[]),...(c.allowedFacts??[])].map((f:any)=>f.id)));return {...result,supportedClaimIds:result.supportedClaimIds.filter((id:string)=>ids.has(id)),preservedFactIds:result.preservedFactIds.filter((id:string)=>facts.has(id)),novelFactIds:result.novelFactIds.filter((id:string)=>facts.has(id)),semanticChecks:result.semanticChecks.filter((c:any)=>owners.has(c.candidateId)),claimEntailment:result.claimEntailment.filter((c:any)=>ids.has(c.claimId))};};
 const cases=manifest.expected.map((label:any)=>{const claims=manifest.claims.filter((c:any)=>c.id.startsWith(label.id+':'));let decision:any={status:'UNRESOLVED',reasons:[errorCode??'MISSING_VERDICT']};if(result)try{decision=decidePublicationPackets(claims,[{claims,result:project(claims)}]).decision;}catch{decision={status:'UNRESOLVED',reasons:['INCOMPATIBLE_SCOPE']};}return {...label,decision};});
 const row={requestHash:manifest.requestHash,promptVersion:manifest.promptVersion,result,errorCode,wallMs,headersMs,usage,receipts,calls,cases,settled:false,scope:'MIXED_CONTROL_BATCH_NOT_A_PUBLISHED_EDITION',labels:'PRIOR_AI_ASSISTED_NOT_INDEPENDENT_HUMAN'};durable(root+'batch-result.json',row);
 if(confirmed){await settleModelSpending(db,reservation.id,reservation.token,{costUsd:usage.cost,reported:true});row.settled=true;durable(root+'batch-result.json',row);}if(!confirmed)throw Error('UNKNOWN_ACCOUNTING_NO_REISSUE');
 await rawCapture;expect(calls).toBe(1);expect(existsSync(root+'batch-raw-hash.json')).toBe(true);
 console.log(JSON.stringify({requestHash:manifest.requestHash,calls,wallMs,headersMs,actualCostUsd:usage.cost,settled:row.settled,cases:cases.map((c:any)=>({id:c.id,label:c.label,status:c.decision.status,reasons:c.decision.reasons}))}));
},240000);
