import {readingBudgetWords,headlineWordCount,priorMemoryCutoff,type BriefingReviewEvent,type PriorItem} from '@distilled/briefing';
import {HandoffError,sha256} from '@distilled/contracts';
import {z} from 'zod';
import {canonicalJson} from '../v1-intake/canonical';
import {cutoffEvidenceAuthorized} from './cutoff-edition';
import type {BriefingEditionRecord} from './publication';
import type {FeedTransaction,V1FeedStore} from './store';
import type {V3WindowInput} from './v3-window';

const id=z.string().min(1).max(300);
const digest=z.string().regex(/^[a-f0-9]{64}$/);
const story=z.object({
  headline:z.string().min(1).max(500).refine(value=>value===value.trim()&&!/[\r\n]/u.test(value)),
  body:z.string().max(8000).refine(value=>value===value.trim()),
  relation:z.enum(['new','update','correction']),
  updatesId:id.optional(),
  support:z.array(z.object({evidenceRevisionId:id,quote:z.string().min(1).max(3000).refine(value=>Boolean(value.trim()))}).strict()).min(1).max(12),
}).strict();

export const reviewActionSchema=z.discriminatedUnion('action',[
  z.object({action:z.literal('save'),version:z.number().int().nonnegative(),historyDigest:digest,stories:z.array(story).min(1).max(30)}).strict(),
  z.object({action:z.literal('approve'),version:z.number().int().positive(),digest,attested:z.literal(true)}).strict(),
  z.object({action:z.literal('reject'),version:z.number().int().nonnegative(),note:z.string().trim().min(1).max(1000)}).strict(),
  z.object({action:z.literal('publish'),version:z.number().int().positive(),digest}).strict(),
]);

export type ReviewStory=z.infer<typeof story>;
export type ReviewAction=z.infer<typeof reviewActionSchema>;
export interface V5ReviewCase {
  id:string; feedId:string; inputId:string; fingerprint:string; openedAt:string;
  operationIds:string[]; failure?:string;
}
export interface V5ReviewCheckpoint {id:string;feedId:string;inputId:string;event:BriefingReviewEvent}
export interface V5ReviewRevision {
  id:string;feedId:string;windowId:string;inputId:string;historyDigest:string;digest:string;
  stories:ReviewStory[];editorId:string;savedAt:string;
}
export interface V5ReviewDecision {
  id:string;feedId:string;windowId:string;version:number;editorId:string;at:string;
  decision:'approve'|'reject';revisionId?:string;digest?:string;note?:string;
}
export interface V5ReviewState {
  id:string;feedId:string;version:number;status:'editing'|'approved'|'rejected'|'published';
  revisionId?:string;decisionId?:string;publishedDigest?:string;
}
export class V5ReviewError extends Error {
  constructor(readonly code:string,readonly status:400|403|404|409){super(code);}
}
export const reviewDigest=(value:unknown)=>sha256(canonicalJson(value));

export async function currentReviewHistory(store:V1FeedStore,input:V3WindowInput) {
  const history=await store.publicationPreparationHistory(input.feedId,priorMemoryCutoff(new Date(input.input.windowEnd)));
  const prior:PriorItem[]=history
    .sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id))
    .flatMap(edition=>edition.stories.map(story=>({id:edition.id+':'+story.candidateId,at:edition.createdAt,
      headline:story.claims[0]?.text??'',body:story.claims.map(claim=>claim.text).join('\n')})));
  return {prior,digest:await reviewDigest(history),
    newer:history.some(edition=>Date.parse(edition.windowEnd)>Date.parse(input.input.windowStart))};
}
export async function reviewEvidenceAllowed(store:V1FeedStore,input:V3WindowInput,ids:string[]):Promise<boolean>{
  if(ids.some(id=>!input.evidenceRevisionIds.includes(id)))return false;
  if(input.cutoffPolicy)return cutoffEvidenceAuthorized(store,{...input,evidenceRevisionIds:ids});
  const active=await store.activeEvidenceRevisionIds(input.feedId,ids);
  return ids.every(id=>active.has(id));
}

const normalized=(value:string)=>value.normalize('NFKC').replace(/\s+/gu,' ').trim().toLowerCase();
export async function validateReviewCopy(tx:FeedTransaction,input:V3WindowInput,stories:ReviewStory[],prior:PriorItem[]) {
  const parsed=z.array(story).min(1).max(30).safeParse(stories);
  if(!parsed.success)throw new V5ReviewError('INVALID_REVIEW_STORIES',400);
  const words=headlineWordCount(input.input.feed.language,stories),ceiling=readingBudgetWords(input.input.feed.windowMinutes);
  // Reader rendering deduplicates an identical expansion. Require the editor
  // to save the exact displayed form instead of relying on that transformation.
  if(words>ceiling||stories.some(item=>item.body===item.headline))throw new V5ReviewError('READER_WORD_BUDGET_OR_DUPLICATED_HEADLINE',400);
  const seen=new Set<string>(),priorIds=new Set(prior.map(item=>item.id));
  const previousText=new Set(prior.flatMap(item=>[normalized(item.headline),normalized(item.body),normalized(item.headline+'\n'+item.body)]));
  const refs=[...new Set(stories.flatMap(item=>item.support.map(binding=>binding.evidenceRevisionId)))];
  if(!await reviewEvidenceAllowed(tx.store,input,refs))throw new V5ReviewError('SOURCE_OUT_OF_SCOPE_OR_STALE',409);
  await tx.preloadRevisions(refs);
  const articles=new Map(input.input.articles.map(article=>[article.id,article]));
  for(const item of stories){
    const text=normalized(item.headline+'\n'+item.body);
    if(seen.has(text)||previousText.has(text))throw new V5ReviewError('EXACT_READER_REPEAT',400);
    seen.add(text);
    if(item.relation==='new'?item.updatesId!==undefined:!item.updatesId||!priorIds.has(item.updatesId))
      throw new V5ReviewError('INVALID_READER_HISTORY_LINK',400);
    for(const {evidenceRevisionId,quote} of item.support){
      const article=articles.get(evidenceRevisionId),revision=await tx.revision(evidenceRevisionId);
      if(!article||!revision||revision.feedId!==input.feedId||
        ![article.text,article.title].some(value=>value?.includes(quote))||
        ![revision.body,revision.title].some(value=>value?.includes(quote)))
        throw new V5ReviewError('INVALID_EXACT_SOURCE_PASSAGE',400);
    }
  }
  return {words,ceiling};
}

export function approvedStories(windowId:string,stories:ReviewStory[]):BriefingEditionRecord['stories'] {
  return stories.map((item,i)=>({
    candidateId:windowId+':'+i,relation:item.relation,...(item.updatesId?{updatesId:item.updatesId}:{}),
    claims:[{id:windowId+':'+i+':text',text:item.headline+'\n'+item.body,support:item.support}],
  }));
}

export async function validateEditorApprovedEdition(tx:FeedTransaction,edition:BriefingEditionRecord):Promise<void>{
  const state=await tx.read<V5ReviewState>('v5_review_states',edition.id);
  const review=await tx.read<V5ReviewCase>('v5_review_cases',edition.id);
  const input=review?await tx.read<V3WindowInput>('v3_window_inputs',review.inputId):undefined;
  const decision=state?.decisionId?await tx.read<V5ReviewDecision>('v5_review_decisions',state.decisionId):undefined;
  const revision=state?.revisionId?await tx.read<V5ReviewRevision>('v5_review_revisions',state.revisionId):undefined;
  if(!input?.models.generation||!state||!review||!decision||!revision||
    input.id!==(edition.v3InputId??edition.id)||input.fingerprint!==review.fingerprint||
    input.feedId!==edition.feedId||input.feedRevision!==edition.feedRevision||input.feedRevision!==tx.snapshot.feed.revision||
    input.input.windowStart!==edition.windowStart||input.input.windowEnd!==edition.windowEnd||input.scheduledFor!==edition.scheduledFor||
    input.input.feed.language!==edition.language||state.status!=='published'||state.publishedDigest!==await reviewDigest(edition)||
    decision.decision!=='approve'||decision.editorId!==tx.snapshot.feed.ownerId||decision.id!==edition.editorialApprovalId||
    decision.windowId!==edition.id||decision.version+1!==state.version||decision.revisionId!==revision.id||decision.digest!==revision.digest||
    revision.editorId!==decision.editorId||
    canonicalJson(edition.evidenceRevisionIds)!==canonicalJson([...new Set(revision.stories.flatMap(story=>story.support.map(binding=>binding.evidenceRevisionId)))].sort())||
    revision.windowId!==edition.id||revision.inputId!==input.id||
    revision.digest!==await reviewDigest({inputId:input.id,historyDigest:revision.historyDigest,stories:revision.stories})||
    canonicalJson(edition.stories)!==canonicalJson(approvedStories(edition.id,revision.stories)))throw new HandoffError('SCOPE_DENIED');
  const history=await currentReviewHistory(tx.store,input);
  if(history.newer||history.digest!==revision.historyDigest)throw new HandoffError('SCOPE_DENIED');
  await validateReviewCopy(tx,input,revision.stories,history.prior);
}
