import {HandoffError} from '@distilled/contracts';
import {checkReaderFidelity} from './fidelity';
import type {BriefingDraft,SynthesisInput} from './publication';

export interface WriterIssue {code:string;candidateId?:string;claimId?:string;factId?:string;value?:string}
export interface WriterFeedback {id:string;feedId:string;selectionId:string;draftId:string;editorialPlanId?:string;issues:WriterIssue[];missingFactIds:string[];createdAt:string}
export class DraftVerificationError extends HandoffError {
 constructor(readonly feedback:WriterFeedback){super('INVALID_REQUEST');}
}
/** Quotation delimiters are semantic: plain reported speech is not a direct quote.
 * Apostrophes inside words are not delimiters. Preserve both text and delimiters
 * exactly, including typographic variants; unknown/unbalanced forms fail closed.
 */
export function invalidDirectQuotes(text:string,approvedSpans:string[]):string[] {
 const pairs:Record<string,string>={'"':'"','“':'”','‘':'’',"'":"'",'«':'»','„':'“','「':'」','『':'』'};
 const failures:string[]=[];
 for(let i=0;i<text.length;i++){
  const ch=text[i],close=pairs[ch];
  if((ch==="'"||ch==='‘')&&/[\p{L}\p{N}]/u.test(text[i-1]??''))continue;
  if(!close){if(['”','’','»','」','』'].includes(ch)&&!(ch==='’'&&/[\p{L}\p{N}]/u.test(text[i-1]??'')&&/[\p{L}\p{N}]/u.test(text[i+1]??'')))failures.push(ch);continue;}
  const end=text.indexOf(close,i+1);if(end<0){failures.push(text.slice(i));break;}
  const fragment=text.slice(i,end+1);
  if(!approvedSpans.some(span=>span.includes(fragment)))failures.push(fragment);
  i=end;
 }
 return failures;
}
export function inspectWriterDraft(input:SynthesisInput,draft:BriefingDraft,allowedSpans:(story:SynthesisInput['stories'][number])=>{evidenceRevisionId:string;quote:string}[],semanticPending=false):WriterIssue[] {
 const issues:WriterIssue[]=[],seen=new Set<string>();
 for(const offered of draft.stories){
  const story=input.stories.find(s=>s.candidate.id===offered.candidateId);
  if(!story||seen.has(offered.candidateId)){issues.push({code:'UNKNOWN_OR_DUPLICATE_STORY',candidateId:offered.candidateId});continue;}
  seen.add(offered.candidateId);const spans=allowedSpans(story),facts=story.plan?.facts??[],requiredIds=new Set(story.plan?[...story.plan.mustIncludeFactIds,...story.plan.attributionFactIds,...story.plan.certaintyFactIds,...story.plan.disagreementFactIds,...story.plan.openQuestionFactIds]:[]);

  for(const [index,claim]of offered.claims.entries()){
   const claimId=`claim_${index+1}`;
   for(const ref of claim.support)if(!spans.some(s=>s.evidenceRevisionId===ref.evidenceRevisionId&&s.quote.includes(ref.quote)))issues.push({code:'INVALID_SUPPORT_QUOTE',candidateId:offered.candidateId,claimId,value:ref.quote});
   for(const quote of invalidDirectQuotes(claim.text,spans.map(s=>s.quote)))issues.push({code:'INVALID_DIRECT_QUOTE',candidateId:offered.candidateId,claimId,value:quote});
   const urls=(text:string)=>(text.match(/https?:\/\/[^\s<>"“”]+/gu)??[]).map(url=>url.replace(/[.,;!?)]*$/u,''));
   const approvedUrls=new Set(spans.flatMap(s=>urls(s.quote)));
   for(const url of urls(claim.text))if(!approvedUrls.has(url))issues.push({code:'UNAPPROVED_URL',candidateId:offered.candidateId,claimId,value:url});
   if(claim.communicatedFactIds){for(const id of claim.communicatedFactIds){if(!facts.some(f=>f.id===id))issues.push({code:'UNAPPROVED_FACT_ID',candidateId:offered.candidateId,claimId,factId:id});}}
  }
  // Missing declarations alone never establish an omitted proposition. The
  // semantic verifier judges reader prose, regardless of writer bookkeeping.
  if(story.plan){const fidelity=checkReaderFidelity(offered.claims.map(c=>c.text),facts.filter(f=>requiredIds.has(f.id)),facts,input.feed.outputLanguage==='en'&&story.evidence.every(e=>e.language==='en'),semanticPending?{pending:true}:undefined);for(const failure of fidelity.failures){issues.push({...failure,candidateId:offered.candidateId});if(failure.code==='LOST_QUANTITY'&&failure.factId)issues.push({code:'MISSING_REQUIRED_FACT',candidateId:offered.candidateId,factId:failure.factId});}}
 }
 for(const story of input.stories)if(!seen.has(story.candidate.id))issues.push({code:'MISSING_STORY',candidateId:story.candidate.id});
 return issues;
}
