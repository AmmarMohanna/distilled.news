import {it,expect} from 'vitest';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {database,ingest,exportState} from './rss-canary-test-support';
import {canaryWindows,type freezeRssCorpus} from './rss-canary';
import {inputFingerprint} from './editorial-evaluation';
import {processV1Briefing} from './runtime';
import type {EventMembership} from '@distilled/contracts';
import type {BriefingEditionRecord} from './publication';
const enabled=process.env.DISTILLED_SEMANTIC_FROZEN_REPLAY==='true',suffix=process.env.DISTILLED_SEMANTIC_REPLAY_STAGE==='postfix'?'-postfix':'';
const corpusFile=new URL('../../../../.local-reports/rss-editorial-canary-2026-10-04/corpus.json',import.meta.url);
const output=new URL('../../../../.local-reports/semantic-core/',import.meta.url);
// Engineering replay only: no collection, external fetch, human annotation or
// quality metrics. Explicit no-key semantic policy exercises labeled fallback.
for(const duration of [30,120,360,1440] as const)it.skipIf(!enabled)(`frozen semantic runtime replay ${duration} minutes`,async()=>{
 const original=readFileSync(corpusFile,'utf8'),corpus=JSON.parse(original) as Awaited<ReturnType<typeof freezeRssCorpus>>&{sources:any[]};
 expect(await inputFingerprint(corpus.items)).toBe(corpus.hash);
 const context=await database(`sem${duration}-${Date.now().toString(36)}`,corpus),trace:any[]=[],windows:any[]=[];
 context.env.V1_SEMANTIC_POLICY='SEMANTIC';context.env.V1_SALIENCE_POLICY='DETERMINISTIC';
 let index=0;
 try{
  for(const window of canaryWindows(corpus.start,corpus.end,duration)){
   while(index<corpus.items.length&&Date.parse(corpus.items[index].publishedAt!)<Date.parse(window.end)){
    const item=corpus.items[index];trace.push(await ingest(context,item,index,corpus.sources.find(s=>s.id===item.canarySourceId)));index++;
   }
   const started=performance.now();let edition:BriefingEditionRecord|undefined,failure:string|undefined;
   try{edition=await processV1Briefing(context.env,{type:'v1_briefing',feedId:'feed-canary',window},()=>window.end)}catch(error){failure=error instanceof Error?error.message:'UNKNOWN'}
   const requests=await context.store.list<any>('feed-canary','briefing_requests'),request=requests.find(r=>r.window.start===window.start&&r.window.end===window.end);
   const status=edition?'PUBLISHED':failure?request?.state??'FAILED':'QUIET';
   if(failure)expect(status).not.toBe('QUIET');
   if(edition){
    const members=await context.store.list<EventMembership>('feed-canary','memberships');
    for(const story of edition.stories)for(const claim of story.claims)for(const support of claim.support){
     expect(edition.evidenceRevisionIds).toContain(support.evidenceRevisionId);
     expect(members.some(m=>edition!.eventVersionIds.includes(m.eventVersionId)&&m.evidenceRevisionId===support.evidenceRevisionId)).toBe(true);
     const revision=await context.store.revision('feed-canary',support.evidenceRevisionId);expect((revision?.body??'').includes(support.quote)||revision?.title===support.quote).toBe(true);
    }
    expect((await context.store.read<any>('feed-canary','fidelity_results',edition.selectionId))?.passed).toBe(true);
    expect(await processV1Briefing(context.env,{type:'v1_briefing',feedId:'feed-canary',window},()=>window.end)).toEqual(edition);
   }
   windows.push({window,status,failure,edition,latencyMs:performance.now()-started});
   if(windows.length%10===0)console.info('SEMANTIC_REPLAY_PROGRESS',{duration,windows:windows.length,items:index});
  }
  expect(index).toBe(corpus.items.length);expect(windows.some(w=>w.status==='PUBLISHED')).toBe(true);
  const state=await exportState(context),documents=await context.store.list<any>('feed-canary','source_documents');
  expect(documents).toHaveLength(corpus.items.length);expect(await context.store.list('feed-canary','semantic_intents')).toHaveLength(0);
  const report={purpose:'ENGINEERING_INVARIANTS_ONLY',route:'DETERMINISTIC_FALLBACK_NO_PROVIDER',corpusHash:corpus.hash,durationMinutes:duration,trace,windows,state,complete:true};
  mkdirSync(output,{recursive:true});writeFileSync(new URL(`semantic-replay-${duration}${suffix}.json`,output),JSON.stringify(report,null,2));
  console.info('SEMANTIC_REPLAY',{duration,items:index,windows:windows.length,published:windows.filter(w=>w.status==='PUBLISHED').length,quiet:windows.filter(w=>w.status==='QUIET').length,failed:windows.filter(w=>w.failure).length});
  expect(readFileSync(corpusFile,'utf8')).toBe(original);
 }finally{await context.mf.dispose()}
},600000);
