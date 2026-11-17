// Offline aggregation only: never imports a provider or remote database adapter.
import {readFileSync,readdirSync,writeFileSync,existsSync} from 'node:fs';
const root='.local-reports/news-end-to-end/',files=readdirSync(root);
const load=name=>JSON.parse(readFileSync(root+name,'utf8').replace(/^\uFEFF/,''));
const pending=files.filter(n=>n.endsWith('-intent.json')&&!existsSync(root+n.replace('-intent.json','-accounted.json')));
if(pending.length)throw Error('UNSETTLED_EVALUATION_OPERATIONS');
const scopeMap=existsSync(root+'execution-scopes.json')?load('execution-scopes.json').operations:{};
const rows=files.filter(n=>n.endsWith('-accounted.json')).map(load),scope=r=>scopeMap[r.id]??r.executionScope??'PRIMARY_PIPELINE',sum=(values,key)=>values.reduce((n,r)=>n+(r[key]??0),0);
const median=values=>{const sorted=[...values].sort((a,b)=>a-b),middle=Math.floor(sorted.length/2);return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2};
const routes=['openrouter','cloudflare'].map(provider=>{
 const report=load(provider+'-report.json'),paid=rows.filter(r=>r.route===provider&&scope(r)==='PRIMARY_PIPELINE');
 const history=[...files.filter(n=>n.startsWith(provider+'-prior-report-')).map(load),report];
 const documents=load(provider+'-local-state.json').map(d=>({kind:d.kind,...JSON.parse(d.json)}));
 const recoveries=documents.filter(d=>d.kind==='editorial_response_recoveries');
 const operatorAssisted=recoveries.length>0||existsSync(root+provider+'-editorial-recovery.json');
 const baseline=JSON.parse(readFileSync('benchmarks/news-end-to-end-baseline-results.json','utf8')).routes.find(r=>r.provider===provider);
 const corpus=load('corpus.json'),lineage=load(provider+'-source-lineage.json');
 const claims=documents.filter(d=>d.kind==='claim_mentions');
 const invalidSourceSpans=claims.filter(c=>{const owner=lineage.find(l=>l.localRevisionId===c.evidenceRevisionId),source=corpus.find(s=>s.id===owner?.originalRevisionId);return !source||source[c.span.field]?.slice(c.span.start,c.span.end)!==c.sourceText});
 if(invalidSourceSpans.length||claims.length!==89)throw Error('SOURCE_EVIDENCE_INTEGRITY_FAILED');
 const rejected=documents.filter(d=>d.kind==='semantic_results'&&d.validationDiagnostic).map(d=>({phase:d.input?.kind,code:d.validationDiagnostic.rejection.code}));
 const phases=[...new Set(paid.map(r=>r.phase))].map(phase=>{const calls=paid.filter(r=>r.phase===phase);return {phase,calls:calls.length,costUsd:sum(calls,'costUsd'),responseAndValidationMs:sum(calls,'responseAndValidationMs'),billingConfirmationMs:sum(calls,'billingMs')}});
 return {provider,model:'openai/gpt-4.1',editorialVariant:report.editorialVariant??'BASELINE',status:report.status,error:report.error??null,
  operatorAssisted,unattendedSuccess:report.status==='SUCCEEDED'&&report.timeToUsefulBriefingMs!==null&&!operatorAssisted&&baseline?.status==='SUCCEEDED',
  editorialRecoveryIds:recoveries.map(r=>r.id),baselineStatus:baseline?.status,baselineError:baseline?.error,
  sourceIntegrity:{claimMentions:claims.length,exactOwnedSourceSpans:claims.length-invalidSourceSpans.length,sourceArticles:lineage.length},
  usefulBriefing:report.timeToUsefulBriefingMs!==null,timeToUsefulBriefingMs:report.timeToUsefulBriefingMs,
  cumulativeActiveWallMs:report.cumulativeActiveWallMs??report.wallMs,elapsedSinceSnapshotImportMs:report.elapsedSinceSnapshotImportMs,
  calls:paid.length,costUsd:sum(paid,'costUsd'),conservativeReservationsUsd:sum(paid,'reservedUsd'),
  inputTokens:paid.reduce((n,r)=>n+r.usage.tokensIn,0),outputTokens:paid.reduce((n,r)=>n+r.usage.tokensOut,0),
  medianResponseAndValidationMs:median(paid.map(r=>r.responseAndValidationMs)),billingConfirmationMs:sum(paid,'billingMs'),evaluationScopeWaitMs:sum(paid,'scopeWaitMs'),
  database:{reads:history.reduce((n,r)=>n+r.database.reads,0),writes:history.reduce((n,r)=>n+r.database.writes,0)},
  exclusiveTurnHeldMs:sum(history,'exclusiveTurnHeldMs'),casConflicts:sum(history,'casConflicts'),rejected,phases,
  reachedStages:[...new Set(history.flatMap(r=>r.stages.map(s=>s.name.split(':')[0])))],
  qualification:'UNQUALIFIED',qualityReview:'AI_ASSISTED_PRELIMINARY_NOT_INDEPENDENT_HUMAN_GOLD'};
});
const result={mode:'REAL_PAID_LOCAL_SOURCE_TO_BRIEFING_CASE_STUDY',corpusHash:load('manifest.json').corpusHash,
 sourceArticles:3,sourceClaimMentions:89,routes,
 downstreamControls:['openrouter','cloudflare'].filter(p=>existsSync(root+p+'-downstream-control.json')).map(provider=>{const r=load(provider+'-downstream-control.json'),paid=rows.filter(r=>r.route===provider&&scope(r)==='AI_CURATED_DOWNSTREAM_CONTROL');return {scope:r.scope,provider,inputHash:r.inputHash,status:r.status,error:r.error,decision:r.decision?{status:r.decision.status,reasons:r.decision.reasons,readerSpanCount:r.decision.readerSpans?.length??0}:undefined,operatorAssisted:true,unattendedSuccess:false,latestAttemptWallMs:r.wallMs,cumulativeActiveWallMs:r.cumulativeActiveWallMs??r.wallMs,firstAttemptWallMs:r.firstAttemptWallMs??r.wallMs,priorAttempts:r.priorAttempts??[],stages:r.stages,calls:paid.length,costUsd:sum(paid,'costUsd'),responseAndValidationMs:sum(paid,'responseAndValidationMs'),billingConfirmationMs:sum(paid,'billingMs'),evaluationScopeWaitMs:sum(paid,'scopeWaitMs'),timingRecoveryMissing:paid.flatMap(r=>(r.timingRecoveryMissing??[]).map(field=>({operationId:r.id,field})))};}),
 accounting:{calls:rows.length,actualCostUsd:sum(rows,'costUsd'),conservativeReservationsUsd:sum(rows,'reservedUsd'),unsettledNewOperations:pending.length,maxCalls:24,maxReservationsUsd:2.5},
 limitations:['Three saved sources, one cohort per route; no statistical equivalence or production throughput claim.',
 'Article graphs and downstream questions depend on each route; only acquired source evidence and configured model are matched.',
 'Harness recovery and serial billing confirmation are included and reported separately; no latency to a useful briefing exists for failed runs.',
 'Natural compacted schemas admitted direct construction. This run does not qualify real parallel packet reconciliation.',
 'An orchestration test passing means results were captured, not that a briefing passed publication or quality checks.',
 'Full source bodies, provider responses and any local editions remain private local artifacts.']};
const publicJson=JSON.stringify(result);if(['readerSpans','draft','rawResponse','rawProposal'].some(key=>publicJson.includes(JSON.stringify(key)+':')))throw Error('PRIVATE_MODEL_OUTPUT_IN_PUBLIC_REPORT');
writeFileSync('benchmarks/news-end-to-end-results.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
