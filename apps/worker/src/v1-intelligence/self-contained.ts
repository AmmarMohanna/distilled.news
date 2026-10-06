import type {EvidenceRevision} from '@distilled/contracts';

/** How well a fact stands on its own. UNASSESSED means the language is not one
 * the conservative detector understands; it is never treated as resolved. */
export type SelfContainment='YES'|'RESOLVED_BY_CONTEXT'|'UNRESOLVED'|'UNASSESSED';
/** Context taken from permitted, retained evidence only. The provenance is the
 * evidence revision it came from; nothing is generated. */
export interface FactContext {evidenceRevisionId:string;field:'title';text:string}
export interface ContainmentAssessment {status:SelfContainment;context?:FactContext}

// Topic-agnostic anaphoric heads: nouns that normally refer back to something
// introduced elsewhere ("the incident", "the ads"). Deliberately small; a miss
// only means the fact is treated as already self-contained.
const anaphoricHeads=new Set(['incident','ads','advertisements','advertisement','attack','proposal','plan','move','decision','report','deal','merger','bill','measure','announcement','statement','case','crash','explosion','accident','claim','claims','move','policy','campaign','probe','investigation','talks','meeting','vote','ruling','move']);
const pronouns=new Set(['he','she','they','it','his','her','their','its','this','that','these','those','him','them']);
const letters=(s:string)=>s.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu)??[];
const stem=(w:string)=>w.replace(/(ies|es|s)$/,'');

/** The unresolved reference a fact starts with, if any. English only. */
export function leadingReference(text:string):{kind:'PRONOUN'|'ANAPHORIC_NOUN';head:string;anchor?:string}|undefined {
 const abstract=/^([^.!?]{1,100})['?]s\s+(success|decision|move|proposal|result|failure|victory|loss|achievement)\b(.*)$/iu.exec(text.trim());
 // A named actor does not explain a vague outcome. Concrete complements do.
 if(abstract&&!/^\s+(?:in|at|with|to|of|over|against|on|about)\b/i.test(abstract[3]))return {kind:'ANAPHORIC_NOUN',head:abstract[2].toLowerCase(),anchor:abstract[1]};
 const words=letters(text);if(!words.length)return;
 const first=words[0]!,second=words[1];
 if(pronouns.has(first))return {kind:'PRONOUN',head:first};
 if((first==='the'||first==='these'||first==='those'||first==='this'||first==='that')&&second&&anaphoricHeads.has(second))return {kind:'ANAPHORIC_NOUN',head:second};
 return undefined;
}

/** Judge a fact against the evidence that supports it. Context is only the
 * supporting revision's own title, and only when it demonstrably names the
 * referent (anaphoric noun appears in the title) or the title itself is
 * independent of pronouns (pronoun case, resolved by the writer under
 * verification). Otherwise the gap is reported, never papered over. */
export function assessSelfContainment(text:string,support:Pick<EvidenceRevision,'id'|'title'|'language'>[]):ContainmentAssessment {
 const language=support[0]?.language;
 if(language && language!=='en' && !language.startsWith('en-'))return {status:'UNASSESSED'};
 // Embedded descriptive possessives can hide an unnamed actor even when
 // the opening subject is explicit ("people received ... the store's app").
 const embedded=/\bthe\s+[^.!?,;]{1,65}['’]s\s+(app|website|platform|service|product|decision|proposal|plan|statement|policy)\b/iu.exec(text);
 const award=/\b(?:has|have)\s+won\s+(?:for|because|after)\b/iu.test(text);
 const gap=leadingReference(text)??(award?{kind:'ANAPHORIC_NOUN' as const,head:'win'}:undefined)??(embedded?{kind:'ANAPHORIC_NOUN' as const,head:embedded[1].toLowerCase()}:undefined);
 if(!gap)return {status:'YES'};
 for(const e of support){
  const title=(e.title??'').trim();if(!title||leadingReference(title))continue;
  const titleStems=new Set(letters(title).map(stem));
  const names=gap.anchor?letters(gap.anchor).map(stem).every(w=>titleStems.has(w)):gap.kind==='ANAPHORIC_NOUN'?titleStems.has(stem(gap.head)):titleStems.size>=2;
  if(names)return {status:'RESOLVED_BY_CONTEXT',context:{evidenceRevisionId:e.id,field:'title',text:title}};
 }
 return {status:'UNRESOLVED'};
}
