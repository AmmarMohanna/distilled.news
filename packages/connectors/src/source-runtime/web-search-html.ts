import {parse} from 'parse5';
type Node={tagName?:string;value?:string;attrs?:{name:string;value:string}[];childNodes?:Node[];parentNode?:Node};
const attr=(node:Node,key:string)=>node.attrs?.find(value=>value.name===key)?.value??'';
const has=(node:Node,key:string)=>attr(node,'class').split(/\s+/).includes(key);
function text(node:Node):string{return node.tagName==='script'||node.tagName==='style'?'':node.value??(node.childNodes??[]).map(text).join(' ');}
/** Only organic result links from the fixed public HTML search response. */
export function parseWebSearchHtml(html:string):{url:string;title:string;excerpt:string}[]{
 if(new TextEncoder().encode(html).length>1_000_000)return [];
 const all:Node[]=[],pending=[parse(html) as Node];
 while(pending.length&&all.length<50000){const node=pending.pop()!;all.push(node);pending.push(...[...(node.childNodes??[])].reverse());}
 if(pending.length)return [];
 const results:{url:string;title:string;excerpt:string}[]=[];
 for(const anchor of all){
  if(anchor.tagName!=='a'||!has(anchor,'result__a'))continue;
  let container=anchor.parentNode;
  while(container&&!has(container,'result__body')&&!has(container,'result'))container=container.parentNode;
  let ad=false;for(let parent:Node|undefined=anchor;parent;parent=parent.parentNode)if(has(parent,'result--ad'))ad=true;
  if(!container||ad)continue;
  try{
   let target=new URL(attr(anchor,'href'),'https://html.duckduckgo.com/');
   if(target.hostname==='duckduckgo.com'&&target.pathname==='/l/')target=new URL(target.searchParams.get('uddg')??'');
   if(target.protocol!=='https:'||target.username||target.password||/(^|\.)(duckduckgo|google|bing)\.com$/i.test(target.hostname))continue;
   const title=text(anchor).replace(/\s+/g,' ').trim().slice(0,300);
   const nodes=[container];let excerpt='';
   while(nodes.length){const node=nodes.pop()!;if(has(node,'result__snippet')){excerpt=text(node).replace(/\s+/g,' ').trim().slice(0,800);break;}nodes.push(...(node.childNodes??[]));}
   if(title&&!results.some(row=>row.url===target.href))results.push({url:target.href,title,excerpt});
   if(results.length>=40)break;
  }catch{/* Invalid and non-public destinations are never fetched here. */}
 }
 return results;
}

/** A provider's public directory exposes profile identities directly, without
 * guessing profile URLs or treating an entire institution as person evidence.
 */
export function parseDirectorySearchHtml(html:string,base:string,label:string):{url:string;title:string;excerpt:string}[]{
 if(new TextEncoder().encode(html).length>1_000_000)return [];
 const results:{url:string;title:string;excerpt:string}[]=[],pending=[parse(html) as Node];
 let visited=0;
 while(pending.length&&visited++<50000){
  const node=pending.pop()!;
  if(has(node,'researcher-card')){
   const nodes=[node];let profile:Node|undefined;
   while(nodes.length){const child=nodes.pop()!;if(child.tagName==='a'&&child.parentNode&&/^h[1-6]$/.test(child.parentNode.tagName??'')){profile=child;break;}nodes.push(...(child.childNodes??[]));}
   if(profile)try{
    const url=new URL(attr(profile,'href'),base),name=text(profile).replace(/\s+/g,' ').trim();
    if(url.protocol==='https:'&&url.origin===new URL(base).origin&&name){
     const excerpt=text(node).replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi,'').replace(/\s+/g,' ').trim().slice(0,800);
     results.push({url:url.href,title:`${label} — ${name}`,excerpt});
    }
   }catch{}
  }else pending.push(...[...(node.childNodes??[])].reverse());
 }
 return pending.length?[]:results;
}
