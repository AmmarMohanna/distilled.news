import {sha256} from '../packages/contracts/src/index';import {canonicalJson} from '../apps/worker/src/v1-intake/canonical';
export async function comparisonDraftQuestions(input:any,draft:any){
 const questions:any[]=[];for(const story of draft.stories){const source=input.stories.find((s:any)=>s.candidate.id===story.candidateId),required=source?.approvedFacts.filter((f:any)=>source.plan.mustIncludeFactIds.includes(f.id));if(!source)throw Error('DRAFT_SOURCE_OWNER_MISSING');
 for(const c of story.claims)questions.push({id:await sha256(canonicalJson({candidate:story.candidateId,claim:c})),candidateId:story.candidateId,text:c.text,support:c.support,context:source.evidence.map((e:any)=>({evidenceRevisionId:e.id,title:e.title,text:e.body,publisherId:'techcrunch.com'})),requiredFacts:required,allowedFacts:source.approvedFacts,newUnderstandingFacts:required,previousLedgerFacts:[],previousReaderClaims:[],correctionObligations:[]});}
 return questions;
}
