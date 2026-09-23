import {RssFeedSourceAcquisitionAdapter,TemporalSourceAcquisition,MemorySourceHighWaterStore,commitSourceHighWater,type SourceAcquisitionRequest} from "../packages/agent-runtime/src/index.ts";

const [resourceLocator,canonicalSourceUrl,startTime,endTime]=process.argv.slice(2);
if(!resourceLocator||!canonicalSourceUrl||!startTime||!endTime)throw new Error("usage: run-public-rss-acquisition <feed-url> <source-url> <start-iso> <end-iso>");
const request:SourceAcquisitionRequest={source:{sourceFamily:"rss",canonicalSourceUrl,resourceLocator},window:{startTime,endTime},limits:{maxItems:50,maxPages:2,maxScrolls:1,maxPhysicalAttempts:1,maxExecutionMs:20_000},authentication:"PUBLIC"};
const kernel=new TemporalSourceAcquisition();
const run=()=>kernel.acquire(request,new RssFeedSourceAcquisitionAdapter());
const first=await run();
const store=new MemorySourceHighWaterStore();
const firstHighWater=await commitSourceHighWater(store,"public-rss-validation",first);
const replay=await run();
const replayHighWater=await commitSourceHighWater(store,"public-rss-validation",replay);
const summarize=(result:Awaited<ReturnType<typeof run>>)=>({items:result.items.map(item=>({sourceItemId:item.sourceItemId,canonicalItemUrl:item.canonicalItemUrl,title:item.title,publishedAt:item.publishedAt,text:item.text,originalSourceReference:item.originalSourceReference,acquisitionEvidence:item.acquisitionEvidence})),coverage:result.coverage,continuation:result.continuation,provenance:{mechanism:"official_rss",workflowId:"rss-feed-v1",workflowVersion:1,llmCalls:0,browserUsed:false}});
console.log(JSON.stringify({request,first:summarize(first),replay:summarize(replay),highWater:{first:firstHighWater,replay:replayHighWater}},null,2));
