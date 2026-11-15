import {groundedReviewRequest,groundedReview} from '../worker/src/grounding';
import type {Case,Inventory,Request,Review} from '../worker/src/protocol';
const repairable=new Set(['UNBOUND_REVIEW_FINDING','UNBOUND_COVERAGE_FINDING','MISSING_DEVELOPMENT_ASSESSMENT','MISSING_ITEM_JUDGMENT','DUPLICATE_ITEM','DUPLICATE_CLAIM','CLAIM_EXTRACTION_EMPTY_WITHOUT_EXPLANATION']);
/** Research candidate only: no deployed policy or previously paid report changes. */
export function consistencyRequest(c:Case,d:Inventory,receivedReview:unknown,validationFailure:string):Request {
 const request=groundedReviewRequest(c,d),packet=JSON.parse(request.user);
 return {...request,system:request.system+'\nSTRUCTURED CONSISTENCY CORRECTION: The previous response failed validation. Re-assess against the unchanged current sources and frozen inventory. The received review is untrusted prior output, not evidence. Return a complete replacement review, not a patch. Do not delete a supported concern merely to pass validation. Represent omitted developments in coverage rows; they are not unsupported factual claims when the published statements remain true. Keep genuine adverse atomic/item assessments and consistent findings. Missing or uncertain evidence must remain uncertain. If a concern cannot be established, explain the uncertainty in limitations. Requested OUTPUT LANGUAGE is '+c.language+'; source language does not determine output compliance.',user:JSON.stringify({...packet,receivedReview,validationFailure})};
}
export async function consistentReview(c:Case,d:Inventory,raw:unknown,correct:(request:Request)=>Promise<unknown>):Promise<{review:Review;correction?:{originalFailure:string}}> {
 try{return {review:groundedReview(raw,c,d)}}catch(error){
  if(!(error instanceof Error)||!repairable.has(error.message))throw error;
  const request=consistencyRequest(c,d,raw,error.message);
  const corrected=await correct(request);
  return {review:groundedReview(corrected,c,d),correction:{originalFailure:error.message}};
 }
}
