import {database,ingest,exportState} from './rss-canary-test-support';
import {existsSync,mkdirSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {Miniflare} from 'miniflare';
import {expect,it,vi} from 'vitest';
import {fetchRssCandidates,type ConnectorBatch} from '@distilled/connectors';
import {handoffConnectorBatch,sha256,type CollectionCoverage,type EventVersion,type EventMembership,type EvidenceRevision} from '@distilled/contracts';
import {CANARY_SOURCES,freezeRssCorpus,canaryWindows,mechanicalRepeatMetrics,assertFrozenArm,type CanaryItem} from './rss-canary';
import {canonicalJson} from '../v1-intake/canonical';
import {prepareRssHandoff,rssLanguageHint} from '../v1-intake/rss-handoff';
import {V1IntakeStore} from '../v1-intake/store';
import {createCandidateIntakePort} from '../v1-intake/intake';
import {createV1RuntimePolicy,processV1Acquisition} from '../v1-downstream-runtime';
import {enrollV1Source} from './product';
import {processV1Briefing,processV1Reassessment} from './runtime';
import {V1FeedStore,feedTransact} from './store';
import {independentSupportCount,type SelectionRecord} from './scoring';
import {inputFingerprint,evaluateSalience} from './editorial-evaluation';
import {supportedSentences} from './editorial';
import {DeterministicSalienceScorer,OpenRouterJudgmentClient,JevSalienceScorer,GptSalienceScorer,type SalienceInput,type SalienceResult} from './salience';
import type {Env} from '../types';
import type {BriefingEditionRecord} from './publication';

// Test-only counterfactual substitution. The production module and its contracts
// remain unchanged; every substituted overall score has a frozen sidecar trace.
const arm=vi.hoisted(()=>({name:'DETERMINISTIC',scores:new Map<string,SalienceResult>()}));
vi.mock('./salience',async importOriginal=>{
 const original=await importOriginal<typeof import('./salience')>();
 return {...original,DeterministicSalienceScorer:class extends original.DeterministicSalienceScorer {
  score(input:SalienceInput){const baseline=super.score(input),result=arm.scores.get(input.targetVersionId);return arm.name==='DETERMINISTIC'||input.targetType!=='EVENT'||!result?baseline:{...baseline,components:{...baseline.components,overallScore:result.components.overallScore}}}
 }};
});
const root=new URL('../../../../.local-reports/rss-editorial-canary-2026-10-04/',import.meta.url);
const json=(name:string)=>JSON.parse(readFileSync(new URL(name,root),'utf8'));
function save(name:string,value:unknown){mkdirSync(root,{recursive:true});writeFileSync(new URL(name,root),JSON.stringify(value,null,2))}
const esc=(value:unknown)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
type Corpus=Awaited<ReturnType<typeof freezeRssCorpus>>;
const enabled=process.env.DISTILLED_RSS_EDITORIAL_CANARY==='true';
it('isolates counterfactual Event salience from window features, Storylines and the production baseline',()=>{
 const input:SalienceInput={feedId:'fixture',feedRevision:1,targetType:'EVENT',targetVersionId:'fixture-version',text:'Parliament approved legislation.',version:1,independentSupport:1,persistence:0,recency:.2};
 const scorer=new DeterministicSalienceScorer(),baseline=scorer.score(input);
 try{
  arm.name='GPT';arm.scores.set(input.targetVersionId,{...baseline,components:{...baseline.components,overallScore:.75,recency:1}});
  expect(scorer.score(input).components).toEqual({...baseline.components,overallScore:.75});
  expect(scorer.score({...input,targetType:'STORYLINE'})).toEqual(baseline);
 }finally{arm.name='DETERMINISTIC';arm.scores.clear()}
 expect(scorer.score(input)).toEqual(baseline);
});
async function validatedCorpus(){
 const corpus=json('corpus.json') as Corpus & {sources:any[];limitations:string[]};expect(await inputFingerprint(corpus.items)).toBe(corpus.hash);
 for(const source of corpus.sources)expect(await sha256(readFileSync(new URL(source.rawFile,root),'utf8'))).toBe(source.rawHash);
 return corpus;
}

async function capture(){
 if(existsSync(new URL('corpus.json',root)))throw Error('FROZEN_CORPUS_ALREADY_EXISTS_DO_NOT_REFETCH');
 const observedAt=new Date().toISOString(),all:CanaryItem[]=[],sources=[];
 const {WorkerPublicSourceFetch}=await import('../public-source-fetch');
 for(const source of CANARY_SOURCES){
  const start=performance.now();let raw='';
  const batch=await fetchRssCandidates({url:source.url,resourceId:source.id,checkpoint:{version:'0'},maxItems:1000},{get:async()=>{
   const response=await new WorkerPublicSourceFetch(source.url).get(source.url);raw=response.body;return {status:response.status,body:raw,headers:{}};
  }});
  writeFileSync(new URL(`${source.id}.xml`,root),raw);
  const filtered=await freezeRssCorpus(batch.observations.map(item=>({...item,canarySourceId:source.id})),observedAt,12);
  all.push(...filtered.items);sources.push({...source,language:rssLanguageHint(raw),rawHash:await sha256(raw),rawFile:`${source.id}.xml`,telemetry:batch.telemetry,coverage:batch.coverage,retry:batch.retry,availableItems:batch.observations.length,retainedItems:filtered.items.length,excluded:filtered.excluded,elapsedMs:performance.now()-start});
 }
 const corpus=await freezeRssCorpus(all,observedAt,40);expect(corpus.items.length).toBeGreaterThan(0);
 save('corpus.json',{...corpus,observedAt,sources,collectionPolicy:'ONE_BOUNDED_SNAPSHOT_PER_APPROVED_SOURCE_MAX_12_PER_SOURCE',limitations:['Finite RSS snapshots do not prove complete 24h coverage.','Publication time is a simulated arrival proxy.','RSS excerpts are not full articles.']});
 console.info('CANARY_CAPTURE',{items:corpus.items.length,hash:corpus.hash,sources:sources.map(s=>({id:s.id,items:s.retainedItems,retry:s.retry,coverage:s.coverage}))});
}

async function canonical(){
 const corpus=await validatedCorpus();
 if(existsSync(new URL('events.frozen.json',root)))throw Error('FROZEN_EVENTS_ALREADY_EXIST');
 const context=await database('canonical',corpus),trace=[];
 try{
  for(let i=0;i<corpus.items.length;i++)trace.push(await ingest(context,corpus.items[i],i,corpus.sources.find(s=>s.id===corpus.items[i].canarySourceId)));
  const versions=await context.store.list<EventVersion>('feed-canary','event_versions'),memberships=await context.store.list<EventMembership>('feed-canary','memberships');
  const inputs:SalienceInput[]=[];
  for(const version of versions.sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id))){
   const revisions=(await Promise.all(memberships.filter(m=>m.eventVersionId===version.id).map(m=>context.store.revision('feed-canary',m.evidenceRevisionId)))).filter((r):r is EvidenceRevision=>Boolean(r));
   const independent=await feedTransact(context.store,'feed-canary',tx=>independentSupportCount(tx,revisions));
   inputs.push({feedId:'feed-canary',feedRevision:(await context.store.getFeed('feed-canary'))!.revision,targetType:'EVENT',targetVersionId:version.id,text:`${version.title??''}\n${version.state}`.slice(0,6000),version:version.version,independentSupport:independent,persistence:0,recency:1});
  }
  expect(inputs.length).toBeLessThanOrEqual(40);
  save('events.frozen.json',{corpusHash:corpus.hash,datasetHash:await inputFingerprint(inputs),inputs,recencyPolicy:'FIXED_ONE_TO_ISOLATE_SALIENCE_WINDOW_RECENCY_REMAINS_CURRENT_PIPELINE'});
  save('canonical-provenance.json',{corpusHash:corpus.hash,trace,state:await exportState(context)});
  save('event-annotations.template.json',{status:'UNLABELED_TEMPLATE_NOT_GOLD',datasetHash:await inputFingerprint(inputs),annotatorId:null,createdAt:null,labelPolicyVersion:'human-salience-v1',events:inputs.map(i=>({targetVersionId:i.targetVersionId,importance:null,important:null,noise:null,notes:''}))});
  console.info('CANARY_FROZEN_EVENTS',{items:corpus.items.length,versions:inputs.length,hash:await inputFingerprint(inputs)});
 }finally{await context.mf.dispose()}
}
async function score(){
 await validatedCorpus();
 const frozen=json('events.frozen.json') as {datasetHash:string;inputs:SalienceInput[]};expect(await inputFingerprint(frozen.inputs)).toBe(frozen.datasetHash);
 if(!process.env.OPENROUTER_API_KEY)throw Error('CANARY_REQUIRES_LOCAL_KEY');
 const path=new URL('scorer-arms.json',root),report=existsSync(path)?json('scorer-arms.json'):{datasetHash:frozen.datasetHash,quality:'PENDING_HUMAN_LABELS',maximumCalls:80,maximumReservedCostUsd:1.6,arms:{}};
 expect(report.datasetHash).toBe(frozen.datasetHash);
 arm.name='DETERMINISTIC';arm.scores.clear();
 if(!report.arms.DETERMINISTIC)report.arms.DETERMINISTIC=await evaluateSalience(frozen.inputs,new DeterministicSalienceScorer(),Math.min(5,frozen.inputs.length));
 for(const kind of ['JEV','GPT'] as const){
  const rows:any[]=report.arms[kind]?.rows??[];let blocked=report.arms[kind]?.blocked;
  for(const input of frozen.inputs){if(rows.some(r=>r.targetVersionId===input.targetVersionId))continue;if(blocked)break;
   const currentRows=Object.values(report.arms).flatMap((a:any)=>a.rows??[]).filter((r:any)=>r.usage.calls>0);
   if(currentRows.reduce((n:number,r:any)=>n+r.usage.calls,0)>=80||currentRows.reduce((n:number,r:any)=>n+r.usage.costUsd,0)+.02>1.6){blocked='GLOBAL_BUDGET_LIMIT';break}
   const client=new OpenRouterJudgmentClient({kind,apiKey:process.env.OPENROUTER_API_KEY,model:kind==='JEV'?'typesafe/jev-1.13':'openai/gpt-4.1-mini',maxCalls:1,maxCostUsd:.02,maxCallCostUsd:.02,timeoutMs:10000});
   // Persist an intent before a paid request. An interrupted/lost outcome must
   // never be silently reissued when this phase is resumed.
   report.pending={kind,targetVersionId:input.targetVersionId,reservedCostUsd:.02};save('scorer-arms.json',report);
   const start=performance.now(),result=await (kind==='JEV'?new JevSalienceScorer(client):new GptSalienceScorer(client)).score(structuredClone(input));
   rows.push({targetVersionId:input.targetVersionId,score:result.components.overallScore,latencyMs:performance.now()-start,...result});
   if(!result.usage.reported||result.usage.costUsd>.02)blocked=result.fallback??'UNKNOWN_OR_OVERRUN_OUTCOME_STOP_ARM';
   report.arms[kind]={rows,blocked,nativeModelQualityEligible:rows.every(r=>!r.fallback),ranking:[...rows].sort((a,b)=>b.score-a.score||a.targetVersionId.localeCompare(b.targetVersionId)).map(r=>r.targetVersionId)};
   delete report.pending;save('scorer-arms.json',report);
  }
 }
 save('scorer-arms.json',report);console.info('CANARY_PAID_ARMS',Object.fromEntries(Object.entries(report.arms).map(([k,a]:[string,any])=>[k,{rows:a.rows.length,fallbacks:a.rows.filter((r:any)=>r.fallback).length,calls:a.rows.reduce((n:number,r:any)=>n+r.usage.calls,0),cost:a.rows.reduce((n:number,r:any)=>n+r.usage.costUsd,0),blocked:a.blocked}])));
}

async function replay(kind:string,duration:30|120|360|1440){
 const label=`${kind}-${duration}`,file=`replay-${label}-v2.json`;
 const corpus=await validatedCorpus(),frozen=json('events.frozen.json'),scorers=existsSync(new URL('scorer-arms.json',root))?json('scorer-arms.json'):undefined;
 expect(await inputFingerprint(corpus.items)).toBe(corpus.hash);expect(await inputFingerprint(frozen.inputs)).toBe(frozen.datasetHash);
 if(kind!=='DETERMINISTIC'&&(!scorers?.arms[kind]||scorers.arms[kind].rows.length!==frozen.inputs.length))throw Error('INCOMPLETE_ARM_CANNOT_REPLAY_AS_NATIVE');
 if(kind!=='DETERMINISTIC')assertFrozenArm(frozen.datasetHash,frozen.inputs.map((i:SalienceInput)=>i.targetVersionId),scorers.datasetHash,scorers.arms[kind].rows.map((row:any)=>row.targetVersionId));
 if(existsSync(new URL(file,root))){const prior=json(file);if(prior.corpusHash!==corpus.hash||prior.datasetHash!==frozen.datasetHash||prior.arm!==kind||prior.durationMinutes!==duration)throw Error('REPLAY_INPUT_MISMATCH');if(prior.complete)return;throw Error('PARTIAL_REPLAY_REQUIRES_NEW_STORAGE_LABEL_NOT_SILENT_SKIP')}
 arm.name=kind;arm.scores=new Map((scorers?.arms[kind]?.rows??[]).map((row:any)=>[row.targetVersionId,row]));
 const context=await database(label,corpus),windows:any[]=[],trace:any[]=[];let position=0;
 const begin=performance.now();
 try{
  for(const window of canaryWindows(corpus.start,corpus.end,duration)){
   while(position<corpus.items.length&&Date.parse(corpus.items[position].publishedAt!)<Date.parse(window.end)){
    trace.push(await ingest(context,corpus.items[position],position,corpus.sources.find(s=>s.id===corpus.items[position].canarySourceId)));position++;
   }
   const before=performance.now();let edition:BriefingEditionRecord|undefined,failure:string|undefined;
   try{edition=await processV1Briefing(context.env,{type:'v1_briefing',feedId:'feed-canary',window},()=>window.end)}catch(error){failure=error instanceof Error?error.message:'UNKNOWN'}
   const selections=(await context.store.list<SelectionRecord>('feed-canary','selections')).filter(s=>s.window.start===window.start&&s.window.end===window.end);
   const selection=selections[0],candidates=await context.store.list<any>('feed-canary','candidates');
   // A failure is not a quiet editorial choice. No provider/extraction retry.
   const offered=candidates.filter(c=>selection?.candidateIds.includes(c.id));
   windows.push({window,status:failure?'FAILED':edition?'PUBLISHED':'QUIET',failure,latencyMs:performance.now()-before,selection,candidates:offered,experimentalSalienceByCandidate:kind==='DETERMINISTIC'?undefined:Object.fromEntries(offered.map(c=>[c.id,c.targetType==='STORYLINE'?{status:'UNCHANGED_DETERMINISTIC_STORYLINE_SALIENCE'}:{inputHash:frozen.datasetHash,result:arm.scores.get(c.targetVersionId)}])),edition});
   save(file,{arm:kind,durationMinutes:duration,corpusHash:corpus.hash,datasetHash:frozen.datasetHash,complete:false,windows});
  }
  const versions=await context.store.list<EventVersion>('feed-canary','event_versions');
  expect(versions.map(v=>v.id).sort()).toEqual(frozen.inputs.map((i:SalienceInput)=>i.targetVersionId).sort());
  const canonicalVersions=json('canonical-provenance.json').state.v1_feed_documents.filter((d:any)=>d.kind==='event_versions').map((d:any)=>JSON.parse(d.json));
  expect(await inputFingerprint([...versions].sort((a,b)=>a.id.localeCompare(b.id)))).toBe(await inputFingerprint(canonicalVersions.sort((a:any,b:any)=>a.id.localeCompare(b.id))));
  const editions=windows.filter(w=>w.edition).map(w=>w.edition as BriefingEditionRecord);
  const grounding=[];
  for(const edition of editions)for(const story of edition.stories)for(const claim of story.claims){
   const checks=await Promise.all(claim.support.map(async support=>{const revision=await context.store.revision('feed-canary',support.evidenceRevisionId);return {evidenceRevisionId:support.evidenceRevisionId,exists:Boolean(revision),quoteContained:Boolean(revision?.body?.includes(support.quote)),claimEqualsQuote:claim.text===support.quote}}));
   grounding.push({claimId:claim.id,checks});expect(checks.every(c=>c.exists&&c.quoteContained)).toBe(true);
  }
  save(file,{arm:kind,durationMinutes:duration,corpusHash:corpus.hash,datasetHash:frozen.datasetHash,complete:true,windows,trace,state:await exportState(context),grounding,repeat:mechanicalRepeatMetrics(editions.map(e=>e.stories.flatMap(s=>s.claims.map(c=>c.text)))),wallClockMs:performance.now()-begin,scoringSubstitution:kind==='DETERMINISTIC'?'NONE':'TEST_ONLY_FROZEN_EVENT_OVERALL_SALIENCE_SCORE; STORYLINE_SALIENCE_REMAINS_DETERMINISTIC',synthesis:'CURRENT_DETERMINISTIC_EXTRACTIVE_EDITORIAL',modelCalls:0,reportedCostUsd:0});
  console.info('CANARY_REPLAY',{arm:kind,duration,windows:windows.length,published:editions.length,quiet:windows.filter(w=>w.status==='QUIET').length,failed:windows.filter(w=>w.status==='FAILED').length});
 }finally{arm.name='DETERMINISTIC';arm.scores.clear();await context.mf.dispose()}
}
async function review(){
 const corpus=await validatedCorpus(),frozen=json('events.frozen.json'),scorers=existsSync(new URL('scorer-arms.json',root))?json('scorer-arms.json'):undefined;
 const replays=readdirSync(root).filter(n=>/^replay-.*-v2\.json$/.test(n)).map(n=>json(n));
 if(scorers)for(const value of Object.values(scorers.arms) as any[])assertFrozenArm(frozen.datasetHash,frozen.inputs.map((i:SalienceInput)=>i.targetVersionId),scorers.datasetHash,value.rows.map((r:any)=>r.targetVersionId));
 for(const replay of replays)if(replay.corpusHash!==corpus.hash||replay.datasetHash!==frozen.datasetHash)throw Error('REPORT_REPLAY_INPUT_MISMATCH');
 const rows:any[]=scorers?Object.values(scorers.arms).flatMap((a:any)=>a.rows):[];
 const differences=replays.filter(r=>r.arm!=='DETERMINISTIC').map(replay=>{
  const base=replays.find(r=>r.arm==='DETERMINISTIC'&&r.durationMinutes===replay.durationMinutes);
  return {arm:replay.arm,durationMinutes:replay.durationMinutes,comparedWith:'DETERMINISTIC',windows:replay.windows.map((w:any)=>{
   const b=base?.windows.find((bw:any)=>bw.window.end===w.window.end),ordered=(row:any)=>(row?.selection?.selectedCandidateIds??[]).map((id:string)=>row.candidates.find((c:any)=>c.id===id)?.targetVersionId),targets=(row:any)=>[...ordered(row)].sort();
   if(!base?.complete||!replay.complete||!b)return {windowEnd:w.window.end,comparisonStatus:'PENDING_MATCHING_COMPLETE_REPLAYS',selectionChanged:null,orderChanged:null};
   return {windowEnd:w.window.end,baselineSelected:ordered(b),armSelected:ordered(w),selectionChanged:JSON.stringify(targets(b))!==JSON.stringify(targets(w)),orderChanged:JSON.stringify(ordered(b))!==JSON.stringify(ordered(w)),baselineStatus:b?.status,armStatus:w.status};
  })};
 });
 save('scorer-selection-differences.json',differences);
 const efficiency=scorers?Object.fromEntries(Object.entries(scorers.arms).map(([name,a]:[string,any])=>{const latency=a.rows.map((r:any)=>r.latencyMs).sort((a:number,b:number)=>a-b);return [name,{calls:a.rows.reduce((n:number,r:any)=>n+r.usage.calls,0),reportedCostUsd:a.rows.every((r:any)=>r.usage.reported)?a.rows.reduce((n:number,r:any)=>n+r.usage.costUsd,0):null,totalLatencyMs:latency.reduce((n:number,v:number)=>n+v,0),p95LatencyMs:latency[Math.ceil(latency.length*.95)-1],fallbacks:a.rows.filter((r:any)=>r.fallback).length,nativeModelQualityEligible:a.rows.every((r:any)=>!r.fallback),tokensIn:a.rows.every((r:any)=>r.usage.tokensIn!==undefined)?a.rows.reduce((n:number,r:any)=>n+r.usage.tokensIn,0):null,tokensOut:a.rows.every((r:any)=>r.usage.tokensOut!==undefined)?a.rows.reduce((n:number,r:any)=>n+r.usage.tokensOut,0):null}]})):{};
 const summary={corpusHash:corpus.hash,datasetHash:frozen.datasetHash,sources:corpus.sources.map((s:any)=>({id:s.id,items:s.retainedItems,language:s.language??'UNKNOWN',coverage:s.coverage})),sourceItems:corpus.items.length,eventVersions:frozen.inputs.length,modelCalls:rows.reduce((n,r)=>n+r.usage.calls,0),reportedCostUsd:rows.every(r=>r.usage.reported)?rows.reduce((n,r)=>n+r.usage.costUsd,0):null,reservedOrReportedCostUsd:rows.reduce((n,r)=>n+r.usage.costUsd,0),quality:'PENDING_HUMAN_LABELS',efficiency,scorerSelectionDifferences:differences.map(d=>({arm:d.arm,durationMinutes:d.durationMinutes,changedWindows:d.windows.filter((w:any)=>w.selectionChanged).length})),replays:replays.map(r=>({arm:r.arm,durationMinutes:r.durationMinutes,complete:r.complete,windows:r.windows.length,published:r.windows.filter((w:any)=>w.status==='PUBLISHED').length,quiet:r.windows.filter((w:any)=>w.status==='QUIET').length,failed:r.windows.filter((w:any)=>w.status==='FAILED').length,repeat:r.repeat,wallClockMs:r.wallClockMs})),limitations:[...corpus.limitations,'Experimental Event scores only; 24h Storyline salience stays deterministic.','Deterministic synthesis is fixed across all arms; no live GPT prose comparison.','Unknown DW language is preserved; synthesis failures are not quiet decisions.','Canonical UTC window padding is outside the captured 24h corpus.','Original enrollment, Windows path and invalid-window harness attempts are retained separately.']};
 save('summary.json',summary);
 const canonical=json('canonical-provenance.json'),docs=canonical.state.v1_feed_documents.map((d:any)=>({kind:d.kind,value:JSON.parse(d.json)}));
 let html='<!doctype html><meta charset="utf-8"><title>Real RSS editorial canary</title><style>body{font:16px system-ui;max-width:1150px;margin:35px auto;padding:20px}table{border-collapse:collapse;width:100%}td,th{padding:8px;border:1px solid #ccc;text-align:left;vertical-align:top}pre{white-space:pre-wrap;overflow-wrap:anywhere}summary{cursor:pointer;padding:12px}details{border:1px solid #ddd;margin:12px 0}a{color:#1654a8}</style><h1>Real RSS editorial canary</h1><p>Local simulation. RSS excerpts; partial historical coverage; publication-time arrival proxy. Human labels pending. No Recall@K, NDCG or human unnecessary-repeat claim.</p>';
 html+=`<h2>Run summary</h2><pre>${esc(JSON.stringify(summary,null,2))}</pre><h2>Source items for annotation</h2><table><tr><th>Source / time</th><th>Source item / evidence excerpt</th></tr>`;
 for(const item of corpus.items)html+=`<tr><td>${esc(item.canarySourceId)}<br>${esc(item.publishedAt)}</td><td><a href="${esc(item.url)}">${esc(item.title)}</a><p>${esc(item.text)}</p><small>${esc(item.upstreamId)}</small></td></tr>`;
 html+='</table><h2>Frozen Event and Storyline versions</h2>';
 for(const doc of docs.filter((d:any)=>['event_versions','storyline_versions','duplicates','roles'].includes(d.kind)))html+=`<details><summary>${esc(doc.kind)} — ${esc(doc.value.title??doc.value.currentState??doc.value.id)}</summary><pre>${esc(JSON.stringify(doc.value,null,2))}</pre></details>`;
 const blind='<meta charset="utf-8"><h1>Blind corpus and Event annotation</h1><p>Unlabeled real RSS evidence. No scorer results or briefing choices. Use the frozen input hash in event-annotations.template.json. Importance: 0 negligible, 1 limited, 2 significant, 3 exceptional. Important means omission materially hurts understanding; noise means no useful development. Preserve attribution and uncertainty; source excerpt limitations apply.</p>'+corpus.items.map(item=>`<h2>${esc(item.canarySourceId)} — ${esc(item.publishedAt)}</h2><p><a href="${esc(item.url)}">${esc(item.title)}</a></p><p>${esc(item.text)}</p>`).join('')+docs.filter((d:any)=>['event_versions','storyline_versions','memberships'].includes(d.kind)).map((d:any)=>`<details><summary>${esc(d.kind)} ${esc(d.value.id)}</summary><pre>${esc(JSON.stringify(d.value,null,2))}</pre></details>`).join('');
 writeFileSync(new URL('annotation-blind.html',root),blind);
 html+='<h2>Scorer differences — identical frozen input hash</h2><table><tr><th>Frozen Event version</th><th>Deterministic</th><th>JEV</th><th>GPT</th></tr>';
 for(const input of frozen.inputs){html+=`<tr><td>${esc(input.targetVersionId)}<p>${esc(input.text)}</p></td>`;for(const name of ['DETERMINISTIC','JEV','GPT']){const result=scorers?.arms[name]?.rows.find((r:any)=>r.targetVersionId===input.targetVersionId);html+=`<td>${esc(result?.score??'NOT RUN')}<p>${esc(result?.fallback??result?.provenance?.scorer??'')}</p></td>`}html+='</tr>'}
 html+=`</table><details><summary>Full scoring provenance and selection differences</summary><pre>${esc(JSON.stringify({scorers,differences},null,2))}</pre></details><h2>Chronological briefing windows</h2>`;
 const labels=[];
 for(const replay of replays){html+=`<h3>${esc(replay.arm)} / ${replay.durationMinutes} minutes</h3><details><summary>Grounding checks and mechanical repetition</summary><pre>${esc(JSON.stringify({grounding:replay.grounding,repeat:replay.repeat},null,2))}</pre></details>`;
  for(const row of replay.windows){html+=`<details><summary>${esc(row.window.start)} → ${esc(row.window.end)} — ${esc(row.status)} — ${row.edition?.stories.length??0} stories</summary>`;
   if(row.edition)for(const story of row.edition.stories)html+=`<p>${story.claims.map((c:any)=>esc(c.text)).join(' ')}</p>`;
   const revisions=(replay.state?.v1_revisions??[]).map((r:any)=>JSON.parse(r.json));
   const selectedEvidenceIds=row.selection?.selectedCandidateIds.flatMap((id:string)=>row.selection.evidenceByCandidate[id]??[])??[];
   const selectedEvidence=revisions.filter((r:any)=>selectedEvidenceIds.includes(r.id)).map((r:any)=>({id:r.id,language:r.language??'UNKNOWN',bodyCharacters:r.body?.length,representation:r.representation}));
   html+=`<p>Included and suppressed candidates, budget omissions, treatment and previous-edition deltas:</p><pre>${esc(JSON.stringify({failure:row.failure,latencyMs:row.latencyMs,selectedEvidence,candidates:row.candidates,selection:row.selection,experimentalSalienceByCandidate:row.experimentalSalienceByCandidate,edition:row.edition},null,2))}</pre></details>`;
   if(row.edition){
    // Offer facts behind omitted candidates too: restricting annotations to
    // published support would hide information lost during selection.
    const documents=(replay.state?.v1_feed_documents??[]).map((d:any)=>({kind:d.kind,value:JSON.parse(d.json)}));
    const candidateEventVersions=new Set(row.candidates.flatMap((c:any)=>c.targetType==='EVENT'?[c.targetVersionId]:(documents.find((d:any)=>d.kind==='storyline_versions'&&d.value.id===c.targetVersionId)?.value.eventVersionIds??[])));
    const offeredRevisionIds=new Set(documents.filter((d:any)=>d.kind==='memberships'&&candidateEventVersions.has(d.value.eventVersionId)).map((d:any)=>d.value.evidenceRevisionId));
    const revisions=(replay.state?.v1_revisions??[]).map((r:any)=>JSON.parse(r.json)).filter((r:any)=>offeredRevisionIds.has(r.id));
    const offeredFacts=revisions.flatMap((r:any)=>supportedSentences(r.body??'').map((text,index)=>({id:`${r.id}:fact:${index}`,evidenceRevisionId:r.id,text})));
    const snapshot={editionId:row.edition.id,claims:row.edition.stories.flatMap((s:any)=>s.claims.map((c:any)=>({id:c.id,text:c.text}))),sourceFactIds:offeredFacts.map((f:any)=>f.id),candidateEventIds:row.candidates.map((c:any)=>c.targetVersionId),selectedEventIds:row.candidates.filter((c:any)=>c.selectionState==='SELECTED').map((c:any)=>c.targetVersionId)};
    labels.push({arm:replay.arm,durationMinutes:replay.durationMinutes,editionId:row.edition.id,outputHash:await inputFingerprint(snapshot),snapshot,offeredFacts,claims:snapshot.claims.map((c:any)=>({...c,supported:null,unnecessaryRepeat:null,redundant:null,correctDelta:null})),requiredFacts:[],noiseEventIds:[],storylineCoherence:null,humanUsefulness:null});
   }
  }
 }
 html+='<h2>Annotation protocol</h2><p>Use event-annotations.template.json and edition-annotations.template.json. Null values are intentionally unlabeled. Record annotator identity, UTC timestamp and rubric version; blind importance labeling should use the corpus and canonical provenance without scorer outputs. Frozen inputs and exact edition claims must not be edited. Mechanical exact recurrence is not a human unnecessary-repeat judgment. Full artifacts and persistent local D1/R2 are retained beside this report.</p>';
 writeFileSync(new URL('review.html',root),html);save('edition-annotations.template.json',{status:'UNLABELED_TEMPLATE_NOT_GOLD',corpusHash:corpus.hash,annotatorId:null,createdAt:null,editions:labels});
 console.info('CANARY_SUMMARY',JSON.stringify(summary));
}
async function verifyArtifacts(){
 const corpus=await validatedCorpus(),frozen=json('events.frozen.json'),scorers=json('scorer-arms.json');
 expect(await inputFingerprint(frozen.inputs)).toBe(frozen.datasetHash);expect(frozen.corpusHash).toBe(corpus.hash);expect(scorers.pending).toBeUndefined();
 for(const kind of ['DETERMINISTIC','JEV','GPT'])assertFrozenArm(frozen.datasetHash,frozen.inputs.map((i:SalienceInput)=>i.targetVersionId),scorers.datasetHash,scorers.arms[kind].rows.map((r:any)=>r.targetVersionId));
 const canonicalState=json('canonical-provenance.json').state;
 const kinds=['roles','duplicates','events','event_versions','memberships','storylines','storyline_versions','intelligence_receipts'];
 const intelligence=(state:any)=>state.v1_feed_documents.filter((d:any)=>kinds.includes(d.kind)).map((d:any)=>({kind:d.kind,value:JSON.parse(d.json)})).sort((a:any,b:any)=>`${a.kind}:${a.value.id}`.localeCompare(`${b.kind}:${b.value.id}`));
 const intelligenceHash=await inputFingerprint(intelligence(canonicalState));
 let claims=0,windows=0;
 for(const kind of ['DETERMINISTIC','JEV','GPT'])for(const duration of [30,120,360,1440]){
  const replay=json(`replay-${kind}-${duration}-v2.json`);expect(replay.complete).toBe(true);expect(replay.corpusHash).toBe(corpus.hash);expect(replay.datasetHash).toBe(frozen.datasetHash);
  expect(await inputFingerprint(intelligence(replay.state))).toBe(intelligenceHash);
  const versionDates=new Map(replay.state.v1_feed_documents.filter((d:any)=>['event_versions','storyline_versions'].includes(d.kind)).map((d:any)=>{const version=JSON.parse(d.json);return [version.id,version.createdAt]}));
  expect(replay.trace.map((t:any)=>t.sourceItemKey)).toEqual(corpus.items.map(i=>i.upstreamId));
  for(const window of replay.windows){windows++;for(const candidate of window.candidates)expect(Date.parse(versionDates.get(candidate.targetVersionId) as string)).toBeLessThan(Date.parse(window.window.end))}
  const evidence=new Map(replay.state.v1_revisions.map((row:any)=>{const r=JSON.parse(row.json);return [r.id,r]}));
  for(const row of replay.windows)if(row.edition){
   const allowed=new Set(row.edition.evidenceRevisionIds);for(const story of row.edition.stories)for(const claim of story.claims){claims++;for(const support of claim.support){const revision=evidence.get(support.evidenceRevisionId) as EvidenceRevision;expect(allowed.has(support.evidenceRevisionId)).toBe(true);expect(revision.body!.includes(support.quote)).toBe(true);expect(Date.parse(revision.acceptedAt)).toBeLessThan(Date.parse(row.window.end));expect(claim.text).toBe(support.quote)}}
  }
 }
 const files=readdirSync(root).filter(n=>/\.(?:json|xml|html)$/.test(n)&&n!=='artifact-manifest.json'),hashes:Record<string,string>={};
 for(const file of files)hashes[file]=await sha256(readFileSync(new URL(file,root),'utf8'));
 save('artifact-manifest.json',{corpusHash:corpus.hash,datasetHash:frozen.datasetHash,intelligenceHash,replayCount:12,windows,checkedPublishedClaims:claims,hashes,quality:'PENDING_HUMAN_LABELS'});
 console.info('CANARY_ARTIFACT_VERIFICATION',{replays:12,windows,checkedPublishedClaims:claims,intelligenceHash});
}
it.runIf(enabled)('runs explicitly authorized frozen real RSS editorial canary phases',async()=>{
 mkdirSync(root,{recursive:true});const phase=process.env.DISTILLED_RSS_CANARY_PHASE;
 if(phase==='CAPTURE')await capture();else if(phase==='FREEZE_EVENTS')await canonical();else if(phase==='SCORE'){
  if(existsSync(new URL('scorer-arms.json',root))&&json('scorer-arms.json').pending)throw Error('PENDING_PAID_OUTCOME_REQUIRES_MANUAL_RECONCILIATION');await score();
 }else if(phase==='REPLAY'){
  const kind=process.env.DISTILLED_RSS_CANARY_ARM??'DETERMINISTIC';if(!['DETERMINISTIC','JEV','GPT'].includes(kind))throw Error('INVALID_CANARY_ARM');
  for(const duration of [30,120,360,1440] as const)await replay(kind,duration);await review();
 }else if(phase==='REPORT')await review();else if(phase==='VERIFY')await verifyArtifacts();else throw Error('EXPLICIT_CANARY_PHASE_REQUIRED');
},1200000);
