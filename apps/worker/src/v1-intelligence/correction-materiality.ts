import {equivalentFact} from './editorial';
import {nonFactRole} from './claims';
/** Meaning-bearing numbers, negation, certainty and attribution survive normalization.
 * Only typography, sentence-ending periods and non-printing formatting characters are ignored. */
export function normalizedReporting(text:string):string {
 return [...new Intl.Segmenter('und',{granularity:'sentence'}).segment(text)].map(s=>s.segment.trim()).filter(s=>!nonFactRole(s)).map(s=>s.normalize('NFKC').replace(/[\u200b\u200c\u200d\ufeff]/g,'').replace(/[‘’]/g,"'").replace(/[“”]/g,'"').replace(/\s+/g,' ').replace(/[.]\s*$/,'')).join('\n');
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
