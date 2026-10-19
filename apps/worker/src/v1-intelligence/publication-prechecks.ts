import type {BriefingDraft,SynthesisInput} from './publication';
import {inspectWriterDraft,type WriterIssue} from './writer-feedback';
import type {EditorialContract} from './editorial-requirements';
const pairs:Record<string,string>={'"':'"','“':'”',"'":"'",'‘':'’','«':'»','„':'“','「':'」','『':'』'};
const word=(s:string|undefined)=>Boolean(s&&/[\p{L}\p{N}]/u.test(s));
function quoted(text:string):{fragments:string[];ambiguous:boolean}{
 const fragments:string[]=[];
 for(let i=0;i<text.length;i++){
  const ch=text[i];if((ch==="'"||ch==='’'||ch==='‘')&&word(text[i-1]))continue;
  const close=pairs[ch];if(!close){if(['”','’','»','」','』'].includes(ch))return {fragments,ambiguous:true};continue;}
  const end=text.indexOf(close,i+1);if(end<0)return {fragments,ambiguous:true};
  const body=text.slice(i+1,end);
  // Do not guess quote nesting or normalize internal Unicode/punctuation.
  if(!body.trim()||[...body].some((c,j)=>(pairs[c]||['”','’','»'].includes(c))&&!(word(body[j-1])&&word(body[j+1]))))return {fragments,ambiguous:true};
  fragments.push(body);i=end;
 }
 return {fragments,ambiguous:false};
}
export function compareDirectQuotations(text:string,approvedSpans:string[]):{status:'MATCH'|'MISMATCH'|'UNRESOLVED';values:string[]}{
 const reader=quoted(text);if(reader.ambiguous)return {status:'UNRESOLVED',values:[text]};
 if(!reader.fragments.length)return {status:'MATCH',values:[]};
 const sources=approvedSpans.map(quoted),presentation=(s:string)=>s.replace(/[.,]$/u,'');
 const missing=reader.fragments.filter(r=>!sources.some(s=>s.fragments.some(q=>q===r||presentation(q)===presentation(r))));
 return {status:missing.length?(sources.some(s=>s.ambiguous)?'UNRESOLVED':'MISMATCH'):'MATCH',values:missing};
}
/** A route to existing reservation-gated verification, never factual approval.
 * semanticPathAvailable means a compatible saved result or the existing
 * reservation-required verifier path, NOT a balance snapshot or model name. */
export function assessWriterDraft(input:SynthesisInput,draft:BriefingDraft,allowedSpans:Parameters<typeof inspectWriterDraft>[2],contract:EditorialContract,semanticPathAvailable:boolean){
 const legacy=inspectWriterDraft(input,draft,allowedSpans,contract==='EVIDENCE_GROUNDED_V2'||semanticPathAvailable,contract==='EVIDENCE_GROUNDED_V2');
 if(contract==='LEGACY')return {blockingIssues:legacy,factualWarnings:[] as WriterIssue[],requiresSemantic:false,decision:legacy.length?'HARD_REJECT' as const:'LEGACY' as const};
 const factualWarnings:WriterIssue[]=[],blockingIssues=legacy;let ambiguous=false;
 for(const offered of draft.stories){const story=input.stories.find(s=>s.candidate.id===offered.candidateId);if(!story)continue;
  for(const [index,claim]of offered.claims.entries()){const compared=compareDirectQuotations(claim.text,allowedSpans(story).map(s=>s.quote));
   if(compared.status!=='MATCH'){ambiguous||=compared.status==='UNRESOLVED';blockingIssues.push({code:compared.status==='UNRESOLVED'?'UNRESOLVED_DIRECT_QUOTE':'INVALID_DIRECT_QUOTE',candidateId:offered.candidateId,claimId:`claim_${index+1}`,value:compared.values[0]});}
  }
 }
 return {blockingIssues,factualWarnings,requiresSemantic:true,decision:ambiguous||!semanticPathAvailable?'UNRESOLVED' as const:blockingIssues.length?'HARD_REJECT' as const:'NEEDS_SEMANTIC' as const};
}
