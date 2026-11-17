import { hashContent } from '@distilled/contracts';
import { unreadableArticleReason } from '@distilled/connectors';
import { WorkerPublicSourceFetch } from '../public-source-fetch';
import type { LanguageResolution } from '../v1-intelligence/language';
import { acquiredSchema } from './evidence';
import { resolvePublicationDate } from './publication-date';
import { articleHeadlineKey } from './reviewed-redirect';
import type { AcceptedAcquiredContent, AcceptedInput } from './types';

export interface SuppliedPayload {
  title?: string;
  body: string;
  language?: string;
  languageResolution?: LanguageResolution;
  publishedAt?: string;
}

export function canUseRetainedRssExcerpt(input: AcceptedInput): boolean {
  const { observation, proposal } = input;
  return observation.operation === 'UPSERT' && observation.representation === 'ARTICLE_EXCERPT' &&
    proposal?.connectorType === 'rss' && proposal.observationId === observation.id &&
    proposal.url === observation.canonicalUrl && !!observation.canonicalUrl &&
    proposal.suppliedPayloadRef === observation.suppliedPayloadRef &&
    observation.suppliedPayloadRef?.startsWith('source-payloads/') === true && !!observation.contentHash;
}

export function permitsRetainedRssExcerpt(failure: string | undefined, httpStatus?: number): boolean {
  return failure === 'UNCERTAIN_PAID_SUBMISSION' || failure === 'BODY_BUDGET_EXCEEDED' ||
    failure === 'EXTRACTION_FAILED' && (httpStatus === undefined || httpStatus >= 500) ||
    failure === 'UNSUPPORTED' && httpStatus === 404;
}

/** Reuse the publisher's exact retained text. Clean only the string used to
 * check whether it contains information beyond the title and links. */
export async function retainedRssExcerpt(
  input: AcceptedInput,
  candidateId: string,
  acquiredAt: string,
  payload: SuppliedPayload,
): Promise<AcceptedAcquiredContent | undefined> {
  if (!canUseRetainedRssExcerpt(input)) return;
  const o = input.observation;
  try { new WorkerPublicSourceFetch(o.canonicalUrl!); } catch { return; }
  if (payload.body.length > 512_000 || unreadableArticleReason(payload.body)) return;

  const title = articleHeadlineKey(payload.title ?? o.titleHint).replace(/\p{Cf}/gu, '');
  const normalized = articleHeadlineKey(payload.body.replace(/&(?:nbsp|#160|#x[aA]0);/gi, ' ')).replace(/\p{Cf}/gu, '');
  const remainder = (title ? normalized.replaceAll(title, '') : normalized)
    .replace(/https?:\/\/\S+/giu, '')
    .replace(/\b(?:read more|continue reading|full article|click here|learn more|lire la suite)\b|اقرأ المزيد|إقرأ المزيد|اضغط هنا/giu, '')
    .trim();
  if (remainder.length < 30 || (remainder.match(/[\p{L}\p{M}]/gu) ?? []).length < 25) return;
  // Some RSS descriptions contain only a Drupal language/type/date block.
  if (/^[\s.:-]*(?:(?:language|اللغة)\s+[a-z]{2,3}\s+)?news type:\s*[^:]{1,80}\s+image:\s*date:\s*[^.!?]{0,55}\d[^.!?]{0,12}$/iu.test(remainder)) return;

  const { languageResolution, ...content } = payload;
  if (languageResolution && languageResolution.language !== content.language) return;
  if (await hashContent({ representation: o.representation, title: content.title, body: content.body }) !== o.contentHash) return;
  const publicationDate = resolvePublicationDate(undefined, o.publishedAtHint ?? content.publishedAt);
  const parsed = acquiredSchema.safeParse({
    ...content,
    id: JSON.stringify(['acquired', o.id]), feedId: o.feedId, candidateId, sourceId: o.sourceId,
    sourceObservationId: o.id, canonicalUrl: o.canonicalUrl, acquiredAt, publishedAt: publicationDate.publishedAt,
    representation: 'ARTICLE_EXCERPT', contentCompleteness: 'PARTIAL',
    acquisitionMethod: 'supplied_payload', acquisitionProvider: 'rss_supplied_excerpt',
    quality: { transportSuccess: true, extractionSuccess: true, extractionComplete: false },
    provenance: { routerVersion: 'v1-existing-orchestrator', stages: ['SUPPLIED'], rawPayloadRef: o.suppliedPayloadRef, publicationDate, languageResolution },
  });
  return parsed.success ? parsed.data : undefined;
}
