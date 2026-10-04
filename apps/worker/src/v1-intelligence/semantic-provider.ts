import {z} from 'zod';
import type {ExperimentUsage} from './salience';
export type SemanticQuestion={kind:'CHOICE';instructions:string;criteria:Record<string,string>}|{kind:'BOOLEAN';instructions:string}|{kind:'SCORE';instructions:string;levels:string[]};
export type SemanticAnswer={kind:'CHOICE';choice:string;confidence:number;probabilities:Record<string,number>}|{kind:'BOOLEAN';probability:number}|{kind:'SCORE';value:number;confidence:number;probabilities:Record<string,number>};
export interface SemanticJudgments {answers:Record<string,SemanticAnswer>;usage:ExperimentUsage}
export interface SemanticJudge {model:string;decide(state:unknown,questions:Record<string,SemanticQuestion>):Promise<SemanticJudgments>;usage():ExperimentUsage}
const unit=z.number().finite().min(0).max(1);
export function wireQuestions(questions:Record<string,SemanticQuestion>):Record<string,unknown> {
 const entries=Object.entries(questions);if(!entries.length || entries.length>8)throw Error('INVALID_EXPERIMENT_INPUT');
 return Object.fromEntries(entries.map(([key,q])=>{
  if(!/^[a-z][a-z_]{0,40}$/.test(key)||!q.instructions.trim()||q.instructions.length>2000)throw Error('INVALID_EXPERIMENT_INPUT');
  if(q.kind==='BOOLEAN')return [key,{type:'noul',instructions:q.instructions,criteria:{true:'Supported by the supplied evidence',false:'Not supported by the supplied evidence'}}];
  if(q.kind==='SCORE'){if(q.levels.length<2||q.levels.length>10||q.levels.some(s=>!s.trim()||s.length>1000))throw Error('INVALID_EXPERIMENT_INPUT');return [key,{type:'score',instructions:q.instructions,criteria:q.levels}]}
  const keys=Object.keys(q.criteria);if(keys.length<2||keys.length>10||Object.values(q.criteria).some(s=>!s.trim()||s.length>1000))throw Error('INVALID_EXPERIMENT_INPUT');return [key,{type:'choice',instructions:q.instructions,criteria:q.criteria}];
 }));
}
export function parseSemanticAnswers(raw:unknown,questions:Record<string,SemanticQuestion>):Record<string,SemanticAnswer> {
 const answers:z.infer<ReturnType<typeof z.record>>=z.record(z.unknown()).parse(raw);
 if(Object.keys(answers).length!==Object.keys(questions).length)throw Error('INVALID_EXPERIMENT_RESULT');
 const result:Record<string,SemanticAnswer>={};
 for(const [key,q] of Object.entries(questions)){
  if(q.kind==='BOOLEAN'){const a=z.object({type:z.literal('noul'),noul:unit}).strict().parse(answers[key]);result[key]={kind:'BOOLEAN',probability:a.noul};continue}
  const keys=q.kind==='CHOICE'?Object.keys(q.criteria):q.levels.map((_,i)=>String(i));
  const probabilities=z.object(Object.fromEntries(keys.map(k=>[k,unit]))).strict();
  if(q.kind==='CHOICE'){
   const a=z.object({type:z.literal('choice'),choice:z.enum(keys as [string,...string[]]),confidence:unit,probabilities}).strict().parse(answers[key]);
   if(Math.abs(Object.values(a.probabilities).reduce((s,n)=>s+n,0)-1)>.001)throw Error('INVALID_EXPERIMENT_RESULT');result[key]={kind:'CHOICE',choice:a.choice,confidence:a.confidence,probabilities:a.probabilities};
  }else{
   const a=z.object({type:z.literal('score'),score:z.number().finite().min(0).max(q.levels.length-1),confidence:unit,probabilities,legend:z.record(z.string()).optional()}).strict().parse(answers[key]);
   if(Math.abs(Object.values(a.probabilities).reduce((s,n)=>s+n,0)-1)>.001)throw Error('INVALID_EXPERIMENT_RESULT');
   const mean=Object.entries(a.probabilities).reduce((s,[k,n])=>s+Number(k)*n,0);if(Math.abs(mean-a.score)>.01)throw Error('INVALID_EXPERIMENT_RESULT');
   result[key]={kind:'SCORE',value:a.score/(q.levels.length-1),confidence:a.confidence,probabilities:a.probabilities};
  }
 }return result;
}
