import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {sha256,type EventVersion,type EvidenceRevision,type EventMembership} from '@distilled/contracts';
import {database,ingest,exportState} from './rss-canary-test-support';
import {canaryWindows,mechanicalRepeatMetrics} from './rss-canary';
import {inputFingerprint} from './editorial-evaluation';
import {independentSupportCount,type SelectionRecord} from './scoring';
import {feedTransact} from './store';
import {processV1Briefing} from './runtime';
import {OpenRouterJudgmentClient,JevSalienceScorer,GptSalienceScorer,type SalienceInput,type EventSalienceScorer,type SalienceResult} from './salience';
import {cachedSalienceResult} from './salience-cache';
import {SemanticSalienceRouter} from './salience-router';
import type {StorylineVersion} from './types';
const original=new URL('../../../../.local-reports/rss-editorial-canary-2026-10-04/',import.meta.url);
const root=new URL('../../../../.local-reports/editorial-fixes-canary-2026-10-04-v1/',import.meta.url);
const read=(name:string,from=root)=>JSON.parse(readFileSync(new URL(name,from),'utf8'));
function save(name:string,value:unknown){mkdirSync(root,{recursive:true});writeFileSync(new URL(name,root),JSON.stringify(value,null,2))}
async function corpus(){const value=read('corpus.json',original);expect(await inputFingerprint(value.items)).toBe(value.hash);return value}
async function originalManifest(){const manifest=read('artifact-manifest.json',original);for(const [file,hash] of Object.entries(manifest.hashes))expect(await sha256(readFileSync(new URL(file,original),'utf8'))).toBe(hash);return manifest}
async function freezeStorylines(){
 if(existsSync(new URL('storylines.frozen.json',root)))return;
 const c=await corpus(),context=await database('editorial-fixes-freeze-v1',c);
 try{
  for(let i=0;i<c.items.length;i++)await ingest(context,c.items[i],i,c.sources.find((s:any)=>s.id===c.items[i].canarySourceId));
  const events=await context.store.list<EventVersion>('feed-canary','event_versions'),frozen=read('events.frozen.json',original);
  expect(events.map(e=>e.id).sort()).toEqual(frozen.inputs.map((i:SalienceInput)=>i.targetVersionId).sort());
  const memberships=await context.store.list<EventMembership>('feed-canary','memberships'),inputs:SalienceInput[]=[];
  for(const version of await context.store.list<StorylineVersion>('feed-canary','storyline_versions')){
   const ids=[...new Set(memberships.filter(m=>version.eventVersionIds.includes(m.eventVersionId)).map(m=>m.evidenceRevisionId))];
   const evidence=(await Promise.all(ids.map(id=>context.store.revision('feed-canary',id)))).filter((r):r is EvidenceRevision=>Boolean(r));
   inputs.push({feedId:'feed-canary',feedRevision:3,targetType:'STORYLINE',targetVersionId:version.id,text:version.currentState.slice(0,6000),version:version.version,independentSupport:await feedTransact(context.store,'feed-canary',tx=>independentSupportCount(tx,evidence)),persistence:Math.round(Math.min(1,version.eventVersionIds.length/4)*1e6)/1e6,recency:1});
  }
  save('storylines.frozen.json',{corpusHash:c.hash,inputs,datasetHash:await inputFingerprint(inputs),purpose:'STORYLINE_SALIENCE_NOT_STORYLINE_CHANGE_CLASSIFICATION'});
 }finally{await context.mf.dispose()}
}
async function score(){
 const frozen=read('events.frozen.json',original),old=read('scorer-arms.json',original),storylines=read('storylines.frozen.json');
 expect(await inputFingerprint(frozen.inputs)).toBe(frozen.datasetHash);expect(old.datasetHash).toBe(frozen.datasetHash);expect(await inputFingerprint(storylines.inputs)).toBe(storylines.datasetHash);
 const report=existsSync(new URL('routing-v3.json',root))?read('routing-v3.json'):existsSync(new URL('routing-v2.json',root))?{...read('routing-v2.json'),rows:[],complete:false}:existsSync(new URL('routing.json',root))?{...read('routing.json'),rows:[],complete:false}:{eventHash:frozen.datasetHash,storylineHash:storylines.datasetHash,rows:[],calls:[],maxCalls:46,maxReservedCostUsd:.92};
 if(report.pending)throw Error('UNRESOLVED_PAID_INTENT_DO_NOT_REISSUE');
 if(!process.env.OPENROUTER_API_KEY)throw Error('LOCAL_KEY_REQUIRED');
 const paid=async(kind:'JEV'|'GPT',input:SalienceInput)=>{
  const prior=report.calls.find((c:any)=>c.kind===kind&&c.input.targetVersionId===input.targetVersionId);if(prior)return prior.result;
  if(report.calls.length>=46 || report.calls.reduce((n:number,c:any)=>n+c.result.usage.costUsd,0)+.02>.92)throw Error('CANARY_BUDGET_EXHAUSTED');
  report.pending={kind,input,reservedCostUsd:.02};save('routing-v3.json',report);
  const model=kind==='JEV'?'typesafe/jev-1.13':'openai/gpt-4.1-mini',client=new OpenRouterJudgmentClient({kind,model,apiKey:process.env.OPENROUTER_API_KEY!,maxCalls:1,maxCostUsd:.02,maxCallCostUsd:.02,timeoutMs:10000});
  const begin=performance.now(),result=await (kind==='JEV'?new JevSalienceScorer(client):new GptSalienceScorer(client)).score(input);
  report.calls.push({kind,input,result,latencyMs:performance.now()-begin});delete report.pending;save('routing-v3.json',report);
  if(!result.usage.reported)throw Error('UNKNOWN_PAID_OUTCOME_STOP_CANARY');return result;
 };
 for(const input of frozen.inputs as SalienceInput[]){
  if(report.rows.some((r:any)=>r.input.targetVersionId===input.targetVersionId))continue;
  const jev=old.arms.JEV.rows.find((r:any)=>r.targetVersionId===input.targetVersionId),gpt=old.arms.GPT.rows.find((r:any)=>r.targetVersionId===input.targetVersionId);
  const port=(kind:'JEV'|'GPT',result:SalienceResult):EventSalienceScorer=>({model:kind==='JEV'?'typesafe/jev-1.13':'openai/gpt-4.1-mini',score:async()=>cachedSalienceResult(result)});
  const jevResult=jev.fallback?await paid('JEV',input):jev;
  const router=new SemanticSalienceRouter({jev:port('JEV',jevResult),gpt:port('GPT',gpt)});
  report.rows.push({input,result:await router.score(input),jevDiagnostic:jevResult,originalJevReason:jev.fallback??null,reusedNativeJev:!jev.fallback,reusedGpt:true});save('routing-v3.json',report);
 }
 for(const input of storylines.inputs as SalienceInput[]){
  if(report.rows.some((r:any)=>r.input.targetVersionId===input.targetVersionId))continue;
  const result=await paid('GPT',input),router=new SemanticSalienceRouter({gpt:{model:'openai/gpt-4.1-mini',score:()=>cachedSalienceResult(result)}});
  report.rows.push({input,result:await router.score(input),newStorylineJudgment:result});save('routing-v3.json',report);
 }
 report.complete=true;save('routing-v3.json',report);
 console.info('EDITORIAL_FIXES_ROUTING',{events:report.rows.filter((r:any)=>r.input.targetType==='EVENT').reduce((a:any,r:any)=>(a[r.result.route]=(a[r.result.route]??0)+1,a),{}),storylines:report.rows.filter((r:any)=>r.input.targetType==='STORYLINE').reduce((a:any,r:any)=>(a[r.result.route]=(a[r.result.route]??0)+1,a),{}),newCalls:report.calls.length,costUsd:report.calls.reduce((n:number,c:any)=>n+c.result.usage.costUsd,0)});
}
async function replay(duration:30|120|360|1440){
 const name=`replay-${duration}-v2.json`;if(existsSync(new URL(name,root))){if(read(name).complete)return;throw Error('PARTIAL_REPLAY_REQUIRES_NEW_VERSION')}
 const c=await corpus(),routing=read('routing-v3.json');if(!routing.complete)throw Error('INCOMPLETE_ROUTING');
 const router=new SemanticSalienceRouter({jev:{model:'typesafe/jev-1.13',score:()=>{throw Error('CACHE_ONLY_NO_PAID_CALLS')}},gpt:{model:'openai/gpt-4.1-mini',score:()=>{throw Error('CACHE_ONLY_NO_PAID_CALLS')}}});
 const cached:EventSalienceScorer={policyKey:router.policyKey,score:async input=>{
  const row=routing.rows.find((r:any)=>r.input.targetVersionId===input.targetVersionId);if(!row || await inputFingerprint(row.input)!==await inputFingerprint(input))throw Error('CANARY_FROZEN_INPUT_MISMATCH');
  return row.result;
 }};
 const context=await database(`editorial-fixes-${duration}-v2`,c),windows:any[]=[],trace:any[]=[];let position=0;const started=performance.now();
 try{
  for(const window of canaryWindows(c.start,c.end,duration)){
   while(position<c.items.length&&Date.parse(c.items[position].publishedAt)<Date.parse(window.end)){trace.push(await ingest(context,c.items[position],position,c.sources.find((s:any)=>s.id===c.items[position].canarySourceId)));position++}
   let edition,failure;try{edition=await processV1Briefing(context.env,{type:'v1_briefing',feedId:'feed-canary',window},()=>window.end,cached)}catch(error){failure=error instanceof Error?error.message:'UNKNOWN'}
   const selection=(await context.store.list<SelectionRecord>('feed-canary','selections')).find(s=>s.window.start===window.start&&s.window.end===window.end);
   windows.push({window,status:failure?'FAILED':edition?'PUBLISHED':'QUIET',failure,edition,selection});
   save(name,{complete:false,corpusHash:c.hash,windows});
   if(edition)expect((await processV1Briefing(context.env,{type:'v1_briefing',feedId:'feed-canary',window},()=>window.end,cached))?.id).toBe(edition.id);
  }
  const editions=windows.filter(w=>w.edition).map(w=>w.edition),grounding=[];
  for(const edition of editions)for(const story of edition.stories)for(const claim of story.claims)for(const support of claim.support){const revision=await context.store.revision('feed-canary',support.evidenceRevisionId);const valid=Boolean(revision?.body?.includes(support.quote))&&claim.text===support.quote;grounding.push({claimId:claim.id,evidenceRevisionId:support.evidenceRevisionId,valid});expect(valid).toBe(true)}
  save(name,{complete:true,corpusHash:c.hash,durationMinutes:duration,windows,trace,state:await exportState(context),grounding,repeat:mechanicalRepeatMetrics(editions.map(e=>e.stories.flatMap((s:any)=>s.claims.map((cl:any)=>cl.text)))),modelCalls:0,modelCostUsd:0,latencyMs:performance.now()-started,scoring:'PRODUCTION_SEMANTIC_ROUTER_WITH_SIMULATED_ORIGINAL_MODEL_USAGE',usageNote:'Assessment usage is simulated from saved actual judgments for production budget enforcement; actual replay calls/cost are zero.'});
 }finally{await context.mf.dispose()}
}
async function report(){
 const c=await corpus(),routing=read('routing-v3.json'),originalState=read('canonical-provenance.json',original).state;
 const claims=(run:any)=>run.windows.reduce((n:number,w:any)=>n+(w.edition?.stories??[]).reduce((s:number,story:any)=>s+story.claims.length,0),0);
 const stats=(run:any)=>({failed:run.windows.filter((w:any)=>w.status==='FAILED').length,quiet:run.windows.filter((w:any)=>w.status==='QUIET').length,published:run.windows.filter((w:any)=>w.status==='PUBLISHED').length,claims:claims(run),repeat:run.repeat,failures:run.windows.filter((w:any)=>w.failure).map((w:any)=>w.failure),omissions:run.windows.flatMap((w:any)=>w.selection?.omissions??[]).reduce((a:any,o:any)=>(a[o.reason]=(a[o.reason]??0)+1,a),{})});
 const comparisons=[];
 for(const duration of [30,120,360,1440]){
  const corrected=read(`replay-${duration}-v2.json`),old=read(`replay-DETERMINISTIC-${duration}-v2.json`,original);
  expect(corrected.complete).toBe(true);expect(corrected.corpusHash).toBe(c.hash);expect(corrected.grounding.every((g:any)=>g.valid)).toBe(true);
  for(const kind of ['event_versions','storyline_versions','memberships']){
   const documents=(state:any)=>state.v1_feed_documents.filter((d:any)=>d.kind===kind).map((d:any)=>JSON.parse(d.json)).sort((a:any,b:any)=>a.id.localeCompare(b.id));
   expect(await inputFingerprint(documents(corrected.state))).toBe(await inputFingerprint(documents(originalState)));
  }
  comparisons.push({durationMinutes:duration,old:stats(old),corrected:stats(corrected),actualReplayModelCalls:0,actualReplayModelCostUsd:0,groundingChecks:corrected.grounding.length,groundingFailures:0,wallClockMs:corrected.latencyMs});
 }
 const aggregate=(rows:any[])=>({calls:rows.length,costUsd:rows.reduce((n,c)=>n+c.result.usage.costUsd,0),totalLatencyMs:rows.reduce((n,c)=>n+c.latencyMs,0),p95LatencyMs:rows.length?[...rows].map(c=>c.latencyMs).sort((a,b)=>a-b)[Math.ceil(rows.length*.95)-1]:0});
 const diagnostics=routing.rows.filter((r:any)=>r.originalJevReason).map((r:any)=>({targetVersionId:r.input.targetVersionId,title:r.input.text.split('\n')[0],originalReason:r.originalJevReason,recheckedReason:r.jevDiagnostic.fallback,confidence:r.jevDiagnostic.confidence,judgment:r.jevDiagnostic.judgment,cause:'CONFIDENCE_BELOW_UNCHANGED_0_6_THRESHOLD',semanticCause:'NOT_ESTABLISHED_WITHOUT_HUMAN_LABELS'}));
 const summary={corpusHash:c.hash,eventHash:routing.eventHash,storylineHash:routing.storylineHash,comparisons,jevCauses:{confidenceBelowThreshold:16,malformed:0,parseSchema:0,providerFailure:0,semanticSubcause:'UNLABELED_NOT_INFERRED'},diagnostics,eventRoutes:routing.rows.filter((r:any)=>r.input.targetType==='EVENT').reduce((a:any,r:any)=>(a[r.result.route]=(a[r.result.route]??0)+1,a),{}),storylineRoutes:routing.rows.filter((r:any)=>r.input.targetType==='STORYLINE').reduce((a:any,r:any)=>(a[r.result.route]=(a[r.result.route]??0)+1,a),{}),newCalls:aggregate(routing.calls),jevRechecks:aggregate(routing.calls.filter((c:any)=>c.kind==='JEV')),gptStorylines:aggregate(routing.calls.filter((c:any)=>c.kind==='GPT')),humanQuality:'PENDING_HUMAN_LABELS',limitations:['RSS excerpts and finite snapshot coverage remain unchanged.','14 native JEV and existing GPT Event judgments are reused; their old confidence diagnostics were not retained.','Only overall salience is semantic; other assessment components remain explicitly deterministic.','Cached replay enforces production call/cost budgets with simulated original usage; actual replay calls/cost are zero.','Cached replay elapsed time does not simulate provider deadline exhaustion.','No Recall@K/NDCG or scorer-quality superiority claim.','English output with UNKNOWN language copies evidence exactly; no language is invented.','Original and incomplete harness attempts remain preserved.']};
 save('summary-v2.json',summary);
 const esc=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
 const histories=comparisons.map(({durationMinutes}:any)=>{const run=read(`replay-${durationMinutes}-v2.json`);return `<h2>${durationMinutes} minutes</h2>`+run.windows.map((w:any)=>`<details><summary>${esc(w.window.start)} — ${esc(w.status)}</summary><p>${esc(w.failure??'')}</p>${(w.edition?.stories??[]).flatMap((s:any)=>s.claims.map((cl:any)=>`<p>${esc(cl.text)}</p><small>${esc(cl.support.map((e:any)=>e.evidenceRevisionId).join(', '))}</small>`)).join('')}<pre>${esc(JSON.stringify(w.selection?.omissions??[],null,2))}</pre></details>`).join('')}).join('');
 writeFileSync(new URL('review-v2.html',root),`<!doctype html><html><meta charset="utf-8"><title>Distilled editorial fixes canary</title><style>body{font:16px system-ui;max-width:1050px;margin:40px auto;padding:0 24px;color:#17202a}pre{white-space:pre-wrap;background:#f4f6f7;padding:16px}details{border-top:1px solid #ddd;padding:12px}summary{cursor:pointer}</style><h1>Frozen RSS editorial fixes</h1><p>Human editorial quality remains unlabeled. Paid results were saved once; these replays made zero provider calls. Historical files are unchanged.</p><pre>${esc(JSON.stringify(summary,null,2))}</pre>${histories}</html>`);
 const hashes:Record<string,string>={};for(const name of ['storylines.frozen.json','routing-v3.json','summary-v2.json','review-v2.html',...[30,120,360,1440].map(d=>`replay-${d}-v2.json`)])hashes[name]=await sha256(readFileSync(new URL(name,root),'utf8'));
 save('manifest-v2.json',{corpusHash:c.hash,originalManifestUnchanged:true,hashes});
 console.info('EDITORIAL_FIXES_COMPARISON',comparisons.map(({durationMinutes,old,corrected}:any)=>({durationMinutes,old:{failed:old.failed,quiet:old.quiet,published:old.published,claims:old.claims},corrected:{failed:corrected.failed,quiet:corrected.quiet,published:corrected.published,claims:corrected.claims}})));
}
it.runIf(process.env.DISTILLED_EDITORIAL_FIXES_CANARY==='true')('replays the preserved corpus after semantic routing and language fixes',async()=>{
 mkdirSync(root,{recursive:true});await originalManifest();
 const phase=process.env.DISTILLED_EDITORIAL_FIXES_PHASE;
 if(phase==='FREEZE_STORYLINES')await freezeStorylines();else if(phase==='SCORE')await score();else if(phase==='REPLAY')for(const duration of [30,120,360,1440] as const)await replay(duration);else if(phase==='REPORT')await report();else throw Error('EXPLICIT_PHASE_REQUIRED');
 await originalManifest();
},1200000);
