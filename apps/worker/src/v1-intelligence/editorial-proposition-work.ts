import {exactReaderWitness} from './fidelity';
import type {FeedTransaction} from './store';
import type {ShortlistCandidate} from './shortlist';
import type {EditorialWork} from './editorial-work';
import type {BriefingEditionRecord} from './publication';
export interface PropositionWork extends EditorialWork {validationContract:'EVIDENCE_GROUNDED_V2';propositionIds:string[];parentFactIds:string[]}
export async function deferPropositionWork(tx:FeedTransaction,c:Pick<ShortlistCandidate,'stableTargetId'|'targetVersionId'|'protectedReasons'>,p:{id:string;parentFactId:string;text:string},origin:string,windowEnd:string,now:string):Promise<PropositionWork>{
 const id=JSON.stringify([origin,c.targetVersionId,'editorial-proposition-v2',p.id]);
 const prior=await tx.read<PropositionWork>('editorial_deferred_work',id);if(prior)return prior;
 const value:PropositionWork={id,feedId:tx.snapshot.feed.id,stableTargetId:c.stableTargetId,targetVersionId:c.targetVersionId,protectedReasons:c.protectedReasons,reason:'AWAITING_PROPOSITION_COMMUNICATION',createdAt:now,planId:origin,windowEnd,validationContract:'EVIDENCE_GROUNDED_V2',propositionIds:[p.id],parentFactIds:[p.parentFactId],factTexts:[p.text],continuationPolicy:'ADAPTIVE'};
 await tx.write('editorial_deferred_work',id,value);return value;
}
/** Called inside canonical ledger admission. A target/window/sibling alone is
 * never delivery. The proof must be a persisted v2 acceptance for exact prose. */
export async function resolvePropositionWork(tx:FeedTransaction,work:PropositionWork,edition:BriefingEditionRecord,proofId:string):Promise<boolean>{
 const proof=await tx.read<{status:string;contract:string;editionId:string;candidateId:string;targetVersionId:string;propositionIds:string[];readerSpans:{propositionId:string;claimId:string;text:string;start?:number;end?:number}[]}>('publication_validation_results',proofId);
 if(work.feedId!==tx.snapshot.feed.id||edition.feedId!==work.feedId||!proof||proof.status!=='ACCEPT'||proof.contract!=='EVIDENCE_GROUNDED_V2'||proof.editionId!==edition.id||proof.targetVersionId!==work.targetVersionId||!work.propositionIds.every(id=>proof.propositionIds.includes(id)))return false;
 const claims=edition.stories.find(s=>s.candidateId===proof.candidateId)?.claims;
 if(!claims?.length||!work.propositionIds.every(id=>proof.readerSpans.some(s=>s.propositionId===id))||!proof.readerSpans.every(w=>exactReaderWitness(w,claims)))return false;
 const id=JSON.stringify([work.id,edition.id]);if(!await tx.read('editorial_work_resolutions',id))await tx.write('editorial_work_resolutions',id,{id,feedId:work.feedId,workId:work.id,editionId:edition.id,validationProofId:proofId,createdAt:edition.createdAt});return true;
}
