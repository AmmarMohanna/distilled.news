import {parse} from 'parse5';
import {primaryTextContainer,headlineElement} from './primary-text';
import {discoverPromedReports} from './promed-discovery';
import {articleUrl} from './provider-normalize';
import {isArticleSchemaType,matchesOpaqueArticlePage} from './article-schema';

interface Node {tagName?:string;attrs?:{name:string;value:string}[];childNodes?:Node[];parentNode?:Node;value?:string}
export interface WebsiteDiscovery {articles:{url:string;title?:string;publishedAt?:string}[];nextPage?:string;paginationUnresolved?:true}
/** Known publisher indexes whose article cards do not fit generic discovery. */
function publisherListing(url:URL):RegExp|undefined {
 const host=url.hostname.toLowerCase().replace(/^www\./,''),path=url.pathname.replace(/\/$/,'');
 if(host==='deepmind.google'&&(path==='/blog'||path==='/discover/blog'))return /^\/blog\/[^/]+\/?$/;
 if(host==='onthewire.ai'&&path==='')return /^\/article\/[^/]+\/?$/;
 if(host==='inference.report'&&(path===''||path==='/archive'))return /^\/archive\/\d{4}-\d{2}-\d{2}\/?$/;
 if(host==='almodon.com'&&path==='')
  return /^\/[^/]+\/\d{4}\/\d{2}\/\d{2}\/[^/]+\/?$/;
}

/** Fetch the dated index for the rolling Inference Report homepage. */
export function websiteCollectionUrl(value:string):string {
 const url=new URL(value);
 if(url.hostname==='inference.report'&&url.pathname==='/')return new URL('/archive',url).href;
 return value;
}

/** Section locators are discovery surfaces, never a single full article. */
export function isWebsiteListingUrl(value:string):boolean {
 const url=new URL(value),host=url.hostname.toLowerCase().replace(/^www\./,''),path=url.pathname.replace(/\/$/,'');
 if(publisherListing(url))return true;
 if(host==='lovin.co'&&(path===''||path==='/watch'||/^\/beirut(?:\/(?:en|ar))?$/.test(path)))return true;
 // Observed publisher sections: keep this exact and host-scoped so short
 // article URLs on other publishers are not discarded by a generic heuristic.
 if(host==='jpost.com'&&['/mdaheroes','/podcast','/american-politics','/diaspora','/judaism','/christianworld','/food-recipes','/archaeology','/science','/israel-news/culture','/history','/omg','/travel'].includes(path))return true;
 if(host==='thenationalnews.com'&&(['/business','/arts-culture','/magazine'].includes(path)||/^\/podcasts\/(?:beyond-the-headlines|culture-bites|business-extra|tarab)$/.test(path)))return true;
 if(host==='lbcgroup.tv'&&(/^\/(?:news-highlights|latest-news)\/(?:ar|en)$/.test(path)||/^\/news-bulletin(?:\/[^/]+)*\/(?:ar|en)$/.test(path)))return true;
 if(host==='almodon.com'&&/^\/(?:politics|economy|arabworld|society|opinion|culture|media|video|infograph)$/.test(path))return true;
 if(host==='lorientlejour.com'||host==='today.lorientlejour.com'){
  if(path===''||/^\/(?:rubrique|boutique|archives-index)(?:\/|$)/.test(path))return true;
  if(['/cuisine-liban-a-table','/editorials','/dessins','/portfolios'].includes(path))return true;
 }
 // Al Arabiya stories always carry a /YYYY/MM/DD/ path; its undated links
 // (/aswaq/microscope, /aswaq/economy, ...) are section pages, not stories.
 if((host==='alarabiya.net'||host.endsWith('.alarabiya.net'))&&!/\/\d{4}\/\d{2}\/\d{2}\//.test(path+'/'))return true;
 // ESA archive pagination is a section locator, even when its link appears
 // inside a headline card. It must not become an article acquisition job.
 if(host==='esa.int'&&/\/(?:\(archive\)|%28archive%29)\/\d+$/i.test(path))return true;
 return /^\/(?:tags?|category|categories|topics?|sections?)(?:\/[^/?#]+)*\/?$/i.test(new URL(value).pathname)||/^\/(?:(?:news|newsroom)\/(?:all-news|latest|all|recently-published)|all-news|latest-news|latest-articles|opinions?|live|archives?)\/?$/i.test(new URL(value).pathname)||/^\/(?:home\/writer|authors?)\/[^/]+\/?$/i.test(new URL(value).pathname);
}
const attr=(n:Node,key:string)=>n.attrs?.find(a=>a.name===key)?.value??'';
function nodes(root:Node):Node[]{const result:Node[]=[],stack=[root];while(stack.length){const n=stack.pop()!;result.push(n);stack.push(...[...(n.childNodes??[])].reverse())}return result}
const text=(n:Node)=>nodes(n).filter(n=>!n.tagName&&n.value).map(n=>n.value).join('').replace(/\s+/g,' ').trim();
function linkLineage(anchor:Node):Node[]{
 const lineage:Node[]=[];
 for(let n:Node|undefined=anchor;n;n=n.parentNode)lineage.push(n);
 return lineage;
}
function isPageChrome(lineage:Node[]){
 return lineage.some(n=>['nav','header','footer','aside','script','template','noscript'].includes(n.tagName??'')||
  n.attrs?.some(a=>a.name==='hidden'||a.name==='inert')||attr(n,'aria-hidden').toLowerCase()==='true'||
  /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden)\b/i.test(attr(n,'style'))||
  attr(n,'role')==='navigation'||!['body','html'].includes(n.tagName??'')&&
  /(?:^|[\s_-])(?:nav|navigation|menu|footer|header|sidebar|masthead)(?:$|[\s_-])/i.test(
   attr(n,'class').split(/\s+/).filter(token=>!/^(?:has|with|no)[_-]/i.test(token)).join(' ')+' '+attr(n,'id')));
}

export type WebsiteLinkSelector=(url:string,candidates:readonly {url:string;title:string}[])=>Promise<readonly number[]>;

export function listingLinkCandidates(html:string,pageUrl:string):{url:string;title:string}[]{
 const page=new URL(pageUrl),publisherPaths=publisherListing(page);
 const candidates=new Map<string,{url:string;title:string}>();
 for(const anchor of nodes(parse(html) as unknown as Node)){
  if(anchor.tagName!=='a'||isPageChrome(linkLineage(anchor)))continue;
  const href=attr(anchor,'href');
  if(!href||href.startsWith('#')||attr(anchor,'rel').split(/\s+/).some(value=>['next','prev'].includes(value.toLowerCase())))continue;
  let url:string|undefined;
  try{url=articleUrl(new URL(href,page).href)}catch{continue}
  if(!url||url===articleUrl(pageUrl)||isWebsiteListingUrl(url))continue;
  const target=new URL(url),path=target.pathname;
  if(target.origin!==page.origin||target.search||path.length>300||path==='/'||publisherPaths&&!publisherPaths.test(path)||
   /\.(?:pdf|zip|xml|jpg|jpeg|png|gif|svg|webp|css|js|mp[34])$/i.test(path)||
   /^\/(?:about|contact|privacy|terms|search|account|login|logout|signup|subscribe|unsubscribe|help|api|admin|settings)(?:\/|$)/i.test(path))continue;
  const anchorNodes=nodes(anchor);
  const label=anchorNodes.find(n=>headlineElement(n)&&!isPageChrome(linkLineage(n)))??anchor;
  const title=nodes(label).filter(n=>n.value&&!isPageChrome(linkLineage(n))).map(n=>n.value).join(' ').replace(/\s+/g,' ').trim().slice(0,160);
  if(title.length<8||/^(?:read more|learn more|click here|continue reading)$/i.test(title))continue;
  candidates.set(url,{url,title});
  if(candidates.size===48)break;
 }
 return [...candidates.values()];
}

/** Discovery is structural, never a judgment about importance or Event identity.
 * Every captured identity survives; the collector's durable snapshot slices work. */
export function discoverWebsiteArticles(html:string,approvedUrl:string):WebsiteDiscovery|undefined {
 const approved=new URL(approvedUrl),publisherPaths=publisherListing(approved);
 const origin=approved.origin,all=nodes(parse(html) as unknown as Node),articles=new Map<string,{url:string;title?:string}>();
 const promed=discoverPromedReports(all.filter(n=>n.tagName==='script').map(n=>nodes(n).map(child=>child.value??'').join('')),all.filter(n=>n.tagName==='tr').map(text),approvedUrl);if(promed)return promed;
 const scoped=(href:string)=>{try{const url=articleUrl(new URL(href,approvedUrl).href);return url&&new URL(url).origin===origin&&url!==articleUrl(approvedUrl)?url:undefined}catch{return undefined}};
 const add=(href:string,title?:string)=>{const url=scoped(href);if(url&&(!publisherPaths||publisherPaths.test(new URL(url).pathname))&&!isWebsiteListingUrl(url)&&!articles.has(url))articles.set(url,{url,...(title?{title}:{})})};
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
 const knownListing=isWebsiteListingUrl(approvedUrl);
 const lovinLanding=new URL(approvedUrl).hostname.replace(/^www\./,'')==='lovin.co'&&knownListing;
 if(!publisherPaths&&!lovinLanding&&primaryTextContainer(all))return undefined;
 const bodies=all.filter(n=>n.tagName==='article');
 const directBody=bodies.length===1&&nodes(bodies[0]).some(n=>n.tagName==='h1'&&!nodes(n).some(child=>child.tagName==='a'))&&nodes(bodies[0]).some(n=>n.tagName==='p'&&text(n));
 // Article pages can embed a CollectionPage for their parent section or
 // related stories. Only metadata bound to this URL can override article
 // evidence; an arbitrary nested CollectionPage must not reject the story.
 const section=knownListing||boundSection||unboundSection&&!isArticle&&!directBody;
 if(!section&&(isArticle||directBody))return undefined;
 for(const anchor of all.filter(n=>n.tagName==='a')){
  const href=attr(anchor,'href');if(!href)continue;
  const rel=attr(anchor,'rel').toLowerCase().split(/\s+/);
  if(rel.includes('next')||/(?:^|\s)next(?:\s|$)/i.test(attr(anchor,'class'))&&attr(anchor,'data-page-number')){const next=scoped(href);nextPage??=next;if(!next)paginationUnresolved=true;continue}
  const lineage=linkLineage(anchor);
  if(isPageChrome(lineage))continue;
  if(/(?:^|[\s_-])(?:comment|comments|print|share|reply)(?:$|[\s_-])/i.test(attr(anchor,'class'))||/#(?:comments?|reply)/i.test(href))continue;
  // Publishers commonly wrap the heading in its link (<a><h3>...), rather
  // than placing a link inside the heading. Both are observed headline links.
  const heading=lineage.some(headlineElement)||nodes(anchor).some(headlineElement);
  const entry=lineage.some(n=>n.tagName==='article'||/(?:^|[\s_-])(?:story|post|entry|item|article)(?:$|[\s_-])/i.test(attr(n,'class')));
  const title=/(?:^|[\s_-])(?:title|headline|heading)(?:$|[\s_-])/i.test(attr(anchor,'class'));
  // A whole-card link can also contain a category, deck, duration or badge.
  // Retain the actual headline rather than turning that chrome into identity.
  const childHeadline=nodes(anchor).find(headlineElement);
  if(publisherPaths){
   const card=lineage.find(n=>attr(n,'class').split(/\s+/).includes('card__content'));
   const cardHeadline=card&&nodes(card).find(headlineElement);
   // Archive cards include a synopsis. Their report date is the card title.
   const datedReport=href.match(/\/archive\/(\d{4}-\d{2}-\d{2})\/?(?:[?#].*)?$/);
   add(href,datedReport?.[1]||text(childHeadline??cardHeadline??anchor)||undefined);
   continue;
  }
  if(heading||rel.includes('bookmark')||(entry&&title))add(href,text(childHeadline??anchor)||undefined);
 }
 return section||structuredListing&&articles.size||articles.size>=2?{articles:[...articles.values()],nextPage,...(paginationUnresolved?{paginationUnresolved:true as const}:{})}:undefined;
}

const DATED_PATH=/\/(?:19|20)\d{2}\/[01]?\d\/[0-3]?\d(?:\/|$)/;
/** Publisher article URLs are far more stable than their card markup. */
function articlePathShape(path:string):string|undefined{
 const segments=path.split('/').filter(Boolean);
 if(!segments.length||segments.length>8)return undefined;
 const last=segments.at(-1)!,decoded=(()=>{try{return decodeURIComponent(last)}catch{return last}})();
 const dated=DATED_PATH.test(path+'/');
 const numeric=segments.some(segment=>/^\d{5,}$/.test(segment)||/[-_]\d{5,}(?:\.[a-z]{3,5})?$/i.test(segment)||/^\d{5,}[-_]/.test(segment));
 const slug=decoded.split(/[-_]+/).filter(word=>word.length>1).length>=4||decoded.replace(/\.[a-z]{3,5}$/i,'').length>=40;
 // Opaque story IDs such as /articles/c4g0e1xk2v3o mix letters and digits.
 const opaque=/^(?=[a-z0-9]*\d)(?=[a-z0-9]*[a-z])[a-z0-9]{10,24}$/i.test(last);
 if(!dated&&!numeric&&!slug&&!opaque)return undefined;
 // One shape per URL family: a short slug must not split a dated cluster.
 const kind=dated?'dated':numeric?'numeric':opaque?'opaque':'slug';
 // Section depth varies for dated and ID URLs; bare slugs need it to stay precise.
 return `${kind==='slug'?segments.length:''}|${kind}|${/\.([a-z]{3,5})$/i.exec(last)?.[1]?.toLowerCase()??''}`;
}

/**
 * Second listing parser for pages whose cards the regular discovery cannot read
 * (renamed classes, headline markup moved, script-rendered cards). It ignores
 * card markup and keeps only same-origin links that share the dominant
 * article-shaped URL pattern, from visible anchors and embedded page data.
 * It never runs on a page regular discovery already understood.
 */
export function discoverByUrlPattern(html:string,pageUrl:string):{url:string;title?:string}[]{
 const page=new URL(pageUrl),self=articleUrl(pageUrl),found=new Map<string,{url:string;title?:string}>();
 const consider=(href:string,title?:string)=>{
  let url:string|undefined;
  try{url=articleUrl(new URL(href,page).href)}catch{return}
  if(!url||url===self||found.has(url))return;
  const target=new URL(url);
  if(target.origin!==page.origin||target.search||target.pathname.length>300||isWebsiteListingUrl(url)||
   /\.(?:pdf|zip|xml|json|jpg|jpeg|png|gif|svg|webp|css|js|mp[34])$/i.test(target.pathname)||
   /^\/(?:about|contact|privacy|terms|search|account|login|logout|signup|subscribe|unsubscribe|help|api|admin|settings|static|assets|_next|wp-content|wp-json|cdn-cgi)(?:\/|$)/i.test(target.pathname))return;
  found.set(url,{url,...(title?{title}:{})});
 };
 for(const candidate of listingLinkCandidates(html,pageUrl))consider(candidate.url,candidate.title);
 // Script-rendered listings often carry their story links only in page data.
 const root=parse(html) as unknown as Node;
 for(const script of nodes(root).filter(n=>n.tagName==='script'&&/json/i.test(attr(n,'type')||(attr(n,'id')==='__NEXT_DATA__'?'json':'')))){
  const body=nodes(script).map(child=>child.value??'').join('');
  if(body.length>2_000_000)continue;
  const host=page.host.replace(/[.]/g,'\\.');
  const pattern=new RegExp(`"((?:https?:\\\\?/\\\\?/${host})?\\\\?/[^"\\s<>]{8,300})"`,'g');
  let match:RegExpExecArray|null,seen=0;
  while((match=pattern.exec(body))&&seen<400){seen++;consider(match[1].replace(/\\\//g,'/'));}
 }
 const clusters=new Map<string,{url:string;title?:string}[]>();
 for(const entry of found.values()){
  const shape=articlePathShape(new URL(entry.url).pathname);
  if(shape)clusters.set(shape,[...(clusters.get(shape)??[]),entry]);
 }
 const best=[...clusters.values()].sort((a,b)=>b.length-a.length)[0]??[];
 return best.length>=3?best.slice(0,30):[];
}
