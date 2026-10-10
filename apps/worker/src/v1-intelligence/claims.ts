import {HandoffError,sha256,type EvidenceRevision} from '@distilled/contracts';
import {z} from 'zod';
import {canonicalJson} from '../v1-intake/canonical';
import type {FeedTransaction} from './store';
import {classifyRole,features} from './policies';

export const CLAIM_EXTRACTOR='exact-sentence-spans-v3',CLAIM_POLICY='deterministic-claim-foundation-v3';
/** Obvious non-assertions only. Ambiguous reporting remains available to semantic construction.
 * A TEASER announces that a piece exists (a list, guide, video, explainer) without stating what it found; it is classified by
 * what the sentence DOES, never by length: "OpenAI released GPT-6." is short and substantive, "We created a list of the best AI agents." is not. */
const CONTENT_NOUN='(?:list|roundup|round-up|rundown|guide|ranking|collection|explainer|primer|breakdown|cheat sheet|gallery|timeline|tracker)';
const CREATED_CONTENT=new RegExp(`^(?:we|our (?:team|editors|reporters|writers)|the (?:team|editors))\\s+(?:have\\s+|'ve\\s+)?(?:created|compiled|put together|rounded up|assembled|curated|ranked|picked|selected|made|built|updated|wrote)\\s+(?:a|an|the|our)\\s+(?:[\\w'-]+\\s+){0,4}?${CONTENT_NOUN}\\b`,'i');
const HERE_ARE_LIST=new RegExp(`^here(?:'|\u2019)?(?:s|\\s+(?:are|is))\\s+(?:the\\s+|our\\s+|a\\s+)?(?:(?:top|best|most|biggest|latest|\\d+|every|all|everything|what)\\b|(?:[\\w'-]+\\s+){0,3}?${CONTENT_NOUN}\\b)`,'i');
const READ_ON=/^(?:in this (?:episode|video|article|piece|story|guide|podcast|newsletter|edition)\b|read on\b|keep reading\b|click (?:here|through|to)\b|tap (?:here|to)\b|see (?:the )?(?:full |complete )?(?:list|gallery|ranking)\b|listen (?:to|now)\b|everything you (?:need|want) to know\b|all you need to know\b|what (?:you )?(?:need|have) to know\b)/i;
const LISTICLE_TITLE=/^\d+\s+(?:best|top|ways|things|reasons|tips|tools|apps|gadgets|games|movies|shows|books)\b/i;
const EVENT_PROMO=/\b(?:pass(?:es)? savings|ticket(?:s)? (?:are|on sale|sales)|early[- ]bird|at the door|promo(?:tion(?:al)?)? code|use code\b|lock in your|\d+% off|save up to [$\u20ac\u00a3]?\d+)\b|^\d+\s+days?\s+to\s+[^.]*\b(?:disrupt|summit|conference|expo|festival|pass|tickets?|registration|register)\b|^(?:hear|learn|get insights) from\b[^.]*\b(?:stage|session|panel|roundtable|summit|conference|disrupt|keynote)\b|\b(?:is|are) (?:coming|heading|headed) to (?:the )?[\w' -]*?\b(?:stage|summit|disrupt|conference)\b/i;
export function nonFactRole(text:string):'QUESTION'|'CALL_TO_ACTION'|'PROMOTION'|'TEASER'|undefined {
 if(/\?\s*$/.test(text.trim()))return 'QUESTION';
 if(/^(?:if\b[^.!?]*\byou\b[^.!?]*[,;]\s*)?(?:don(?:'|\u2019)t wait to\s+|do not wait to\s+)?(?:register|subscribe|sign up|buy tickets|book your|join us|get (?:all of )?your)\b/i.test(text.trim())||/^save (?:up to )?[$\u20ac\u00a3]?\d/i.test(text.trim()))return 'CALL_TO_ACTION';
 if(/^(?:we explain (?:all|everything)|learn how|find out (?:more|how)|read more|watch (?:now|here))\b/i.test(text.trim()))return 'TEASER';
 if(/^(?:sponsored (?:by|content)|advertisement)\b/i.test(text.trim()))return 'PROMOTION';
 const t=text.trim(),afterColon=t.includes(':')?t.slice(t.indexOf(':')+1).trim():'';
 // A lead-in that goes on to state its substance ("Here's what the court decided: it struck down the law") is not a teaser.
 if((CREATED_CONTENT.test(t)||HERE_ARE_LIST.test(t)||READ_ON.test(t)||LISTICLE_TITLE.test(t))&&afterColon.length<25)return 'TEASER';
 if(EVENT_PROMO.test(t))return 'PROMOTION';
 return undefined;
}
export function isNewsMention(mention:Pick<ClaimMention,'reportingRole'|'sourceText'>):boolean{return !nonFactRole(mention.sourceText)&&!['QUESTION','CALL_TO_ACTION','PROMOTION','TEASER'].includes(mention.reportingRole)}

export const claimMentionSchema=z.object({
 id:z.string().min(1),feedId:z.string().min(1),evidenceRevisionId:z.string().min(1),sourceDocumentId:z.string().min(1),extractionKey:z.string().min(1),
 span:z.object({field:z.enum(['body','title']),start:z.number().int().nonnegative(),end:z.number().int().positive()}).strict(),sourceText:z.string().min(1),
 reportingRole:z.enum(['NEW_REPORTING','BACKGROUND_RECAP','QUOTED_CLAIM','ANALYSIS_OPINION','OTHER_UNCERTAIN','QUESTION','CALL_TO_ACTION','PROMOTION','TEASER']),attribution:z.string().optional(),
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
 const sources=([['title',revision.title],['body',revision.body]] as const).filter((entry):entry is readonly ['title'|'body',string]=>Boolean(entry[1]));
 const source=sources.map(([,text])=>text).join('\n');
 const extractionKey=await sha256(canonicalJson({contentHash:revision.contentHash,sources,extractorVersion:CLAIM_EXTRACTOR,policy:CLAIM_POLICY}));
 const documentId=await sha256(canonicalJson({feedId:revision.feedId,revisionId:revision.id,extractionKey}));
 const dependency=source.match(/\b(?:republished from|originally published by|reporting by|distributed by|via)\s+([\p{L}\p{N}][\p{L}\p{N} .'-]{1,80})(?=[\n:;]|$)/iu)?.[1]?.trim();
 const origin:ClaimMention['origin']={kind:dependency?'EXPLICIT_DEPENDENCY':'UNKNOWN',label:dependency,fingerprint:await sha256(source.normalize('NFKC').replace(/\s+/g,' ').trim())};
 const mentions:ClaimMention[]=[],documentRole=classifyRole(source).role;
 for(const [field,source] of sources){
 for(const segment of new Intl.Segmenter('und',{granularity:'sentence'}).segment(source)) {
  const leading=segment.segment.length-segment.segment.trimStart().length,sourceText=segment.segment.trim();if(!sourceText)continue;
  const span={field,start:segment.index+leading,end:segment.index+leading+sourceText.length};
  const attribution=sourceText.match(/^(.{1,100}?)\s+(?:said|says|alleges?|claimed|reported|reports|warned|announced)\b/i)?.[1];
  const obviousRole=nonFactRole(sourceText);const reportingRole:ClaimMention['reportingRole']=obviousRole?obviousRole:/^(?:background|recap|previously)\b/i.test(sourceText)?'BACKGROUND_RECAP':attribution || /[“”«»]/u.test(sourceText)?'QUOTED_CLAIM':['ANALYSIS','OPINION'].includes(documentRole)?'ANALYSIS_OPINION':features(sourceText).development!=='report'?'NEW_REPORTING':'OTHER_UNCERTAIN';
  const quantities=[...sourceText.matchAll(/\d+(?:[.,]\d+)*(?:\s*(?:%|percent\b|million\b|billion\b|thousand\b))?/giu)].map(m=>({text:m[0],start:m.index!,end:m.index!+m[0].length}));
  const qualifiers=[...new Set((sourceText.match(/\b(not|no|never|without|at least|at most|more than|less than|up to|approximately|about|before|after|until)\b/gi)??[]).map(s=>s.toLowerCase()))];
  const id=await sha256(canonicalJson({feedId:revision.feedId,evidenceRevisionId:revision.id,span,extractorVersion:CLAIM_EXTRACTOR,policy:CLAIM_POLICY}));
  const mention=claimMentionSchema.parse({id,feedId:revision.feedId,evidenceRevisionId:revision.id,sourceDocumentId:documentId,extractionKey,span,sourceText,reportingRole,attribution,certainty:certainty(sourceText),quantities,qualifiers,reportTime:revision.publishedAt??revision.acceptedAt,origin,extractorVersion:CLAIM_EXTRACTOR,extractionPolicyVersion:CLAIM_POLICY});
  assertClaimSpan(mention,revision);mentions.push(mention);
 }
 }
 return {document:{id:documentId,feedId:revision.feedId,evidenceRevisionId:revision.id,contentHash:revision.contentHash,extractionKey,claimMentionIds:mentions.map(m=>m.id),origin,extractorVersion:CLAIM_EXTRACTOR,extractionPolicyVersion:CLAIM_POLICY},mentions};
}
export async function persistClaimMentions(tx:FeedTransaction,revision:EvidenceRevision):Promise<ClaimMention[]> {
 const {document,mentions}=await extractClaimMentions(revision);
 await tx.preload('claim_mentions',mentions.map(m=>m.id));
 await tx.write('source_documents',document.id,document);for(const mention of mentions)await tx.write('claim_mentions',mention.id,mention);return mentions;
}
