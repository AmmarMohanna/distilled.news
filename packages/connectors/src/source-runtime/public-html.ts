import {parse} from 'parse5';
import {discoverWebsiteArticles} from './website-discovery';
type Node={tagName?:string;nodeName?:string;value?:string;attrs?:{name:string;value:string}[];childNodes?:Node[];parentNode?:Node};
const attr=(n:Node,name:string)=>n.attrs?.find(a=>a.name===name)?.value??'';
const excluded=new Set(['script','style','noscript','nav','header','footer','aside','form','button','svg']);
export const PUBLIC_ARTICLE_HTML_MAX_BYTES=6_000_000;
function text(root:Node,skip=true,keepHeader=false):string {
 const parts:string[]=[],stack=[root];let seen=0;
 while(stack.length&&seen++<100000){const n=stack.pop()!;if(skip&&excluded.has(n.tagName??'')&&!(keepHeader&&n.tagName==='header'))continue;if(n.nodeName==='#text')parts.push(n.value??'');else stack.push(...[...(n.childNodes??[])].reverse());}
 return parts.join(' ').replace(/\s+/g,' ').trim();
}
/** Deterministic public HTML extraction. Dates come only from publisher
 * publication metadata; missing dates and content remain explicitly missing. */
export function extractPublicHtml(html:string,url:string){
 if(new TextEncoder().encode(html).length>PUBLIC_ARTICLE_HTML_MAX_BYTES)throw Error('SOURCE_TOO_LARGE');
 // Large publisher pages often consist mostly of scripts. They were already
 // excluded from article text; discard them before DOM construction while
 // retaining structured article/date/restriction metadata.
 const source=html.replace(/<script\b([^>]*)>[\s\S]*?<\/script\s*>/gi,(full,attrs:string)=>/\btype\s*=\s*(?:"application\/ld\+json"|'application\/ld\+json'|application\/ld\+json(?=\s|$))/i.test(attrs)?full:'').replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi,'');
 let tags=0;for(const _ of source.matchAll(/<[a-zA-Z][\w:-]*\b/g))if(++tags>100000)throw Error('SOURCE_TOO_COMPLEX');
 const root=parse(source) as Node,all:Node[]=[],stack=[root];
 while(stack.length&&all.length<100000){const n=stack.pop()!;all.push(n);stack.push(...[...(n.childNodes??[])].reverse());}
 if(stack.length)throw Error('SOURCE_TOO_COMPLEX');
 const meta=(key:string)=>all.find(n=>n.tagName==='meta'&&(attr(n,'property').toLowerCase()===key||attr(n,'name').toLowerCase()===key));
 const metadata=(key:string)=>{const n=meta(key);return n?attr(n,'content'):undefined};
 let publishedAt=metadata('article:published_time')??metadata('datepublished');
 let title=all.find(n=>n.tagName==='h1')?text(all.find(n=>n.tagName==='h1')!):metadata('og:title')??text(all.find(n=>n.tagName==='title')??{});
 let structuredBody:string|undefined,articleMetadata=metadata('og:type')==='article',restrictedMetadata=false,softwareMetadata=false,catalogueMetadata=false,productMetadata=false;
 const samePage=(identity:unknown)=>{if(typeof identity!=='string')return false;try{const a=new URL(identity,url),b=new URL(url);return !a.username&&!a.password&&a.origin===b.origin&&a.pathname.replace(/\/$/,'')===b.pathname.replace(/\/$/,'')&&a.search===b.search}catch{return false}};
 for(const script of all.filter(n=>n.tagName==='script'&&attr(n,'type')==='application/ld+json').slice(0,10)){
  const raw=text(script,false);if(raw.length>128000)continue;
  try{
   const pending:unknown[]=[JSON.parse(raw)];let seen=0;
   while(pending.length&&seen++<2000){const item=pending.pop();if(Array.isArray(item)){pending.push(...item);continue}if(!item||typeof item!=='object')continue;
    const value=item as Record<string,unknown>,types=[value['@type']].flat();
    if(samePage(value.url??value['@id'])){
     const entity=value.mainEntity as {itemListElement?:unknown[]}|undefined;
     if(types.includes('CollectionPage')&&Array.isArray(entity?.itemListElement)&&entity.itemListElement.some(entry=>{
      if(!entry||typeof entry!=='object')return false;const e=entry as Record<string,unknown>,p=(e.item??e) as Record<string,unknown>;
      return p&&[p['@type']].flat().includes('Product');
     }))catalogueMetadata=true;
     if(types.includes('Product'))productMetadata=true;
     if(types.some(t=>['CollectionPage','Product'].includes(String(t)))&&typeof value.datePublished==='string'&&!publishedAt)publishedAt=value.datePublished;
     if(types.some(t=>['CollectionPage','Product'].includes(String(t)))&&value.isAccessibleForFree===false)restrictedMetadata=true;
    }
    if(types.includes('SoftwareApplication'))softwareMetadata=true;
    if(types.some(t=>['WebPage','Article','NewsArticle','BlogPosting','ScholarlyArticle','MedicalScholarlyArticle'].includes(String(t)))&&(value.isAccessibleForFree===false||value.isAccessibleForFree==='False'||value.isAccessibleForFree==='false'))restrictedMetadata=true;
    if(types.some(t=>['Article','NewsArticle','BlogPosting','ScholarlyArticle','MedicalScholarlyArticle'].includes(String(t)))){
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
 const listing=discoverWebsiteArticles(source,url);
 const article=all.find(n=>n.tagName==='article'),main=all.find(n=>n.tagName==='main'||attr(n,'role')==='main');
 // Some publishers use an explicit article-body div instead of <article>.
 // Require article metadata and one unambiguous content container; never read
 // the entire page or mistake a listing's generic content div for reporting.
 const articleBodies=articleMetadata?all.filter(n=>attr(n,'itemprop').split(/\s+/).includes('articleBody')||n.tagName==='div'&&(attr(n,'class').split(/\s+/).includes('entry-content')||attr(n,'id')==='article-start'&&attr(n,'class').split(/\s+/).includes('content-box'))):[];
 // Some Article microdata publishers (including Naharnet) put the reporting
 // in itemprop=description. Admit only a multi-paragraph description owned by
 // an Article container; a generic description/meta teaser is not a body.
 const descriptions=articleMetadata&&!articleBodies.length?all.filter(n=>{
  if(!attr(n,'itemprop').split(/\s+/).includes('description')||(n.childNodes??[]).filter(c=>c.tagName==='p'&&text(c)).length<2)return false;
  for(let parent=n.parentNode;parent;parent=parent.parentNode)if(attr(parent,'itemtype').split(/\s+/).some(t=>/^https?:\/\/schema\.org\/(?:Article|NewsArticle|BlogPosting)$/.test(t)))return true;
  return false;
 }):[];
 if(descriptions.length===1)articleBodies.push(descriptions[0]);
 // TechSpot's software RSS entries are detail pages, not news articles. Retain
 // their actual description and release notes, without inventing publication
 // dates from dateModified or promoting the site's download index.
 if(softwareMetadata&&new URL(url).hostname==='www.techspot.com'&&/^\/downloads\/\d+-[^/]+\.html$/.test(new URL(url).pathname)){
  const details=all.filter(n=>n.tagName==='div'&&attr(n,'class').split(/\s+/).includes('product-details')&&attr(n,'class').split(/\s+/).includes('articleBody'));
  if(details.length===1){articleBodies.push(details[0]);articleMetadata=true;}
 }
 const content=articleBodies.length===1?articleBodies[0]:undefined;
 const explicitPreview=all.some(n=>attr(n,'data-test')==='institution-access-preview'&&/preview of subscription content/i.test(text(n)));
 const accessRestricted=restrictedMetadata&&(explicitPreview||!structuredBody&&!content&&!article&&all.some(n=>/(?:^|[\s_-])paywall(?:$|[\s_-])/i.test(attr(n,'class')+' '+attr(n,'id'))));
 let body=structuredBody??(content||article||main?text(content??article??main!):'');
 let contentKind:'PRODUCT_DETAIL'|'CATALOGUE'|undefined;
 const within=(n:Node,parent:Node)=>{for(let p:Node|undefined=n;p;p=p.parentNode)if(p===parent)return true;return false};
 // A primary Product scope owns its visible name/description. Related product
 // cards and a bare navigation index cannot become the current page's evidence.
 const productScopes:Node[]=[];
 for(let n=all.find(n=>n.tagName==='h1');n;n=n.parentNode)if(n.attrs?.some(a=>a.name==='itemscope')&&attr(n,'itemtype').split(/\s+/).some(t=>/^https?:\/\/schema\.org\/Product$/.test(t))&&(!attr(n,'itemid')||samePage(attr(n,'itemid'))))productScopes.push(n);
 const primaryProducts=productScopes.length===1&&all.filter(n=>n.tagName==='h1').length===1?productScopes.filter(p=>all.filter(n=>attr(n,'itemprop').split(/\s+/).includes('description')).slice(0,20).some(n=>within(n,p)&&text(n).length>=100)):[];
 if(!articleMetadata&&!article&&primaryProducts.length===1){body=text(primaryProducts[0],true,true);contentKind='PRODUCT_DETAIL';}
 else if(!articleMetadata&&!article&&main&&all.some(n=>n.tagName==='h1'&&within(n,main))&&(productMetadata||catalogueMetadata&&listing&&listing.articles.length>0)){
  body=text(main,true,true);contentKind=productMetadata?'PRODUCT_DETAIL':'CATALOGUE';
 }
 const canonical=all.find(n=>n.tagName==='link'&&attr(n,'rel').split(/\s+/).includes('canonical'));
 let canonicalUrl=url;try{const candidate=new URL(canonical?attr(canonical,'href'):url,url);if(candidate.origin===new URL(url).origin&&candidate.pathname!=='/')canonicalUrl=candidate.href}catch{}
 return {title,body,...(contentKind?{contentKind}:{}),...(accessRestricted?{accessRestricted:true}:{}),publishedAt:publishedAt&&Number.isFinite(Date.parse(publishedAt))?new Date(publishedAt).toISOString():undefined,canonicalUrl,
  language:attr(all.find(n=>n.tagName==='html')??{},'lang')||undefined,
  pageKind:contentKind?'catalogue':listing?'listing':articleMetadata||article?'article':'unknown',articleLinks:listing?.articles.map(a=>a.url)??[]};
}
