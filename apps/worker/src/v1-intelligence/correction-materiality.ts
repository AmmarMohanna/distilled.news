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
