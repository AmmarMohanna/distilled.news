import type {BriefingDraft,ClaimSupport,SynthesisWriterInput,VerificationClaim} from './publication';
import type {WriterFeedback} from './writer-feedback';
import {z} from 'zod';
import {faithfulFact,numbers} from './fidelity';
const wireDraft=z.object({language:z.string(),stories:z.array(z.object({storyId:z.string(),correctionAcknowledgment:z.string().nullable().optional(),claims:z.array(z.object({text:z.string(),supportIds:z.array(z.string()).min(1).max(3),communicatedFactIds:z.array(z.string()).max(100)}).strict()).max(4)}).strict()).max(20)}).strict();
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
  return {storyId,temporalTask:s.approvedFacts?.some(f=>f.timing?.framingRequired)?'Explicitly frame this as older SOURCE REPORTING, such as an earlier source report shows. A prior Distilled briefing is reader history and does not communicate source-report age. Do not imply recent release; publication date does not date the incident.':undefined,treatment:s.plan?.treatment??'STANDARD',deltaType:s.plan?.deltaType,correctionTask:s.plan?.correctionObligations?.length?'Briefly acknowledge that a prior Distilled briefing was withdrawn, then communicate the supported facts ONCE. Do not restate the withdrawn prose or repeat the fact around the acknowledgment. Do not mention policy requirements or add a source-retraction caveat unless the prior claim actually asserted one. Ordinary news paraphrase alone is not corrective delivery.':undefined,approvedFacts:s.approvedFacts?.map(f=>({factId:[...facts].find(([,id])=>id===f.id)![0],text:f.text,numericValues:[...numbers(f.text)],mustInclude:required.has(f.id),attribution:f.attribution,certainty:f.certainty,reportTime:f.reportTime,eventTime:f.eventTime,timing:f.timing,context:f.context?{text:f.context.text,field:f.context.field}:undefined,selfContained:f.selfContained,supportIds:[...supports].filter(([,ref])=>f.support.some(s=>s.evidenceRevisionId===ref.evidenceRevisionId&&ref.quote.includes(s.quote))).map(([id])=>id)})),supportSpans:[...supports].map(([supportId,span])=>({supportId,...span,publisherId:s.evidence.find(e=>e.id===span.evidenceRevisionId)?.publisherId})),previousLedgerEntries:s.plan?.previousLedgerEntries?.filter(e=>!s.plan?.correctionObligations?.length||s.plan.correctionObligations.some(o=>o.ledgerEntryId===e.id)).map(e=>({claimText:e.claimText,claimFacts:s.plan?.correctionObligations?.length?undefined:e.claimFacts})),correctionObligations:s.plan?.correctionObligations?.map(o=>({kind:o.kind,publicationWithdrawal:o.publicationWithdrawal?true:undefined}))};
 });
 const storyIds=[...identities.keys()],supportIds=[...identities.values()].flatMap(x=>[...x.supports.keys()]),factIds=[...identities.values()].flatMap(x=>[...x.facts.keys()]);
 const schema=obj({language:{type:'string'},stories:{type:'array',minItems:stories.length,maxItems:stories.length,items:obj({storyId:{type:'string',enum:storyIds.length?storyIds:['NO_STORIES']},claims:{type:'array',minItems:1,maxItems:4,items:obj({text:{type:'string'},supportIds:{...strings(supportIds,3),minItems:1},communicatedFactIds:strings(factIds)})}})}});
 const payload={outputLanguage:input.feed.outputLanguage,window:input.window,stories};
 const writerStorySchema=(schema.properties.stories as {items:{properties:Record<string,unknown>;required:string[]}}).items;
 writerStorySchema.properties.correctionAcknowledgment={type:['string','null']};
 writerStorySchema.required.push('correctionAcknowledgment');
 const decode=(raw:unknown):BriefingDraft=>{
  const draft=wireDraft.parse(raw),seen=new Set<string>();
  return {language:draft.language,stories:draft.stories.map(s=>{const identity=identities.get(s.storyId);if(!identity||seen.has(s.storyId))throw new Error('UNRECOGNIZED_WRITER_ID');seen.add(s.storyId);
   if(s.correctionAcknowledgment&&!input.stories.find(story=>story.candidate.id===identity.candidateId)?.plan?.correctionObligations?.length)throw new Error('UNEXPECTED_CORRECTION_ACKNOWLEDGMENT');
   return {candidateId:identity.candidateId,claims:s.claims.map((c,i)=>({text:i===0&&s.correctionAcknowledgment?`${s.correctionAcknowledgment.trim()} ${c.text}`:c.text,support:c.supportIds.map(id=>{const span=identity.supports.get(id);if(!span)throw new Error('UNRECOGNIZED_SUPPORT_ID');return span;}),communicatedFactIds:c.communicatedFactIds.map(id=>{const fact=identity.facts.get(id);if(!fact)throw new Error('UNRECOGNIZED_FACT_ID');return fact;})}))};})};
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
 const factIds=new Map<string,string>(),claimIds=new Map<string,string>(),obligationIds=new Map<string,string>(),historyIds=new Map<string,string>();
 const alias=(map:Map<string,string>,id:string,prefix:string)=>{let key=[...map].find(([,original])=>original===id)?.[0];if(!key){key=`${prefix}_${map.size+1}`;map.set(key,id);}return key;};
 const fact=(id:string)=>{let alias=[...factIds].find(([,value])=>value===id)?.[0];if(!alias){alias=`fact_${factIds.size+1}`;factIds.set(alias,id);}return alias;};
 const groups=new Map<string,VerificationClaim[]>();
 for(const claim of claims){const key=claim.candidateId??claim.id;const group=groups.get(key)??[];group.push(claim);groups.set(key,group);}
 const stories=[...groups.values()].map((group,i)=>{
  const unique=<T extends {id:string}>(values:T[])=>[...new Map(values.map(v=>[v.id,v])).values()];
  const spans=(values:VerificationClaim['support'])=>[...new Set(values.map(s=>s.quote))].map(quote=>({quote,evidenceRevisionIds:[...new Set(values.filter(s=>s.quote===quote).map(s=>s.evidenceRevisionId))]}));
  const contexts=new Map<string,VerificationClaim['context']>();
  for(const c of group.flatMap(c=>c.context)){const key=JSON.stringify([c.text,c.title,c.publisherId,c.truncated]);contexts.set(key,[...(contexts.get(key)??[]),c]);}
  const inventory=unique(group.flatMap(c=>[...(c.allowedFacts??[]),...(c.requiredFacts??[]),...(c.newUnderstandingFacts??[])]));
  return {storyId:`story_${i+1}`,claims:group.map(c=>{const id=`claim_${claimIds.size+1}`;claimIds.set(id,c.id);return {id,text:c.text,support:spans(c.support)};}),facts:inventory.map(f=>({...f,id:fact(f.id)})),requiredFactIds:[...new Set(group.flatMap(c=>(c.requiredFacts??[]).map(f=>fact(f.id))))],newUnderstandingFactIds:[...new Set(group.flatMap(c=>(c.newUnderstandingFacts??[]).map(f=>fact(f.id))))],previousLedgerFacts:[...new Set(group.flatMap(c=>c.previousLedgerFacts??[]))],previousReaderClaims:unique(group.flatMap(c=>c.previousReaderClaims??[])).map(e=>({id:alias(historyIds,e.id,'prior'),claimText:e.claimText})),correctionObligations:unique(group.flatMap(c=>c.correctionObligations??[])).map(o=>({id:alias(obligationIds,o.id,'correction'),kind:o.kind,ledgerEntryId:alias(historyIds,o.ledgerEntryId,'prior'),publicationWithdrawal:o.publicationWithdrawal})),context:[...contexts.values()].map(values=>({evidenceRevisionIds:[...new Set(values.map(c=>c.evidenceRevisionId))],title:values[0].title,publisherId:values[0].publisherId,text:values[0].text,truncated:values[0].truncated}))};
 });
 // Evidence identities are request-local provenance handles. Keep every support
 // relationship while avoiding repeated storage UUIDs in bounded model input.
 const evidenceIds=new Map<string,string>();
 const evidence=(id:string)=>alias(evidenceIds,id,'evidence');
 const compact=(value:unknown,key=''):unknown=>{
  if(key==='evidenceRevisionId'&&typeof value==='string')return evidence(value);
  if(key==='evidenceRevisionIds'&&Array.isArray(value))return value.map(id=>evidence(String(id)));
  if(key==='publicationWithdrawal'&&value)return true;
  if(Array.isArray(value))return value.map(v=>compact(v));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,compact(v,k)]));
  return value;
 };
 const payload={stories:compact(stories) as typeof stories},obligations=stories.flatMap(s=>s.correctionObligations);
 const check=z.object({factId:z.string(),communicated:z.boolean(),attribution:z.boolean(),certainty:z.boolean(),temporal:z.boolean(),qualifiers:z.boolean(),nonRepetitive:z.boolean().optional(),reason:z.string().max(500),readerSpans:z.array(z.object({claimId:z.string(),text:z.string().min(1).optional()}).strict()).max(claims.length)}).strict();
 const requiredIds=[...new Set(stories.flatMap(s=>s.requiredFactIds))];
 const schema=obj({semanticChecks:{type:'array',minItems:requiredIds.length,maxItems:factIds.size,items:obj({factId:{type:'string',...(factIds.size?{enum:[...factIds.keys()]}:{})},communicated:{type:'boolean'},nonRepetitive:{type:'boolean'},attribution:{type:'boolean'},certainty:{type:'boolean'},temporal:{type:'boolean'},qualifiers:{type:'boolean'},reason:{type:'string',maxLength:500},readerSpans:{type:'array',maxItems:claims.length,items:obj({claimId:{type:'string',enum:[...claimIds.keys()]},text:{type:'string',minLength:1}})}})},supportedClaimIds:strings([...claimIds.keys()],claims.length),preservedFactIds:strings([...factIds.keys()],factIds.size),novelFactIds:strings([...factIds.keys()],factIds.size),addressedCorrectionObligationIds:strings(obligations.map(o=>o.id),obligations.length)});
 // Reader witnesses identify actual prose without duplicating it in the schema
 // or asking the model to retype source quotes. Persist resolved exact text.
 const semanticSchema=schema.properties.semanticChecks as {items:{properties:{readerSpans:Record<string,unknown>}}};
 semanticSchema.items.properties.readerSpans.items=obj({claimId:{type:'string',enum:[...claimIds.keys()]}});
 const checkProperties=semanticSchema.items.properties as Record<string,unknown>,preservedNames={attribution:'attributionPreserved',certainty:'certaintyPreserved',temporal:'temporalFaithful',qualifiers:'qualifiersPreserved'};
 for(const [old,name] of Object.entries(preservedNames)){checkProperties[name]=checkProperties[old];delete checkProperties[old];}
 (semanticSchema.items as unknown as {required:string[]}).required=(semanticSchema.items as unknown as {required:string[]}).required.map(k=>preservedNames[k as keyof typeof preservedNames]??k);
 const ids=(raw:unknown,key:string,map:Map<string,string>)=>z.array(z.string()).parse((raw as Record<string,unknown>)[key]??[]).map(id=>{const original=map.get(id);if(!original)throw new Error('UNRECOGNIZED_VERIFIER_ID');return original;});
 const decode=(raw:unknown)=>{
  const seen=new Set<string>(),supported=ids(raw,'supportedClaimIds',claimIds);
  const offered=z.array(z.record(z.string(),z.unknown())).parse((raw as Record<string,unknown>).semanticChecks??[]).map(c=>{const value={...c};for(const [old,name] of Object.entries(preservedNames))if(name in value){if(old in value)throw new Error('AMBIGUOUS_VERIFIER_FACET');value[old]=value[name];delete value[name];}return value;});
  const semanticChecks=z.array(check).parse(offered).map(c=>{const factId=factIds.get(c.factId);if(!factId||seen.has(factId))throw new Error('UNRECOGNIZED_VERIFIER_ID');seen.add(factId);
   let invalidWitness=false;
   const readerSpans=c.readerSpans.flatMap(span=>{const claimId=claimIds.get(span.claimId),claim=claims.find(x=>x.id===claimId);const storyFacts=claim?groups.get(claim.candidateId??claim.id)?.flatMap(c=>c.requiredFacts??[]):undefined,text=span.text??claim?.text;if(!claim||!text||!claim.text.includes(text)||!storyFacts?.some(f=>f.id===factId)||!supported.includes(claim.id)){invalidWitness=true;return [];}return [{claimId:claim.id,text}];});
   // Invalid semantic evidence is a durably settled negative verdict, not an
   // uncertain provider execution. Preserve its usage and precise repair reason.
   if(invalidWitness||(c.communicated&&!readerSpans.length))return {...c,factId,communicated:false,readerSpans:[],reason:invalidWitness?'INVALID_READER_WITNESS: coverage cited source-only, wrong-story or unsupported prose.':'MISSING_READER_WITNESS: no reader prose establishes coverage.'};
   return {...c,factId,readerSpans};});
  if(requiredIds.some(id=>!seen.has(factIds.get(id)!)))throw new Error('INCOMPLETE_SEMANTIC_VERDICT');
  return {supportedClaimIds:ids(raw,'supportedClaimIds',claimIds),preservedFactIds:ids(raw,'preservedFactIds',factIds).filter(id=>semanticChecks.some(c=>c.factId===id&&faithfulFact(c))),semanticChecks,novelFactIds:ids(raw,'novelFactIds',factIds),addressedCorrectionObligationIds:ids(raw,'addressedCorrectionObligationIds',obligationIds)};
 };
 return {payload,schema,decode};
}
