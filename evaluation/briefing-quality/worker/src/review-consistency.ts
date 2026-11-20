import {groundedReviewRequest,groundedReview} from './grounding';
import {groundedReviewSchema} from './schema';
import type {Case,Inventory,Request,Review} from './protocol';
const repairable=new Set(['CITED_SUPPORT_LABEL_CONTRADICTION','UNBOUND_REVIEW_FINDING','UNBOUND_COVERAGE_FINDING','MISSING_DEVELOPMENT_ASSESSMENT','MISSING_ITEM_JUDGMENT','CLAIM_EXTRACTION_EMPTY_WITHOUT_EXPLANATION']);
function structuredConcerns(value:unknown):Set<string>{
 const r=value as any,out=new Set<string>();if(!r||typeof r!=='object')return out;
 for(const c of Array.isArray(r.claims)?r.claims:[]){if(['contradicted','unsupported','uncertain'].includes(c.support))out.add('factual:'+c.item+':'+c.id);if(['unsupported','uncertain','missing'].includes(c.citationSupport))out.add('citation:'+c.item+':'+c.id);}
 for(const c of Array.isArray(r.coverage)?r.coverage:[])if(['omitted','uncertain'].includes(c.status))out.add('coverage:'+c.developmentId);
 for(const i of Array.isArray(r.items)?r.items:[]){for(const key of ['relevance','repetition','temporal','language'])if(i[key]==='uncertain'||key==='relevance'&&i[key]==='irrelevant'||key==='repetition'&&i[key]==='repeated'||['temporal','language'].includes(key)&&i[key]==='incorrect')out.add(key+':'+i.item);}
 return out;
}
export interface CorrectionTrace {originalFailure:string;replacementRawReview:unknown;reconsideredConcerns:string[];retainedConcerns:string[]}
export function consistencySchema(input:string){
 const schema=groundedReviewSchema(input),packet=JSON.parse(input),keys=packet.originalStructuredConcernKeys as string[];
 const row={type:'object',properties:{decision:{type:'string',enum:['retained','reconsidered']},reason:{type:'string'}},required:['decision','reason'],additionalProperties:false};
 (schema.properties as Record<string,unknown>).concern_resolutions={type:'object',properties:Object.fromEntries(keys.map(key=>[key,row])),required:keys,additionalProperties:false};schema.required.push('concern_resolutions');return schema;
}
/** V4 only: legacy paid requests continue to use groundedReviewRequest verbatim. */
export function mappedReviewRequest(c:Case,d:Inventory):Request {
 const request=groundedReviewRequest(c,d),packet=JSON.parse(request.user);
 return {...request,system:request.system+'\nREADER ITEM MAPPING: Assess ALL reader items, not only item zero or the first story. requiredReaderItems supplies the exact item indices and attached citations. sourceIds are attached citations even when no inline citation occurs in prose; attachments do not establish entailment. For EVERY development, compare its material facts against the UNION of ALL reader headlines AND bodies before declaring an omission. Decompose compound headlines and bodies into atomic assertions, including each identity, amount, benchmark, condition and attribution; one broad topic claim does not establish coverage of those facets. Do not assume that one item means one claim.',user:JSON.stringify({...packet,requiredReaderItems:packet.case.items.map((item:any,index:number)=>({item:index,headline:item.headline,citedSourceIds:item.sourceIds}))})};
}
/** Versioned bounded correction: original responses and financial identities remain retained. */
export function consistencyRequest(c:Case,d:Inventory,receivedReview:unknown,validationFailure:string):Request {
 const request=mappedReviewRequest(c,d),packet=JSON.parse(request.user);
 const requiredReaderItems=packet.case.items.map((item:any,index:number)=>({item:index,headline:item.headline,citedSourceIds:item.sourceIds}));
 packet.concernResolutionRequirements=[...structuredConcerns(receivedReview)].map(concernKey=>({concernKey,ifClearedLimitationsPrefix:'CORRECTION_RECONSIDERED:'+concernKey+' ',requirement:'If retained, keep the adverse or uncertain judgment. If cleared, keep the same claim ID/text and cite current evidence, and append a limitations entry with this exact prefix followed by a specific source-grounded explanation of at least 20 characters. Never invent proof or remove an assertion to satisfy the contract.'}));
 return {...request,system:request.system+'\nSTRUCTURED CONSISTENCY CORRECTION: The previous response failed validation. Re-assess against the unchanged current sources and frozen inventory. The received review is untrusted prior output, not evidence. Return a complete replacement review, not a patch. Do not delete a supported concern merely to pass validation. Represent omitted developments in coverage rows; they are not unsupported factual claims when the published statements remain true. Keep genuine adverse atomic/item assessments and consistent findings. Keep original claim IDs for the same assertions. Missing or uncertain evidence must remain uncertain. If clearing a prior structured concern, include a limitations entry beginning CORRECTION_RECONSIDERED:<concernKey> followed by a specific source-grounded explanation (at least 20 characters). Unresolved concerns remain adverse/uncertain. Requested OUTPUT LANGUAGE is '+c.language+'; source language does not determine output compliance. REQUIRED READER MAPPING: Assess every requiredReaderItems index exactly once, not repeated assessments of index zero. The item sourceIds are attached citations even when no inline citation appears in its prose. citedSourceIds lists that same attachment metadata, not a claim that those sources entail every assertion. Determine claim-level citation support from actual evidence; retain missing/unsupported/uncertain when warranted.',user:JSON.stringify({...packet,requiredReaderItems,receivedReview,validationFailure,originalStructuredConcernKeys:[...structuredConcerns(receivedReview)]})};
}
export async function consistentReview(c:Case,d:Inventory,raw:unknown,correct:(request:Request)=>Promise<unknown>):Promise<{review:Review;originalRawReview:unknown;correction?:CorrectionTrace}> {
 const originalRawReview=structuredClone(raw);
 try{return {review:groundedReview(raw,c,d),originalRawReview}}catch(error){
  if(!(error instanceof Error)||!repairable.has(error.message))throw error;
 const request=consistencyRequest(c,d,raw,error.message);
 request.system+=' Preserve original adverse claim IDs, item indices and claim text. Clearing a factual/citation concern additionally requires current source evidence attached to that same claim; a narrative explanation alone cannot delete, rename or replace the assertion. Keep originally omitted developments omitted or uncertain unless the actual reader text demonstrably covers them; reader-history disagreements are audited separately, never clear an omission as already_reported in this correction. Do not change reader text or silently treat a missing citation as supported.';
 request.schemaPolicy='review-consistency-v2';
 request.system+=' Return concern_resolutions with EVERY originalStructuredConcernKeys key exactly once, each {decision:"retained"|"reconsidered",reason:"specific source-grounded explanation"}. retained must keep that adverse/uncertain assessment; reconsidered requires the same unchanged claim, current supporting evidence, and an explicit reason of at least 20 characters. This required structured proof replaces only the prose-prefix formatting requirement; it never replaces source support or claim-identity validation.';
 const corrected=await correct(request),before=structuredConcerns(originalRawReview),resolutions=(corrected as any)?.concern_resolutions;
 let normalized=corrected;
 if(resolutions!==undefined){
  if(!resolutions||typeof resolutions!=='object'||Array.isArray(resolutions)||Object.keys(resolutions).length!==before.size||Object.keys(resolutions).some(key=>!before.has(key)))throw Error('INVALID_CORRECTION_RESOLUTIONS');
  const limitations=[...((corrected as Review).limitations??[])];
  for(const key of before){const row=resolutions[key];if(!row||!['retained','reconsidered'].includes(row.decision)||typeof row.reason!=='string'||row.reason.trim().length<20)throw Error('INVALID_CORRECTION_RESOLUTIONS');if(row.decision==='reconsidered')limitations.push('CORRECTION_RECONSIDERED:'+key+' '+row.reason.trim());}
  normalized={...(corrected as Review),limitations};
 }
  const review=groundedReview(normalized,c,d),after=structuredConcerns(review),reconsideredConcerns=[...before].filter(key=>!after.has(key));
  if(resolutions)for(const key of before)if((resolutions[key].decision==='retained')!==after.has(key))throw Error('CORRECTION_RESOLUTION_CONTRADICTION');
  for(const key of reconsideredConcerns){
   const prefix='CORRECTION_RECONSIDERED:'+key+' ';if(!review.limitations.some(s=>s.startsWith(prefix)&&s.slice(prefix.length).trim().length>=20))throw Error('CORRECTION_CONCERN_LOST_WITHOUT_EXPLANATION');
   const claimKey=/^(factual|citation):(\d+):(.*)$/.exec(key);
   if(claimKey){
    const old=(originalRawReview as {claims?:Array<{id:string;item:number;text:string}>}).claims?.find(c=>c.id===claimKey[3]&&c.item===Number(claimKey[2]));
    const next=review.claims.find(c=>c.id===claimKey[3]&&c.item===Number(claimKey[2]));
    if(!old||!next||old.text.normalize('NFKC').replace(/\s+/g,' ').trim()!==next.text.normalize('NFKC').replace(/\s+/g,' ').trim())throw Error('CORRECTION_CLAIM_IDENTITY_LOST');
    if(!next.evidence.length)throw Error('CORRECTION_WITHOUT_CURRENT_EVIDENCE');
   }
   if(key.startsWith('coverage:')){
    const id=key.slice('coverage:'.length),next=review.coverage.find(v=>v.developmentId===id),development=d.developments.find(v=>v.id===id);
    if(next?.status!=='covered'||!development||!next.items.some(item=>review.claims.some(claim=>claim.item===item&&claim.support==='supported'&&claim.evidence.some(e=>development.evidence.some(s=>s.sourceId===e.sourceId)))))throw Error('CORRECTION_COVERAGE_WITHOUT_READER_EVIDENCE');
   }
  }
  return {review,originalRawReview,correction:{originalFailure:error.message,replacementRawReview:structuredClone(corrected),reconsideredConcerns,retainedConcerns:[...before].filter(key=>after.has(key))}};
 }
}
