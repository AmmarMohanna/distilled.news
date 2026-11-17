import {describe,expect,it} from "vitest";
import {HttpHtmlSourceAcquisitionAdapter} from "../src/http-html-acquisition";
import {TemporalSourceAcquisition,type HttpHtmlSourceWorkflow,type SourceAcquisitionRequest} from "../src/index";

const request:SourceAcquisitionRequest={source:{canonicalSourceUrl:"https://news.example.test/section",resourceLocator:"https://news.example.test/section"},window:{startTime:"2026-09-22T00:00:00Z",endTime:"2026-09-24T00:00:00Z"},limits:{maxItems:10,maxPages:3,maxScrolls:1,maxPhysicalAttempts:3,maxExecutionMs:10_000},authentication:"PUBLIC",acquisitionAsOf:"2026-09-24T00:00:00Z"};
const item=(id:string,time:string,text="full article body with enough deterministic content")=>({sourceResource:"https://news.example.test/section",sourceItemId:id,canonicalItemUrl:`https://news.example.test/article/${id}`,title:`Headline ${id}`,text,publishedAt:time,originalSourceReference:`https://news.example.test/article/${id}`,acquisitionEvidence:{timestampSource:"fixture"}});

describe("generic deterministic HTTP/HTML adapter",()=>{
  it("traverses listings, extracts full article items, deduplicates URLs, and reports coverage",async()=>{
    const pages=[{articleUrls:["/article/a","/article/a","/article/b"],nextUrl:"https://news.example.test/section?page=2"},{articleUrls:["/article/c"],lowerBoundaryProven:true,sourceExhausted:true}];
    const articles={"https://news.example.test/article/a":item("a","2026-09-23T10:00:00Z"),"https://news.example.test/article/b":item("b","2026-09-22T12:00:00Z"),"https://news.example.test/article/c":item("c","2026-09-21T23:00:00Z")};
    let listingCalls=0,articleCalls=0;
    const workflow:HttpHtmlSourceWorkflow={listingUrl:(_r,page)=>page===1?"https://news.example.test/section":"https://news.example.test/section?page=2",parseListing:()=>pages[listingCalls++],parseArticle:(_html,url)=>articles[url as keyof typeof articles]};
    const fetcher=async(input:RequestInfo|URL)=>{const url=String(input);if(url.includes("article")){articleCalls++;return new Response("article html",{status:200});}return new Response("listing html",{status:200});};
    const adapter=new HttpHtmlSourceAcquisitionAdapter({...workflow,parseListing:workflow.parseListing,parseArticle:workflow.parseArticle},fetcher); const result=await new TemporalSourceAcquisition().acquire(request,adapter);
    expect(result.items.map(item=>item.sourceItemId)).toEqual(["a","b"]); expect(articleCalls).toBe(3); expect(result.coverage).toMatchObject({rangeCovered:true,stopReason:"START_BOUNDARY_REACHED"}); expect(result.continuation?.pageCount).toBe(2);
  });
});
