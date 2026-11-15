import {detectAll} from 'tinyld';
export type OutputLanguage='en'|'ar'|'fr';
export interface LanguageCompliance {
 status:'compliant'|'noncompliant'|'unknown';
 requested:OutputLanguage;detected:string|null;
 reason:string;letters:number;words:number;quotationCount:number;
 candidates:Array<{language:string;score:number}>;
 detector:'tinyld-1.3.4';
}
export function combinedLanguageStatus(judge:'correct'|'incorrect'|'uncertain',independent:LanguageCompliance):'correct'|'incorrect'|'uncertain'{
 if(independent.status==='unknown')return 'uncertain';
 if(independent.status==='noncompliant')return 'incorrect';
 // Conflicting judgments are retained as disagreement rather than erased.
 return judge==='incorrect'||judge==='uncertain'?'uncertain':'correct';
}
const words=(s:string)=>s.match(/\p{L}[\p{L}\p{M}'’]*/gu)??[];
/** Independent of source/judge language. Detector scores are not calibrated probabilities. */
export function languageCompliance(headline:string,body:string,requested:OutputLanguage):LanguageCompliance {
 const whole=(headline+'\n'+body).normalize('NFC').replace(/https?:\/\/\S+/gu,' ');
 let quotationCount=0;
 const narrative=whole.replace(/“[^”]*”|«[^»]*»|"[^"\n]*"/gu,()=>{quotationCount++;return ' '});
 const tokens=words(narrative),letters=(narrative.match(/\p{L}/gu)??[]).length;
 const base={requested,letters,words:tokens.length,quotationCount,detector:'tinyld-1.3.4' as const};
 const unknown=(reason:string,candidates:LanguageCompliance['candidates']=[],detected:string|null=null):LanguageCompliance=>({...base,status:'unknown',reason,candidates,detected});
 if(tokens.length<3||letters<12)return unknown('INSUFFICIENT_NARRATIVE_EVIDENCE');
 // Names and all-cap abbreviations do not establish the language of narration.
 const lowercase=tokens.filter(t=>t[0]===t[0].toLocaleLowerCase()&&t[0]!==t[0].toLocaleUpperCase());
 const arabic=(narrative.match(/\p{Script=Arabic}/gu)??[]).length;
 if(arabic<3&&lowercase.length<2)return unknown('NAME_OR_ABBREVIATION_ONLY');
 // Arabic has no uppercase distinction. Script confidence alone cannot distinguish
 // a list of place/person names from narration; require a syntactic/news cue.
 const arabicCues=new Set('في من إلى الى عن على مع أن ان إن لا لن لم قد قال قالت أعلن أعلنت او أو ثم هو هي هذا هذه بحسب خلال بعد قبل عند دون أمام امام يفتح تبدأ تفتح سيبقى أبقى ابقى'.split(' '));
 if(arabic>=3&&!tokens.some(t=>arabicCues.has(t)||t.startsWith('و')&&arabicCues.has(t.slice(1))))return unknown('ARABIC_NAME_LIST_OR_INSUFFICIENT_SYNTAX');
 // A language-changing sentence is not excused by a majority-language paragraph.
 const segments=narrative.split(/[.!?؟。\n]+/u).filter(s=>words(s).length>=4);
 const confidentSegments=segments.map(s=>detectAll(s)).map(cs=>cs[0]&&cs[0].accuracy>=.075&&cs[0].accuracy-(cs[1]?.accuracy??0)>=.025?cs[0].lang:null).filter(Boolean);
 if(new Set(confidentSegments).size>1)return unknown('MIXED_NARRATIVE_LANGUAGES');
 const raw=detectAll(narrative),candidates=raw.slice(0,4).map(c=>({language:c.lang,score:c.accuracy}));
 const best=candidates[0];if(!best||best.score<.30||best.score-(candidates[1]?.score??0)<.12)return unknown('DETECTOR_AMBIGUOUS',candidates,best?.language??null);
 if(!['en','ar','fr'].includes(best.language))return unknown('OTHER_LANGUAGE_OR_AMBIGUOUS_TEXT',candidates,best.language);
 return {...base,status:best.language===requested?'compliant':'noncompliant',detected:best.language,reason:'INDEPENDENT_NARRATIVE_LANGUAGE',candidates};
}
