/** A narrow negative entailment floor, NOT an entailment classifier.
 * Match explicit predicate/object relations and exact coordinated objects;
 * never borrow a predicate from another object in the same source. Unknown
 * syntax, translated text and semantically paraphrased objects still require
 * contextual verification. No topic, publisher or company rules live here. */
const predicates:Record<string,string>={
 address:'TOPIC',addresses:'TOPIC',addressed:'TOPIC',discuss:'TOPIC',discusses:'TOPIC',discussed:'TOPIC',
 prohibit:'BAN',prohibits:'BAN',prohibited:'BAN',ban:'BAN',bans:'BAN',banned:'BAN',forbid:'BAN',forbids:'BAN',forbidden:'BAN',
 mandate:'REQUIRE',mandates:'REQUIRE',mandated:'REQUIRE',require:'REQUIRE',requires:'REQUIRE',required:'REQUIRE',
 consider:'CONSIDER',considers:'CONSIDER',considered:'CONSIDER',approve:'APPROVE',approves:'APPROVE',approved:'APPROVE',
 propose:'PROPOSE',proposes:'PROPOSE',proposed:'PROPOSE',implement:'IMPLEMENT',implements:'IMPLEMENT',implemented:'IMPLEMENT',
 plan:'PLAN',plans:'PLAN',planned:'PLAN',complete:'COMPLETE',completes:'COMPLETE',completed:'COMPLETE',
 affect:'AFFECT',affects:'AFFECT',affected:'AFFECT',
};
const pattern=()=>new RegExp(`\\b(${Object.keys(predicates).join('|')})\\b`,'g');
interface Relation {action:string;object:string;uncertain:boolean;negative:boolean}
const normalize=(s:string)=>s.normalize('NFKC').toLowerCase().replace(/[’]/g,"'").replace(/\s+/g,' ').trim();
function objects(text:string):string[]{
 return text.replace(/^(?:activities? related to|activities? involving)\s+/,'').split(/\s*(?:,|\band\b|\bor\b)\s*/).map(s=>s.replace(/^(?:the|a|an)\s+/,'').trim()).filter(Boolean);
}
function relations(text:string):Relation[]{
 const result:Relation[]=[];
 for(const sentence of normalize(text).split(/[.!?;\n]+/)){
  // Conditional, quoted and contrastive/embedded clauses need contextual
  // judgment. Do not assert a deterministic relation across those boundaries.
  if(/\b(?:if|unless|whether|though|although|because)\b|["“”]/.test(sentence))continue;
  const matches=[...sentence.matchAll(pattern())];
  for(const [i,m]of matches.entries()){
   const before=sentence.slice(i?matches[i-1].index!+matches[i-1][0].length:0,m.index),after=sentence.slice(m.index!+m[0].length,i+1<matches.length?matches[i+1].index:undefined);
   const passive=/\b(?:is|are|was|were|be|been)\s+(?:not\s+)?$/.test(before)&&/^(?:prohibited|banned|forbidden|mandated|required|approved|implemented|completed|affected)$/.test(m[0]);
   let object=passive?before.replace(/\s+(?:(?:may|might|could|will)\s+)?(?:is|are|was|were|be|been)\s+(?:not\s+)?$/,''):after;
   if(!passive&&i+1<matches.length)object=object.replace(/\s*(?:,?\s+(?:and|but|while)\s+(?:[\w'-]+\s+){0,4})$/,'');
   // Only simple terminal noun/gerund objects or explicit lists. Infinitive,
   // relative and embedded predicates are not proved by this cheap parser.
   if(/\b(?:to|that|which|who|when|from|by)\b/.test(object.replace(/^\s*(?:activities? related to)\s+/,'')))continue;
   object=object.trim();if(!object)continue;
   const uncertain=/\b(?:may|might|could|possibly|reportedly|allegedly)\b/.test(before),negative=/\b(?:not|never|cannot|can't|doesn't|didn't|won't)\b/.test(before);
   for(const item of objects(object))result.push({action:predicates[m[0]],object:item,uncertain,negative});
  }
 }
 return result;
}
const strengthens=(source:string,reader:string)=>source==='TOPIC'&&['BAN','REQUIRE'].includes(reader)
 || source==='CONSIDER'&&reader==='APPROVE'||source==='PROPOSE'&&reader==='IMPLEMENT'||source==='PLAN'&&reader==='COMPLETE';
export function provenActionStrengthViolations(texts:string[],facts:{id:string;text:string}[]):{factId:string;value:string}[]{
 const parsed=facts.map(f=>({fact:f,relations:relations(f.text)})),support=parsed.flatMap(f=>f.relations.map(r=>({...r,factId:f.fact.id}))),failures:{factId:string;value:string}[]=[];
 for(const reader of texts.flatMap(relations)){
  const aligned=support.filter(s=>s.object===reader.object);
  // A legitimate explicit relation for this object must remain permitted,
  // including equivalent action words and stronger source modality.
  if(aligned.some(s=>s.action===reader.action&&s.negative===reader.negative&&(!s.uncertain||reader.uncertain)))continue;
  // Another approved span discussing the SAME object in unrecognised syntax
  // may legitimately supply the action (passive/embedded/qualified scope).
  // Do not convert incomplete parsing into a proven absence of support.
  const objectPattern=new RegExp(`\\b${reader.object.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\b`);
  if(parsed.some(s=>objectPattern.test(normalize(s.fact.text))&&!s.relations.some(r=>r.object===reader.object)))continue;
  const contradicted=aligned.find(s=>s.action===reader.action&&(s.negative!==reader.negative||s.uncertain&&!reader.uncertain)
   || !s.negative&&!reader.negative&&strengthens(s.action,reader.action));
  if(contradicted)failures.push({factId:contradicted.factId,value:`${contradicted.action}${contradicted.negative?' NEGATED':''}${contradicted.uncertain?' UNCERTAIN':''} -> ${reader.action}${reader.negative?' NEGATED':''}${reader.uncertain?' UNCERTAIN':''}: ${reader.object}`});
 }
 return failures;
}
