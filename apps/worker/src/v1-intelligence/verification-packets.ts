import {HandoffError} from '@distilled/contracts';
import {faithfulFact} from './fidelity';
import type {VerificationClaim,BriefingModelPort} from './publication';
export type VerificationOutcome=Awaited<ReturnType<NonNullable<BriefingModelPort['verify']>>>;
/** Whole-edition verification is preferred. Only real context exhaustion uses
 * story-local checks plus every cross-story pair, retaining global duplication
 * checks. This is execution work, not a limit on published stories. */
export function partitionVerification(claims:VerificationClaim[],fits:(claims:VerificationClaim[])=>boolean):VerificationClaim[][] {
 if(fits(claims))return [claims];
 const groups=new Map<string,VerificationClaim[]>();for(const claim of claims){const id=claim.candidateId??claim.id;groups.set(id,[...(groups.get(id)??[]),claim])}
 const stories=[...groups.values()],packets:VerificationClaim[][]=[];
 if(stories.some(s=>!fits(s)))throw Error('MODEL_CONTEXT_CONTINUATION_REQUIRED');
 if(stories.length===1)return stories;
 const remaining=new Set<string>();for(let i=0;i<stories.length;i++)for(let j=i+1;j<stories.length;j++)remaining.add(i+':'+j);
 while(remaining.size){const [i,j]=remaining.values().next().value!.split(':').map(Number),indices=[i,j];
  if(!fits([...stories[i],...stories[j]]))throw Error('MODEL_CONTEXT_CONTINUATION_REQUIRED');
  for(let k=0;k<stories.length;k++)if(!indices.includes(k)&&indices.some(n=>remaining.has(Math.min(n,k)+':'+Math.max(n,k)))&&fits([...indices.flatMap(n=>stories[n]),...stories[k]]))indices.push(k);
  packets.push(indices.flatMap(n=>stories[n]));for(let a=0;a<indices.length;a++)for(let b=a+1;b<indices.length;b++)remaining.delete(Math.min(indices[a],indices[b])+':'+Math.max(indices[a],indices[b]));
 }
 return packets;
}
/** No permissive packet can override a negative semantic verdict elsewhere.
 * Every reference is checked against the exact evidence-bound packet. */
export function mergeVerification(results:{claims:VerificationClaim[];result:VerificationOutcome}[],requireComplete=false):VerificationOutcome {
 const checks=new Map<string,NonNullable<VerificationOutcome['semanticChecks']>[number][]>(),entailment=new Map<string,NonNullable<VerificationOutcome['claimEntailment']>[number][]>(),supported=new Map<string,boolean[]>(),preserved=new Map<string,boolean[]>(),novel=new Map<string,boolean[]>(),addressed=new Map<string,boolean[]>();
 const add=<T>(m:Map<string,T[]>,key:string,value:T)=>m.set(key,[...(m.get(key)??[]),value]);
 const inventory=(claim:VerificationClaim)=>[...(claim.requiredFacts??[]),...(claim.allowedFacts??[]),...(claim.newUnderstandingFacts??[])];
 for(const {claims,result} of results){const claimIds=new Set(claims.map(c=>c.id)),facts=new Set(claims.flatMap(c=>inventory(c).map(f=>f.id))),obligations=new Set(claims.flatMap(c=>(c.correctionObligations??[]).map(o=>o.id)));
  if(result.supportedClaimIds.some(id=>!claimIds.has(id))||result.semanticChecks?.some(c=>!facts.has(c.factId)||Boolean(c.candidateId&&!claims.some(claim=>(claim.candidateId??claim.id)===c.candidateId&&inventory(claim).some(f=>f.id===c.factId))))||result.claimEntailment?.some(c=>!claimIds.has(c.claimId))||result.preservedFactIds?.some(id=>!facts.has(id))||result.novelFactIds?.some(id=>!facts.has(id))||result.addressedCorrectionObligationIds?.some(id=>!obligations.has(id)))throw new HandoffError('SCOPE_DENIED');
  if(requireComplete&&(claims.some(c=>!result.claimEntailment?.some(v=>v.claimId===c.id))||claims.some(claim=>claim.requiredFacts?.some(f=>!result.semanticChecks?.some(v=>v.factId===f.id&&(!v.candidateId||v.candidateId===(claim.candidateId??claim.id)))))))throw new HandoffError('SCOPE_DENIED');
  for(const id of claimIds)add(supported,id,result.supportedClaimIds.includes(id));
  for(const id of facts){add(preserved,id,result.preservedFactIds?.includes(id)??false);add(novel,id,result.novelFactIds?.includes(id)??false)}for(const id of obligations)add(addressed,id,result.addressedCorrectionObligationIds?.includes(id)??false);
  for(const check of result.semanticChecks??[])add(checks,JSON.stringify([check.candidateId??null,check.factId]),check);for(const check of result.claimEntailment??[])add(entailment,check.claimId,check);
 }
 const positive=(m:Map<string,boolean[]>)=>[...m].filter(([,v])=>v.every(Boolean)).map(([id])=>id);
 // Preserve summary aliases by story occurrence before projecting original IDs.
 // A sibling packet omitting the same optional fact is not a contrary summary
 // for the story which actually communicates it. Legacy scalar merging stays.
 const mergedChecks=[...checks.values()].map(values=>{const chosen=values.find(c=>!faithfulFact(c))??values[0];return values.every(c=>typeof c.preservedInSummary==='boolean')?{...chosen,preservedInSummary:values.every(c=>c.preservedInSummary)}:chosen});
 const scopedIds=new Set(mergedChecks.filter(c=>typeof c.preservedInSummary==='boolean').map(c=>c.factId));
 const preservedIds=[...new Set([...positive(preserved).filter(id=>!scopedIds.has(id)),...mergedChecks.filter(c=>c.preservedInSummary).map(c=>c.factId)])];
 return {supportedClaimIds:positive(supported),preservedFactIds:preservedIds,novelFactIds:positive(novel),addressedCorrectionObligationIds:positive(addressed),semanticChecks:checks.size?mergedChecks:undefined,claimEntailment:entailment.size?[...entailment.values()].map(values=>values.find(c=>!c.fullyEntailed||c.unsupportedMeaning.length>0)??values[0]):undefined,usage:{tokensIn:0,tokensOut:0,cost:0,confirmed:true}};
}
