export type SearchTopic={title:string;description:string};
export const topicWords=(value:string):string[]=>value.normalize('NFKD').toLocaleLowerCase().replace(/\p{M}/gu,'').match(/[\p{L}\p{N}]+/gu)??[];
const ignored=new Set(('a an the and or of on in to for with from about by my our your feed news updates update latest current recent stay informed follow following related developments get concise powered summaries relevant all one place interests interest track tracking coverage information specific articles article daily weekly every project projects achievements development regarding concernant actualites nouvelles les des une un le la de du et sur pour dans avec suivre restez dernières dernières حول عن في من إلى على و آخر اخبار أخبار متابعة تحديثات آخر الأخبار').split(' '));
export function topicSearchGate(context?:SearchTopic){
 if(!context)return undefined;
 const title=topicWords(context.title).filter(word=>word.length>1&&!ignored.has(word));
 const description=topicWords(context.description);
 const titleInDescription=title.length>0&&title.every(word=>description.includes(word));
 const exact=titleInDescription&&title.length>1&&title.length<=5;
 // A category title is a label, not an instruction to discard the rest of the
 // interests. Proper subjects/geographies still retain their original anchor.
 const categories=new Set(['economy','economics','business','finance','technology','computing','science','research','health','sports','sport','politics','economie','entreprises','technologie','recherche','sante','politique','اقتصاد','الاقتصاد','تكنولوجيا','علوم','صحة','رياضة','سياسة']);
 const retainTitle=exact||(titleInDescription&&!title.some(word=>categories.has(word)));
 const terms=[...new Set(retainTitle?title:[...title,...description.filter(word=>word.length>1&&!ignored.has(word))])].slice(0,16);
 if(!terms.length)return {hint:context.title,matches:()=>false};
 // Short literal feed subjects, especially people, must retain the full subject.
 const variants=(word:string)=>{
  // Arabic conjunctions/prepositions attached to the definite article are
  // grammatical variants, not different subjects. Never alter exact names.
  const prefix=word.match(/^(?:[وفبك]ال|لل|ال)/u)?.[0];
  return prefix&&word.length-prefix.length>=3?[word,word.slice(prefix.length)]:[word];
 };
 const relevant=new Set(terms.flatMap(variants));
 return {hint:exact?context.title:terms.slice(0,4).join(' '),matches:(text:string)=>{
  const words=new Set(topicWords(text));
  return exact?terms.every(term=>words.has(term)):[...words].some(word=>variants(word).some(term=>relevant.has(term)));
 }};
}
export function sourceSearchCacheQuery(query:string,context?:SearchTopic){
 return context?JSON.stringify([query.trim().toLocaleLowerCase(),context.title.trim(),context.description.trim()]):query;
}
