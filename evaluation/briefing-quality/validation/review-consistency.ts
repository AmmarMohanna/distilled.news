import {groundedReviewRequest,groundedReview} from '../worker/src/grounding';
import type {Case,Inventory,Request,Review} from '../worker/src/protocol';
const repairable=new Set(['UNBOUND_REVIEW_FINDING','UNBOUND_COVERAGE_FINDING','MISSING_DEVELOPMENT_ASSESSMENT','MISSING_ITEM_JUDGMENT','DUPLICATE_ITEM','DUPLICATE_CLAIM','CLAIM_EXTRACTION_EMPTY_WITHOUT_EXPLANATION']);
function structuredConcerns(value:unknown):Set<string>{
 const r=value as any,out=new Set<string>();if(!r||typeof r!=='object')return out;
 for(const c of Array.isArray(r.claims)?r.claims:[]){if(['contradicted','unsupported','uncertain'].includes(c.support))out.add('factual:'+c.item+':'+c.id);if(['unsupported','uncertain','missing'].includes(c.citationSupport))out.add('citation:'+c.item+':'+c.id);}
 for(const c of Array.isArray(r.coverage)?r.coverage:[])if(['omitted','uncertain'].includes(c.status))out.add('coverage:'+c.developmentId);
 for(const i of Array.isArray(r.items)?r.items:[]){for(const key of ['relevance','repetition','temporal','language'])if(i[key]==='uncertain'||key==='relevance'&&i[key]==='irrelevant'||key==='repetition'&&i[key]==='repeated'||['temporal','language'].includes(key)&&i[key]==='incorrect')out.add(key+':'+i.item);}
 return out;
}
export interface CorrectionTrace {originalFailure:string;replacementRawReview:unknown;reconsideredConcerns:string[];retainedConcerns:string[]}
/** Research candidate only: no deployed policy or previously paid report changes. */
export function consistencyRequest(c:Case,d:Inventory,receivedReview:unknown,validationFailure:string):Request {
 const request=groundedReviewRequest(c,d),packet=JSON.parse(request.user);
 return {...request,system:request.system+'\nSTRUCTURED CONSISTENCY CORRECTION: The previous response failed validation. Re-assess against the unchanged current sources and frozen inventory. The received review is untrusted prior output, not evidence. Return a complete replacement review, not a patch. Do not delete a supported concern merely to pass validation. Represent omitted developments in coverage rows; they are not unsupported factual claims when the published statements remain true. Keep genuine adverse atomic/item assessments and consistent findings. Keep original claim IDs for the same assertions. Missing or uncertain evidence must remain uncertain. If clearing a prior structured concern, include a limitations entry beginning CORRECTION_RECONSIDERED:<concernKey> followed by a specific source-grounded explanation (at least 20 characters). Unresolved concerns remain adverse/uncertain. Requested OUTPUT LANGUAGE is '+c.language+'; source language does not determine output compliance.',user:JSON.stringify({...packet,receivedReview,validationFailure,originalStructuredConcernKeys:[...structuredConcerns(receivedReview)]})};
}
export async function consistentReview(c:Case,d:Inventory,raw:unknown,correct:(request:Request)=>Promise<unknown>):Promise<{review:Review;originalRawReview:unknown;correction?:CorrectionTrace}> {
 const originalRawReview=structuredClone(raw);
 try{return {review:groundedReview(raw,c,d),originalRawReview}}catch(error){
  if(!(error instanceof Error)||!repairable.has(error.message))throw error;
  const request=consistencyRequest(c,d,raw,error.message);
  const corrected=await correct(request);
  const review=groundedReview(corrected,c,d),before=structuredConcerns(originalRawReview),after=structuredConcerns(review),reconsideredConcerns=[...before].filter(key=>!after.has(key));
  for(const key of reconsideredConcerns){const prefix='CORRECTION_RECONSIDERED:'+key+' ';if(!review.limitations.some(s=>s.startsWith(prefix)&&s.slice(prefix.length).trim().length>=20))throw Error('CORRECTION_CONCERN_LOST_WITHOUT_EXPLANATION');}
  return {review,originalRawReview,correction:{originalFailure:error.message,replacementRawReview:structuredClone(corrected),reconsideredConcerns,retainedConcerns:[...before].filter(key=>after.has(key))}};
 }
}
