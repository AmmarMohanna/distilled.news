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
