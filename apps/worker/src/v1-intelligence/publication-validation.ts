import {z} from 'zod';
import {canonicalJson} from '../v1-intake/canonical';
import {exactReaderWitness,faithfulFact} from './fidelity';
import type {VerificationClaim} from './publication';
import {mergeVerification,type VerificationOutcome} from './verification-packets';
const str=z.string().min(1);
const manifestSchema=z.object({contract:z.literal('EVIDENCE_GROUNDED_V2'),feedId:str,feedRevision:z.number().int().nonnegative(),evidenceHash:str,selectionHash:str,draftHash:str,questionHash:str,promptVersion:str,packetSchemaVersion:str,semanticPolicy:z.literal('semantic-publication-v2'),editorialContractVersion:z.literal('editorial-requirements-v2'),model:str,provider:str,providerRoute:str,outputLanguage:str}).strict();
export type VerificationManifest=z.infer<typeof manifestSchema>;
export interface PaidVerificationLink {operationId:string;receiptOperationId:string;reservationId:string;intentToken:string;settlementToken:string;resultHash:string}
export function verificationCompatibility(saved:unknown,current:VerificationManifest,authoritativeResultHash:string):boolean{
 const shape=z.object({manifest:manifestSchema,paid:z.object({operationId:str,receiptOperationId:str,reservationId:str,intentToken:str,settlementToken:str,resultHash:str}).strict()}).strict().safeParse(saved),requested=manifestSchema.safeParse(current);
 if(!shape.success||!requested.success)return false;
 const {manifest,paid}=shape.data;
 return canonicalJson(manifest)===canonicalJson(requested.data)&&paid.intentToken===paid.settlementToken&&paid.operationId===paid.receiptOperationId&&paid.reservationId==='semantic_intents:'+paid.operationId&&paid.resultHash===authoritativeResultHash;
}
export interface ValidationDecision {status:'ACCEPT'|'REJECT'|'UNRESOLVED';reasons:string[];readerSpans:{propositionId:string;candidateId:string;claimId:string;text:string;start?:number;end?:number}[]}
/** Semantic half of the v2 gate. Exact provenance, current authorization and
 * canonical CAS fencing remain separate mandatory publication gates. */
export function decidePublicationValidation(claims:VerificationClaim[],result:VerificationOutcome|undefined):ValidationDecision{
 const reasons=new Set<string>(),readerSpans:ValidationDecision['readerSpans']=[];let negative=false,unknown=false,conflict=false;
 const unresolved=(reason:string)=>{unknown=true;reasons.add(reason);};
 if(!result||!claims.length)return {status:'UNRESOLVED',reasons:['SEMANTIC_VERDICT_UNAVAILABLE'],readerSpans};
 if(new Set(claims.map(c=>c.id)).size!==claims.length)unresolved('DUPLICATE_CLAIM_ID');
 const entailment=result.claimEntailment??[],checks=result.semanticChecks??[];
 const factOwners=new Map<string,Set<string>>();
 for(const claim of claims)for(const f of [...(claim.requiredFacts??[]),...(claim.allowedFacts??[])]){const owners=factOwners.get(f.id)??new Set<string>();owners.add(claim.candidateId??claim.id);factOwners.set(f.id,owners)}
 // Decoder-derived alias ownership, never a model-supplied semantic flag.
 // Direct ports can use scalar summaries only when ownership is unambiguous.
 const summarized=(c:typeof checks[number]):boolean|undefined=>{
  if(c.preservedInSummary!==undefined)return typeof c.preservedInSummary==='boolean'?c.preservedInSummary:undefined;
  if(!result.preservedFactIds?.includes(c.factId))return false;
  return factOwners.get(c.factId)?.size===1?true:undefined;
 };
 for(const c of checks)if(c.preservedInSummary!==undefined&&(typeof c.preservedInSummary!=='boolean'||c.preservedInSummary&&!result.preservedFactIds?.includes(c.factId)))unresolved('FACT_VERDICT_CONFLICT');
 // Positive preservation summaries are assertions too. Keep contradictions
 // visible, including optional facts: never sanitize them into a repairable
 // negative or let an omitted optional fact appear positively delivered.
 for(const factId of result.preservedFactIds??[]){
  const matching=checks.filter(c=>c.factId===factId),declared=matching.filter(c=>summarized(c)===true);
  if(!declared.length||matching.some(c=>summarized(c)===undefined)||declared.some(c=>!faithfulFact(c)||c.sourceSupported!==true||c.readerEntailsProposition!==true))unresolved('FACT_VERDICT_CONFLICT');
 }
 // Novelty is a semantic decision too. Missing/uncertain judgment must not
 // become a later NO_SUPPORTED_DELTA rejection that purchases a writer repair.
 const novelty=new Map<string,{owner:string;factId:string}>();
 for(const claim of claims)for(const fact of claim.newUnderstandingFacts??[]){const owner=claim.candidateId??claim.id;novelty.set(JSON.stringify([owner,fact.id]),{owner,factId:fact.id});}
 for(const {owner,factId} of novelty.values()){
  const matching=checks.filter(c=>c.candidateId===owner&&c.factId===factId),verdict=matching[0]?.readerNovelty;
  const owned=claims.filter(c=>(c.candidateId??c.id)===owner),required=owned.some(c=>c.requiredFacts?.some(f=>f.id===factId));
  // An omitted optional proposition needs no coverage verdict if this story
  // already has affirmative novelty or correction delivery. It cannot stand
  // in for the missing affirmative judgment needed to authorize publication.
  if(!matching.length&&!required){
   const deliveredNovelty=checks.some(c=>c.candidateId===owner&&c.readerNovelty?.status==='NEW'&&faithfulFact(c)&&owned.some(claim=>claim.newUnderstandingFacts?.some(f=>f.id===c.factId)));
   const obligations=owned.flatMap(c=>c.correctionObligations??[]),deliveredCorrection=obligations.length>0&&obligations.every(o=>result.addressedCorrectionObligationIds?.includes(o.id));
   if(deliveredNovelty||deliveredCorrection)continue;
  }
  if(matching.length!==1||!verdict||!['NEW','ALREADY_COMMUNICATED','NOT_COMMUNICATED'].includes(verdict.status)||!verdict.reason?.trim()||!Array.isArray(verdict.previousFactTexts))unresolved('INCOMPLETE_NOVELTY_VERDICT');
 }
 for(const check of checks)if(/^(?:INVALID|MISSING)_READER_WITNESS:/.test(check.reason))unresolved('INVALID_READER_WITNESS');
 if(new Set(entailment.map(c=>c.claimId)).size!==entailment.length||entailment.some(c=>!claims.some(v=>v.id===c.claimId)))unresolved('SEMANTIC_CLAIM_SCOPE');
 for(const c of claims){
  const whole=entailment.find(v=>v.claimId===c.id);
  if(!whole||typeof whole.fullyEntailed!=='boolean'||!Array.isArray(whole.unsupportedMeaning)){unresolved('INCOMPLETE_CLAIM_VERDICT');continue;}
  if(!whole.fullyEntailed||whole.unsupportedMeaning.length){negative=true;reasons.add('CLAIM_NOT_ENTAILED');if(result.supportedClaimIds.includes(c.id))unresolved('CLAIM_VERDICT_CONFLICT');}
  else if(!result.supportedClaimIds.includes(c.id))unresolved('CLAIM_VERDICT_CONFLICT');
 }
 const required=new Map<string,{owner:string;factId:string}>();
 for(const claim of claims)for(const f of claim.requiredFacts??[]){const owner=claim.candidateId??claim.id;required.set(JSON.stringify([owner,f.id]),{owner,factId:f.id});}
 for(const {owner,factId}of required.values()){
  const matching=checks.filter(c=>c.candidateId===owner&&c.factId===factId);
  if(matching.length!==1){unresolved('INCOMPLETE_FACT_VERDICT');continue;}
  const check=matching[0],spans=check.readerSpans??[],owned=claims.filter(c=>(c.candidateId??c.id)===owner);
  if([check.sourceSupported,check.readerEntailsProposition,check.communicated,check.attribution,check.certainty,check.temporal,check.qualifiers].some(v=>typeof v!=='boolean')){unresolved('INVALID_FACT_VERDICT');continue;}
  const witnesses=spans.length>0&&spans.every(w=>exactReaderWitness(w,owned));
  if(check.communicated&&!witnesses){unresolved('INVALID_READER_WITNESS');continue;}
  const positive=faithfulFact(check)&&check.sourceSupported===true&&check.readerEntailsProposition===true;
  if(!positive){negative=true;reasons.add(check.communicated?'FACT_FACET_FAILED':'MISSING_MANDATORY_COVERAGE');}
  if(summarized(check)===undefined||positive!==summarized(check))unresolved('FACT_VERDICT_CONFLICT');
  for(const span of spans){
   const whole=entailment.find(v=>v.claimId===span.claimId),wholePositive=whole?.fullyEntailed===true&&whole.unsupportedMeaning.length===0;
   if(whole&&wholePositive!==positive){conflict=true;reasons.add('SEMANTIC_VERDICT_CONFLICT');}
   if(witnesses&&positive)readerSpans.push({propositionId:factId,candidateId:owner,...span});
  }
 }
 // Optional omission is permitted. A provided adverse facet about optional
 // meaning actually communicated still participates in the combined judgment.
 for(const check of checks.filter(c=>c.communicated&&!required.has(JSON.stringify([c.candidateId,c.factId])))){
  const spans=check.readerSpans??[],owned=claims.filter(c=>(c.candidateId??c.id)===check.candidateId);
  if(!spans.length||spans.some(w=>!exactReaderWitness(w,owned))){unresolved('INVALID_READER_WITNESS');continue;}
  if(typeof check.sourceSupported!=='boolean'||typeof check.readerEntailsProposition!=='boolean'){unresolved('INVALID_FACT_VERDICT');continue;}
  const positive=faithfulFact(check)&&check.sourceSupported&&check.readerEntailsProposition;
  if(!positive){negative=true;reasons.add('OPTIONAL_FACT_FACET_FAILED');}
  for(const span of spans){const whole=entailment.find(v=>v.claimId===span.claimId);if(whole&&(whole.fullyEntailed&&whole.unsupportedMeaning.length===0)!==positive){conflict=true;reasons.add('SEMANTIC_VERDICT_CONFLICT');}}
 }
 if(checks.some(c=>!claims.some(claim=>(claim.candidateId??claim.id)===c.candidateId&&[...(claim.requiredFacts??[]),...(claim.allowedFacts??[])].some(f=>f.id===c.factId))))unresolved('SEMANTIC_FACT_SCOPE');
 return {status:conflict||unknown?'UNRESOLVED':negative?'REJECT':'ACCEPT',reasons:[...reasons],readerSpans};
}
/** Every packet must be complete independently. Overlapping positive packets
 * cannot fill holes or erase a conflict in another paid response. */
export function decidePublicationPackets(claims:VerificationClaim[],packets:{claims:VerificationClaim[];result:VerificationOutcome}[]){
 const packetDecisions=packets.map(p=>decidePublicationValidation(p.claims,p.result)),merged=mergeVerification(packets,false),decision=decidePublicationValidation(claims,merged);
 // Same reader occurrence cannot be both affirmed and denied by different
 // compatible packets. Keep that conflict out of the paid repair path too.
 if(packets.length>1){
  const judgments=new Map<string,Set<boolean>>();
  const add=(key:string,value:boolean)=>{const values=judgments.get(key)??new Set<boolean>();values.add(value);judgments.set(key,values);};
  for(const packet of packets){
   for(const c of packet.result.claimEntailment??[])add(JSON.stringify(['claim',c.claimId]),c.fullyEntailed===true&&Array.isArray(c.unsupportedMeaning)&&c.unsupportedMeaning.length===0);
   for(const c of packet.result.semanticChecks??[])add(JSON.stringify(['fact',c.candidateId,c.factId]),Boolean(faithfulFact(c)&&c.sourceSupported===true&&c.readerEntailsProposition===true));
  }
  if([...judgments.values()].some(values=>values.size>1)){decision.status='UNRESOLVED';decision.reasons=[...new Set([...decision.reasons,'SEMANTIC_PACKET_CONFLICT'])];}
 }
 const unresolved=packetDecisions.filter(d=>d.status==='UNRESOLVED');
 if(unresolved.length){decision.status='UNRESOLVED';decision.reasons=[...new Set([...decision.reasons,...unresolved.flatMap(d=>d.reasons)])];}
 // A fact can appear in multiple context packets. None may silently override
 // a different novelty decision from another authoritative paid response.
 const noveltyStatuses=new Map<string,Set<string>>();
 for(const packet of packets)for(const claim of packet.claims)for(const fact of claim.newUnderstandingFacts??[]){
  const owner=claim.candidateId??claim.id,key=JSON.stringify([owner,fact.id]),status=packet.result.semanticChecks?.find(c=>c.candidateId===owner&&c.factId===fact.id)?.readerNovelty?.status;
  const statuses=noveltyStatuses.get(key)??new Set<string>();if(status)statuses.add(status);noveltyStatuses.set(key,statuses);
 }
 if([...noveltyStatuses.values()].some(s=>s.size>1)){decision.status='UNRESOLVED';decision.reasons=[...new Set([...decision.reasons,'NOVELTY_VERDICT_CONFLICT'])];}
 return {merged,decision};
}
