import {describe,expect,it} from "vitest";
import {RssFeedSourceAcquisitionAdapter} from "../src/rss-acquisition";
import {TemporalSourceAcquisition,type SourceAcquisitionRequest} from "../src/temporal-acquisition";

const request:SourceAcquisitionRequest={source:{sourceFamily:"rss",canonicalSourceUrl:"https://news.example.test",resourceLocator:"https://news.example.test/feed.xml"},window:{startTime:"2026-09-22T00:00:00Z",endTime:"2026-09-24T00:00:00Z"},limits:{maxItems:20,maxPages:2,maxScrolls:1,maxPhysicalAttempts:2,maxExecutionMs:10_000},authentication:"PUBLIC"};
const xml=`<rss><channel><item><title><![CDATA[Older]]></title><description><![CDATA[old summary]]></description><link>https://news.example.test/a#1</link><guid>https://news.example.test/a#1</guid><pubDate>Mon, 21 Sep 2026 23:00:00 GMT</pubDate></item><item><title>Boundary</title><description>boundary summary</description><link>https://news.example.test/b</link><guid>https://news.example.test/b#1</guid><pubDate>Tue, 22 Sep 2026 00:00:00 GMT</pubDate></item><item><title>Inside</title><description>inside summary</description><link>https://news.example.test/c</link><guid>https://news.example.test/c#1</guid><pubDate>Wed, 23 Sep 2026 12:00:00 GMT</pubDate></item></channel></rss>`;

describe("generic RSS acquisition adapter",()=>{
  it("maps feed evidence and lets the generic kernel apply the half-open window",async()=>{
    const fetcher=async()=>new Response(xml,{status:200,headers:{"content-type":"application/rss+xml"}});
    const result=await new TemporalSourceAcquisition().acquire(request,new RssFeedSourceAcquisitionAdapter(fetcher));
    expect(result.items.map(item=>item.title)).toEqual(["Boundary","Inside"]);
    expect(result.items.every(item=>item.publishedAt&&item.canonicalItemUrl&&item.text)).toBe(true);
    expect(result.coverage).toMatchObject({rangeCovered:true,truncated:false,stopReason:"START_BOUNDARY_REACHED",oldestObservedTimestamp:"2026-09-21T23:00:00.000Z",newestObservedTimestamp:"2026-09-23T12:00:00.000Z"});
  });
  it("deduplicates canonical URLs when a feed repeats an entry",async()=>{
    const duplicate=xml.replace("</channel>","<item><title>Duplicate</title><link>https://news.example.test/c#tracking</link><guid>https://news.example.test/c#2</guid><pubDate>Wed, 23 Sep 2026 12:01:00 GMT</pubDate></item></channel>");
    const fetcher=async()=>new Response(duplicate,{status:200});
    const result=await new TemporalSourceAcquisition().acquire(request,new RssFeedSourceAcquisitionAdapter(fetcher));
    expect(result.items.filter(item=>item.canonicalItemUrl==="https://news.example.test/c")).toHaveLength(1);
  });
});
