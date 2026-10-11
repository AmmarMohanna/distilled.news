import {normalizeRssSnapshot} from '@distilled/connectors';
import {WorkerPublicSourceFetch} from './public-source-fetch';

/** Owner-approved, one-origin discovery. A section page must advertise a
 * section-specific feed; the site's generic feed is not a substitute. */
export async function discoverPublicRssFeed(pageUrl:string,fetcher:typeof fetch=fetch):Promise<string|undefined>{
 const page=new URL(pageUrl);
 const section=/^\/(?:category|section|topic|topics)\//i.test(page.pathname);
 if(page.pathname!=='/'&&!section)return undefined;
 const port=new WorkerPublicSourceFetch(page.href,fetcher);
 let document:Awaited<ReturnType<WorkerPublicSourceFetch['get']>>;
 try{document=await port.get(page.href)}catch{return undefined}
 if(document.status!==200)return undefined;
 if(/<(?:rss|feed)(?:\s|>)/i.test(document.body.slice(0,1000))){
  try{normalizeRssSnapshot(document.body,page.href);return page.href}catch{return undefined}
 }
 const candidates:string[]=[];
 for(const tag of document.body.match(/<link\b[^>]*>/gi)??[]){
  const attributes=Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/g)].map(m=>[m[1].toLowerCase(),m[3]]));
  if(!/\balternate\b/i.test(attributes.rel??'')||!/application\/(?:rss|atom)\+xml/i.test(attributes.type??''))continue;
  if(!attributes.href)continue;
  try{
   const candidate=new URL(attributes.href,page);
   if(candidate.protocol!=='https:'||candidate.origin!==page.origin||candidate.username||candidate.password||candidate.hash)continue;
   if(section&&!candidate.pathname.startsWith(page.pathname.replace(/\/?$/,'/')))continue;
   if(!candidates.includes(candidate.href))candidates.push(candidate.href);
  }catch{/* Malformed advertised feed is ignored. */}
  if(candidates.length>=3)break;
 }
 if(!section&&candidates.length===0)candidates.push(new URL('/feed/',page).href);
 for(const candidate of candidates){
  try{
   const response=await port.get(candidate);
   if(response.status!==200||/text\/html/i.test(response.contentType))continue;
   normalizeRssSnapshot(response.body,candidate);
   return candidate;
  }catch{/* A failed candidate does not authorize a cross-origin probe. */}
 }
 return undefined;
}
