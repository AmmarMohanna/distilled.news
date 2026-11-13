export type SearchTopic={title:string;description:string};
export const topicWords=(value:string):string[]=>value.normalize('NFKD').toLocaleLowerCase().replace(/\p{M}/gu,'').match(/[\p{L}\p{N}]+/gu)??[];
const ignored=new Set(('a an the and or of on in to for with from about by my our your feed news updates update latest current recent stay informed follow following related developments get concise powered summaries relevant all one place interests interest track tracking coverage information specific articles article daily weekly every project projects achievements development regarding concernant actualites nouvelles les des une un le la de du et sur pour dans avec suivre restez dernières dernières حول عن في من إلى على و آخر اخبار أخبار متابعة تحديثات آخر الأخبار').split(' '));
export function topicSearchGate(context?:SearchTopic){
 if(!context)return undefined;
 const title=topicWords(context.title).filter(word=>word.length>1&&!ignored.has(word));
 const description=topicWords(context.description);
 const titleInDescription=title.length>0&&title.every(word=>description.includes(word));
 const terms=[...new Set(titleInDescription?title:description.filter(word=>word.length>1&&!ignored.has(word)))].slice(0,16);
 if(!terms.length)return {hint:context.title,matches:()=>false};
 // Short literal feed subjects, especially people, must retain the full subject.
 const exact=titleInDescription&&title.length>1&&title.length<=5;
 return {hint:exact?context.title:terms.slice(0,4).join(' '),matches:(text:string)=>{
  const words=new Set(topicWords(text));
  return exact?terms.every(term=>words.has(term)):terms.some(term=>words.has(term));
 }};
}
export function sourceSearchCacheQuery(query:string,context?:SearchTopic){
 return context?JSON.stringify([query.trim().toLocaleLowerCase(),context.title.trim(),context.description.trim()]):query;
}
