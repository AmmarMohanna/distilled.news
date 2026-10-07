export interface FidelityFact {id:string;text:string;evidenceRevisionIds:string[];attribution?:string;timing?:import('./freshness').FactTiming;context?:{text:string}}
export interface ReaderNoveltyVerdict {status:'NEW'|'ALREADY_COMMUNICATED'|'NOT_COMMUNICATED'|'UNRESOLVED'|'NOT_APPLICABLE';reason:string;previousFactTexts:string[]}
export interface SemanticFactCheck {readerNovelty?:ReaderNoveltyVerdict;factId:string;communicated:boolean;attribution:boolean;certainty:boolean;temporal:boolean;qualifiers:boolean;nonRepetitive?:boolean;reason:string;readerSpans?:{claimId:string;text:string}[]}
export const faithfulFact=(check:SemanticFactCheck)=>check.communicated&&check.attribution&&check.certainty&&check.temporal&&check.qualifiers&&check.nonRepetitive!==false;
export function hasReaderWitness(check:SemanticFactCheck,claims:{id:string;text:string}[]):boolean {
 return !!check.readerSpans?.length&&check.readerSpans.every(span=>claims.some(c=>c.id===span.claimId&&c.text.includes(span.text)));
}
export interface ReaderFidelity {passed:boolean;failures:{code:'UNSUPPORTED_QUANTITY'|'LOST_QUANTITY'|'UNSUPPORTED_DATE'|'LOST_MODALITY'|'LOST_NEGATION'|'LOST_BOUND'|'LOST_ATTRIBUTION'|'TEMPORAL_FRAMING_REQUIRED';factId?:string;value?:string}[];policyVersion:string}
const normalized=(text:string)=>text.normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
// URL path/query digits are provenance identifiers, not reader-facing quantities.
const factualText=(text:string)=>normalized(text).replace(/https?:\/\/[^\s]+/gu,'');
function numericText(text:string):string {
 const words:Record<string,string>={zero:'0',one:'1',two:'2',three:'3',four:'4',five:'5',six:'6',seven:'7',eight:'8',nine:'9',ten:'10',eleven:'11',twelve:'12',thirteen:'13',fourteen:'14',fifteen:'15',sixteen:'16',seventeen:'17',eighteen:'18',nineteen:'19',twenty:'20',thirty:'30',forty:'40',fifty:'50',sixty:'60',seventy:'70',eighty:'80',ninety:'90'};
 return factualText(text).replace(/([£€$]\s*\d+(?:[.,]\d+)*)\s*m\b/g,'$1 million').replace(/\b(?:(?:a|one)\s+)?century(?=[-\s]+old\b)/g,'100').replace(/\b(?:(?:a|one)\s+)?hundred(?=[-\s]+years?[-\s]+old\b)/g,'100').replace(/[٠-٩۰-۹]/g,c=>String(c.charCodeAt(0)-(c.charCodeAt(0)>=0x6f0?0x6f0:0x660))).replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)\b/g,w=>words[w]);
}
export function numbers(text:string):Set<string> {
 const source=numericText(text);
 return new Set([...source.matchAll(/(\d+(?:[.,]\d+)*)(?:\s*(%|percent\b|hundred\b|thousand\b|million\b|billion\b|trillion\b|bn\b|mn\b|tn\b))?/g)].map(m=>{
  const number=Number(/^\d{1,3}(?:,\d{3})+$/.test(m[1])?m[1].replace(/,/g,''):m[1].replace(',','.')),unit=m[2],scale=unit==='hundred'?100:unit==='thousand'?1000:unit==='million'||unit==='mn'?1e6:unit==='billion'||unit==='bn'?1e9:unit==='trillion'||unit==='tn'?1e12:1;return `${number*scale}${unit==='%'||unit==='percent'?'%':''}`;
 }));
}
function numericalBounds(text:string):Set<string>{
 const operators:Record<string,string>={'at least':'>=','no fewer than':'>=','at most':'<=','no more than':'<=','more than':'>','over':'>','less than':'<','under':'<'};
 return new Set([...numericText(text).matchAll(/\b(at least|no fewer than|at most|no more than|more than|over|less than|under)\s+(?:a\s+)?(\d+(?:[.,]\d+)*(?:\s*(?:%|percent\b|hundred\b|thousand\b|million\b|billion\b|trillion\b|bn\b|mn\b|tn\b))?)/g)].flatMap(m=>[...numbers(m[2])].map(n=>operators[m[1]]+n)));
}
/** Calendar dates are provenance-qualified dates, not casualty counts or ages.
 * Only exact supported calendar dates may bypass the quantity floor; semantic
 * verification still checks whether prose uses them as report or event dates. */
function calendarDates(text:string):{text:string;key:string}[] {
 const months=['january','february','march','april','may','june','july','august','september','october','november','december'];
 const month=months.join('|'),out:{text:string;key:string}[]=[];
 for(const m of text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})(?:T[0-9:.]+Z)?\b/g))out.push({text:m[0],key:`${Number(m[2])}-${Number(m[3])}-${m[1]}`});
 const pattern=new RegExp(`\\b(?:(\\d{1,2})\\s+(${month})|(${month})\\s+(\\d{1,2}))(?:,?\\s+(\\d{4}))?\\b`,'gi');
 for(const m of text.matchAll(pattern))out.push({text:m[0],key:`${months.indexOf((m[2]??m[3]).toLowerCase())+1}-${Number(m[1]??m[4])}${m[5]?`-${m[5]}`:''}`});
 return out;
}
function withoutSupportedDates(text:string,keys:Set<string>):string {
 for(const date of calendarDates(text))if(keys.has(date.key))text=text.replace(date.text,' ');
 return text;
}
/** Extra deterministic floors, not a substitute for contextual entailment.
 * English qualifier guards are enabled only for compatible known language;
 * translations retain the mandatory structured model verification path. */
export function checkReaderFidelity(claimTexts:string[],required:FidelityFact[],allowed:FidelityFact[],english:boolean,semantic?:{pending?:boolean;checks?:SemanticFactCheck[]}):ReaderFidelity {
 const text=factualText(claimTexts.join('\n')),support=factualText(allowed.flatMap(f=>[f.text,...(f.context?[f.context.text]:[])]).join('\n')),failures:ReaderFidelity['failures']=[];
 const dateKeys=new Set(calendarDates(support).map(d=>d.key));for(const f of allowed)for(const date of [f.timing?.sourcePublishedAt,f.timing?.reportTime,f.timing?.eventTime])if(date)for(const d of calendarDates(date))dateKeys.add(d.key);
 for(const key of [...dateKeys])dateKeys.add(key.split('-').slice(0,2).join('-'));
 const quantityText=withoutSupportedDates(text,dateKeys),quantitySupport=withoutSupportedDates(support,dateKeys);
 const offered=numbers(quantitySupport),visible=numbers(quantityText);if(english||offered.size)for(const value of visible)if(!offered.has(value))failures.push({code:'UNSUPPORTED_QUANTITY',value});
 if(english){const bounds=numericalBounds(quantitySupport);for(const value of numericalBounds(quantityText))if(!bounds.has(value))failures.push({code:'UNSUPPORTED_QUANTITY',value});}
 for(const fact of required)for(const value of numbers(withoutSupportedDates(fact.text,dateKeys)))if(!visible.has(value))failures.push({code:'LOST_QUANTITY',factId:fact.id,value});
 // Approximate magnitudes are information too, not interchangeable with "some".
 // This hard floor cannot be overridden by a permissive semantic attestation.
 if(english)for(const fact of required)for(const match of normalized(fact.text).matchAll(/\b(dozens|hundreds|thousands|millions|billions|trillions)\b/g))if(!new RegExp(`\\b${match[1]}\\b`).test(text))failures.push({code:'LOST_QUANTITY',factId:fact.id,value:match[1]});
 for(const date of calendarDates(text))if(!dateKeys.has(date.key))failures.push({code:'UNSUPPORTED_DATE',value:date.text});
 for(const fact of required)if(fact.timing?.framingRequired&&!semantic?.pending&&!semantic?.checks?.some(c=>c.factId===fact.id&&faithfulFact(c)))failures.push({code:'TEMPORAL_FRAMING_REQUIRED',factId:fact.id});
 // Relative event sequence ("days after the killing") does not communicate
 // reporting age. A permissive model verdict cannot erase this reader floor.
 if(english&&!semantic?.pending)for(const fact of required)if(fact.timing?.framingRequired){
  const olderReport=/\b(?:earlier|older|previous|past|prior|original)\b\s+(?:source\s+|news\s+)?(?:report|reporting|coverage|account)\b|\b(?:report|reporting|reported|coverage|account)\b[^.!?]{0,45}\b(?:earlier|older|previous|previously)\b/i.test(text);
  const datedReport=calendarDates(text).length>0&&/\b(?:report|reported|reporting|coverage)\b/i.test(text);
  if(!olderReport&&!datedReport)failures.push({code:'TEMPORAL_FRAMING_REQUIRED',factId:fact.id});
 }
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
 return {passed:!failures.length,failures,policyVersion:'reader-fidelity-floors-v4'};
}

/** Model attestation must concern actual supported reader prose. English adds
 * an explicit correction/contrast floor; other languages rely on entailment. */
export function verifiedCorrectionDelivery(texts:string[],obligationId:string,verifiedIds:string[],english:boolean):boolean {
 return verifiedIds.includes(obligationId)&&(!english||/\b(correction|corrected|previously|earlier|retracted|withdrawn|contrary|disputed|instead|however|now)\b/i.test(texts.join(' ')));
}
