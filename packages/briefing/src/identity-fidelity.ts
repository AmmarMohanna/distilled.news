export interface IdentityIssue {code:'ARABIC_NAME_UNBOUND'|'ARABIC_ROLE_UNBOUND';name:string;role:string;quote:string}
// Joseph has both observed Arabic renderings in these sources. This is spelling
// normalization, not a table assigning people their supposedly current offices.
const normalized=(s:string)=>s.normalize('NFKC').replace(/[\u064b-\u065f\u0670\u0640]/gu,'').replace(/[أإآ]/gu,'ا').replace(/جوزاف/gu,'جوزيف').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
export const normalizeArabicIdentityText=normalized;
const role='(?:رئيس مجلس الوزراء|رئيس الحكومة|رئيس الوزراء|رئيس الجمهورية|قائد الجيش|الرئيس)';
const stop=new Set('قال قالت يقول اكد اكدت يؤكد اعلن اعلنت يعلن اوضح اوضحت يوضح شدد شددت يشدد ان انه بان في من على الي عن مع الذي التي هذا هذه هو هي خلال بعد قبل اليوم امس غدا التنفيذي التنفيذية السابق السابقة الاسبق الاسبقة الحالي الحالية الفخري الفخرية'.split(' '));
const canonicalRole=(s:string)=>/رئيس (?:مجلس الوزراء|الحكومة|الوزراء)/u.test(s)?'prime_minister':s==='الرئيس'||s==='رئيس الجمهورية'?'president':'army_commander';
export function arabicPersonMentions(text:string){
 const value=normalized(text),pattern=new RegExp(`(${role}) (?:(?:اللبناني|العراقي|السوري|الفرنسي|الاسرائيلي|البريطاني|الاميركي|الامريكي|الروسي|الايراني|المصري|السعودي|القطري|الاردني|التركي)(?:ة)? )?([\\p{Script=Arabic}]+) ([\\p{Script=Arabic}]+)`,'gu');
 return [...value.matchAll(pattern)].filter(m=>!stop.has(m[2])&&!stop.has(m[3])).map(m=>({role:m[1],name:`${m[2]} ${m[3]}`,quote:m[0]}));
}
/** Narrow source-binding check, not general NER or a truth oracle. Only explicit
 * two-token Arabic person names following these roles are covered. English /
 * French translation, aliases, single surnames and other entities remain the
 * verifier's responsibility. An unbound span requests repair/abstention, never
 * an automatic rewrite or a claim that the publisher itself is false. */
export function arabicIdentityIssues(reader:string,sources:string[]):IdentityIssue[]{
 const evidence=sources.map(normalized),bound=sources.flatMap(arabicPersonMentions);
 return arabicPersonMentions(reader).flatMap(m=>{
  // Cross-script transliteration cannot be decided by exact matching.
  const surname=m.name.split(' ').at(-1)!;
  if(!evidence.some(s=>s.split(' ').includes(surname)))return [];
  const code=!evidence.some(s=>` ${s} `.includes(` ${m.name} `))?'ARABIC_NAME_UNBOUND':!bound.some(b=>b.name===m.name&&canonicalRole(b.role)===canonicalRole(m.role))?'ARABIC_ROLE_UNBOUND':undefined;
  return code?[{...m,code}]:[];
 });
}
