export type SearchTopic={title:string;description:string};
/** Retrieval hint only. Relevance is judged from the complete context by the model,
 * never by requiring all words of a multiword category title. */
export function sourceSearchHint(context?:SearchTopic){
 return context?.title.trim();
}
export function sourceSearchCacheQuery(query:string,context?:SearchTopic){
 return context?JSON.stringify([query.trim().toLocaleLowerCase(),context.title.trim(),context.description.trim()]):query;
}
