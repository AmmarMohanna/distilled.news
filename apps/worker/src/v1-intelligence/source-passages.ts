import {sha256,type EvidenceRevision} from '@distilled/contracts';
import {canonicalJson} from '../v1-intake/canonical';
import {assertClaimSpan,type ClaimMention,type SourceDocument} from './claims';
import type {FeedTransaction} from './store';

export const SOURCE_PASSAGES='exact-source-paragraphs-v2';
export const isSourcePassageVersion=(version:string)=>version===SOURCE_PASSAGES||version==='exact-source-paragraphs-v1';
/** A source index, not claim extraction. Paragraphs are reference anchors, not
 * facts, occurrence boundaries or eligibility judgments. Retain connected prose
 * and every non-whitespace character in the title and body, in any language.
 * ClaimMention is only the existing persistence/reference format. */
export async function indexSourcePassages(revision:EvidenceRevision):Promise<{document:SourceDocument;mentions:ClaimMention[]}> {
 const extractionKey=await sha256(canonicalJson({contentHash:revision.contentHash,title:revision.title,body:revision.body,policy:SOURCE_PASSAGES}));
 const id=await sha256(canonicalJson({feedId:revision.feedId,revisionId:revision.id,extractionKey}));
 const origin:ClaimMention['origin']={kind:'UNKNOWN',fingerprint:await sha256(canonicalJson({title:revision.title,body:revision.body}))};
 const mentions:ClaimMention[]=[];
 for(const field of ['title','body'] as const){
  const source=revision[field]??'';let start=0;
  const ends=field==='body'?[...source.matchAll(/\r?\n(?:[\t ]*\r?\n)*/g)].map(m=>({end:m.index!,next:m.index!+m[0].length})):[];
  for(const {end,next} of [...ends,{end:source.length,next:source.length}]){
   const sourceText=source.slice(start,end),span={field,start,end};start=next;
   if(!sourceText.trim())continue;
   const mention:ClaimMention={id:await sha256(canonicalJson({documentId:id,span})),feedId:revision.feedId,evidenceRevisionId:revision.id,sourceDocumentId:id,extractionKey,span,sourceText,
    // Unspecified legacy fields carry NO semantic assertion. Consumers of this
    // version must use source text and model judgments, never these placeholders.
    reportingRole:'OTHER_UNCERTAIN',certainty:{kind:'UNSPECIFIED',hedges:[]},quantities:[],qualifiers:[],reportTime:revision.publishedAt??revision.acceptedAt,origin,extractorVersion:SOURCE_PASSAGES,extractionPolicyVersion:SOURCE_PASSAGES};
   assertClaimSpan(mention,revision);mentions.push(mention);
  }
 }
 return {document:{id,feedId:revision.feedId,evidenceRevisionId:revision.id,contentHash:revision.contentHash,extractionKey,claimMentionIds:mentions.map(m=>m.id),origin,extractorVersion:SOURCE_PASSAGES,extractionPolicyVersion:SOURCE_PASSAGES},mentions};
}
export async function persistSourcePassages(tx:FeedTransaction,revision:EvidenceRevision){
 const {document,mentions}=await indexSourcePassages(revision);
 await tx.preload('claim_mentions',mentions.map(m=>m.id));await tx.write('source_documents',document.id,document);
 for(const mention of mentions)await tx.write('claim_mentions',mention.id,mention);
 return mentions;
}
