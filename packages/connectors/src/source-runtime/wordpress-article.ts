import {parse} from 'parse5';
interface Node {tagName?:string;attrs?:{name:string;value:string}[];childNodes?:Node[];value?:string}
const attr=(n:Node,key:string)=>n.attrs?.find(a=>a.name===key)?.value??'';
const children=(root:Node)=>{const all:Node[]=[],stack=[root];while(stack.length){const n=stack.pop()!;all.push(n);if(!['script','style','template'].includes(n.tagName??''))stack.push(...[...(n.childNodes??[])].reverse())}return all;};
const content=(n:Node)=>children(n).map(n=>n.value??(['p','div','li','h1','h2','h3','br','blockquote'].includes(n.tagName??'')?'\n':'')).join('').replace(/[ \t]+/g,' ').replace(/\n\s*\n/g,'\n').trim();
/** Full WordPress post body, never a heuristic excerpt or a generic div.
 * Decline missing/ambiguous article metadata, containers or canonical ownership.
 * Parse the complete bounded document; never truncate body text to force success. */
export function extractWordpressArticle(html:string,url:string,source:string){
 if(new TextEncoder().encode(html).length>512000)return undefined;
 const all=children(parse(html) as unknown as Node),meta=(name:string)=>all.filter(n=>n.tagName==='meta'&&(attr(n,'property')||attr(n,'name')).toLowerCase()===name).map(n=>attr(n,'content'));
 if(meta('og:type').length!==1||meta('og:type')[0]!=='article')return undefined;
 const dates=meta('article:published_time');if(dates.length!==1||!Number.isFinite(Date.parse(dates[0])))return undefined;
 const canonicals=all.filter(n=>n.tagName==='link'&&attr(n,'rel').split(/\s+/).includes('canonical'));
 if(canonicals.length!==1)return undefined;
 let canonical:URL;try{canonical=new URL(attr(canonicals[0],'href'),url);if(canonical.href!==new URL(url).href||canonical.origin!==new URL(source).origin||canonical.username||canonical.password)return undefined;}catch{return undefined;}
 const bodies=all.filter(n=>n.tagName==='div'&&['entry-content','wp-block-post-content'].every(c=>attr(n,'class').split(/\s+/).includes(c))),headings=all.filter(n=>n.tagName==='h1');
 if(bodies.length!==1||headings.length!==1)return undefined;
 const body=content(bodies[0]),title=content(headings[0]);if(body.length<200||new TextEncoder().encode(body).length>500000||!title)return undefined;
 return {sourceResource:source,canonicalItemUrl:canonical.href,title,text:body,publishedAt:new Date(dates[0]).toISOString(),originalSourceReference:url,acquisitionEvidence:{mechanism:'deterministic_wordpress_post_content',timestampSource:'article_published_meta'}};
}
