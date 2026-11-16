export type SearchTopic={title:string;description:string};
export function sourceSearchCacheQuery(query:string,context?:SearchTopic){
 return context?JSON.stringify([query.trim().toLocaleLowerCase(),context.title.trim(),context.description.trim()]):query;
}
