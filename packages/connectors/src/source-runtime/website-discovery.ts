import {parse} from 'parse5';
import {primaryTextContainer,headlineElement} from './primary-text';
import {discoverPromedReports} from './promed-discovery';
import {articleUrl} from './provider-normalize';
import {isArticleSchemaType,matchesOpaqueArticlePage} from './article-schema';

interface Node {tagName?:string;attrs?:{name:string;value:string}[];childNodes?:Node[];parentNode?:Node;value?:string}
export interface WebsiteDiscovery {articles:{url:string;title?:string;publishedAt?:string}[];nextPage?:string;paginationUnresolved?:true}
/** Section locators are discovery surfaces, never a single full article. */
export function isWebsiteListingUrl(value:string):boolean {
 const url=new URL(value),host=url.hostname.toLowerCase().replace(/^www\./,''),path=url.pathname.replace(/\/$/,'');
 // Observed publisher sections: keep this exact and host-scoped so short
 // article URLs on other publishers are not discarded by a generic heuristic.
 if(host==='jpost.com'&&['/mdaheroes','/podcast','/american-politics','/diaspora','/judaism','/christianworld','/food-recipes','/archaeology','/science','/israel-news/culture','/history','/omg','/travel'].includes(path))return true;
 if(host==='thenationalnews.com'&&(['/business','/arts-culture','/magazine'].includes(path)||/^\/podcasts\/(?:beyond-the-headlines|culture-bites|business-extra|tarab)$/.test(path)))return true;
 if(host==='lbcgroup.tv'&&(/^\/(?:news-highlights|latest-news)\/(?:ar|en)$/.test(path)||/^\/news-bulletin(?:\/[^/]+)*\/(?:ar|en)$/.test(path)))return true;
 // ESA archive pagination is a section locator, even when its link appears
 // inside a headline card. It must not become an article acquisition job.
 if(host==='esa.int'&&/\/(?:\(archive\)|%28archive%29)\/\d+$/i.test(path))return true;
 return /^\/(?:tags?|category|categories|topics?|sections?)(?:\/[^/?#]+)*\/?$/i.test(new URL(value).pathname)||/^\/(?:(?:news|newsroom)\/(?:all-news|latest|all|recently-published)|all-news|latest-news|latest-articles|opinions?|live|archives?)\/?$/i.test(new URL(value).pathname)||/^\/(?:home\/writer|authors?)\/[^/]+\/?$/i.test(new URL(value).pathname);
}
const attr=(n:Node,key:string)=>n.attrs?.find(a=>a.name===key)?.value??'';
function nodes(root:Node):Node[]{const result:Node[]=[],stack=[root];while(stack.length){const n=stack.pop()!;result.push(n);stack.push(...[...(n.childNodes??[])].reverse())}return result}
const text=(n:Node)=>nodes(n).filter(n=>!n.tagName&&n.value).map(n=>n.value).join('').replace(/\s+/g,' ').trim();
/** Discovery is structural, never a judgment about importance or Event identity.
 * Every captured identity survives; the collector's durable snapshot slices work. */
export function discoverWebsiteArticles(html:string,approvedUrl:string):WebsiteDiscovery|undefined {
 const origin=new URL(approvedUrl).origin,all=nodes(parse(html) as unknown as Node),articles=new Map<string,{url:string;title?:string}>();
 const promed=discoverPromedReports(all.filter(n=>n.tagName==='script').map(n=>nodes(n).map(child=>child.value??'').join('')),all.filter(n=>n.tagName==='tr').map(text),approvedUrl);if(promed)return promed;
 const scoped=(href:string)=>{try{const url=articleUrl(new URL(href,approvedUrl).href);return url&&new URL(url).origin===origin&&url!==articleUrl(approvedUrl)?url:undefined}catch{return undefined}};
 const add=(href:string,title?:string)=>{const url=scoped(href);if(url&&!isWebsiteListingUrl(url)&&!articles.has(url))articles.set(url,{url,...(title?{title}:{})})};
 const canonical=all.find(n=>n.tagName==='link'&&attr(n,'rel').split(/\s+/).includes('canonical'));
 const headline=all.find(n=>n.tagName==='h1');
 let isArticle=false,structuredListing=false,boundSection=false,unboundSection=false,nextPage:string|undefined,paginationUnresolved=false;
 for(const node of all){
  if(node.tagName==='meta'&&attr(node,'property').toLowerCase()==='og:type'&&attr(node,'content').toLowerCase()==='article')isArticle=true;
  if(node.tagName!=='script'||attr(node,'type').toLowerCase()!=='application/ld+json')continue;
  try{
   const stack:unknown[]=[JSON.parse(text(node))];
   while(stack.length){const entry=stack.pop();if(Array.isArray(entry)){stack.push(...entry);continue}if(!entry||typeof entry!=='object')continue;
    const item=entry as Record<string,any>,types=[item['@type']].flat();
    if(types.some(t=>['CollectionPage','SearchResultsPage'].includes(t))){
     const identity=item.url??item.mainEntityOfPage?.['@id']??item.mainEntityOfPage??item['@id'];
     if(typeof identity!=='string')unboundSection=true;
     else try{if(articleUrl(new URL(identity,approvedUrl).href)===articleUrl(approvedUrl))boundSection=true}catch{/* unrelated collection metadata is not this page */}
    }
    if(types.some(isArticleSchemaType)){
     const identity=item.url??item.mainEntityOfPage?.['@id']??item.mainEntityOfPage??item['@id'];
     try{if(typeof identity==='string'&&articleUrl(new URL(identity,approvedUrl).href)===articleUrl(approvedUrl))isArticle=true}catch{/* An unrelated embedded article is not the fetched page. */}
     if(matchesOpaqueArticlePage(item,approvedUrl,canonical?attr(canonical,'href'):undefined,headline?text(headline):undefined))isArticle=true;
    }
    if(types.includes('ItemList')){structuredListing=true;for(const raw of item.itemListElement??[]){const article=raw.item??raw;if(typeof article==='string')add(article);else if(typeof article?.url==='string')add(article.url,article.headline??article.name)}}
    stack.push(...Object.values(item));
   }
  }catch{/* Invalid metadata is not authority to manufacture an article. */}
 }
 if(primaryTextContainer(all))return undefined;
 const bodies=all.filter(n=>n.tagName==='article');
 const directBody=bodies.length===1&&nodes(bodies[0]).some(n=>n.tagName==='h1'&&!nodes(n).some(child=>child.tagName==='a'))&&nodes(bodies[0]).some(n=>n.tagName==='p'&&text(n));
 // Article pages can embed a CollectionPage for their parent section or
 // related stories. Only metadata bound to this URL can override article
 // evidence; an arbitrary nested CollectionPage must not reject the story.
 const section=isWebsiteListingUrl(approvedUrl)||boundSection||unboundSection&&!isArticle&&!directBody;
 if(!section&&(isArticle||directBody))return undefined;
 for(const anchor of all.filter(n=>n.tagName==='a')){
  const href=attr(anchor,'href');if(!href)continue;
  const rel=attr(anchor,'rel').toLowerCase().split(/\s+/);
  if(rel.includes('next')||/(?:^|\s)next(?:\s|$)/i.test(attr(anchor,'class'))&&attr(anchor,'data-page-number')){const next=scoped(href);nextPage??=next;if(!next)paginationUnresolved=true;continue}
  const lineage:Node[]=[];for(let n:Node|undefined=anchor;n;n=n.parentNode)lineage.push(n);
  if(lineage.some(n=>['nav','header','footer','aside','script'].includes(n.tagName??'')||attr(n,'role')==='navigation'||/(?:^|[\s_-])(?:nav|navigation|menu|footer|header|sidebar|masthead)(?:$|[\s_-])/i.test(attr(n,'class').split(/\s+/).filter(token=>! /^(?:has|with|no)[_-]/i.test(token)).join(' ')+' '+attr(n,'id'))))continue;
  if(/(?:^|[\s_-])(?:comment|comments|print|share|reply)(?:$|[\s_-])/i.test(attr(anchor,'class'))||/#(?:comments?|reply)/i.test(href))continue;
  // Publishers commonly wrap the heading in its link (<a><h3>...), rather
  // than placing a link inside the heading. Both are observed headline links.
  const heading=lineage.some(headlineElement)||nodes(anchor).some(headlineElement);
  const entry=lineage.some(n=>n.tagName==='article'||/(?:^|[\s_-])(?:story|post|entry|item|article)(?:$|[\s_-])/i.test(attr(n,'class')));
  const title=/(?:^|[\s_-])(?:title|headline|heading)(?:$|[\s_-])/i.test(attr(anchor,'class'));
  // A whole-card link can also contain a category, deck, duration or badge.
  // Retain the actual headline rather than turning that chrome into identity.
  const childHeadline=nodes(anchor).find(headlineElement);
  if(heading||rel.includes('bookmark')||(entry&&title))add(href,text(childHeadline??anchor)||undefined);
 }
 return section||structuredListing&&articles.size||articles.size>=2?{articles:[...articles.values()],nextPage,...(paginationUnresolved?{paginationUnresolved:true as const}:{})}:undefined;
}
