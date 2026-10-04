import {z} from 'zod';
import {sha256} from '@distilled/contracts';
import {canonicalJson} from '../v1-intake/canonical';
import {equivalentFact,supportedSentences} from './editorial';
import {features} from './policies';
import {salienceInputSchema,salienceResultSchema,type EventSalienceScorer,type SalienceInput,type JudgmentClient,type ExperimentUsage} from './salience';
const identity=z.string().min(1),hash=z.string().regex(/^[a-f0-9]{64}$/);
const annotation={origin:z.literal('HUMAN'),annotatorId:identity,createdAt:z.string().datetime(),labelPolicyVersion:identity};
export const salienceLabelsSchema=z.object({...annotation,datasetHash:hash,events:z.array(z.object({targetVersionId:identity,importance:z.number().int().min(0).max(3),important:z.boolean(),noise:z.boolean()}).strict())}).strict().refine(v=>v.events.every(e=>!(e.important&&e.noise)),'An important event cannot be labeled noise');
export type SalienceLabels=z.infer<typeof salienceLabelsSchema>;
export async function inputFingerprint(value:unknown):Promise<string> {return sha256(canonicalJson(value))}
function sameIds(a:string[],b:string[]):boolean {return new Set(a).size===a.length && new Set(b).size===b.length && a.length===b.length && a.every(id=>b.includes(id))}
/** Label files are caller-supplied, immutable and hashed. Synthetic arithmetic
 * fixtures test formulas but never enter an actual human-quality report. */
export async function evaluateSalience(inputs:SalienceInput[],scorer:EventSalienceScorer,k:number,rawLabels?:unknown) {
 if(!inputs.length || !Number.isInteger(k) || k<1 || k>inputs.length || new Set(inputs.map(i=>i.targetVersionId)).size!==inputs.length) throw Error('INVALID_EVALUATION_INPUT');
 inputs.forEach(i=>salienceInputSchema.parse(i));const datasetHash=await inputFingerprint(inputs);
 const labels=rawLabels===undefined?undefined:salienceLabelsSchema.parse(rawLabels);
 if(labels && (labels.datasetHash!==datasetHash || !sameIds(inputs.map(i=>i.targetVersionId),labels.events.map(e=>e.targetVersionId)))) throw Error('LABEL_INPUT_MISMATCH');
 const rows=[];
 for(const input of inputs) {const start=performance.now(),result=salienceResultSchema.parse(await scorer.score(structuredClone(input)));rows.push({targetVersionId:input.targetVersionId,score:result.components.overallScore,latencyMs:performance.now()-start,...result})}
 const ranked=[...rows].sort((a,b)=>b.score-a.score||a.targetVersionId.localeCompare(b.targetVersionId)),selected=ranked.slice(0,k);
 let quality:Record<string,unknown>={status:'PENDING_HUMAN_LABELS'};
 if(labels) {
  const gold=new Map(labels.events.map(e=>[e.targetVersionId,e])),important=labels.events.filter(e=>e.important),retained=selected.filter(r=>gold.get(r.targetVersionId)!.important).length;
  const dcg=(grades:number[])=>grades.reduce((sum,g,i)=>sum+(2**g-1)/Math.log2(i+2),0),ideal=dcg(labels.events.map(e=>e.importance).sort((a,b)=>b-a).slice(0,k));
  let pairs=0,agreement=0;
  for(let i=0;i<rows.length;i++) for(let j=i+1;j<rows.length;j++) {const desired=Math.sign(gold.get(rows[i].targetVersionId)!.importance-gold.get(rows[j].targetVersionId)!.importance);if(!desired) continue;pairs++;const actual=Math.sign(rows[i].score-rows[j].score);agreement+=actual===desired?1:actual===0?.5:0}
  quality={status:'MEASURED_WITH_SUPPLIED_HUMAN_LABELS',labelHash:await inputFingerprint(labels),importantRecallAtK:important.length?retained/important.length:null,ndcgAtK:ideal?dcg(selected.map(r=>gold.get(r.targetVersionId)!.importance))/ideal:null,falseNoiseInclusion:selected.filter(r=>gold.get(r.targetVersionId)!.noise).length/k,importantOmission:important.length-retained,humanPairwiseRankingAgreement:pairs?agreement/pairs:null};
 }
 const latency=rows.map(r=>r.latencyMs).sort((a,b)=>a-b),total=latency.reduce((a,b)=>a+b,0),fallbacks=rows.filter(r=>r.fallback).length;
 return {datasetHash,k,rows,ranking:ranked.map(r=>r.targetVersionId),quality,nativeModelQualityEligible:fallbacks===0,fallbacks,efficiency:{totalScoringMs:total,p95LatencyMs:latency[Math.ceil(.95*latency.length)-1],throughputPerSecond:total>0?rows.length*1000/total:null,modelCalls:rows.reduce((n,r)=>n+r.usage.calls,0),reportedCostUsd:rows.every(r=>r.usage.reported)?rows.reduce((n,r)=>n+r.usage.costUsd,0):null,reservedOrReportedCostUsd:rows.reduce((n,r)=>n+r.usage.costUsd,0),tokensIn:rows.every(r=>r.usage.tokensIn!==undefined)?rows.reduce((n,r)=>n+r.usage.tokensIn!,0):null,tokensOut:rows.every(r=>r.usage.tokensOut!==undefined)?rows.reduce((n,r)=>n+r.usage.tokensOut!,0):null}};
}
export const CHANGE_CLASSES=['NO_MEANINGFUL_CHANGE','MINOR_UPDATE','MATERIAL_UPDATE','MAJOR_STATE_CHANGE','TURNING_POINT'] as const;
export type ChangeClass=typeof CHANGE_CLASSES[number];
export interface StorylineChangeInput {id:string;previousState:string;currentState:string;eventVersionIds:string[];evidenceRevisionIds:string[]}
export function deterministicStorylineChange(input:StorylineChangeInput):ChangeClass {
 const previous=supportedSentences(input.previousState),next=supportedSentences(input.currentState).filter(f=>!previous.some(p=>equivalentFact(p,f)));
 if(!next.length) return 'NO_MEANINGFUL_CHANGE';
 const phases=new Set(previous.map(p=>features(p).development));
 if(next.some(f=>features(f).development==='sign') && !phases.has('sign')) return 'TURNING_POINT';
 if(next.some(f=>features(f).development!=='report' && !phases.has(features(f).development))) return 'MAJOR_STATE_CHANGE';
 return next.some(f=>/\p{N}|\b(postponed|uncertain|unresolved|not|no|affected)\b/iu.test(f))?'MATERIAL_UPDATE':'MINOR_UPDATE';
}
export async function judgeStorylineChange(input:StorylineChangeInput,client?:JudgmentClient):Promise<{change:ChangeClass;provenance:string;usage:ExperimentUsage;fallback?:string}> {
 if(!input.id || !input.currentState || !input.eventVersionIds.length || !input.evidenceRevisionIds.length) throw Error('INVALID_EVALUATION_INPUT');
 const baseline={change:deterministicStorylineChange(input),provenance:'deterministic-storyline-change-v1',usage:{calls:0,costUsd:0,tokensIn:0,tokensOut:0,reported:true}};
 if(!client) return baseline;const before=client.usage();
 try {const result=await client.choose(input,'Classify the supported change from the previously communicated storyline state. Do not score salience or select a briefing. Preserve negation, uncertainty and quantities.',{NO_MEANINGFUL_CHANGE:'Equivalent already communicated understanding or corroboration only.',MINOR_UPDATE:'New detail with limited consequences.',MATERIAL_UPDATE:'Meaningful new fact, consequence, discrepancy or unresolved outcome.',MAJOR_STATE_CHANGE:'A major phase or status transition.',TURNING_POINT:'A supported decisive transition changing the trajectory.'});
  if(result.confidence<.6 || !(CHANGE_CLASSES as readonly string[]).includes(result.choice)) throw Error('INVALID_EXPERIMENT_RESULT');
  return {change:result.choice as ChangeClass,provenance:`${client.kind}:${client.model}:storyline-change-v1`,usage:result.usage};
 }catch {const after=client.usage();return {...baseline,fallback:'EXPERIMENT_UNAVAILABLE',usage:{calls:after.calls-before.calls,costUsd:Math.max(0,after.costUsd-before.costUsd),reported:after.reported}}}
}
export const storylineLabelsSchema=z.object({...annotation,datasetHash:hash,changes:z.array(z.object({id:identity,change:z.enum(CHANGE_CLASSES)}).strict())}).strict();
export async function evaluateStorylineChanges(inputs:StorylineChangeInput[],client?:JudgmentClient,rawLabels?:unknown) {
 if(!inputs.length || new Set(inputs.map(i=>i.id)).size!==inputs.length) throw Error('INVALID_EVALUATION_INPUT');
 const datasetHash=await inputFingerprint(inputs),labels=rawLabels===undefined?undefined:storylineLabelsSchema.parse(rawLabels);
 if(labels && (labels.datasetHash!==datasetHash || !sameIds(inputs.map(i=>i.id),labels.changes.map(c=>c.id)))) throw Error('LABEL_INPUT_MISMATCH');
 const rows=[];for(const input of inputs){const start=performance.now(),result=await judgeStorylineChange(input,client);rows.push({id:input.id,latencyMs:performance.now()-start,...result})}
 return {datasetHash,rows,quality:labels?{status:'MEASURED_WITH_SUPPLIED_HUMAN_LABELS',labelHash:await inputFingerprint(labels),accuracy:rows.filter(r=>labels.changes.find(c=>c.id===r.id)!.change===r.change).length/rows.length}:{status:'PENDING_HUMAN_LABELS'}};
}
export interface DistillationSnapshot {editionId:string;claims:{id:string;text:string}[];sourceFactIds:string[];candidateEventIds:string[];selectedEventIds:string[]}
export const distillationLabelsSchema=z.object({...annotation,outputHash:hash,requiredFacts:z.array(z.object({id:identity,retained:z.boolean()}).strict()),claims:z.array(z.object({id:identity,supported:z.boolean(),unnecessaryRepeat:z.boolean(),redundant:z.boolean(),correctDelta:z.boolean()}).strict()),noiseEventIds:z.array(identity),storylineCoherence:z.number().int().min(1).max(5),humanUsefulness:z.number().int().min(1).max(5)}).strict();
export async function evaluateDistillation(snapshot:DistillationSnapshot,rawLabels?:unknown) {
 if(!snapshot.editionId || new Set(snapshot.claims.map(c=>c.id)).size!==snapshot.claims.length || new Set(snapshot.sourceFactIds).size!==snapshot.sourceFactIds.length || new Set(snapshot.candidateEventIds).size!==snapshot.candidateEventIds.length || new Set(snapshot.selectedEventIds).size!==snapshot.selectedEventIds.length || snapshot.selectedEventIds.some(id=>!snapshot.candidateEventIds.includes(id))) throw Error('INVALID_EVALUATION_INPUT');
 const outputHash=await inputFingerprint(snapshot),words=snapshot.claims.reduce((n,c)=>n+(c.text.match(/\S+/g)??[]).length,0);
 const measured={outputHash,readingWords:words,estimatedReadingMinutesAt200Wpm:words/200};
 if(rawLabels===undefined) return {...measured,quality:{status:'PENDING_HUMAN_LABELS'}};
 const labels=distillationLabelsSchema.parse(rawLabels);
 if(labels.outputHash!==outputHash || !sameIds(snapshot.claims.map(c=>c.id),labels.claims.map(c=>c.id)) || new Set(labels.requiredFacts.map(f=>f.id)).size!==labels.requiredFacts.length || labels.requiredFacts.some(f=>!snapshot.sourceFactIds.includes(f.id)) || new Set(labels.noiseEventIds).size!==labels.noiseEventIds.length || labels.noiseEventIds.some(id=>!snapshot.candidateEventIds.includes(id))) throw Error('LABEL_INPUT_MISMATCH');
 const proportion=(values:boolean[])=>values.length?values.filter(Boolean).length/values.length:null;
 const retention=proportion(labels.requiredFacts.map(f=>f.retained));
 return {...measured,quality:{status:'MEASURED_WITH_SUPPLIED_HUMAN_LABELS',labelHash:await inputFingerprint(labels),signalRetention:retention,informationLoss:retention===null?null:1-retention,noiseRejection:labels.noiseEventIds.length?labels.noiseEventIds.filter(id=>!snapshot.selectedEventIds.includes(id)).length/labels.noiseEventIds.length:null,repeatRate:proportion(labels.claims.map(c=>c.unnecessaryRepeat)),redundancy:proportion(labels.claims.map(c=>c.redundant)),grounding:proportion(labels.claims.map(c=>c.supported)),unsupportedClaimRate:proportion(labels.claims.map(c=>!c.supported)),deltaCorrectness:proportion(labels.claims.map(c=>c.correctDelta)),storylineCoherence:labels.storylineCoherence,humanUsefulness:labels.humanUsefulness}};
}
