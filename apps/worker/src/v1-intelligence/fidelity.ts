export interface FidelityFact {id:string;text:string;evidenceRevisionIds:string[];attribution?:string}
export interface SemanticFactCheck {factId:string;communicated:boolean;attribution:boolean;certainty:boolean;temporal:boolean;qualifiers:boolean;reason:string}
export const faithfulFact=(check:SemanticFactCheck)=>check.communicated&&check.attribution&&check.certainty&&check.temporal&&check.qualifiers;
export interface ReaderFidelity {passed:boolean;failures:{code:'UNSUPPORTED_QUANTITY'|'LOST_QUANTITY'|'UNSUPPORTED_DATE'|'LOST_MODALITY'|'LOST_NEGATION'|'LOST_BOUND'|'LOST_ATTRIBUTION';factId?:string;value?:string}[];policyVersion:string}
const normalized=(text:string)=>text.normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
// URL path/query digits are provenance identifiers, not reader-facing quantities.
const factualText=(text:string)=>normalized(text).replace(/https?:\/\/[^\s]+/gu,'');
function numbers(text:string):Set<string> {
 const words:Record<string,string>={zero:'0',one:'1',two:'2',three:'3',four:'4',five:'5',six:'6',seven:'7',eight:'8',nine:'9',ten:'10',eleven:'11',twelve:'12',thirteen:'13',fourteen:'14',fifteen:'15',sixteen:'16',seventeen:'17',eighteen:'18',nineteen:'19',twenty:'20',thirty:'30',forty:'40',fifty:'50',sixty:'60',seventy:'70',eighty:'80',ninety:'90'};
 const source=factualText(text).replace(/[٠-٩۰-۹]/g,c=>String(c.charCodeAt(0)-(c.charCodeAt(0)>=0x6f0?0x6f0:0x660))).replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)\b/g,w=>words[w]);
 return new Set([...source.matchAll(/(\d+(?:[.,]\d+)*)(?:\s*(%|percent\b|hundred\b|thousand\b|million\b|billion\b|trillion\b))?/g)].map(m=>{
  const number=Number(/^\d{1,3}(?:,\d{3})+$/.test(m[1])?m[1].replace(/,/g,''):m[1].replace(',','.')),unit=m[2],scale=unit==='hundred'?100:unit==='thousand'?1000:unit==='million'?1e6:unit==='billion'?1e9:unit==='trillion'?1e12:1;return `${number*scale}${unit==='%'||unit==='percent'?'%':''}`;
 }));
}
/** Extra deterministic floors, not a substitute for contextual entailment.
 * English qualifier guards are enabled only for compatible known language;
 * translations retain the mandatory structured model verification path. */
export function checkReaderFidelity(claimTexts:string[],required:FidelityFact[],allowed:FidelityFact[],english:boolean,semantic?:{pending?:boolean;checks?:SemanticFactCheck[]}):ReaderFidelity {
 const text=factualText(claimTexts.join('\n')),support=factualText(allowed.map(f=>f.text).join('\n')),failures:ReaderFidelity['failures']=[];
 const offered=numbers(support),visible=numbers(text);if(english||offered.size)for(const value of visible)if(!offered.has(value))failures.push({code:'UNSUPPORTED_QUANTITY',value});
 for(const fact of required)for(const value of numbers(fact.text))if(!visible.has(value))failures.push({code:'LOST_QUANTITY',factId:fact.id,value});
 const dates=new Set(support.match(/\b\d{4}-\d{2}-\d{2}\b/g)??[]);for(const value of text.match(/\b\d{4}-\d{2}-\d{2}\b/g)??[])if(!dates.has(value))failures.push({code:'UNSUPPORTED_DATE',value});
 if(english)for(const fact of required){
  // Only an explicit independent semantic verdict may resolve a lexical floor.
  // Numbers/dates above remain hard checks. Pending semantic judgment is not a pass.
  if(semantic?.pending||semantic?.checks?.some(c=>c.factId===fact.id&&faithfulFact(c)))continue;
  const source=normalized(fact.text);
  if(/\b(may|might|could|possibly|possible|alleged|unconfirmed|expected|reportedly)\b/.test(source) && !/\b(may|might|could|possibly|possible|potential|alleged|unconfirmed|expected|planned|reportedly|uncertain)\b/.test(text))failures.push({code:'LOST_MODALITY',factId:fact.id});
  if(/\b(not|never|no|without)\b/.test(source)&&!/\b(not|never|no|without|didn't|hasn't|isn't|wasn't|unconfirmed)\b/.test(text))failures.push({code:'LOST_NEGATION',factId:fact.id});
  for(const [phrase,equivalent] of [['at least',/\b(at least|no fewer than)\b/],['at most',/\b(at most|no more than)\b/],['more than',/\b(more than|over)\b/],['less than',/\b(less than|under)\b/],['before',/\b(before|earlier than|prior to)\b/],['after',/\b(after|later than|following)\b/]] as const)if(source.includes(phrase)&&!equivalent.test(text))failures.push({code:'LOST_BOUND',factId:fact.id,value:phrase});
  if(fact.attribution&&!text.includes(normalized(fact.attribution)))failures.push({code:'LOST_ATTRIBUTION',factId:fact.id,value:fact.attribution});
 }
 return {passed:!failures.length,failures,policyVersion:'reader-fidelity-floors-v2'};
}

/** Model attestation must concern actual supported reader prose. English adds
 * an explicit correction/contrast floor; other languages rely on entailment. */
export function verifiedCorrectionDelivery(texts:string[],obligationId:string,verifiedIds:string[],english:boolean):boolean {
 return verifiedIds.includes(obligationId)&&(!english||/\b(correction|corrected|previously|earlier|retracted|withdrawn|contrary|disputed|instead|however|now)\b/i.test(texts.join(' ')));
}
