/** Discovery results add a publisher, so an existing RSS feed from that
 * publisher also counts as added. Social accounts retain their path identity.
 */
export function sourcePublisherKey(input:string){
 const source=input.trim().replace(/^rss\s*:\s*/i,'');
 try{
  const url=new URL(/^https?:\/\//i.test(source)?source:'https://'+source);
  const host=url.hostname.toLowerCase().replace(/^www\./,'');
  if(!host.includes('.'))return source.toLowerCase();
  const social=/^(?:t\.me|telegram\.me|x\.com|twitter\.com|linkedin\.com|youtube\.com|reddit\.com|facebook\.com)$/i.test(host);
  return host+(social?url.pathname.replace(/\/+$/,''):'');
 }catch{return source.toLowerCase();}
}

function sourceScope(input:string){
 const value=input.trim().replace(/^rss\s*:\s*/i,'');
 try{
  const url=new URL(/^https?:\/\//i.test(value)?value:'https://'+value);
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||!url.hostname.includes('.'))return;
  url.hostname=url.hostname.replace(/^www\./,'');url.hash='';
  const rss=/^rss\s*:/i.test(input)||/\.(?:xml|rss|atom)$/i.test(url.pathname)||/\/(?:rss|feed)\/?$/i.test(url.pathname);
  for(const key of [...url.searchParams.keys()])if(/^utm_/i.test(key)||['fbclid','gclid'].includes(key.toLowerCase()))url.searchParams.delete(key);
  const broad=rss||url.pathname==='/'&&!url.search;
  return {broad,key:url.hostname+url.pathname.replace(/\/$/,'')+url.search};
 }catch{return;}
}

/** A specific followed page never subscribes the user to its whole institution
 * or publisher. Existing publisher/RSS subscriptions retain their broader scope. */
export function sourceIsAlreadyAdded(candidate:string,selected:readonly string[]){
 const target=sourceScope(candidate);
 return selected.some(input=>{
  const saved=sourceScope(input);
  if(!saved||!target)return sourcePublisherKey(input)===sourcePublisherKey(candidate);
  return saved.broad?sourcePublisherKey(input)===sourcePublisherKey(candidate):saved.key===target.key;
 });
}
