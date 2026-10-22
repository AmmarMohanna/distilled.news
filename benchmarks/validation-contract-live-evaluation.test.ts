import {it,expect} from 'vitest';
import {readFileSync,writeFileSync,existsSync,mkdirSync,openSync,closeSync,fsyncSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {evaluationD1} from '../scripts/validation-evaluation-d1.mjs';
import {createStoredEvidenceModel} from '../apps/worker/src/v1-intelligence/model';
import {decidePublicationPackets} from '../apps/worker/src/v1-intelligence/publication-validation';
import {reserveModelSpending,settleModelSpending} from '../apps/worker/src/v1-intelligence/model-spending';
import {withProviderReceiptSink} from '../apps/worker/src/provider-receipt';
import type {ProviderReceipt} from '../apps/worker/src/provider-receipt';
const root='.local-reports/briefing-latency/';
const load=(p:string)=>JSON.parse(readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
function durable(path:string,value:unknown){writeFileSync(path,JSON.stringify(value,null,2));const fd=openSync(path,'r+');try{fsyncSync(fd);}finally{closeSync(fd);}}

// Never part of ordinary tests; no fallback, repair, or uncertain-operation retry.
it.skipIf(process.env.DISTILLED_RUN_VALIDATION_EVALUATION!=='AUTHORIZED_STAGING_12_CASES')('evaluates the frozen sample once with actual provider receipts and existing spending gates',async()=>{
 const frozen=load(root+'validation-contract-model-evaluation-packets.json');
 expect(frozen.summary.requestSetHash).toBe('a9bca273f1d753c4f642c0f8f6bf9d6521621e4940dba3af26067f111f456d13');
 expect(hash(frozen.packets.map((p:any)=>({caseId:p.caseId,requestHash:p.requestHash,expected:p.expected})))).toBe(frozen.summary.requestSetHash);
 expect(frozen.packets).toHaveLength(12);
 const varsFile=process.env.DISTILLED_EVALUATION_VARS_FILE;if(!varsFile)throw Error('EXPLICIT_STAGING_VARS_PATH_REQUIRED');
 const vars=readFileSync(varsFile,'utf8'),key=vars.match(/^\s*OPENROUTER_API_KEY\s*=\s*(.*?)\s*$/m)?.[1].trim().replace(/^(['"])(.*)\1$/,'$2');
 if(!key)throw Error('STAGING_OPENROUTER_CREDENTIAL_REQUIRED');
 const config=readFileSync(join(process.env.APPDATA!,'xdg.config/.wrangler/config/default.toml'),'utf8'),token=config.match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];
 const db=evaluationD1(token) as unknown as D1Database;
 const runId=frozen.summary.requestSetHash.slice(0,16),dir=root+'validation-live-'+runId;mkdirSync(dir,{recursive:true});
 const records:any[]=[];
 for(const packet of frozen.packets){
  const intentFile=dir+'/'+packet.caseId+'-intent.json',resultFile=dir+'/'+packet.caseId+'-result.json';
  // A prior intent may have reached the provider. Reuse only fully recorded,
  // settled results; never interpret a local lease/timeout as nonexecution.
  if(existsSync(intentFile)){
   if(!existsSync(resultFile))throw Error('UNKNOWN_PRIOR_EVALUATION_OPERATION:'+packet.caseId);
   const saved=load(resultFile);if(!saved.settled||saved.requestHash!==packet.requestHash)throw Error('UNSETTLED_OR_INCOMPATIBLE_EVALUATION_OPERATION:'+packet.caseId);
   records.push(saved);continue;
  }
  let calls=0,providerLatencyMs:number|undefined;const receipts:ProviderReceipt[]=[];
  const model=createStoredEvidenceModel({V1_SYNTHESIS_MODEL_ENABLED:'true',V1_PUBLICATION_VALIDATION_CONTRACT:'EVIDENCE_GROUNDED_V2',DISTILLED_LLM_API_GATEWAY:'openrouter',OPENROUTER_API_KEY:key,DISTILLED_LIVE_OPENROUTER_MODEL:'openai/gpt-4.1-mini'} as any,async(url,init)=>{
   expect(String(url)).toBe('https://openrouter.ai/api/v1/chat/completions');expect(++calls).toBe(1);
   expect(createHash('sha256').update(String(init?.body)).digest('hex')).toBe(packet.requestHash);
   const started=performance.now();
   try{return await fetch(url,init);}finally{providerLatencyMs=performance.now()-started;}
  })!;
  const wire=model.verificationPayload!(packet.claims),admission=model.admission!(wire);
  expect(hash(wire)).toBe(packet.wireHash);
  expect(admission.fits).toBe(true);
  expect(admission.reservationCostUsd).toBe(packet.admission.reservationCostUsd);
  expect(await model.verificationRequestHash!(packet.claims,admission.maxOutputTokens)).toBe(packet.requestHash);
  const operationId='validation-eval:'+runId+':'+packet.caseId;
  const reservation={id:operationId,accountId:'openrouter-distilled-news-staging',model:model.model,feedId:'validation-evaluation:'+runId,token:randomUUID(),reservedCostUsd:admission.reservationCostUsd,leaseUntil:Date.now()+240000,createdAt:new Date().toISOString()};
  const intent={operationId,requestHash:packet.requestHash,questionHash:packet.questionHash,model:model.model,provider:model.provider,validationContract:model.validationContract,promptVersion:model.promptVersion,reservation,scope:'ISOLATED_CONTROL_EVALUATION_NOT_CANONICAL_FEED_WORK',state:'PREPARED'};
  durable(intentFile,intent);
  // The normal atomic exposure/concurrency guard is the only paid admission.
  await reserveModelSpending(db,reservation);
  durable(intentFile,{...intent,state:'ADMITTED'});
  const started=performance.now();let result:any,errorCode:string|undefined;
  try{
   result=await withProviderReceiptSink(async receipt=>{receipts.push(receipt);durable(dir+'/'+packet.caseId+'-receipts.json',{operationId,requestHash:packet.requestHash,receipts});},()=>model.verify!(packet.claims,{maxOutputTokens:admission.maxOutputTokens,signal:AbortSignal.timeout(180000)}));
  }catch(error){errorCode=error instanceof Error?error.message:'EVALUATION_UNKNOWN_ERROR';}
  const verificationWallMs=performance.now()-started,usage=model.usage!();
  const receipt=receipts.find(r=>r.stage==='USAGE'&&r.generationId&&r.reportedCostUsd!==undefined);
  const confirmed=Boolean(receipt&&usage.confirmed&&usage.cost===receipt.reportedCostUsd);
  let decision:any={status:'UNRESOLVED',reasons:[errorCode??'MODEL_VERDICT_UNAVAILABLE']};
  if(result){try{decision=decidePublicationPackets(packet.claims,[{claims:packet.claims,result}]).decision;}catch{decision={status:'UNRESOLVED',reasons:['INVALID_OR_INCOMPLETE_VERDICT']};}}
  const row={caseId:packet.caseId,expected:packet.expected,operationId,requestHash:packet.requestHash,decision,usage,providerCalls:calls,providerHeadersMs:providerLatencyMs,verificationWallMs,receipts,errorCode,settled:false,result};
  // Save response/receipt first. A settlement failure retains the hold and stops
  // this run; rerunning the test cannot buy the uncertain operation again.
  durable(resultFile,row);
  if(confirmed){await settleModelSpending(db,reservation.id,reservation.token,{costUsd:usage.cost,reported:true});row.settled=true;durable(resultFile,row);}
  records.push(row);durable(dir+'/results.json',{provenance:'AI_ASSISTED',independentHumanGold:0,applicationCommit:'c389419',requestSetHash:frozen.summary.requestSetHash,records});
  console.log(JSON.stringify({caseId:row.caseId,expected:row.expected,decision:decision.status,reasons:decision.reasons,costUsd:confirmed?usage.cost:null,verificationWallMs,settled:row.settled,providerCalls:calls}));
  if(!confirmed)throw Error('UNKNOWN_PROVIDER_ACCOUNTING_NO_FURTHER_CALLS:'+packet.caseId);
 }
 expect(records).toHaveLength(12);
},2400000);
