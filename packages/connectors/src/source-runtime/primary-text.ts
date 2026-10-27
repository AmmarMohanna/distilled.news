export interface TextNode {tagName?:string;nodeName?:string;value?:string;attrs?:{name:string;value:string}[];childNodes?:TextNode[];parentNode?:TextNode}
const attr=(n:TextNode,k:string)=>n.attrs?.find(a=>a.name===k)?.value??'';
const skip=new Set(['script','style','noscript','nav','header','footer','aside','form','button','svg']);
function descendants(root:TextNode){const out:TextNode[]=[],stack=[root];while(stack.length&&out.length<100000){const n=stack.pop()!;if(skip.has(n.tagName??''))continue;out.push(n);stack.push(...[...(n.childNodes??[])].reverse())}return out}
const text=(nodes:TextNode[])=>nodes.filter(n=>n.nodeName==='#text'||!n.tagName&&n.value).map(n=>n.value??'').join(' ').replace(/\s+/g,' ').trim();
/** Prefer a single source-owned prose body over related-story/navigation links.
 * This is structural readability, not a relevance or importance filter. */
export function primaryTextContainer(all:TextNode[]):TextNode|undefined {
 const headings=all.filter(n=>n.tagName==='h1');if(headings.length>1)return undefined;
 const usable=(n:TextNode,strong:boolean)=>{
  const nodes=descendants(n),paragraphs=nodes.filter(p=>p.tagName==='p'||p.tagName==='pre'),prose=paragraphs.length?paragraphs.map(p=>text(descendants(p))).filter(Boolean):[text(nodes)];
  if(prose.join(' ').length<200||prose.length<2&&prose.join(' ').length<400)return false;
  if(nodes.filter(p=>p.tagName==='article').length>1)return false;
  const links=(paragraphs.length?paragraphs.flatMap(p=>descendants(p)):nodes).filter(a=>a.tagName==='a').map(a=>text(descendants(a))).join(' ').length;
  if(links>prose.join(' ').length*.4)return false;
  if(!strong&&nodes.filter(p=>/^h[2-6]$/.test(p.tagName??'')&&descendants(p).some(a=>a.tagName==='a')).length>=2)return false;
  return true;
 };
 const bodies=all.filter(n=>attr(n,'itemprop').split(/\s+/).includes('articleBody')||/(?:^|[\s_])(?:entry-content|article-body|article-content|story-body|post-content|field--name-body|rich-text|richtext|wysiwyg|content-body)(?:$|[\s_])/i.test(attr(n,'class')));
 const readable=bodies.filter(n=>usable(n,true));if(readable.length===1)return readable[0];
 if(!headings.length){const main=all.filter(n=>n.tagName==='main'||attr(n,'role')==='main');const candidate=main.length===1?main[0]:all.find(n=>n.tagName==='body');return candidate&&usable(candidate,false)?candidate:undefined}
 for(let n:TextNode|undefined=headings[0].parentNode;n;n=n.parentNode){if(skip.has(n.tagName??''))break;if(usable(n,n.tagName==='article'))return n;if(n.tagName==='body')break}
 return undefined;
}
