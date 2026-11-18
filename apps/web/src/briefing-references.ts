import type {BriefingEdition,BriefingEvidence} from '@distilled/core';

/** Reader-only identity. Never changes retained URLs, evidence or operation IDs. */
export function readerArticleIdentity(value:string|undefined){
 try{
  const url=new URL(value??'');if(!['https:','http:'].includes(url.protocol)||url.username||url.password)return;
  if(url.pathname==='/'||/\/(?:rss|feed)\/?$|\.(?:xml|rss|atom)$/i.test(url.pathname))return;
  url.hash='';
  const bbc=['bbc.co.uk','www.bbc.co.uk','bbc.com','www.bbc.com'].includes(url.hostname);
  const rss=[...url.searchParams].some(([key,value])=>key.toLowerCase()==='at_medium'&&/^(rss|feed)$/i.test(value));
  for(const key of [...url.searchParams.keys()])if(/^utm_/i.test(key)||['fbclid','gclid','mc_cid','mc_eid'].includes(key.toLowerCase())||((bbc||rss)&&['at_medium','at_campaign','at_link_type'].includes(key.toLowerCase())))url.searchParams.delete(key);
  return url.href;
 }catch{return;}
}
function socialPostUrl(value:string|undefined){
 try{
  const url=new URL(value??'');if(!['https:','http:'].includes(url.protocol)||url.username||url.password)return;
  const post=/^(?:www\.)?(?:x\.com|twitter\.com)$/.test(url.hostname)&&/\/status\/\d+/.test(url.pathname)||/^(?:t\.me|telegram\.me)$/.test(url.hostname)&&/^\/[^/]+\/\d+$/.test(url.pathname)||/^(?:www\.)?linkedin\.com$/.test(url.hostname)&&/^\/(?:posts\/|feed\/update\/)/.test(url.pathname);
  return post?url.href:undefined;
 }catch{return;}
}
export function readerEvidenceUrl(entry:BriefingEvidence){
 if(entry.sourceKind&&/^(?:x_|linkedin_|telegram_)/.test(entry.sourceKind)){
  const post=[entry.sourceUrl,...entry.links].flatMap(value=>{const url=socialPostUrl(value);return url?[url]:[];})[0];
  if(post)return post;
 }
 return (entry.links.length?entry.links:[entry.sourceUrl]).flatMap(value=>{
  try{const url=new URL(value??'');return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password?[url.href]:[];}catch{return [];}
 })[0];
}
function evidenceIdentity(entry:BriefingEvidence){
 // Independent social posts can discuss the same linked article. Their message
 // identities remain distinct when a post URL is not retained.
 const primary=readerEvidenceUrl(entry);
 if(entry.sourceKind&&/^(?:x_|linkedin_|telegram_)/.test(entry.sourceKind)&&!socialPostUrl(primary))return;
 return readerArticleIdentity(primary);
}

/** Number distinct articles within each story; retain every underlying evidence
 * index so alternative links and attachments remain reachable in the popup. */
export function briefingReferences(edition: Pick<BriefingEdition,'sections'>) {
 return edition.sections.flatMap((section,sectionIndex)=>{
  const groups:{sectionIndex:number;evidenceIndex:number;evidenceIndexes:number[]}[]=[],identities=new Map<string,typeof groups[number]>();
  section.evidence.forEach((entry,evidenceIndex)=>{
   const identity=evidenceIdentity(entry),existing=identity?identities.get(identity):undefined;
   if(existing){existing.evidenceIndexes.push(evidenceIndex);return;}
   const group={sectionIndex,evidenceIndex,evidenceIndexes:[evidenceIndex]};groups.push(group);if(identity)identities.set(identity,group);
  });
  return groups.length?groups:[{sectionIndex,evidenceIndex:0,evidenceIndexes:[]}];
 }).map((reference,index)=>({...reference,number:index+1}));
}
