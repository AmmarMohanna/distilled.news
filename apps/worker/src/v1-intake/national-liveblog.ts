import {WorkerPublicSourceFetch} from '../public-source-fetch';
import {AcquisitionFailure} from './acquisition';

/** Public SEO representation documented by Arena and bound by National's own
 * Fusion page metadata. No API keys, general URL resolution or script execution. */
export async function nationalLiveblog(html:string,url:string,fetcher:typeof fetch){
 const page=new URL(url),day=/^\/news\/[^/]+\/(\d{4})\/(\d{2})\/(\d{2})\/[^/]+\/?$/.exec(page.pathname);
 if(page.origin!=='https://www.thenationalnews.com'||!day)return;
 const raw=/Fusion\.globalContent=(\{[\s\S]*?\});Fusion\.globalContentConfig=/.exec(html)?.[1];
 if(!raw)return;
 let data:Record<string,unknown>;try{data=JSON.parse(raw)}catch{return;}
 if(data.canonical_url!==page.pathname||!Array.isArray(data.content_elements))return;
 const embeds=data.content_elements.filter((v:unknown)=>v&&typeof v==='object'&&(v as Record<string,unknown>).type==='custom_embed'&&(v as Record<string,unknown>).subtype==='arena-api-inline');
 if(embeds.length!==1)return;
 const id=(embeds[0] as {embed?:{config?:{embedId?:unknown}}}).embed?.config?.embedId;
 if(typeof id!=='string'||! /^[A-Za-z0-9_-]{6,32}$/.test(id))return;
 const endpoint=`https://cached-api.arena.im/v1/liveblog/the-national/${id}/ldjson`;
 const response=await new WorkerPublicSourceFetch(endpoint,fetcher,{maxBytes:2_000_000}).get(endpoint);
 if(response.status!==200||response.authenticationRequired)return;
 const json=/<script\s+type=["']application\/ld\+json["']\s*>([\s\S]*?)<\/script>/.exec(response.body)?.[1];
 if(!json)return;
 let blog:Record<string,unknown>;try{blog=JSON.parse(json)}catch{return;}
 const identity=`https://www.thenationalnews.com/${id}/`;
 if(blog['@type']!=='LiveBlogPosting'||blog['@id']!==identity+'#liveblog'||blog.isAccessibleForFree!==true||!Array.isArray(blog.liveBlogUpdate)||blog.liveBlogUpdate.length>5000)return;
 const date=day.slice(1).join('-'),updates:{at:string;title:string;body:string}[]=[];
 for(const raw of blog.liveBlogUpdate){
  if(!raw||typeof raw!=='object')continue;
  const p=raw as Record<string,unknown>;
  if(p['@type']!=='BlogPosting'||typeof p.url!=='string'||typeof p.datePublished!=='string'||typeof p.articleBody!=='string'||typeof p.headline!=='string')continue;
  if(!p.publisher||typeof p.publisher!=='object'||(p.publisher as Record<string,unknown>)['@id']!=='https://www.thenationalnews.com/#organization')continue;
  let link:URL;try{link=new URL(p.url)}catch{continue;}
  if(link.origin!==page.origin||link.pathname!==`/${id}/`||!link.searchParams.get('arena_mid'))continue;
  const timestamp=Date.parse(p.datePublished);if(!Number.isFinite(timestamp))continue;
  const at=new Date(timestamp).toISOString();if(!at.startsWith(date))continue;
  if(p.articleBody.trim())updates.push({at,title:p.headline,body:p.articleBody});
 }
 if(!updates.length)return;
 updates.sort((a,b)=>a.at.localeCompare(b.at));
 const body=updates.map(p=>`${p.at}\n${p.title}\n${p.body}`).join('\n\n');
 if(new TextEncoder().encode(body).length>500_000)throw new AcquisitionFailure('BODY_BUDGET_EXCEEDED',false);
 if(body.length<200)return;
 return {body,contentCompleteness:'PARTIAL' as const};
}
