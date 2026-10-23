import {parse} from 'parse5';
import {discoverWebsiteArticles} from './website-discovery';
type Node={tagName?:string;nodeName?:string;value?:string;attrs?:{name:string;value:string}[];childNodes?:Node[]};
const attr=(n:Node,name:string)=>n.attrs?.find(a=>a.name===name)?.value??'';
const excluded=new Set(['script','style','noscript','nav','header','footer','aside','form','button','svg']);
function text(root:Node,skip=true):string {
 const parts:string[]=[],stack=[root];let seen=0;
 while(stack.length&&seen++<100000){const n=stack.pop()!;if(skip&&excluded.has(n.tagName??''))continue;if(n.nodeName==='#text')parts.push(n.value??'');else stack.push(...[...(n.childNodes??[])].reverse());}
 return parts.join(' ').replace(/\s+/g,' ').trim();
}
/** Deterministic public HTML extraction. Dates come only from publisher
 * publication metadata; missing dates and content remain explicitly missing. */
export function extractPublicHtml(html:string,url:string){
 if(new TextEncoder().encode(html).length>2_000_000)throw Error('SOURCE_TOO_LARGE');
 const root=parse(html) as Node,all:Node[]=[],stack=[root];
 while(stack.length&&all.length<100000){const n=stack.pop()!;all.push(n);stack.push(...[...(n.childNodes??[])].reverse());}
 const meta=(key:string)=>all.find(n=>n.tagName==='meta'&&(attr(n,'property').toLowerCase()===key||attr(n,'name').toLowerCase()===key));
 const metadata=(key:string)=>{const n=meta(key);return n?attr(n,'content'):undefined};
 let publishedAt=metadata('article:published_time')??metadata('datepublished');
 let title=all.find(n=>n.tagName==='h1')?text(all.find(n=>n.tagName==='h1')!):metadata('og:title')??text(all.find(n=>n.tagName==='title')??{});
 let structuredBody:string|undefined,articleMetadata=metadata('og:type')==='article';
 for(const script of all.filter(n=>n.tagName==='script'&&attr(n,'type')==='application/ld+json').slice(0,10)){
  const raw=text(script,false);if(raw.length>128000)continue;
  try{
   const pending:unknown[]=[JSON.parse(raw)];let seen=0;
   while(pending.length&&seen++<2000){const item=pending.pop();if(Array.isArray(item)){pending.push(...item);continue}if(!item||typeof item!=='object')continue;
    const value=item as Record<string,unknown>,types=[value['@type']].flat();
    if(types.some(t=>['Article','NewsArticle','BlogPosting'].includes(String(t)))){
     const entity=value.mainEntityOfPage,identity=typeof value.url==='string'?value.url:typeof entity==='string'?entity:entity&&typeof entity==='object'?(entity as Record<string,unknown>)['@id']:undefined;
     if(typeof identity==='string'&&new URL(identity,url).href!==new URL(url).href)continue;
     articleMetadata=true;
     if(!publishedAt&&typeof value.datePublished==='string')publishedAt=value.datePublished;
     if(!title&&typeof value.headline==='string')title=value.headline;
     if(typeof value.articleBody==='string')structuredBody=value.articleBody;
    }
    pending.push(...Object.values(value));
   }
  }catch{/* Malformed metadata cannot supply evidence. */}
 }
 const listing=discoverWebsiteArticles(html,url);
 const article=all.find(n=>n.tagName==='article'),main=all.find(n=>n.tagName==='main'||attr(n,'role')==='main');
 // Some publishers use an explicit article-body div instead of <article>.
 // Require article metadata and one unambiguous content container; never read
 // the entire page or mistake a listing's generic content div for reporting.
 const articleBodies=articleMetadata?all.filter(n=>attr(n,'itemprop').split(/\s+/).includes('articleBody')||n.tagName==='div'&&(attr(n,'class').split(/\s+/).includes('entry-content')||attr(n,'id')==='article-start'&&attr(n,'class').split(/\s+/).includes('content-box'))):[];
 const content=articleBodies.length===1?articleBodies[0]:undefined;
 const body=structuredBody??(content||article||main?text(content??article??main!):'');
 const canonical=all.find(n=>n.tagName==='link'&&attr(n,'rel').split(/\s+/).includes('canonical'));
 let canonicalUrl=url;try{const candidate=new URL(canonical?attr(canonical,'href'):url,url);if(candidate.origin===new URL(url).origin&&candidate.pathname!=='/')canonicalUrl=candidate.href}catch{}
 return {title,body,publishedAt:publishedAt&&Number.isFinite(Date.parse(publishedAt))?new Date(publishedAt).toISOString():undefined,canonicalUrl,
  language:attr(all.find(n=>n.tagName==='html')??{},'lang')||undefined,
  pageKind:listing?'listing':articleMetadata||article?'article':'unknown',articleLinks:listing?.articles.map(a=>a.url)??[]};
}
