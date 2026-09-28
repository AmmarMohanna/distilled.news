import {
  areSameEventDeterministic,
  eventTokens,
  jaccardSimilarity,
  mergeBriefingItem,
  processMessages,
  sanitizeSummary,
  isImportantReviewCandidate,
  isImportantToInterest,
  type BriefingConfig,
  type BriefingItem,
  type EventReviewAdapter,
  type NormalizedMessage,
  type ProcessingResult,
  type SummaryAdapter
} from "@distilled/core";
import type { ProcessingJobMessage, Repository } from "./types";
import {canonicalUrl,evidenceFingerprint,extractiveClaims,updateDevelopment,validateGroundedClaims,stableHash,type GroundedClaim} from "@distilled/core";

const RECENT_MESSAGE_CONTEXT_LIMIT = 30;
const EXISTING_ITEM_CONTEXT_LIMIT = 80;

export async function processQueueMessage(
  repo: Repository,
  message: ProcessingJobMessage,
  now = new Date(),
  summaryAdapter?: SummaryAdapter | null,
  reviewAdapter?: EventReviewAdapter | null
): Promise<ProcessingResult | undefined> {
  const job=await repo.getProcessingJob(message.jobId);
  if(job?.state==="completed")return undefined;
  if(job&&(job.briefingId!==message.briefingId||job.rawMessageId!==message.rawMessageId))throw Error("PROCESSING_JOB_SCOPE_MISMATCH");
  if(job&&!await repo.claimProcessingJob(message.jobId,message.briefingId,now))throw new ProcessingLeaseBusy();
  try {
    const briefing = await repo.getBriefingById(message.briefingId);
    const rawMessage = await repo.getRawMessage(message.rawMessageId);
    if (!briefing || !rawMessage) {
      await repo.failProcessingJob(message.jobId, "Briefing or raw message not found", now);
      return undefined;
    }

    if (briefing.paused) {
      await repo.completeProcessingJob(message.jobId, now);
      return undefined;
    }

    const source = await repo.getSource(rawMessage.source.id);
    if (!source?.enabled) {
      await repo.completeProcessingJob(message.jobId, now);
      return undefined;
    }

    const existingItems = limitExistingItemsForProcessing(await repo.getExistingItems(briefing.id, now));
    if(rawMessage.news){
      const started=Date.now();const result=await processNewsMessage(repo,message,briefing,rawMessage,existingItems,now,summaryAdapter,reviewAdapter);
      const touched=result.publishedItems.filter(item=>item.evidence.some(entry=>entry.messageId===rawMessage.id));
      await repo.recordProcessingOutcome(message.jobId,{outcome:"COMPLETED",elapsedMs:Date.now()-started,developments:touched.map(item=>({id:item.id,version:item.development?.version,membership:item.development?.membership.find(ref=>ref.messageId===rawMessage.id)?.method})),suppressed:result.suppressed.map(entry=>entry.reason)});
      return result;
    }
    const existingItemIds = new Set(existingItems.map((item) => item.id));
    const recentMessages = await repo.listRecentRawMessages(briefing.id, now, RECENT_MESSAGE_CONTEXT_LIMIT);
    const messages = uniqueMessagesById([rawMessage, ...recentMessages]);
    const importantMessageIds = await findImportantMessageIds(briefing, messages, rawMessage.id, reviewAdapter);
    const result = processMessages({
      briefing,
      messages,
      existingItems,
      importantMessageIds,
      now
    });
    result.publishedItems = await mergeReviewedEquivalentItems(
      briefing,
      result.publishedItems,
      rawMessage.id,
      reviewAdapter
    );

    if (summaryAdapter) {
      for (const item of result.publishedItems) {
        if (item.evidence.some((evidence) => evidence.messageId === rawMessage.id)) {
          const fallbackSummary = item.summary;
          try {
            const candidateSummary = sanitizeSummary(await summaryAdapter.summarize({ briefing, evidence: item.evidence }), briefing.language);
            if (candidateSummary) item.summary = candidateSummary;
            else if (!existingItemIds.has(item.id)) item.summary = "";
            else item.summary = fallbackSummary;
          } catch {
            item.summary = fallbackSummary;
          }
        }
      }
    }

    const changedItems = result.publishedItems.filter((item) =>
      Boolean(item.summary) && item.evidence.some((evidence) => evidence.messageId === rawMessage.id)
    );
    await repo.saveBriefingItems(briefing.id, changedItems, now);
    await repo.completeProcessingJob(message.jobId, now);
    return result;
  } catch (error) {
    await repo.failProcessingJob(
      message.jobId,
      error instanceof Error ? error.message : "Unknown processing error",
      now
    );
    throw error;
  }
}

export class ProcessingLeaseBusy extends Error{constructor(){super("PROCESSING_FEED_LEASE_BUSY")}}

async function processNewsMessage(repo:Repository,job:ProcessingJobMessage,briefing:BriefingConfig,raw:NormalizedMessage,existing:BriefingItem[],now:Date,summary?:SummaryAdapter|null,review?:EventReviewAdapter|null):Promise<ProcessingResult>{
  const duplicate=existing.some(item=>item.evidence.some(entry=>entry.messageId===raw.id||(entry.sourceId===raw.source.id&&raw.text.length>=200&&entry.contentHash===raw.news?.contentHash)||(raw.sourceUrl&&entry.sourceUrl&&canonicalUrl(raw.sourceUrl)===canonicalUrl(entry.sourceUrl))));
  if(duplicate){await repo.completeProcessingJob(job.jobId,now);return {publishedItems:existing,suppressed:[{messageId:raw.id,reason:"duplicate",detail:"Same canonical document already processed."}]}}
  // Editorial/opinion content remains stored but is not a factual development.
  if(/\/(?:blogs|opinion)\//i.test(raw.sourceUrl??"")){await repo.completeProcessingJob(job.jobId,now);return {publishedItems:existing,suppressed:[{messageId:raw.id,reason:"fluff",detail:"Editorial evidence retained; no factual development promoted."}]}}
  const previous=new Map(existing.map(item=>[item.id,structuredClone(item)]));
  const important=await findImportantMessageIds(briefing,[raw],raw.id,review);
  const result=processMessages({briefing,messages:[raw],existingItems:structuredClone(existing),importantMessageIds:important,now});
  let item=result.publishedItems.find(candidate=>candidate.evidence.some(entry=>entry.messageId===raw.id));
  if(!item){await repo.completeProcessingJob(job.jobId,now);return result}
  let method:"DETERMINISTIC"|"SEMANTIC_REVIEW"="DETERMINISTIC";
  if(review&&!previous.has(item.id)){
    const candidates=existing.filter(candidate=>Math.abs(Date.parse(candidate.itemAt)-Date.parse(raw.postedAt))<=72*3600000).map(candidate=>({candidate,score:Math.max(jaccardSimilarity(eventTokens(raw.text),eventTokens(candidate.evidence.map(entry=>entry.text).join(" "))),...candidate.evidence.map(entry=>jaccardSimilarity(eventTokens(raw.news?.headline??raw.text),eventTokens(entry.headline??entry.text))))})).sort((a,b)=>b.score-a.score);
    let attempts=0;
    for(const {candidate,score} of candidates){
      const crossLanguage=/[\u0600-\u06ff]/.test(raw.text)!==/[\u0600-\u06ff]/.test(candidate.evidence.map(entry=>entry.text).join(" "));
      if(score<0.12&&!crossLanguage)continue;
      if(attempts++>=3)break;
      const cache=`processing:event:${briefing.id}:${stableHash(raw.id+candidate.id+evidenceFingerprint(candidate.evidence))}`;
      let same=false;
      try{const cached=await repo.getSetting(cache);same=cached===null?await review.areSameEvent({briefing,left:item.evidence,right:candidate.evidence}):cached==="true";if(cached===null)await repo.setSetting(cache,JSON.stringify(same),now)}catch{continue}
      if(same){const merged=mergeBriefingItem(structuredClone(candidate),item,briefing);result.publishedItems=result.publishedItems.filter(value=>value.id!==item!.id&&value.id!==candidate.id);result.publishedItems.push(merged);item=merged;method="SEMANTIC_REVIEW";break}
    }
  }
  const prior=previous.get(item.id);
  if(prior?.development?.evidenceFingerprint===evidenceFingerprint(item.evidence)){await repo.completeProcessingJob(job.jobId,now);return result}
  let claims:GroundedClaim[];
  if(summary?.summarizeGrounded){
    try{claims=validateGroundedClaims(await summary.summarizeGrounded({briefing,evidence:item.evidence,knownClaims:prior?.development?.claims}),item.evidence)}catch{claims=extractiveClaims(item.evidence.filter(entry=>entry.messageId===raw.id))}
  }else claims=extractiveClaims(item.evidence.filter(entry=>entry.messageId===raw.id));
  if(!claims.length){await repo.completeProcessingJob(job.jobId,now);return result}
  updateDevelopment(item,prior,claims,briefing,now,method);
  item.summary=claims.map(claim=>claim.text).join(" ");
  await repo.saveBriefingItems(briefing.id,[item],now);
  await repo.completeProcessingJob(job.jobId,now);
  return result;
}

function uniqueMessagesById<T extends { id: string }>(messages: T[]): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const message of messages) {
    if (seen.has(message.id)) continue;
    seen.add(message.id);
    unique.push(message);
  }
  return unique;
}

function limitExistingItemsForProcessing(items: BriefingItem[]): BriefingItem[] {
  return items
    .slice()
    .sort((left, right) => right.itemAt.localeCompare(left.itemAt))
    .slice(0, EXISTING_ITEM_CONTEXT_LIMIT);
}

async function findImportantMessageIds(
  briefing: BriefingConfig,
  messages: NormalizedMessage[],
  currentMessageId: string,
  reviewAdapter?: EventReviewAdapter | null
): Promise<string[]> {
  const important = new Set<string>();
  for (const message of messages) {
    if (isImportantToInterest(message, briefing)) {
      important.add(message.id);
      continue;
    }
  }
  const currentMessage = messages.find((message) => message.id === currentMessageId);
  if (reviewAdapter && currentMessage && !important.has(currentMessage.id) && isImportantReviewCandidate(currentMessage, briefing)) {
    try {
      if (await reviewAdapter.isImportant({ briefing, message: currentMessage })) important.add(currentMessage.id);
    } catch {
      // Review calls are advisory; deterministic filtering remains the fallback.
    }
  }
  return Array.from(important);
}

async function mergeReviewedEquivalentItems(
  briefing: BriefingConfig,
  items: BriefingItem[],
  rawMessageId: string,
  reviewAdapter?: EventReviewAdapter | null
): Promise<BriefingItem[]> {
  const merged: BriefingItem[] = [];
  for (const item of items) {
    const target = merged.find((candidate) => areSameEventDeterministic(candidate.evidence, item.evidence));
    if (target) mergeBriefingItem(target, item, briefing);
    else merged.push({ ...item, evidence: item.evidence.map((entry) => ({ ...entry, links: [...entry.links], media: entry.media.map((media) => ({ ...media })) })) });
  }

  if (!reviewAdapter) return sortItems(merged);

  let reviews = 0;
  const maxReviews = 2;
  for (let leftIndex = 0; leftIndex < merged.length; leftIndex += 1) {
    const left = merged[leftIndex];
    if (!left.evidence.some((entry) => entry.messageId === rawMessageId)) continue;

    for (let rightIndex = 0; rightIndex < merged.length; rightIndex += 1) {
      if (leftIndex === rightIndex || reviews >= maxReviews) continue;
      const right = merged[rightIndex];
      if (!right || !shouldReviewEventPair(left, right)) continue;
      reviews += 1;
      try {
        if (await reviewAdapter.areSameEvent({ briefing, left: left.evidence, right: right.evidence })) {
          mergeBriefingItem(right, left, briefing);
          merged.splice(leftIndex, 1);
          leftIndex -= 1;
          break;
        }
      } catch {
        // Equivalence review is advisory; deterministic merge remains the fallback.
      }
    }
  }

  return sortItems(merged);
}

function shouldReviewEventPair(left: BriefingItem, right: BriefingItem): boolean {
  const leftTokens = eventTokens([left.summary, ...left.evidence.map((entry) => entry.text)].join(" "));
  const rightTokens = eventTokens([right.summary, ...right.evidence.map((entry) => entry.text)].join(" "));
  if (leftTokens.length === 0 || rightTokens.length === 0) return false;
  return jaccardSimilarity(leftTokens, rightTokens) >= 0.24;
}

function sortItems(items: BriefingItem[]): BriefingItem[] {
  return items.sort((left, right) => right.itemAt.localeCompare(left.itemAt));
}
