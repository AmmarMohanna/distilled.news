import type {BriefingDraft,ClaimSupport,SynthesisWriterInput,VerificationClaim} from './publication';
import type {WriterFeedback} from './writer-feedback';
import {z} from 'zod';
import {faithfulFact,numbers} from './fidelity';
const wireDraft=z.object({language:z.string(),stories:z.array(z.object({storyId:z.string(),claims:z.array(z.object({text:z.string(),supportIds:z.array(z.string()).min(1).max(3),communicatedFactIds:z.array(z.string()).max(100)}).strict()).max(4)}).strict()).max(20)}).strict();
const obj=(properties:Record<string,unknown>)=>({type:'object',additionalProperties:false,required:Object.keys(properties),properties});
const strings=(values:string[],max=100)=>({type:'array',maxItems:max,items:values.length?{type:'string',enum:values}:{type:'string'}});
export function writerWire(input:SynthesisWriterInput){
 const identities=new Map<string,{candidateId:string;supports:Map<string,ClaimSupport>;facts:Map<string,string>}>();
 const stories=input.stories.map((s,i)=>{
  const storyId=`story_${i+1}`,supports=new Map<string,ClaimSupport>(),facts=new Map<string,string>();
  // Merged approved spans already cover each fact; do not offer redundant
  // per-fact copies that inflate both citations and a later repair request.
  const spans=[...(s.approvedSpans??s.approvedFacts?.flatMap(f=>f.support)??[])];
  if(!s.plan&&!spans.length)spans.push(...s.evidence.filter(e=>e.body).map(e=>({evidenceRevisionId:e.id,quote:e.body!})));
  for(const span of spans)if(![...supports.values()].some(s=>s.evidenceRevisionId===span.evidenceRevisionId&&s.quote===span.quote))supports.set(`span_${i+1}_${supports.size+1}`,span);
  for(const f of s.approvedFacts??[])facts.set(`fact_${i+1}_${facts.size+1}`,f.id);
  identities.set(storyId,{candidateId:s.candidate.id,supports,facts});
  const required=new Set(s.plan?[...s.plan.mustIncludeFactIds,...s.plan.attributionFactIds,...s.plan.certaintyFactIds,...s.plan.disagreementFactIds,...s.plan.openQuestionFactIds]:[]);
  return {storyId,treatment:s.plan?.treatment??'STANDARD',approvedFacts:s.approvedFacts?.map(f=>({factId:[...facts].find(([,id])=>id===f.id)![0],text:f.text,numericValues:[...numbers(f.text)],mustInclude:required.has(f.id),attribution:f.attribution,certainty:f.certainty,reportTime:f.reportTime,eventTime:f.eventTime,context:f.context?{text:f.context.text,field:f.context.field}:undefined,selfContained:f.selfContained,supportIds:[...supports].filter(([,ref])=>f.support.some(s=>s.evidenceRevisionId===ref.evidenceRevisionId&&ref.quote.includes(s.quote))).map(([id])=>id)})),supportSpans:[...supports].map(([supportId,span])=>({supportId,...span,publisherId:s.evidence.find(e=>e.id===span.evidenceRevisionId)?.publisherId})),previousLedgerEntries:s.plan?.previousLedgerEntries,correctionObligations:s.plan?.correctionObligations};
 });
 const storyIds=[...identities.keys()],supportIds=[...identities.values()].flatMap(x=>[...x.supports.keys()]),factIds=[...identities.values()].flatMap(x=>[...x.facts.keys()]);
 const schema=obj({language:{type:'string'},stories:{type:'array',minItems:stories.length,maxItems:stories.length,items:obj({storyId:{type:'string',enum:storyIds.length?storyIds:['NO_STORIES']},claims:{type:'array',minItems:1,maxItems:4,items:obj({text:{type:'string'},supportIds:{...strings(supportIds,3),minItems:1},communicatedFactIds:strings(factIds)})}})}});
 const payload={outputLanguage:input.feed.outputLanguage,stories};
 const decode=(raw:unknown):BriefingDraft=>{
  const draft=wireDraft.parse(raw),seen=new Set<string>();
  return {language:draft.language,stories:draft.stories.map(s=>{const identity=identities.get(s.storyId);if(!identity||seen.has(s.storyId))throw new Error('UNRECOGNIZED_WRITER_ID');seen.add(s.storyId);
   return {candidateId:identity.candidateId,claims:s.claims.map(c=>({text:c.text,support:c.supportIds.map(id=>{const span=identity.supports.get(id);if(!span)throw new Error('UNRECOGNIZED_SUPPORT_ID');return span;}),communicatedFactIds:c.communicatedFactIds.map(id=>{const fact=identity.facts.get(id);if(!fact)throw new Error('UNRECOGNIZED_FACT_ID');return fact;})}))};})};
 };
 const repair=(draft:BriefingDraft,feedback:WriterFeedback)=>{
  const failedDraft={language:draft.language,stories:draft.stories.map(s=>{
   const id=[...identities].find(([,x])=>x.candidateId===s.candidateId);
   return {storyId:id?.[0]??'UNKNOWN_STORY',claims:s.claims.map((c,i)=>({claimId:`claim_${i+1}`,text:c.text,supportIds:c.support.map(ref=>[...(id?.[1].supports??[])].find(([,s])=>s.evidenceRevisionId===ref.evidenceRevisionId&&s.quote===ref.quote)?.[0]??'INVALID_SUPPORT'),communicatedFactIds:c.communicatedFactIds?.map(f=>[...(id?.[1].facts??[])].find(([,x])=>x===f)?.[0]??'UNKNOWN_FACT')}))};
  })};
  const issues=feedback.issues.map(issue=>{
   const story=draft.stories.find(s=>s.candidateId===issue.candidateId),claim=story?.claims.findIndex(c=>c.text===issue.value)??-1;
   // A short claim reference points to the unchanged failed prose. Do not repeat
   // its full text or canonical hash in feedback on that same claim.
   return {...issue,candidateId:[...identities].find(([,x])=>x.candidateId===issue.candidateId)?.[0],claimId:claim>=0?`claim_${claim+1}`:issue.claimId?.startsWith('claim_')?issue.claimId:undefined,value:claim>=0?undefined:issue.value,factId:[...identities.values()].flatMap(x=>[...x.facts]).find(([,x])=>x===issue.factId)?.[0]};
  });
  return {input:payload,failedDraft,feedback:issues};
 };
 return {payload,schema,decode,repair};
}
/** One fact inventory and source context per story, not per claim. */
export function verificationWire(claims:VerificationClaim[]){
 const factIds=new Map<string,string>(),claimIds=new Map<string,string>();
 const fact=(id:string)=>{let alias=[...factIds].find(([,value])=>value===id)?.[0];if(!alias){alias=`fact_${factIds.size+1}`;factIds.set(alias,id);}return alias;};
 const groups=new Map<string,VerificationClaim[]>();
 for(const claim of claims){const key=claim.candidateId??claim.id;const group=groups.get(key)??[];group.push(claim);groups.set(key,group);}
 const stories=[...groups.values()].map((group,i)=>{
  const unique=<T extends {id:string}>(values:T[])=>[...new Map(values.map(v=>[v.id,v])).values()];
  const inventory=unique(group.flatMap(c=>[...(c.allowedFacts??[]),...(c.requiredFacts??[]),...(c.newUnderstandingFacts??[])]));
  return {storyId:`story_${i+1}`,claims:group.map(c=>{const id=`claim_${claimIds.size+1}`;claimIds.set(id,c.id);return {id,text:c.text,support:c.support};}),facts:inventory.map(f=>({...f,id:fact(f.id)})),requiredFactIds:[...new Set(group.flatMap(c=>(c.requiredFacts??[]).map(f=>fact(f.id))))],newUnderstandingFactIds:[...new Set(group.flatMap(c=>(c.newUnderstandingFacts??[]).map(f=>fact(f.id))))],previousLedgerFacts:[...new Set(group.flatMap(c=>c.previousLedgerFacts??[]))],correctionObligations:unique(group.flatMap(c=>c.correctionObligations??[])),context:[...new Map(group.flatMap(c=>c.context).map(c=>[c.evidenceRevisionId,c])).values()]};
 });
 const payload={stories},obligations=stories.flatMap(s=>s.correctionObligations);
 const check=z.object({factId:z.string(),communicated:z.boolean(),attribution:z.boolean(),certainty:z.boolean(),temporal:z.boolean(),qualifiers:z.boolean(),reason:z.string().max(500),readerSpans:z.array(z.object({claimId:z.string(),text:z.string().min(1)}).strict()).max(claims.length)}).strict();
 const requiredIds=[...new Set(stories.flatMap(s=>s.requiredFactIds))];
 const schema=obj({semanticChecks:{type:'array',minItems:requiredIds.length,maxItems:factIds.size,items:obj({factId:{type:'string',...(factIds.size?{enum:[...factIds.keys()]}:{})},communicated:{type:'boolean'},attribution:{type:'boolean'},certainty:{type:'boolean'},temporal:{type:'boolean'},qualifiers:{type:'boolean'},reason:{type:'string',maxLength:500},readerSpans:{type:'array',maxItems:claims.length,items:obj({claimId:{type:'string',enum:[...claimIds.keys()]},text:{type:'string',minLength:1}})}})},supportedClaimIds:strings([...claimIds.keys()],claims.length),preservedFactIds:strings([...factIds.keys()],factIds.size),novelFactIds:strings([...factIds.keys()],factIds.size),addressedCorrectionObligationIds:strings(obligations.map(o=>o.id),obligations.length)});
 const ids=(raw:unknown,key:string,map:Map<string,string>)=>z.array(z.string()).parse((raw as Record<string,unknown>)[key]??[]).map(id=>{const original=map.get(id);if(!original)throw new Error('UNRECOGNIZED_VERIFIER_ID');return original;});
 const decode=(raw:unknown)=>{
  const seen=new Set<string>(),supported=ids(raw,'supportedClaimIds',claimIds);
  const semanticChecks=z.array(check).parse((raw as Record<string,unknown>).semanticChecks??[]).map(c=>{const factId=factIds.get(c.factId);if(!factId||seen.has(factId))throw new Error('UNRECOGNIZED_VERIFIER_ID');seen.add(factId);
   let invalidWitness=false;
   const readerSpans=c.readerSpans.flatMap(span=>{const claimId=claimIds.get(span.claimId),claim=claims.find(x=>x.id===claimId);const storyFacts=claim?groups.get(claim.candidateId??claim.id)?.flatMap(c=>c.requiredFacts??[]):undefined;if(!claim||!claim.text.includes(span.text)||!storyFacts?.some(f=>f.id===factId)||!supported.includes(claim.id)){invalidWitness=true;return [];}return [{claimId:claim.id,text:span.text}];});
   // Invalid semantic evidence is a durably settled negative verdict, not an
   // uncertain provider execution. Preserve its usage and precise repair reason.
   if(invalidWitness||(c.communicated&&!readerSpans.length))return {...c,factId,communicated:false,readerSpans:[],reason:invalidWitness?'INVALID_READER_WITNESS: coverage cited source-only, wrong-story or unsupported prose.':'MISSING_READER_WITNESS: no reader prose establishes coverage.'};
   return {...c,factId,readerSpans};});
  if(requiredIds.some(id=>!seen.has(factIds.get(id)!)))throw new Error('INCOMPLETE_SEMANTIC_VERDICT');
  return {supportedClaimIds:ids(raw,'supportedClaimIds',claimIds),preservedFactIds:ids(raw,'preservedFactIds',factIds).filter(id=>semanticChecks.some(c=>c.factId===id&&faithfulFact(c))),semanticChecks,novelFactIds:ids(raw,'novelFactIds',factIds),addressedCorrectionObligationIds:z.array(z.string()).parse((raw as Record<string,unknown>).addressedCorrectionObligationIds??[]).map(id=>{if(!obligations.some(o=>o.id===id))throw new Error('UNRECOGNIZED_VERIFIER_ID');return id;})};
 };
 return {payload,schema,decode};
}
