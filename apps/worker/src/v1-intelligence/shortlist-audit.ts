import {equivalentFact} from './editorial';
import {selectableForPlanning} from './planning-capacity';
import type {ShortlistRecord,ShortlistCandidate} from './shortlist';
/** Evidence-derived causes that can keep a candidate out of an edition. A model's own stated reason is NOT one of them:
 * the audit classifies from the retained shortlist, ledger and obligations, never from planner rationale. */
export type DeferralCause='PROTECTED_CORRECTION_BLOCKED_BY_IDENTITY'|'UNRESOLVED_HIGH_CONSEQUENCE_IDENTITY'|'EXTRACTION_PENDING'|'ACTUAL_REPETITION'|'OLD_BUT_READER_NEW'|'WEAK_FEED_RELEVANCE'|'EVIDENCE_NOT_SELF_CONTAINED'|'ELIGIBLE_SUPPORTED_NEW';
export interface CandidateAudit {targetVersionId:string;title:string;causes:DeferralCause[];eligible:boolean;costUnits?:number;relevance?:number}
const WEAK_RELEVANCE=.5;
export function auditShortlist(shortlist:Pick<ShortlistRecord,'candidates'|'ledger'|'obligations'>):CandidateAudit[]{
 return shortlist.candidates.map(c=>auditCandidate(c,shortlist));
}
export function auditCandidate(c:ShortlistCandidate,shortlist:Pick<ShortlistRecord,'ledger'|'obligations'>):CandidateAudit{
 const known=shortlist.ledger.filter(e=>e.eventIds?.includes(c.stableTargetId)||Boolean(c.storylineId&&e.storylineIds?.includes(c.storylineId))).flatMap(e=>e.claimFacts);
 const causes:DeferralCause[]=[];
 if(c.flags.includes('IDENTITY_UNRESOLVED_HIGH_CONSEQUENCE'))causes.push(c.correctionObligationIds.length?'PROTECTED_CORRECTION_BLOCKED_BY_IDENTITY':'UNRESOLVED_HIGH_CONSEQUENCE_IDENTITY');
 if(c.flags.includes('TITLE_EXTRACTION_PENDING'))causes.push('EXTRACTION_PENDING');
 if(c.facts.length&&c.facts.every(f=>known.some(k=>equivalentFact(k,f.text)))&&!c.correctionObligationIds.length)causes.push('ACTUAL_REPETITION');
 if(c.flags.includes('OLD_RECAP')&&!causes.includes('ACTUAL_REPETITION'))causes.push('OLD_BUT_READER_NEW');
 if(c.facts.some(f=>f.selfContained==='UNRESOLVED'))causes.push('EVIDENCE_NOT_SELF_CONTAINED');
 if(c.ranking&&c.ranking.source==='JEV'&&c.ranking.relevance<WEAK_RELEVANCE&&!c.protectedReasons.length)causes.push('WEAK_FEED_RELEVANCE');
 const blocking=causes.filter(x=>!['OLD_BUT_READER_NEW'].includes(x));
 return {targetVersionId:c.targetVersionId,title:c.sourceTitles?.[0]??'',causes:blocking.length||causes.length?causes:['ELIGIBLE_SUPPORTED_NEW'],eligible:selectableForPlanning(c)&&!blocking.length,costUnits:c.communicationCost?.inputUnits,relevance:c.ranking?.relevance};
}

export type ReasoningDefect='IDENTITY_CLAIM_WITHOUT_FLAG'|'EXTRACTION_CLAIM_WITHOUT_FLAG'|'REPEAT_CLAIM_WITHOUT_LEDGER_MATCH'|'PROVISIONAL_USED_AS_BLOCKER'|'WITHDRAWN_PROSE_TREATED_AS_KNOWN';
export interface ReasoningFinding {targetVersionId:string;defect:ReasoningDefect;rationale:string}
const claimsIdentity=/\b(identity (is )?(unresolved|uncertain|unclear)|unresolved identity|cannot (confirm|establish) (the )?(identity|same event)|high[- ]consequence identity)\b/i,claimsExtraction=/\b(title extraction|extraction (is )?pending|pending extraction)\b/i,claimsRepeat=/\b(already (been )?(communicated|published|reported|covered|told|known)|previously (communicated|published|reported|covered)|reader (already|has already) (knows?|saw|seen)|repeat of)\b/i,claimsProvisional=/\bprovisional\b/i;
/** Checks a plan's stated reasons against the data it was given. It finds reasoning that asserts a cause the shortlist does not show;
 * it never decides what should be published and never overrides a decision. */
export function auditPlanReasoning(plan:{stories:{targetVersionId:string;decision:'SELECT'|'SUPPRESS'|'DEFER';rationale:string;relevanceRationale?:string}[]},shortlist:Pick<ShortlistRecord,'candidates'|'ledger'|'obligations'>):ReasoningFinding[]{
 const findings:ReasoningFinding[]=[];
 for(const story of plan.stories){
  const c=shortlist.candidates.find(c=>c.targetVersionId===story.targetVersionId);if(!c||story.decision==='SELECT')continue;
  const text=story.rationale,flag=(f:string)=>c.flags.includes(f),withdrawn=c.correctionObligationIds.some(id=>shortlist.obligations.some(o=>o.id===id&&o.publicationWithdrawal));
  const known=shortlist.ledger.filter(e=>e.eventIds?.includes(c.stableTargetId)||Boolean(c.storylineId&&e.storylineIds?.includes(c.storylineId))).flatMap(e=>e.claimFacts);
  const add=(defect:ReasoningDefect)=>findings.push({targetVersionId:c.targetVersionId,defect,rationale:text});
  if(claimsIdentity.test(text)&&!flag('IDENTITY_UNRESOLVED_HIGH_CONSEQUENCE'))add('IDENTITY_CLAIM_WITHOUT_FLAG');
  if(claimsExtraction.test(text)&&!flag('TITLE_EXTRACTION_PENDING'))add('EXTRACTION_CLAIM_WITHOUT_FLAG');
  if(claimsRepeat.test(text)&&!c.facts.every(f=>known.some(k=>equivalentFact(k,f.text))))add(withdrawn&&known.length?'WITHDRAWN_PROSE_TREATED_AS_KNOWN':'REPEAT_CLAIM_WITHOUT_LEDGER_MATCH');
  if(claimsProvisional.test(text)&&!flag('IDENTITY_UNRESOLVED_HIGH_CONSEQUENCE')&&!flag('TITLE_EXTRACTION_PENDING'))add('PROVISIONAL_USED_AS_BLOCKER');
 }
 return findings;
}
