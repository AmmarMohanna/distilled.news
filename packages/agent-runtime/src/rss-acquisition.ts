import type { AcquiredSourceItem,SourceAcquisitionAdapter,SourceAcquisitionPage,SourceAcquisitionRequest } from "./temporal-acquisition";

/** Generic RSS/Atom adapter. It deliberately owns only feed syntax; temporal
 * filtering, identity, budgets and coverage remain in TemporalSourceAcquisition. */
export class RssFeedSourceAcquisitionAdapter implements SourceAcquisitionAdapter {
  readonly authentication="PUBLIC" as const;
  private items:AcquiredSourceItem[]=[];
  private emitted=false;
  constructor(private readonly fetcher:typeof fetch=fetch){}
  async open(request:SourceAcquisitionRequest):Promise<void>{
    const locator=request.source.resourceLocator??request.source.canonicalSourceUrl;
    if(!locator)throw new Error("RSS source requires resourceLocator or canonicalSourceUrl");
    const response=await this.fetcher(locator,{headers:{accept:"application/rss+xml, application/atom+xml, application/xml, text/xml"}});
    if(!response.ok)throw new Error(`RSS fetch failed: ${response.status}`);
    this.items=parseFeed(await response.text(),locator);this.emitted=false;
  }
  async next(request:SourceAcquisitionRequest):Promise<SourceAcquisitionPage>{
    if(this.emitted)return{items:[],sourceExhausted:true};
    this.emitted=true;
    const start=Date.parse(request.window.startTime);
    const lowerBoundaryReached=this.items.some(item=>item.publishedAt!==undefined&&Date.parse(item.publishedAt)<start);
    return{items:this.items,sourceExhausted:true,lowerBoundaryReached};
  }
  async close():Promise<void>{this.items=[];this.emitted=false;}
}

function parseFeed(xml:string,feedUrl:string):AcquiredSourceItem[]{
  const blocks=[...xml.matchAll(/<(?:item|entry)\b[^>]*>([\s\S]*?)<\/(?:item|entry)>/gi)].map(match=>match[1]);
  return blocks.map(block=>{
    const title=tag(block,"title");
    const description=tag(block,"content:encoded")??tag(block,"description")??tag(block,"summary")??tag(block,"content");
    const link=atomLink(block)??tag(block,"link");
    const guid=tag(block,"guid")??tag(block,"id")??link;
    const published=tag(block,"pubDate")??tag(block,"published")??tag(block,"updated");
    const publishedAt=trustedTimestamp(published);
    const canonical=canonicalUrl(link??guid);
    const sourceItemId=canonicalUrl(guid??link)?.replace(/#.*$/u,"");
    return{sourceResource:feedUrl,canonicalItemUrl:canonical,sourceItemId,title:text(title),text:text(description),publishedAt,originalSourceReference:canonical??link,acquisitionEvidence:{mechanism:"rss",feedUrl,sourceTimestampField:published?"published":"unavailable",sourceItemId}};
  }).filter(item=>Boolean(item.canonicalItemUrl||item.sourceItemId));
}

function tag(block:string,name:string):string|undefined{
  const escaped=name.replace(":","\\:");
  const match=block.match(new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`,`i`));
  return match?decodeXml(stripCdata(match[1]).trim()):undefined;
}
function atomLink(block:string):string|undefined{
  const match=block.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*>/i);return match?decodeXml(match[1]):undefined;
}
function canonicalUrl(value?:string):string|undefined{if(!value)return undefined;try{const url=new URL(value);url.hash="";return url.href;}catch{return undefined;}}
function stripCdata(value:string){return value.replace(/^<!\[CDATA\[/u,"").replace(/\]\]>$/u,"");}
function text(value?:string){return value?.replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim()||undefined;}
function decodeXml(value:string){return value.replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&#39;/g,"'");}
function trustedTimestamp(value?:string){if(!value)return undefined;const time=Date.parse(value);return Number.isFinite(time)?new Date(time).toISOString():undefined;}
