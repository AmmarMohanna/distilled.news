import {z} from 'zod';
import {detectSourceInput,TESTED_ACTORS,type SourceDefinition} from '@distilled/connectors';
import {WorkerPublicSourceFetch} from './public-source-fetch';

const telegramConfiguration=z.object({channelId:z.string().regex(/^-[1-9]\d*$/),username:z.string().regex(/^[A-Za-z0-9_]{5,32}$/),public:z.literal(true)}).strict();
const xConfiguration=z.object({username:z.string().regex(/^[A-Za-z0-9_]{1,15}$/)}).strict();
/** Product approval plus the runtime allowlist admits these definitions. No discovery or channel joins. */
export function productConnectorSource(p:{provider:string;kind:string;source_url:string|null;input:string|null;actor_id?:string|null}):{source:SourceDefinition;canonicalUrl:string;identity:unknown;limit:number}|undefined {
 if(p.provider==='web'&&p.kind==='web_page'&&p.source_url&&p.input){
  let detected:ReturnType<typeof detectSourceInput>,url:string;
  try{detected=detectSourceInput(p.input);url=new URL(p.source_url).href;new WorkerPublicSourceFetch(url)}catch{return undefined}
  if(detected.provider!=='web'||detected.kind!=='web_page'||detected.sourceUrl!==url)return undefined;
  return {source:{family:'website',locator:url},canonicalUrl:url,identity:{type:'website',canonicalUrl:url},limit:1};
 }
 if(p.provider==='rss'&&p.kind==='rss_feed'&&p.source_url){
  const url=new URL(p.source_url).href;new WorkerPublicSourceFetch(url);
  return {source:{family:'rss',locator:url},canonicalUrl:url,identity:{type:'rss',canonicalUrl:url},limit:30};
 }
 if(p.provider==='rss'&&p.kind==='google_news'&&p.source_url&&p.input){
  let detected:ReturnType<typeof detectSourceInput>;
  try{detected=detectSourceInput(p.input)}catch{return undefined}
  if(detected.provider!=='rss'||detected.kind!=='google_news'||detected.sourceUrl!==p.source_url)return undefined;
  const query=new URL(p.source_url).searchParams.get('q');
  if(!query)return undefined;
  return {source:{family:'google_news',locator:query,language:'en',region:'US'},canonicalUrl:p.source_url,identity:{type:'google_news',query,language:'en',region:'US'},limit:30};
 }
 if(p.provider==='telegram'&&p.kind==='telegram_channel'&&p.input){
  let raw:unknown;try{raw=JSON.parse(p.input)}catch{return undefined}
  const parsed=telegramConfiguration.safeParse(raw);if(!parsed.success)return undefined;
  const c=parsed.data,url=`https://t.me/${c.username}`;
  if(p.source_url!==url)return undefined;
  return {source:{family:'telegram',locator:c.username,channelId:c.channelId,public:true},canonicalUrl:url,identity:{type:'telegram',channelId:c.channelId},limit:3};
 }
 if(p.provider==='twitterapi_io'&&p.kind==='x_profile'&&p.input){
  let raw:unknown;try{raw=JSON.parse(p.input)}catch{return undefined}
  const parsed=xConfiguration.safeParse(raw);if(!parsed.success)return undefined;
  const username=parsed.data.username,url=`https://x.com/${username}`;
  if(p.source_url!==url)return undefined;
  // Search has a documented maximum of 20 results per page; profile endpoints can differ.
  return {source:{family:'x_search',locator:`from:${username} lang:en`},canonicalUrl:url,identity:{type:'x_search',query:`from:${username.toLowerCase()} lang:en`},limit:20};
 }
 if(p.provider==='apify'&&p.kind==='x_search'&&p.input&&p.actor_id===TESTED_ACTORS.x&& !p.source_url){
  let detected:ReturnType<typeof detectSourceInput>;
  try{detected=detectSourceInput(p.input)}catch{return undefined}
  if(detected.provider!=='apify'||detected.kind!=='x_search')return undefined;
  const terms=detected.actorInput.searchTerms;
  if(!Array.isArray(terms)||terms.length!==1||typeof terms[0]!=='string')return undefined;
  const query=terms[0].trim();
  if(!query||query.length>256)return undefined;
  const url=`https://x.com/search?q=${encodeURIComponent(query)}`;
  return {source:{family:'x_search',locator:query},canonicalUrl:url,identity:{type:'x_search',query},limit:20};
 }
 if(p.provider==='apify'&&p.kind==='x_profile'&&p.input&&p.source_url&&p.actor_id===TESTED_ACTORS.x){
  let detected:ReturnType<typeof detectSourceInput>;
  try{detected=detectSourceInput(p.input)}catch{return undefined}
  if(detected.provider!=='apify'||detected.kind!=='x_profile'||detected.sourceUrl!==p.source_url||!detected.username)return undefined;
  const url=`https://x.com/${detected.username}`;
  if(p.source_url!==url)return undefined;
  return {source:{family:'x_profile',locator:detected.username},canonicalUrl:url,identity:{type:'x_profile',username:detected.username.toLowerCase()},limit:20};
 }
 if(p.provider==='apify'&&(p.kind==='linkedin_company'||p.kind==='linkedin_profile')&&p.source_url&&p.input){
  if(p.actor_id!==TESTED_ACTORS[p.kind])return undefined;
  let detected:ReturnType<typeof detectSourceInput>,url:URL;
  try{detected=detectSourceInput(p.input);url=new URL(p.source_url)}catch{return undefined}
  const segment=p.kind==='linkedin_company'?'company':'in';
  if(detected.provider!=='apify'||detected.kind!==p.kind||detected.sourceUrl!==p.source_url||
    url.protocol!=='https:'||!['linkedin.com','www.linkedin.com'].includes(url.hostname)||url.port||url.username||url.password||url.search||url.hash||
    !new RegExp(`^/${segment}/[A-Za-z0-9._-]+/?$`).test(url.pathname))return undefined;
  return {source:{family:p.kind,locator:url.href},canonicalUrl:url.href,identity:{type:p.kind,canonicalUrl:url.href},limit:20};
 }
 return undefined;
}
