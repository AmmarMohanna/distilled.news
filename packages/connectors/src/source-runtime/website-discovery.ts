import {parse} from 'parse5';
import {articleUrl} from './provider-normalize';
import {isArticleSchemaType,matchesOpaqueArticlePage} from './article-schema';

interface Node {tagName?:string;attrs?:{name:string;value:string}[];childNodes?:Node[];parentNode?:Node;value?:string}
export interface WebsiteDiscovery {articles:{url:string;title?:string}[];nextPage?:string;paginationUnresolved?:true}
/** Section locators are discovery surfaces, never a single full article. */
export function isWebsiteListingUrl(value:string):boolean {
 return /^\/(?:tags?|category|categories|topics?|sections?)(?:\/[^/?#]+)*\/?$/i.test(new URL(value).pathname)||/^\/(?:(?:news|newsroom)\/(?:all-news|latest|all|recently-published)|all-news|latest-news|latest-articles|opinions?|live|archives?)\/?$/i.test(new URL(value).pathname)||/^\/(?:home\/writer|authors?)\/[^/]+\/?$/i.test(new URL(value).pathname);
}
const attr=(n:Node,key:string)=>n.attrs?.find(a=>a.name===key)?.value??'';
function nodes(root:Node):Node[]{const result:Node[]=[],stack=[root];while(stack.length){const n=stack.pop()!;result.push(n);stack.push(...[...(n.childNodes??[])].reverse())}return result}
const text=(n:Node)=>nodes(n).filter(n=>!n.tagName&&n.value).map(n=>n.value).join('').replace(/\s+/g,' ').trim();
/** Discovery is structural, never a judgment about importance or Event identity.
 * Every captured identity survives; the collector's durable snapshot slices work. */
export function discoverWebsiteArticles(html:string,approvedUrl:string):WebsiteDiscovery|undefined {
 const origin=new URL(approvedUrl).origin,all=nodes(parse(html) as unknown as Node),articles=new Map<string,{url:string;title?:string}>();
 const scoped=(href:string)=>{try{const url=articleUrl(new URL(href,approvedUrl).href);return url&&new URL(url).origin===origin&&url!==articleUrl(approvedUrl)?url:undefined}catch{return undefined}};
 const add=(href:string,title?:string)=>{const url=scoped(href);if(url&&!isWebsiteListingUrl(url)&&!articles.has(url))articles.set(url,{url,...(title?{title}:{})})};
 const canonical=all.find(n=>n.tagName==='link'&&attr(n,'rel').split(/\s+/).includes('canonical'));
 const headline=all.find(n=>n.tagName==='h1');
 let isArticle=false,structuredListing=false,nextPage:string|undefined,paginationUnresolved=false;
 for(const node of all){
  if(node.tagName==='meta'&&attr(node,'property').toLowerCase()==='og:type'&&attr(node,'content').toLowerCase()==='article')isArticle=true;
  if(node.tagName!=='script'||attr(node,'type').toLowerCase()!=='application/ld+json')continue;
  try{
   const stack:unknown[]=[JSON.parse(text(node))];
   while(stack.length){const entry=stack.pop();if(Array.isArray(entry)){stack.push(...entry);continue}if(!entry||typeof entry!=='object')continue;
    const item=entry as Record<string,any>,types=[item['@type']].flat();
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
 const bodies=all.filter(n=>n.tagName==='article');
 const directBody=bodies.length===1&&nodes(bodies[0]).some(n=>n.tagName==='h1'&&!nodes(n).some(child=>child.tagName==='a'))&&nodes(bodies[0]).some(n=>n.tagName==='p'&&text(n));
 const section=isWebsiteListingUrl(approvedUrl)||all.some(n=>n.tagName==='script'&&attr(n,'type').toLowerCase()==='application/ld+json'&&/"@type"\s*:\s*"(?:CollectionPage|SearchResultsPage)"/.test(text(n)));
 if(!section&&(isArticle||directBody))return undefined;
 for(const anchor of all.filter(n=>n.tagName==='a')){
  const href=attr(anchor,'href');if(!href)continue;
  const rel=attr(anchor,'rel').toLowerCase().split(/\s+/);
  if(rel.includes('next')||/(?:^|\s)next(?:\s|$)/i.test(attr(anchor,'class'))&&attr(anchor,'data-page-number')){const next=scoped(href);nextPage??=next;if(!next)paginationUnresolved=true;continue}
  const lineage:Node[]=[];for(let n:Node|undefined=anchor;n;n=n.parentNode)lineage.push(n);
  if(lineage.some(n=>['nav','header','footer','aside','script'].includes(n.tagName??'')||attr(n,'role')==='navigation'||/(?:^|[\s_-])(?:nav|navigation|menu|footer|header|sidebar|masthead)(?:$|[\s_-])/i.test(attr(n,'class')+' '+attr(n,'id'))))continue;
  if(/(?:^|[\s_-])(?:comment|comments|print|share|reply)(?:$|[\s_-])/i.test(attr(anchor,'class'))||/#(?:comments?|reply)/i.test(href))continue;
  // Publishers commonly wrap the heading in its link (<a><h3>...), rather
  // than placing a link inside the heading. Both are observed headline links.
  const heading=lineage.some(n=>/^h[1-6]$/.test(n.tagName??''))||nodes(anchor).some(n=>/^h[1-6]$/.test(n.tagName??''));
  const entry=lineage.some(n=>n.tagName==='article'||/(?:^|[\s_-])(?:story|post|entry|item|article)(?:$|[\s_-])/i.test(attr(n,'class')));
  const title=/(?:^|[\s_-])(?:title|headline|heading)(?:$|[\s_-])/i.test(attr(anchor,'class'));
  if(heading||rel.includes('bookmark')||(entry&&title))add(href,text(anchor)||undefined);
 }
 return section||structuredListing&&articles.size||articles.size>=2?{articles:[...articles.values()],nextPage,...(paginationUnresolved?{paginationUnresolved:true as const}:{})}:undefined;
}
