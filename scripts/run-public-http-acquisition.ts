import {HttpHtmlSourceAcquisitionAdapter,TemporalSourceAcquisition,MemorySourceHighWaterStore,commitSourceHighWater,type HttpHtmlSourceWorkflow,type SourceAcquisitionRequest} from "../packages/agent-runtime/src/index.ts";

const SOURCE="https://www.theguardian.com/world";
const AS_OF="2026-09-23T13:00:00.000Z";
const request:SourceAcquisitionRequest={source:{sourceFamily:"guardian-world",canonicalSourceUrl:SOURCE,resourceLocator:SOURCE},window:{startTime:"2026-09-22T20:00:00.000Z",endTime:"2026-09-23T12:00:00.000Z"},limits:{maxItems:30,maxPages:3,maxScrolls:1,maxPhysicalAttempts:3,maxExecutionMs:30_000},authentication:"PUBLIC",acquisitionAsOf:AS_OF};

const workflow:HttpHtmlSourceWorkflow={
  listingUrl:(_request,page)=>page===1?SOURCE:`${SOURCE}?page=${page}`,
  parseListing:(html,url,request,page)=>{
    const urls=[...html.matchAll(/href=["'](\/world\/\d{4}\/[a-z]{3}\/\d{1,2}\/[^"'#?]+)["']/gi)].map(match=>new URL(match[1],url).href).filter(value=>!/\/world\/(?:video|live)\//.test(value));
    const times=[...html.matchAll(/<time\b[^>]*dateTime=["']([^"']+)["'][^>]*>/gi)].map(match=>Date.parse(match[1])).filter(Number.isFinite);
    const lower=Date.parse(request.window.startTime); const lowerBoundaryProven=times.some(value=>value<lower);
    const next=page<3?`${SOURCE}?page=${page+1}`:undefined;
    return{articleUrls:[...new Set(urls)],nextUrl:next,lowerBoundaryProven,sourceExhausted:false,paginationExhausted:page>=3&&!next};
  },
  parseArticle:(html,url)=>{
    const canonical=meta(html,/rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)??meta(html,/href=["']([^"']+)["'][^>]+rel=["']canonical["']/i)??url;
    const published=jsonValue(html,"datePublished")??tagTime(html);
    const title=jsonValue(html,"headline")??meta(html,/property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
    const author=jsonValue(html,"authorName")??meta(html,/name=["']author["'][^>]+content=["']([^"']+)["']/i);
    const bodyMatch=html.match(/article-body-commercial-selector[^>]*>([\s\S]*?)<\/div>/i); const body=bodyMatch?cleanText(bodyMatch[1]):undefined;
    if(!published||!title||!body||body.length<200)return undefined;
    const normalized=new URL(canonical,url);normalized.hash="";
    return{sourceResource:SOURCE,canonicalItemUrl:normalized.href,sourceItemId:normalized.pathname,title:htmlDecode(title),text:body,publishedAt:new Date(Date.parse(published)).toISOString(),author:author?htmlDecode(author):undefined,originalSourceReference:normalized.href,acquisitionEvidence:{mechanism:"http_html",listingUrl:SOURCE,articleTimestampSource:"json_ld_or_time",bodySelector:"article-body-commercial-selector"}};
  }
};

const run=()=>new TemporalSourceAcquisition().acquire(request,new HttpHtmlSourceAcquisitionAdapter(workflow));
const first=await run(); const store=new MemorySourceHighWaterStore(); const firstHighWater=await commitSourceHighWater(store,"guardian-world-http",first); const replay=await run(); const replayHighWater=await commitSourceHighWater(store,"guardian-world-http",replay);
const summary=(result:Awaited<ReturnType<typeof run>>)=>({requestedWindow:result.requestedWindow,effectiveWindow:result.effectiveWindow,acquisitionAsOf:result.acquisitionAsOf,items:result.items.map(item=>({sourceItemId:item.sourceItemId,canonicalItemUrl:item.canonicalItemUrl,title:item.title,publishedAt:item.publishedAt,author:item.author,bodyLength:item.text?.length,originalSourceReference:item.originalSourceReference})),coverage:result.coverage,continuation:result.continuation,provenance:{mechanism:"deterministic_http_html",workflowId:"guardian-world-http-v1",workflowVersion:1,llmCalls:0,browserCalls:0}});
console.log(JSON.stringify({request,first:summary(first),replay:summary(replay),highWater:{first:firstHighWater,replay:replayHighWater}},null,2));

function meta(html:string,pattern:RegExp){const match=html.match(pattern);return match?htmlDecode(match[1]):undefined;}
function jsonValue(html:string,key:string){if(key==="authorName"){const match=html.match(/"author"\s*:\s*\{[^}]*"name"\s*:\s*"([^"]+)"/i);return match?htmlDecode(match[1]):undefined;}const match=html.match(new RegExp(`"${key}"\\s*:\s*"([^"]+)"`,`i`));return match?htmlDecode(match[1]):undefined;}
function tagTime(html:string){const match=html.match(/<time\b[^>]*dateTime=["']([^"']+)["'][^>]*>/i);return match?.[1];}
function cleanText(value:string){return htmlDecode(value.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim());}
function htmlDecode(value:string){return value.replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&#x27;/gi,"'");}
