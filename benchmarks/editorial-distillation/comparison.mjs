import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
export const sha256 = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const candidates = [
 {id:'main-change',variable:'Main-idea selection and detail economy only',instruction:'For each selected development, communicate the main change and only the details needed to understand it accurately. Do not reproduce a source post or its supporting detail list. Keep an essential condition, attribution or consequence even when that makes the item slightly longer; do not add explanations absent from the evidence.'},
 {id:'complementary-evidence',variable:'Synthesis of complementary evidence for the same development only',instruction:'When sources describe the same development, write one account from their complementary evidence rather than paraphrasing each post. Use the most informative supported account, retaining material qualifications or disagreements. Different occurrences remain separate; several citations alone do not make a synthesis useful.'}
];
export function pairedRequest(baseline,candidateId){
 const c=candidates.find(c=>c.id===candidateId);if(!c)throw Error('UNKNOWN_CANDIDATE');
 return {...baseline,system:baseline.system+'\n\n'+c.instruction};
}
export function auditPair(baseline,candidate,candidateId){
 if(!isDeepStrictEqual(candidate,pairedRequest(baseline,candidateId)))throw Error('UNCONTROLLED_COMPARISON');
 return {identicalInput:true,identicalModelAndParameters:true,onlyOneEditorialInstructionChanged:true};
}
/** Descriptive review aids, never semantic quality scores or publication gates. */
export function describeDraft(output,prepared){
 const known=new Map(prepared.map(s=>[s.ref,s]));const items=output.items??[];
 const prose=items.map(i=>i.headline+' '+i.body).join(' ');
 return {items:items.length,words:prose.trim()?prose.trim().split(/\s+/u).length:0,characters:prose.length,
 unknownReferences:items.flatMap((i,index)=>(i.sources??[]).filter(ref=>!known.has(ref)).map(ref=>({index,ref}))),
 repeatedHeadlineBodies:items.flatMap((i,index)=>i.headline?.trim()&&i.body?.trim()===i.headline.trim()?[index]:[]),
 factualSupport:null,importantDevelopmentCoverage:null,synthesisValue:null,falseMerges:null,falseSplits:null,writingQuality:null,
 qualification:'Semantic fields require review against the original corpus; source-reference validity, length and item count are not factuality or distillation scores.'};
}
