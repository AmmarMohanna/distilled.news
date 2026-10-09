import {equivalentFact} from './editorial';
import {nonFactRole} from './claims';
/** Meaning-bearing numbers, negation, certainty and attribution survive normalization.
 * Only typography, sentence-ending periods and non-printing formatting characters are ignored. */
const nameToken=(t:string)=>/^\p{Lu}[\p{L}\p{N}'.&-]*$/u.test(t),nameRun=(segment:string)=>{const tokens=segment.trim().split(/\s+/);return tokens.length>0&&tokens.every(nameToken)};
/** Drops the serial comma before a final "and"/"or" only where the preceding text is provably a series of
 * names: the item immediately before the comma is entirely capitalised tokens, and the series is introduced by
 * a clause whose last token is a capitalised name after a lowercase word. Anything else (appositives such as
 * "A, the maker of B, and C", two-item "A, and B" clause joins, lowercase items) keeps its comma, so the text
 * still differs and the question stays conservative. */
function withoutSerialComma(sentence:string):string {
 let out=sentence;
 for(const match of [...sentence.matchAll(/, (and|or) (?=\p{Lu})/gu)].reverse()){
  const before=out.slice(0,match.index),segments=before.split(', '),last=segments.length-1;
  if(last<1||!nameRun(segments[last]))continue;
  let head=last-1;while(head>0&&nameRun(segments[head]))head--;
  const lead=segments[head].trim().split(/\s+/);
  if(lead.length<2||!nameToken(lead[lead.length-1])||!lead.slice(0,-1).some(t=>/^\p{Ll}/u.test(t)))continue;
  out=before+' '+match[1]+' '+out.slice(match.index!+match[0].length);
 }
 return out;
}
export function normalizedReporting(text:string):string {
 return [...new Intl.Segmenter('und',{granularity:'sentence'}).segment(text)].map(s=>s.segment.trim()).filter(s=>!nonFactRole(s)).map(s=>s.normalize('NFKC').replace(/[\u200b\u200c\u200d\ufeff]/g,'').replace(/[‘’]/g,"'").replace(/[“”]/g,'"').replace(/\s+/g,' ').replace(/[.]\s*$/,'')).map(withoutSerialComma).join('\n');
}
export function revisionChangesMeaning(previous:string,current:string):boolean {
 const a=normalizedReporting(previous),b=normalizedReporting(current);if(a===b)return false;
 // Ambiguous lexical edits remain material: a spelling heuristic cannot establish semantic equivalence.
 return !equivalentFact(a,b);
}
export interface CommunicatedSpan {field:'title'|'body';text:string}
export interface CommunicatedSpanChange {span:CommunicatedSpan;counterparts:string[]}
const sentences=(text:string|undefined)=>text?[...new Intl.Segmenter('und',{granularity:'sentence'}).segment(text)].map(s=>s.segment.trim()).filter(Boolean):[];
/** Claim-level source-revision check. A source revision is evidence about the exact spans that were
 * communicated, not about the whole document: a span that still has a meaning-equivalent sentence in the
 * current revision is unchanged even when unrelated reporting was added. Spans with no such sentence are
 * returned with the sentences that are new or edited in the revision (their only possible replacements).
 * Contradictions and retractions of an unchanged sentence arrive as new evidence through the semantic path. */
export function changedCommunicatedSpans(spans:CommunicatedSpan[],previous:{title?:string;body?:string},current:{title?:string;body?:string}):CommunicatedSpanChange[] {
 const before=new Set([...sentences(previous.title),...sentences(previous.body)].map(s=>normalizedReporting(s))),now=[...sentences(current.title),...sentences(current.body)];
 const added=now.filter(s=>!before.has(normalizedReporting(s))&&!nonFactRole(s));
 return spans.filter(span=>!nonFactRole(span.text)&&!now.some(s=>!revisionChangesMeaning(span.text,s))).map(span=>({span,counterparts:added}));
}
