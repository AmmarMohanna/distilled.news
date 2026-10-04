import {HandoffError,sha256,type EvidenceRevision} from '@distilled/contracts';
import {z} from 'zod';
import {canonicalJson} from '../v1-intake/canonical';
import type {FeedTransaction} from './store';
import {classifyRole,features} from './policies';

export const CLAIM_EXTRACTOR='exact-sentence-spans-v1',CLAIM_POLICY='deterministic-claim-foundation-v1';
export const claimMentionSchema=z.object({
 id:z.string().min(1),feedId:z.string().min(1),evidenceRevisionId:z.string().min(1),sourceDocumentId:z.string().min(1),extractionKey:z.string().min(1),
 span:z.object({field:z.enum(['body','title']),start:z.number().int().nonnegative(),end:z.number().int().positive()}).strict(),sourceText:z.string().min(1),
 reportingRole:z.enum(['NEW_REPORTING','BACKGROUND_RECAP','QUOTED_CLAIM','ANALYSIS_OPINION','OTHER_UNCERTAIN']),attribution:z.string().optional(),
 certainty:z.object({kind:z.enum(['UNSPECIFIED','POSSIBLE','EXPECTED','ALLEGED','CONFIRMED','DENIED']),hedges:z.array(z.string())}).strict(),
 quantities:z.array(z.object({text:z.string(),start:z.number().int().nonnegative(),end:z.number().int().positive()}).strict()),qualifiers:z.array(z.string()),
 reportTime:z.string().datetime(),eventTime:z.string().datetime().optional(),
 origin:z.object({kind:z.enum(['UNKNOWN','EXPLICIT_DEPENDENCY']),label:z.string().optional(),fingerprint:z.string().min(1)}).strict(),
 extractorVersion:z.string().min(1),extractionPolicyVersion:z.string().min(1)
}).strict();
export type ClaimMention=z.infer<typeof claimMentionSchema>;
export interface SourceDocument {id:string;feedId:string;evidenceRevisionId:string;contentHash:string;extractionKey:string;claimMentionIds:string[];origin:ClaimMention['origin'];extractorVersion:string;extractionPolicyVersion:string}

function certainty(text:string):ClaimMention['certainty'] {
 const hedges=[...new Set((text.match(/\b(may|might|could|expected|unconfirmed|alleged|reportedly|estimated|disputed|uncertain|not confirmed)\b/gi)??[]).map(s=>s.toLowerCase()))];
 const kind=/\b(unconfirmed|alleged|not confirmed)\b/i.test(text)?'ALLEGED':/\b(may|might|could)\b/i.test(text)?'POSSIBLE':/\bexpected\b/i.test(text)?'EXPECTED':/\b(denied|retracted)\b/i.test(text)?'DENIED':/\b(confirmed|verified)\b/i.test(text)?'CONFIRMED':'UNSPECIFIED';
 return {kind,hedges};
}
export function assertClaimSpan(mention:ClaimMention,revision:EvidenceRevision):void {
 const source=revision[mention.span.field]??'';
 if(mention.feedId!==revision.feedId || mention.evidenceRevisionId!==revision.id || mention.span.start<0 || mention.span.end>source.length || mention.span.end<=mention.span.start || source.slice(mention.span.start,mention.span.end)!==mention.sourceText)throw new HandoffError('SCOPE_DENIED');
 for(const q of mention.quantities)if(q.start<0 || q.end>mention.sourceText.length || q.end<=q.start || mention.sourceText.slice(q.start,q.end)!==q.text)throw new HandoffError('SCOPE_DENIED');
}
/** Foundation extraction is deliberately conservative metadata, not semantic
 * entailment or proof of new reporting. Exact spans never lose original qualifiers. */
export async function extractClaimMentions(revision:EvidenceRevision):Promise<{document:SourceDocument;mentions:ClaimMention[]}> {
 const field=revision.body?'body':'title',source=revision[field]??'';
 const extractionKey=await sha256(canonicalJson({contentHash:revision.contentHash,source,field,extractorVersion:CLAIM_EXTRACTOR,policy:CLAIM_POLICY}));
 const documentId=await sha256(canonicalJson({feedId:revision.feedId,revisionId:revision.id,extractionKey}));
 const dependency=source.match(/\b(?:republished from|originally published by|reporting by|distributed by|via)\s+([\p{L}\p{N}][\p{L}\p{N} .'-]{1,80})(?=[\n:;]|$)/iu)?.[1]?.trim();
 const origin:ClaimMention['origin']={kind:dependency?'EXPLICIT_DEPENDENCY':'UNKNOWN',label:dependency,fingerprint:await sha256(source.normalize('NFKC').replace(/\s+/g,' ').trim())};
 const mentions:ClaimMention[]=[],documentRole=classifyRole(source).role;
 for(const segment of new Intl.Segmenter('und',{granularity:'sentence'}).segment(source)) {
  const leading=segment.segment.length-segment.segment.trimStart().length,sourceText=segment.segment.trim();if(!sourceText)continue;
  const span={field,start:segment.index+leading,end:segment.index+leading+sourceText.length};
  const attribution=sourceText.match(/^(.{1,100}?)\s+(?:said|says|alleges?|claimed|reported|reports|warned|announced)\b/i)?.[1];
  const reportingRole:ClaimMention['reportingRole']=/^(?:background|recap|previously)\b/i.test(sourceText)?'BACKGROUND_RECAP':attribution || /[“”«»]/u.test(sourceText)?'QUOTED_CLAIM':['ANALYSIS','OPINION'].includes(documentRole)?'ANALYSIS_OPINION':features(sourceText).development!=='report'?'NEW_REPORTING':'OTHER_UNCERTAIN';
  const quantities=[...sourceText.matchAll(/\d+(?:[.,]\d+)*(?:\s*(?:%|percent\b|million\b|billion\b|thousand\b))?/giu)].map(m=>({text:m[0],start:m.index!,end:m.index!+m[0].length}));
  const qualifiers=[...new Set((sourceText.match(/\b(not|no|never|without|at least|at most|more than|less than|up to|approximately|about|before|after|until)\b/gi)??[]).map(s=>s.toLowerCase()))];
  const id=await sha256(canonicalJson({feedId:revision.feedId,evidenceRevisionId:revision.id,span,extractorVersion:CLAIM_EXTRACTOR,policy:CLAIM_POLICY}));
  const mention=claimMentionSchema.parse({id,feedId:revision.feedId,evidenceRevisionId:revision.id,sourceDocumentId:documentId,extractionKey,span,sourceText,reportingRole,attribution,certainty:certainty(sourceText),quantities,qualifiers,reportTime:revision.publishedAt??revision.acceptedAt,origin,extractorVersion:CLAIM_EXTRACTOR,extractionPolicyVersion:CLAIM_POLICY});
  assertClaimSpan(mention,revision);mentions.push(mention);
 }
 return {document:{id:documentId,feedId:revision.feedId,evidenceRevisionId:revision.id,contentHash:revision.contentHash,extractionKey,claimMentionIds:mentions.map(m=>m.id),origin,extractorVersion:CLAIM_EXTRACTOR,extractionPolicyVersion:CLAIM_POLICY},mentions};
}
export async function persistClaimMentions(tx:FeedTransaction,revision:EvidenceRevision):Promise<ClaimMention[]> {
 const {document,mentions}=await extractClaimMentions(revision);
 await tx.write('source_documents',document.id,document);for(const mention of mentions)await tx.write('claim_mentions',mention.id,mention);return mentions;
}
