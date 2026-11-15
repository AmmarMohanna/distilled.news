import {groundedReviewRequest}from'../worker/src/grounding';
import type{Case,Inventory,Request}from'../worker/src/protocol';
import{consistentReview}from'./review-consistency';
import{languageCompliance,combinedLanguageStatus}from'./language-compliance';
export const CANDIDATE_POLICY='independent-language-structured-consistency-v2';
export function candidateReviewRequest(c:Case,d:Inventory):Request {
 const r=groundedReviewRequest(c,d);
 return {...r,system:r.system+'\nOUTPUT LANGUAGE COMPLIANCE: The requested narration language is '+c.language+'. This is independent of the source language and the language used in this evaluation response. Assess headline and narration against that requested language. Proper names and legitimate attributed foreign quotations are allowed. For ambiguous short/name-only text use uncertain, not correct or incorrect. A wrong calendar date may be both a factual and temporal error; do not call the date correct merely because future tense is appropriate.'};
}
/** Candidate policy runs offline only. Original model judgments remain intact. */
export async function candidateAssessment(c:Case,d:Inventory,raw:unknown,correct:(request:Request)=>Promise<unknown>){
 const assessed=await consistentReview(c,d,raw,correct);
 const language=assessed.review.items.map(row=>{const i=c.items[row.item],independent=languageCompliance(i.headline,i.body,c.language);return {item:row.item,model:row.language,independent,combined:combinedLanguageStatus(row.language,independent)}});
 return {policy:CANDIDATE_POLICY,originalRawModelAssessment:assessed.originalRawReview,validatedModelAssessment:assessed.review,correction:assessed.correction,language,languageOutcome:{incorrect:language.filter(i=>i.combined==='incorrect').length,uncertain:language.filter(i=>i.combined==='uncertain').length,correct:language.filter(i=>i.combined==='correct').length},calibration:'not_independently_established',deployment:'not_deployed'};
}
