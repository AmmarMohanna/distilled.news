import {eventTokens,jaccardSimilarity,normalizeText,stableHash,firstSentence} from "./text";
import {hasAuthoritySignal,isRelevantToInterest} from "./filtering";
import {sanitizeEvidenceText} from "./summarization";
import type {BriefingConfig,BriefingEvidence,BriefingItem,DevelopmentState,GroundedClaim,NormalizedMessage} from "./types";

/** Preserve article query identity; remove tracking only. */
export function normalizedDocumentUrl(value?:string):string|undefined {
  if(!value)return undefined;
  try{const url=new URL(value);if(!["https:","http:"].includes(url.protocol)||url.username||url.password)return undefined;
    url.hash="";url.hostname=url.hostname.toLowerCase().replace(/^www\./,"");
    for(const key of [...url.searchParams.keys()])if(/^(utm_|at_|fbclid$|gclid$|mc_)/i.test(key))url.searchParams.delete(key);
    url.searchParams.sort();url.pathname=url.pathname.replace(/\/+$/,"")||"/";
    return url.href;
  }catch{return undefined}
}
export function sameDocument(left:NormalizedMessage,right:NormalizedMessage):boolean {
  if(left.id===right.id)return true;
  const a=normalizedDocumentUrl(left.sourceUrl),b=normalizedDocumentUrl(right.sourceUrl);
  if(a&&b&&a===b)return true;
  if(left.source.id===right.source.id&&left.news?.contentHash&&left.text.length>=200&&left.news.contentHash===right.news?.contentHash)return true;
  if(a&&b)return false;
  return left.source.id===right.source.id&&(left.messageId===right.messageId||normalizeText(left.text)===normalizeText(right.text));
}
export function evidenceFingerprint(evidence:BriefingEvidence[]):string {
  return stableHash(evidence.map(entry=>`${entry.messageId}:${stableHash(entry.text)}`).sort().join("|"));
}
export function validateGroundedClaims(claims:GroundedClaim[],evidence:BriefingEvidence[]):GroundedClaim[] {
  if(!Array.isArray(claims)||claims.length<1||claims.length>6)throw Error("INVALID_GROUNDED_CLAIMS");
  return claims.map(claim=>{
    if(typeof claim.text!=="string"||claim.text.length<12||claim.text.length>1200||!Array.isArray(claim.support)||!claim.support.length||claim.support.length>4)throw Error("INVALID_GROUNDED_CLAIMS");
    const support=claim.support.map(ref=>{
      const source=evidence.find(entry=>entry.messageId===ref.messageId);
      if(!source||typeof ref.quote!=="string"||ref.quote.trim().length<12||ref.quote.length>1600||!compact(source.text).includes(compact(ref.quote)))throw Error("UNSUPPORTED_CLAIM_REFERENCE");
      return {messageId:source.messageId,quote:ref.quote.trim()};
    });
    const quoted=compact(support.map(ref=>ref.quote).join(" "));
    for(const number of claim.text.match(/\d+(?:[.,]\d+)*/g)??[])if(!quoted.includes(number))throw Error("UNSUPPORTED_CLAIM_NUMBER");
    return{id:`claim_${stableHash(normalizeText(claim.text))}`,text:claim.text.trim(),support,...(claim.isNew===false?{isNew:false}:{})};
  });
}
export function extractiveClaims(evidence:BriefingEvidence[]):GroundedClaim[] {
  const result:GroundedClaim[]=[];
  for(const source of evidence){
    const quote=firstSentence(source.text).trim().slice(0,1000);
    const text=sanitizeEvidenceText(quote).trim();
    if(text.length<12||result.some(claim=>sameFact(claim.text,text)))continue;
    result.push({id:`claim_${stableHash(normalizeText(text))}`,text,support:[{messageId:source.messageId,quote}]});
    if(result.length===3)break;
  }
  return result;
}
export function sameFact(left:string,right:string):boolean {
  if(normalizeText(left)===normalizeText(right))return true;
  if((left.match(/\d+(?:[.,]\d+)*/g)??[]).join("|")!==(right.match(/\d+(?:[.,]\d+)*/g)??[]).join("|"))return false;
  return jaccardSimilarity(eventTokens(left),eventTokens(right))>=0.88;
}
export function updateDevelopment(item:BriefingItem,previous:BriefingItem|undefined,claims:GroundedClaim[],briefing:BriefingConfig,now:Date,method:"DETERMINISTIC"|"SEMANTIC_REVIEW"="DETERMINISTIC"):DevelopmentState {
  const prior=previous?.development,known=prior?.claims??[];
  const nextClaims=known.map(claim=>({...claim,support:claim.support.map(ref=>({...ref}))}));
  const added:string[]=[];
  for(const claim of claims){const match=nextClaims.find(known=>sameFact(known.text,claim.text));
    if(match){for(const ref of claim.support)if(!match.support.some(existing=>existing.messageId===ref.messageId&&existing.quote===ref.quote))match.support.push(ref)}
    else if(claim.isNew!==false){nextClaims.push(claim);added.push(claim.id)}
  }
  const previousIds=new Set(previous?.evidence.map(entry=>entry.messageId)??[]),newIds=item.evidence.filter(entry=>!previousIds.has(entry.messageId)).map(entry=>entry.messageId);
  const changes=[...(prior?.changes??[])];
  const kind=!previous?"NEW_DEVELOPMENT":added.length?(/correct|revis|contradict|تصحيح|تراجع/i.test(claims.map(claim=>claim.text).join(" "))?"CORRECTION_OR_CONFLICT":"NEW_INFORMATION"):"CORROBORATION";
  if(newIds.length||added.length)changes.push({id:`change_${stableHash(item.id+newIds.sort().join("|")+added.sort().join("|"))}`,at:now.toISOString(),kind,claimIds:added,messageIds:newIds});
  const meaningful=!previous||added.length>0;
  item.updatedAt=meaningful?now.toISOString():(previous?.updatedAt??item.updatedAt);
  const state:DevelopmentState={version:(prior?.version??0)+1,evidenceFingerprint:evidenceFingerprint(item.evidence),claims:nextClaims.slice(-24),changes:changes.slice(-32),ranking:rankDevelopment(item,briefing,now,meaningful),membership:item.evidence.map(entry=>({messageId:entry.messageId,method:previousIds.has(entry.messageId)?prior?.membership.find(member=>member.messageId===entry.messageId)?.method??"DETERMINISTIC":previous?method:"INITIAL"}))};
  item.development=state;
  return state;
}
export function rankDevelopment(item:BriefingItem,briefing:BriefingConfig,now:Date,meaningful=true){
  const text=item.evidence.map(entry=>entry.text).join(" ");
  const relevant=isRelevantToInterest({text} as NormalizedMessage,briefing);
  const relevance=relevant?1:0.15;
  const importance=/killed|injured|evacuat|approved|court|hurricane|earthquake|ceasefire|government|قُتل|قتلى|إعصار|حكومة|اتفاق|حرب/i.test(text)?0.9:hasAuthoritySignal(text)?0.65:0.35;
  const age=Math.max(0,now.getTime()-Date.parse(item.itemAt)),recency=Math.exp(-age/(3*86400000));
  const novelty=meaningful?1:0.15;
  const sources=new Set(item.evidence.map(entry=>entry.sourceId)).size,confidence=Math.min(1,0.6+Math.min(sources,3)*0.1);
  return {relevance,importance,novelty,recency,confidence,score:Number((relevance*0.3+importance*0.3+novelty*0.2+recency*0.1+confidence*0.1).toFixed(4))};
}
function compact(value:string){return value.normalize("NFKC").replace(/\s+/g," ").trim()}
