export interface TextNode {tagName?:string;nodeName?:string;value?:string;attrs?:{name:string;value:string}[];childNodes?:TextNode[];parentNode?:TextNode}
const attr=(n:TextNode,k:string)=>n.attrs?.find(a=>a.name===k)?.value??'';
export const headlineElement=(n:TextNode)=>/^h[1-6]$/.test(n.tagName??'')||['p','span'].includes(n.tagName??'')&&/(?:^|[\s_-])(?:headline|heading|title)(?:$|[\s_-])/i.test(attr(n,'class').replace(/([a-z])([A-Z])/g,'$1-$2'));
const skip=new Set(['script','style','noscript','nav','header','footer','aside','form','button','svg']);
/** Related article cards do not belong to their surrounding story's prose. */
export function primaryDescendants(root:TextNode){const out:TextNode[]=[],stack=[root];while(stack.length&&out.length<100000){const n=stack.pop()!;if(skip.has(n.tagName??'')||n!==root&&n.tagName==='article')continue;out.push(n);stack.push(...[...(n.childNodes??[])].reverse())}return out}
const text=(nodes:TextNode[])=>nodes.filter(n=>n.nodeName==='#text'||!n.tagName&&n.value).map(n=>n.value??'').join(' ').replace(/\s+/g,' ').trim();
const linkWrapped=(node:TextNode,root:TextNode)=>{for(let p=node.parentNode;p&&p!==root;p=p.parentNode)if(p.tagName==='a')return true;return false};
const contains=(parent:TextNode,child:TextNode)=>{for(let n:TextNode|undefined=child;n;n=n.parentNode)if(n===parent)return true;return false};
/** Prefer source-owned prose over related-story/navigation links. Multiple page
 * headings and nested story cards do not invalidate an otherwise clear body. */
export function primaryTextContainer(all:TextNode[]):TextNode|undefined {
 const headings=all.filter(n=>n.tagName==='h1'&&!primaryDescendants(n).some(p=>p.tagName==='a'));
 const usable=(n:TextNode,strong:boolean)=>{
  const nodes=primaryDescendants(n),paragraphs=nodes.filter(p=>p.tagName==='p'||p.tagName==='pre'||strong&&p.tagName==='li'&&!(p.childNodes??[]).some(child=>['p','pre','ul','ol'].includes(child.tagName??''))),prose=paragraphs.length?paragraphs.map(p=>text(primaryDescendants(p))).filter(Boolean):[text(nodes)];
  const size=prose.join(' ').length;
  if(size<200||prose.length<2&&size<400)return false;
  const links=(paragraphs.length?paragraphs.flatMap(p=>primaryDescendants(p)):nodes).filter(a=>a.tagName==='a').map(a=>text(primaryDescendants(a))).join(' ').length;
  if(links>size*.4)return false;
  if(!strong&&nodes.filter(p=>headlineElement(p)&&(primaryDescendants(p).some(a=>a.tagName==='a')||linkWrapped(p,n))).length>=2)return false;
  return true;
 };
 const bodies=all.filter(n=>attr(n,'itemprop').split(/\s+/).includes('articleBody')||/(?:^|[\s_])(?:entry-content|article-body|article-content|article-text|story-body|post-content|field--name-body|rich-text|richtext|wysiwyg|content-body|elementor-widget-theme-post-content)(?:$|[\s_])/i.test(attr(n,'class')));
 const readable=bodies.filter(n=>usable(n,true));
 // Nested body wrappers describe one scope; disjoint prose sections need their
 // common story container rather than silently selecting only the first part.
 const outer=readable.filter(n=>!readable.some(p=>p!==n&&contains(p,n)));
 if(outer.length===1)return outer[0];
 for(const heading of headings.slice(0,20)){
  for(let n:TextNode|undefined=heading.parentNode;n;n=n.parentNode){
   if(n.tagName==='header')continue;
   if(skip.has(n.tagName??'')||n.tagName==='body')break;
   if(usable(n,n.tagName==='article')&&(!outer.length||outer.every(p=>contains(n,p))))return n;
  }
 }
 if(!headings.length){const main=all.filter(n=>n.tagName==='main'||attr(n,'role')==='main');const candidate=main.length===1?main[0]:all.find(n=>n.tagName==='body');return candidate&&usable(candidate,false)?candidate:undefined}
 return undefined;
}
