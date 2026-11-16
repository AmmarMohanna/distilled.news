/** Offline contract runner: no credentials/provider transport/production data. */
import {createHash} from 'node:crypto';
import {firstClockBriefingAt,livePublicationWindow} from '../../../apps/worker/src/v1-intelligence/schedule';
import {publishHistory} from '../replay';import {withinWordBudget} from '../../../packages/briefing/src/word-budget';
import {BriefingModelError,type Article,type BriefingInput,type BriefingResult,type PriorItem} from '../../../packages/briefing/src/types';
export type System='v4'|'strong'|'simple';
export interface Profile{id:string;interest:string;language:'en'|'ar'|'fr'}
export interface ObservedArticle extends Article{availableAt:string}
export interface Fault{tick:number;phase:'before-generation'|'after-generation'|'after-publication';delayMs:number}
export interface Sequence{id:string;start:string;ticks:number;profiles:Profile[];articles:ObservedArticle[];facts:unknown[];faults:Fault[]}
export interface Job{id:string;system:System;profile:string;tick:number;due:string;cutoff:string;state:string;attempts:number;generationExecutions:number;input?:BriefingInput;result?:BriefingResult;checkpoint?:BriefingResult;publishedAt?:string;resolvedAt?:string;error?:string;historyHash?:string}
export interface Publication{jobId:string;system:System;profile:string;tick:number;due:string;at:string;input:BriefingInput;result:BriefingResult;priorBefore:PriorItem[];publishedItemIds:string[]}
export class UnknownOutcome extends Error{readonly name='UnknownOutcome'}
const hash=(x:unknown)=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export function clockTicks(start:string,count:number){const schedule={durationMinutes:30 as const,timezone:'UTC',clockStartAt:start,clockPolicy:'clock-aligned-delivery-v2' as const};const first=Date.parse(firstClockBriefingAt(schedule));return Array.from({length:count},(_,i)=>livePublicationWindow(schedule,new Date(first+i*1800000-300000)))}
export async function runClosedLoop(sequence:Sequence,systems:System[],generate:(system:System,input:BriefingInput,context:{jobId:string;profile:string;tick:number})=>Promise<BriefingResult>,options:{simpleCheckpoint?:boolean;wordBudget?:number}={}){
 if(new Set(systems).size!==systems.length||new Set(sequence.profiles.map(p=>p.id)).size!==sequence.profiles.length)throw Error('AMBIGUOUS_ARM_OR_PROFILE');
 const ticks=clockTicks(sequence.start,sequence.ticks),histories:Record<string,PriorItem[]>={},jobs:Job[]=[],events:Array<{kind:string;jobId:string;at:string;detail?:string}>=[],publications:Publication[]=[],committed=new Set<string>();
 type Task={at:number;job:Job;retry:boolean;result?:BriefingResult};const tasks:Task[]=[];
 for(const system of systems)for(const profile of sequence.profiles){histories[system+':'+profile.id]=[];ticks.forEach((t,tick)=>{const job:Job={id:sequence.id+':'+system+':'+profile.id+':'+tick,system,profile:profile.id,tick,due:t.scheduledFor!,cutoff:t.end,state:'scheduled',attempts:0,generationExecutions:0};jobs.push(job);tasks.push({at:Date.parse(job.due),job,retry:false})})}
 const event=(kind:string,job:Job,at:number,detail?:string)=>{if(!job.resolvedAt&&['published','quiet','editorially-rejected','publication-rejected','unknown','generation-failed','failed-no-checkpoint','stale-history','invalid-generation-timing'].includes(job.state))job.resolvedAt=new Date(at).toISOString();events.push({kind,jobId:job.id,at:new Date(at).toISOString(),...(detail?{detail}:{})})};
 const retry=(job:Job,at:number,delay:number)=>{if(!Number.isFinite(delay)||delay<0)throw Error('INVALID_FAULT_DELAY');tasks.push({at:at+delay,job,retry:true})};
 while(tasks.length){tasks.sort((a,b)=>a.at-b.at||Number(a.retry)-Number(b.retry)||a.job.id.localeCompare(b.job.id));const task=tasks.shift()!,{at,job,retry:isRetry}=task,key=job.system+':'+job.profile,history=histories[key],profile=sequence.profiles.find(p=>p.id===job.profile)!,fault=sequence.faults.find(f=>f.tick===job.tick);if(!task.result)job.attempts++;
  if(committed.has(job.id)){event('duplicate-delivery-suppressed',job,at);continue}
  if(['unknown','failed-no-checkpoint','stale-history'].includes(job.state)){event('terminal-retry-blocked',job,at);continue}
  if(!task.result&&!isRetry&&fault?.phase==='before-generation'){job.state='known-pre-dispatch-failure';event('pre-dispatch-failure',job,at);retry(job,at,fault.delayMs);continue}
  if(!job.input){const articles=sequence.articles.filter(a=>Date.parse(a.availableAt)<=Date.parse(job.cutoff)&&Date.parse(a.publishedAt)<=Date.parse(job.cutoff)&&Date.parse(a.publishedAt)>=Date.parse(sequence.start)).map(({availableAt,...a})=>structuredClone(a));job.input={feed:{interest:profile.interest,language:profile.language,windowMinutes:30,style:'Use the original source publication dates. Label late discoveries and source revisions with accurate temporal context; acquisition time is not event time.'},articles,prior:structuredClone(history),windowStart:ticks[job.tick].start,windowEnd:job.cutoff};job.historyHash=hash(history)}
  if(job.historyHash!==hash(history)){job.state='stale-history';event('stale-history-blocked',job,at);continue}
  let result:BriefingResult;
  if(task.result){result=task.result}else if(job.checkpoint){result=structuredClone(job.checkpoint);event('checkpoint-reused',job,at)}else{
   if(isRetry&&job.generationExecutions>0){job.state='failed-no-checkpoint';event('missing-result-checkpoint',job,at);continue}
   job.generationExecutions++;try{result=await generate(job.system,structuredClone(job.input),{jobId:job.id,profile:job.profile,tick:job.tick});job.result=structuredClone(result);event('generation-completed',job,at)}catch(e){job.error=String(e);job.state=e instanceof UnknownOutcome||e instanceof BriefingModelError&&e.uncertain?'unknown':'generation-failed';event(job.state,job,at,job.error);continue}
   if(job.system!=='simple'||options.simpleCheckpoint)job.checkpoint=structuredClone(result);
   const duration=result.timings.totalMs;if(!Number.isFinite(duration)||duration<0){job.state='invalid-generation-timing';event(job.state,job,at);continue}const readyAt=at+duration;
   if(!isRetry&&fault?.phase==='after-generation'){job.state='interrupted-after-generation';event('post-generation-interruption',job,readyAt);retry(job,readyAt,fault.delayMs);continue}
   tasks.push({at:readyAt,job,retry:isRetry,result});continue;
  }
  if(!['published','empty','rejected'].includes(result.status)||!Array.isArray(result.items)){job.state='publication-rejected';event('invalid-result',job,at);continue}
  if(result.status!=='published'){if(result.items.length){job.state='publication-rejected';event('unpublished-items-invalid',job,at);continue}job.state=result.status==='empty'?'quiet':'editorially-rejected';event(job.state,job,at);continue}
  const knownSources=new Set(job.input.articles.map(a=>a.id));if(!result.items.length||!withinWordBudget(result.items,options.wordBudget??110)||result.items.some(i=>typeof i.headline!=='string'||!i.headline.trim()||typeof i.body!=='string'||!Array.isArray(i.sourceIds)||!i.sourceIds.length||i.sourceIds.some(id=>!knownSources.has(id))||!['new','update','correction'].includes(i.relation)||i.relation!=='new'&&!history.some(p=>p.id===i.updatesId))){job.state='publication-rejected';event('publication-contract-rejected',job,at);continue}
  const priorBefore=structuredClone(history),publishedAt=new Date(at).toISOString(),next=publishHistory(history,result.items,'published',job.system,job.id,publishedAt);histories[key]=next;committed.add(job.id);job.state='published';job.publishedAt=publishedAt;publications.push({jobId:job.id,system:job.system,profile:job.profile,tick:job.tick,due:job.due,at:publishedAt,input:structuredClone(job.input),result:structuredClone(result),priorBefore,publishedItemIds:next.slice(history.length).map(p=>p.id)});event('published',job,at);
  if(!isRetry&&fault?.phase==='after-publication'){event('post-commit-ack-lost',job,at);retry(job,at,fault.delayMs)}
 }
 return{sequenceId:sequence.id,histories,jobs,events,publications,scope:'Own actual published text drives the next input. Faults/delay are an offline contract model, not measured Cloudflare reliability.'};
}