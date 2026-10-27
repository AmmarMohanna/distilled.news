/** Explicit schema.org article types used by news publishers. */
export function isArticleSchemaType(type:unknown):boolean {
 return typeof type==='string'&&/^(?:https?:\/\/schema.org\/)?(?:Article|NewsArticle|BlogPosting|ReportageNewsArticle|OpinionNewsArticle|AnalysisNewsArticle|BackgroundNewsArticle|ReviewNewsArticle)$/.test(type);
}

/** Ignore only transport tracking; preserve origin, path and content queries. */
export function sameArticleUrl(left:string,right:string):boolean {
 const normalize=(value:string)=>{
  const url=new URL(value);if(url.username||url.password||!['https:','http:'].includes(url.protocol))throw Error('INVALID_ARTICLE_URL');
  url.hash='';
  for(const key of [...url.searchParams.keys()])if(/^utm_/i.test(key)||['fbclid','gclid','mc_cid','mc_eid','igshid','traffic_source'].includes(key.toLowerCase()))url.searchParams.delete(key);
  return url.href;
 };
 try{return normalize(left)===normalize(right);}catch{return false;}
}

/** Some publishers use a numeric CMS ID instead of a URL in JSON-LD.
 * Bind it using both the page canonical and matching primary headline; never
 * let a related story's numeric ID claim the current page. */
export function matchesOpaqueArticlePage(item:Record<string,unknown>,url:string,canonical:string|undefined,title:string|undefined):boolean {
 if(item.url||item.mainEntityOfPage||!/^\d+$/.test(String(item['@id']??''))||!canonical||!title||typeof item.headline!=='string')return false;
 try{
  const a=new URL(canonical,url),b=new URL(url);a.hash='';b.hash='';
  const normalize=(value:string)=>value.replace(/\s+/g,' ').trim();
  return a.href===b.href&&normalize(item.headline)===normalize(title);
 }catch{return false;}
}
