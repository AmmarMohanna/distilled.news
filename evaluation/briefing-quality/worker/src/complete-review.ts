import {review,reviewRequest,type Case,type Inventory,type Request} from './protocol';
/** Correct only a received, paid, incomplete assessment. Never invent coverage rows. */
export async function completeReview(c:Case,d:Inventory,raw:unknown,complete:(request:Request)=>Promise<unknown>,policy?:{request:Request;validate:(raw:unknown)=>ReturnType<typeof review>}){
 const validate=policy?.validate??((value:unknown)=>review(value,c,d));
 try{return validate(raw)}catch(error){
  if(!(error instanceof Error)||error.message!=='MISSING_DEVELOPMENT_ASSESSMENT')throw error;
  const original=policy?.request??reviewRequest(c,d),data=JSON.parse(original.user);
  const request={...original,system:original.system+'\nCOMPLETENESS CORRECTION: The received review omitted inventory coverage rows. Return the full review again, including exactly one coverage assessment for EVERY supplied development ID, and every reader item. Keep the independently frozen inventory and all evidence constraints. Assess omissions honestly; never fill missing rows with covered or already_reported by default.',user:JSON.stringify({...data,incompleteReview:raw,requiredDevelopmentIds:d.developments.map(v=>v.id)})};
  return validate(await complete(request));
 }
}
