/** Trusted CDP DOM-snapshot extraction for the X site adapter. Model output is never input here. */
export interface XTimelineDomNode {
  index: number;
  parent: number;
  name: string;
  value: string;
  attributes: Map<string,string>;
  children: number[];
}
export interface XTimelinePostEvidence {
  sourceItemId: string;
  canonicalItemUrl: string;
  publishedAt: string;
  text: string;
}

export function extractXTimelinePosts(nodes: Map<number,XTimelineDomNode>, pageUrl: string): XTimelinePostEvidence[] {
  const page = new URL(pageUrl);
  if (page.protocol !== "https:" || !["x.com","twitter.com"].includes(page.hostname)) return [];
  const account = page.pathname.split("/").filter(Boolean)[0]?.toLowerCase();
  if (!account || ["home","explore","search","login","i"].includes(account)) return [];
  const posts: XTimelinePostEvidence[] = [];
  const seen = new Set<string>();
  for (const article of nodes.values()) {
    if (article.name !== "article" || article.attributes.get("data-testid") !== "tweet") continue;
    const descendants = collect(article,nodes,512);
    const links = descendants.filter(node=>node.name==="a" && node.attributes.has("href"));
    let identity: { id:string; url:string } | undefined;
    for (const link of links) {
      let target:URL;
      try { target=new URL(link.attributes.get("href")!,page); } catch { continue; }
      const match=target.pathname.match(/^\/([^/]+)\/status\/(\d+)(?:\/|$)/);
      if (!match || !["x.com","twitter.com"].includes(target.hostname) || target.protocol!=="https:" || match[1].toLowerCase()!==account) continue;
      identity={id:match[2],url:`https://x.com/${match[1]}/status/${match[2]}`};break;
    }
    if (!identity || seen.has(identity.id)) continue;
    const time=descendants.find(node=>node.name==="time" && node.attributes.has("datetime"));
    const publishedAt=time?.attributes.get("datetime");
    if (!publishedAt || !Number.isFinite(Date.parse(publishedAt))) continue;
    const body=descendants.find(node=>node.attributes.get("data-testid")==="tweetText");
    const text=body ? textOf(body,nodes).replace(/\s+/g," ").trim().slice(0,2_000) : "";
    if (!text) continue;
    seen.add(identity.id);
    posts.push({sourceItemId:identity.id,canonicalItemUrl:identity.url,publishedAt:new Date(publishedAt).toISOString(),text});
    if (posts.length>=30) break;
  }
  return posts;
}

function collect(root:XTimelineDomNode,nodes:Map<number,XTimelineDomNode>,maximum:number):XTimelineDomNode[]{
  const result:XTimelineDomNode[]=[];const queue=[root];
  while(queue.length && result.length<maximum){const node=queue.shift()!;result.push(node);for(const child of node.children){const found=nodes.get(child);if(found)queue.push(found)}}
  return result;
}
function textOf(root:XTimelineDomNode,nodes:Map<number,XTimelineDomNode>):string{
  if(root.name==="#text")return root.value;
  return root.children.map(child=>{const node=nodes.get(child);return node?textOf(node,nodes):""}).join(" ");
}
