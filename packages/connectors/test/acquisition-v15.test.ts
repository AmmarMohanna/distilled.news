import {describe,it,expect,vi} from "vitest";
import {fetchRssCandidates,fetchGoogleNewsCandidates,fetchTelethonCandidates,fetchPublicTelegramCandidates,handoffConnectorBatch,reuseSuppliedPayload} from "../src/index";
import type {ConnectorBatch,PayloadStore,CandidateIntakePort,CheckpointStore} from "../src/acquisition/contracts";
const scope={tenantId:"tenant",resourceId:"channel"};const cp={version:"0"};
const observation={upstreamId:"telegram:123:7",operation:"upsert" as const,text:"hello",publishedAt:"2026-09-30T08:00:00Z",timestampKind:"published" as const,representation:"telegram_message" as const,contentCompleteness:"complete" as const};
function batch():ConnectorBatch{return {connector:"telethon",observations:[observation],coverage:{completeness:"partial",reason:"page"},checkpointProposal:{afterMessageId:7},retry:{kind:"none"},telemetry:{requests:1,latencyMs:3,providerCostUsd:0}};}
function ports(){
 const data=new Map<string,string>();const effects=new Set<string>();const order:string[]=[];
 const payloads:PayloadStore={put:async(s,h,p)=>{order.push("payload");data.set(s.tenantId+h,p);return h;},get:async(s,h)=>data.get(s.tenantId+h)!};
 const intake:CandidateIntakePort={accept:async p=>{order.push("intake");p.forEach(x=>effects.add(x.observationKey));return{durable:true,acceptedObservationKeys:p.map(x=>x.observationKey)};}};
 const checkpoints:CheckpointStore={advance:vi.fn(async()=>{order.push("checkpoint");return true;})};
 return {payloads,intake,checkpoints,effects,order};
}
describe("connector intake seam",()=>{
 it("persists payload before intake before checkpoint; replay has one intake effect",async()=>{
  const p=ports();await handoffConnectorBatch(scope,cp,batch(),p);await handoffConnectorBatch(scope,cp,batch(),p);
  expect(p.order.slice(0,3)).toEqual(["payload","intake","checkpoint"]);expect(p.effects.size).toBe(1);
 });
 it("does not checkpoint when persistence or intake fails",async()=>{
  for(const where of ["payload","intake"]){const p=ports();if(where==="payload")p.payloads.put=async()=>{throw Error("storage");};else p.intake.accept=async()=>{throw Error("intake");};
   await expect(handoffConnectorBatch(scope,cp,batch(),p)).rejects.toThrow();expect(p.checkpoints.advance).not.toHaveBeenCalled();}
 });
 it("does not advance on rejected proposals or unproven history",async()=>{
  const p=ports();p.intake.accept=async()=>({durable:true,acceptedObservationKeys:[]});await expect(handoffConnectorBatch(scope,cp,batch(),p)).rejects.toThrow("intake_not_durably_accepted");
  const b=batch();b.checkpointProposal={historicalBoundary:"2026-09-30T00:00:00Z"};await expect(handoffConnectorBatch(scope,cp,b,p)).rejects.toThrow("unproven");expect(p.checkpoints.advance).not.toHaveBeenCalled();
 });
 it("scopes identity by tenant and preserves identity across edits",async()=>{
  const p=ports();const a=await handoffConnectorBatch(scope,cp,batch(),p);const b=batch();b.observations=[{...observation,text:"edited"}];const e=await handoffConnectorBatch(scope,cp,b,p);
  expect(a.proposals[0].candidateKey).toBe(e.proposals[0].candidateKey);expect(a.proposals[0].observationKey).not.toBe(e.proposals[0].observationKey);
  const other=await handoffConnectorBatch({...scope,tenantId:"other"},cp,batch(),p);expect(other.proposals[0].candidateKey).not.toBe(a.proposals[0].candidateKey);
 });
 it("reuses durable payload without browser/model provenance; refuses full article upgrade",async()=>{
  const p=ports();const {proposals}=await handoffConnectorBatch(scope,cp,batch(),p);
  const acquired=await reuseSuppliedPayload(proposals[0],"telegram_message",p.payloads);expect(acquired?.content.text).toBe("hello");expect(acquired?.provenance).not.toHaveProperty("modelCallId");
  expect(await reuseSuppliedPayload(proposals[0],"full_article",p.payloads)).toBeNull();p.payloads.get=async()=>"tampered";await expect(reuseSuppliedPayload(proposals[0],"telegram_message",p.payloads)).rejects.toThrow("integrity");
 });
 it("exposes checkpoint CAS conflict without claiming advancement",async()=>{const p=ports();p.checkpoints.advance=async()=>false;expect((await handoffConnectorBatch(scope,cp,batch(),p)).checkpointAdvanced).toBe(false);});
});
const xml=(items=1)=>`<rss><channel>${Array.from({length:items},(_,i)=>`<item><guid>opaque-${i}</guid><title>Title</title><description>Summary</description><link>https://publisher.test/${i}</link><pubDate>2026-09-30T00:00:00Z</pubDate></item>`).join("")}</channel></rss>`;
const rssInput={url:"https://publisher.test/rss",resourceId:"feed",checkpoint:cp,maxItems:10};
describe("RSS and Google News",()=>{
 it("preserves opaque GUID and does not infer historical completeness from a finite feed",async()=>{const b=await fetchRssCandidates(rssInput,{get:async()=>({status:200,body:xml(),headers:{etag:'"1"'}})});expect(b.observations[0].upstreamId).toBe("opaque-0");expect(b.coverage.completeness).toBe("partial");expect(b.checkpointProposal?.historicalBoundary).toBeUndefined();expect(b.checkpointProposal?.etag).toBe('"1"');});
 it("does not commit ETag when the cap leaves unseen work",async()=>{const b=await fetchRssCandidates({...rssInput,maxItems:1},{get:async()=>({status:200,body:xml(2),headers:{etag:"x"}})});expect(b.checkpointProposal).toBeUndefined();expect(b.coverage.reason).toBe("item_limit");});
 it("uses committed ETag and treats 304 as unchanged, not complete history",async()=>{const get=vi.fn(async(_url:string,_headers:Record<string,string>)=>({status:304,body:"",headers:{}}));const b=await fetchRssCandidates({...rssInput,checkpoint:{version:"1",etag:"saved"}},{get});expect(get.mock.calls[0][1]).toEqual(expect.objectContaining({"if-none-match":"saved"}));expect(b.coverage.completeness).toBe("unknown");});
 it("reports rate limits and rejects challenge HTML",async()=>{const a=await fetchRssCandidates(rssInput,{get:async()=>({status:429,body:"",headers:{"retry-after":"60"}})});expect(a.retry).toMatchObject({kind:"rate_limit",afterMs:60000});const b=await fetchRssCandidates(rssInput,{get:async()=>({status:200,body:"<html>Challenge</html>",headers:{}})});expect(b.retry.kind).toBe("permanent");});
 it("freezes query locale and emits listings, not full articles",async()=>{let url="";const b=await fetchGoogleNewsCandidates({query:"energy",region:"FR",language:"fr",resourceId:"google",checkpoint:cp,maxItems:10},{get:async u=>{url=u;return{status:200,body:xml(),headers:{}};}});expect(new URL(url).searchParams.get("ceid")).toBe("FR:fr");expect(b.observations[0].representation).toBe("news_listing");expect(b.observations[0].contentCompleteness).toBe("partial");});
});
const tg={channelId:"123",checkpoint:{version:"0",afterMessageId:5},maxItems:10,mode:"poll" as const};
describe("Telegram alternatives",()=>{
 it("uses the same candidate identity for public and authenticated observations",async()=>{
  const html='<div class="tgme_widget_message" data-post="telegram/7"><div class="tgme_widget_message_text js-message_text">hello</div><a class="tgme_widget_message_date" href="https://t.me/telegram/7"><time datetime="2026-09-30T00:00:00Z"></time></a></div></main>';
  const publicBatch=await fetchPublicTelegramCandidates({...tg,username:"telegram"},{get:async()=>({status:200,body:html,headers:{}})});
  const apiBatch=await fetchTelethonCandidates(tg,{read:async()=>({channelId:"123",records:[{id:7,text:"hello",publishedAt:"2026-09-30T00:00:00Z"}],exhausted:true,orderedFromCheckpoint:true,requests:1,providerCostUsd:0})});
  expect(publicBatch.observations).toHaveLength(1);
  const p=ports();const a=await handoffConnectorBatch(scope,cp,publicBatch,p);const b=await handoffConnectorBatch(scope,cp,apiBatch,p);
  expect(a.proposals[0].candidateKey).toBe(b.proposals[0].candidateKey);
 });
 it("only advances an oldest-first page from the checkpoint",async()=>{const port={read:async()=>({channelId:"123",records:[{id:7,text:"hello",publishedAt:observation.publishedAt}],exhausted:false,orderedFromCheckpoint:true,requests:1,providerCostUsd:0})};const b=await fetchTelethonCandidates(tg,port);expect(b.checkpointProposal?.afterMessageId).toBe(7);expect(b.coverage.completeness).toBe("partial");expect(b.observations[0].upstreamId).toBe(observation.upstreamId);});
 it("does not advance unordered pages or rechecks",async()=>{const port={read:async()=>({channelId:"123",records:[{id:7,text:"edited",publishedAt:observation.publishedAt}],exhausted:true,orderedFromCheckpoint:false,requests:1,providerCostUsd:0})};expect((await fetchTelethonCandidates(tg,port)).checkpointProposal).toBeUndefined();expect((await fetchTelethonCandidates({...tg,mode:"recheck",recheckIds:[7]},port)).checkpointProposal).toBeUndefined();});
 it("records explicit tombstones without inventing deletions from absence",async()=>{const b=await fetchTelethonCandidates({...tg,mode:"recheck",recheckIds:[7]},{read:async()=>({channelId:"123",records:[{id:7,text:"",publishedAt:"",deleted:true}],exhausted:false,orderedFromCheckpoint:false,requests:1,providerCostUsd:0})});expect(b.observations[0].operation).toBe("delete");expect(b.checkpointProposal).toBeUndefined();});
 it("rejects wrong-channel output and bounds revision rechecks",async()=>{await expect(fetchTelethonCandidates(tg,{read:async()=>({channelId:"999",records:[],exhausted:true,orderedFromCheckpoint:true,requests:1,providerCostUsd:0})})).rejects.toThrow("contract");await expect(fetchTelethonCandidates({...tg,mode:"recheck",recheckIds:[]},{read:vi.fn()})).rejects.toThrow("recheck");});
 it("public landing page is partial and cannot move the shared cursor",async()=>{const b=await fetchPublicTelegramCandidates({...tg,username:"telegram"},{get:async()=>({status:200,body:"<html>View in Telegram</html>",headers:{}})});expect(b.coverage.reason).toBe("preview_has_no_inventory");expect(b.checkpointProposal).toBeUndefined();expect(b.observations).toEqual([]);});
});
