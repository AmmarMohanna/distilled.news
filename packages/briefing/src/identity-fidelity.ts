export interface IdentityIssue {code:'ARABIC_NAME_UNBOUND'|'ARABIC_ROLE_UNBOUND'|'ARABIC_NAME_BOUNDARY_UNCERTAIN'|'ARABIC_TRANSLITERATION_UNRESOLVED';name:string;role:string;quote:string}
// Joseph has both observed Arabic renderings in these sources. This is spelling
// normalization, not a table assigning people their supposedly current offices.
const cleaned=(s:string)=>s.normalize('NFKC').replace(/[\u064b-\u065f\u0670\u0640\u200e\u200f\u202a-\u202e]/gu,'').replace(/[أإآ]/gu,'ا').replace(/جوزاف/gu,'جوزيف');
const normalized=(s:string)=>cleaned(s).replace(/[^\p{L}\p{N}]+/gu,' ').trim();
export const normalizeArabicIdentityText=normalized;
const role='(?:رئيس مجلس الوزراء|رئيس الحكومة|رئيس الوزراء|رئيس الجمهورية|قائد الجيش|الرئيس)';
const stop=new Set('قال قالت يقول اكد اكدت يؤكد اعلن اعلنت يعلن اوضح اوضحت يوضح شدد شددت يشدد تحدث حضر كشف ذكر اضاف اضافت يضيف افتتح وافق التقى يلتقي يزور دعا يدعو ان انه بان في من على الي عن مع الذي التي هذا هذه هو هي خلال بعد قبل اليوم امس غدا بسبب بشان بخصوص حول قرار قرارا القرار تاجيل الجلسة التنفيذي التنفيذية السابق السابقة الاسبق الاسبقة الحالي الحالية الفخري الفخرية'.split(' '));
const canonicalRole=(s:string)=>/رئيس (?:مجلس الوزراء|الحكومة|الوزراء)/u.test(s)?'prime_minister':s==='الرئيس'||s==='رئيس الجمهورية'?'president':'army_commander';
export function arabicPersonMentions(text:string){
 const value=cleaned(text),pattern=new RegExp(`(${role})\\s+(?:(?:اللبناني|العراقي|السوري|الفرنسي|الاسرائيلي|البريطاني|الاميركي|الامريكي|الروسي|الايراني|المصري|السعودي|القطري|الاردني|التركي)(?:ة)?\\s+)?`,'gu');
 return [...value.matchAll(pattern)].flatMap(m=>{
  const tail=value.slice(m.index!+m[0].length).replace(/^[\s«“"]+/u,''),end=tail.search(/[^\p{Script=Arabic}\s]/u),region=end<0?tail:tail.slice(0,end);
  const words=region.trim().split(/\s+/u).filter(Boolean),clause=words.findIndex(word=>stop.has(word)||/^[وف]/u.test(word)&&stop.has(word.slice(1)));
  const tokens=clause<0?words:words.slice(0,clause);
  if(!tokens.length)return [];
  // Keep the WHOLE candidate run. Unknown prose is not silently truncated to
  // two presumed name tokens. A separate binding check must resolve its end.
  const boundary: 'clause'|'punctuation'|'open'|'uncertain'=clause>=0?'clause':end<0?'open':/[،,؛;:«»“”"]/u.test(tail[end])?'punctuation':/[.!?؟]/u.test(tail[end])?'open':'uncertain';
  const name=tokens.join(' ');
  return [{role:m[1],name,quote:`${m[1]} ${name}`,boundary}];
 });
}
/** Role-led Arabic candidate spans, not general NER or a truth oracle. An
 * unresolved boundary or transliteration requests repair/abstention, never an
 * automatic rewrite or a claim that the publisher itself is false. */
export function arabicIdentityIssues(reader:string,sources:string[]):IdentityIssue[]{
 const evidence=sources.map(normalized),bound=sources.flatMap(arabicPersonMentions);
 const arabicEvidence=sources.some(s=>/\p{Script=Arabic}/u.test(s));
 const crossScript=!arabicEvidence&&sources.some(s=>/[a-z]/iu.test(s))||sources.some(s=>new RegExp(`${role}\\s+[A-Za-z]`,'u').test(cleaned(s))||/\b(?:president|prime minister|army commander)\s+[A-Za-z]/iu.test(s));
 return arabicPersonMentions(reader).flatMap(m=>{
  // A supported surname abbreviation is a suffix, never a shared given-name
  // prefix. Thus عبد الفتاح cannot stand in for عبد الفتاح السيسي unnoticed.
  const matching=bound.filter(b=>b.boundary!=='uncertain'&&(b.name===m.name||b.name.endsWith(' '+m.name)));
  const explicit=matching.filter(b=>b.boundary==='clause'||b.boundary==='punctuation');
  const nameFound=evidence.some(s=>` ${s} `.includes(` ${m.name} `));
  let code:IdentityIssue['code']|undefined;
  if(!nameFound&&crossScript)code='ARABIC_TRANSLITERATION_UNRESOLVED';
  else if(m.boundary==='uncertain'||m.boundary==='open'&&m.name.split(' ').length>2&&!explicit.length)code='ARABIC_NAME_BOUNDARY_UNCERTAIN';
  else if(!nameFound)code='ARABIC_NAME_UNBOUND';
  else if(!matching.length)code='ARABIC_NAME_BOUNDARY_UNCERTAIN';
  else if(!matching.some(b=>canonicalRole(b.role)===canonicalRole(m.role)))code='ARABIC_ROLE_UNBOUND';
  return code?[{...m,code}]:[];
 });
}
