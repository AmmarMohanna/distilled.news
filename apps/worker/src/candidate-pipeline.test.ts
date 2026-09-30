import {readFileSync} from "node:fs";
import {Miniflare} from "miniflare";
import {expect,it} from "vitest";
import type {CandidateProposal} from "@distilled/core";
import {CandidateIntake,acquireCandidate,canonicalizeCandidateUrl} from "./connector-seam";
import {D1UpstreamResourceStore} from "./upstream-resource-store";
import type {SourceRecord} from "./types";

it("deduplicates connector discovery before acquisition and retains each discovery origin",async()=>{
  const {mf,db,resource}=await setup();
  try{
    const intake=new CandidateIntake(db),base=proposal(resource);
    const first=await intake.accept("owner",base);
    const replay=await intake.accept("owner",base);
    const second=await intake.accept("owner",{...base,discovery:{provider:"google_news",runId:"run-2"}});
    expect(replay.candidate.id).toBe(first.candidate.id);
    expect(second.candidate.id).toBe(first.candidate.id);
    expect((await db.prepare("SELECT count(*) n FROM candidate_discoveries WHERE candidate_id=?").bind(first.candidate.id).first<{n:number}>())?.n).toBe(2);
  }finally{await mf.dispose()}
});

it("keeps scope boundaries and deduplicates platform IDs and payload hashes",async()=>{
  const {mf,db,resource}=await setup();
  try{
    const intake=new CandidateIntake(db),base=proposal(resource);
    const first=await intake.accept("owner",base);
    const upstream=await intake.accept("owner",{...base,url:"https://other.example.com/story",discovery:{provider:"api",runId:"run-3"}});
    expect(upstream.candidate.id).toBe(first.candidate.id);
    const otherScope=await intake.accept("owner",{...base,accessScope:"private:alice",discovery:{provider:"rss",runId:"run-4"}});
    expect(otherScope.candidate.id).not.toBe(first.candidate.id);
  }finally{await mf.dispose()}
});

it("deduplicates safe supplied hashes and rejects unsafe URLs",async()=>{
  const {mf,db,resource}=await setup();
  try{
    const intake=new CandidateIntake(db),base=proposal(resource);
    const hashOnly=await intake.accept("owner",{...base,url:undefined,upstreamId:undefined,payloadHash:"hash-1",discovery:{provider:"api",runId:"run-5"}});
    const hashReplay=await intake.accept("owner",{...base,url:undefined,upstreamId:undefined,payloadHash:"hash-1",discovery:{provider:"api",runId:"run-6"}});
    expect(hashReplay.candidate.id).toBe(hashOnly.candidate.id);
    expect(()=>canonicalizeCandidateUrl("http://127.0.0.1/internal")).toThrow("candidate_url_unsafe");
    expect(()=>canonicalizeCandidateUrl("javascript:alert(1)")).toThrow("candidate_url_unsafe");
  }finally{await mf.dispose()}
});

it("acquires supplied payload with no external route and keeps resolvable normalized provenance",async()=>{
  const {mf,db,resource}=await setup();
  try{
    const intake=new CandidateIntake(db);
    const {candidate}=await intake.accept("owner",{...proposal(resource),suppliedPayloadRef:"r2:allowed/item-1"});
    let supplied=0,external=0;
    const strategies={suppliedPayload:async(ref:string)=>{supplied++;expect(ref).toBe("r2:allowed/item-1");return {text:"A complete message body",publishedAt:"2026-09-29T12:00:00Z"}},directHttp:async()=>{external++;throw new Error("unexpected network")},browser:async()=>{external++;throw new Error("unexpected browser")}};
    const {content,normalized}=await acquireCandidate(db,candidate,strategies);
    expect({supplied,external}).toEqual({supplied:1,external:0});
    expect(content).toMatchObject({candidateId:candidate.id,acquisitionMethod:"supplied_payload",rawPayloadRef:"r2:allowed/item-1",quality:{transportSuccess:true,extractionSuccess:true,extractionComplete:true}});
    expect(normalized.provenance).toMatchObject({candidateId:candidate.id,acquiredContentId:content.id,acquisitionMethod:"supplied_payload"});
    expect((await db.prepare("SELECT count(*) n FROM canonical_acquired_content WHERE candidate_id=?").bind(candidate.id).first<{n:number}>())?.n).toBe(1);
    await acquireCandidate(db,candidate,strategies);
    expect({supplied,external}).toEqual({supplied:1,external:0});
    expect((await db.prepare("SELECT count(*) n FROM normalized_evidence_items WHERE candidate_id=?").bind(candidate.id).first<{n:number}>())?.n).toBe(1);
    const direct=await intake.accept("owner",{...proposal(resource),upstreamId:"post-2",url:"https://example.com/post-2"});
    const directResult=await acquireCandidate(db,direct.candidate,{directHttp:async()=>({text:"partial body",quality:{transportSuccess:true,extractionSuccess:true,extractionComplete:false}})},"direct_http");
    expect(directResult.content.quality.extractionComplete).toBe(false);
    const browser=await intake.accept("owner",{...proposal(resource),upstreamId:"post-3",url:"https://example.com/post-3"});
    expect((await acquireCandidate(db,browser.candidate,{browser:async()=>({text:"browser body"})},"browser")).content.acquisitionMethod).toBe("browser");
  }finally{await mf.dispose()}
});

it("retains supplied work when queue send fails and replays without reacquisition",async()=>{
  const {mf,db,resource}=await setup();
  try{
    const source={id:"feed-source",briefingId:"feed",title:"Feed",type:"rss",provider:"rss",kind:"rss_feed",enabled:true,lastSeenAt:"2026-09-29T13:00:00Z"} as SourceRecord;
    const {candidate}=await new CandidateIntake(db).accept("owner",{...proposal(resource),suppliedPayloadRef:"r2:payload"});
    let reads=0,sends=0;
    const strategies={suppliedPayload:async()=>{reads++;return {text:"Trusted article body",title:"Article",publishedAt:"2026-09-29T12:00:00Z"}}};
    const queue={send:async()=>{sends++;throw Error("temporary queue failure")}};
    await acquireCandidate(db,candidate,strategies,undefined,{source,queue});
    expect({reads,sends}).toEqual({reads:1,sends:1});
    expect((await db.prepare("SELECT count(*) n FROM processing_jobs").first<{n:number}>())?.n).toBe(1);
    await acquireCandidate(db,candidate,strategies,undefined,{source,queue});
    expect({reads,sends}).toEqual({reads:1,sends:1});
    expect((await db.prepare("SELECT count(*) n FROM raw_messages").first<{n:number}>())?.n).toBe(1);
  }finally{await mf.dispose()}
});

function proposal(resource:string):CandidateProposal{return {upstreamResourceId:resource,accessScope:"public",connectorType:"rss",sourceId:resource,upstreamId:"post-1",url:"https://example.com/story?utm_source=x",titleHint:"Story",publishedAtHint:"2026-09-29T12:00:00Z",discoveredAt:"2026-09-29T13:00:00Z",discovery:{provider:"rss",runId:"run-1"}}}
async function setup(){
  const mf=new Miniflare({modules:true,script:"export default {fetch(){return new Response('ok')}}",d1Databases:["DB"]});
  const db=await mf.getD1Database("DB");
  await db.prepare("CREATE TABLE upstream_resources(id TEXT PRIMARY KEY,tenant_id TEXT,canonical_source_url TEXT,resource_locator TEXT,source_family TEXT,created_at TEXT,updated_at TEXT)").run();
  const sql=readFileSync(new URL("../migrations/0035_candidate_intake.sql",import.meta.url),"utf8");
  await db.batch(sql.split(/;\s*(?:\r?\n|$)/).map(value=>value.trim()).filter(Boolean).map(value=>db.prepare(value)));
  await db.exec("CREATE TABLE acquired_source_items(id TEXT PRIMARY KEY,tenant_id TEXT,resource_id TEXT,identity TEXT,canonical_url TEXT,source_item_id TEXT,source_url TEXT,title TEXT,body TEXT,published_at TEXT,evidence_json TEXT,workflow_id TEXT,workflow_version INTEGER,acquired_at TEXT,expires_at TEXT); CREATE TABLE raw_messages(id TEXT PRIMARY KEY,briefing_id TEXT,source_id TEXT,source_title TEXT,source_type TEXT,source_provider TEXT,source_kind TEXT,message_id TEXT,text TEXT,links_json TEXT,media_json TEXT,posted_at TEXT,received_at TEXT,source_url TEXT,expires_at TEXT,created_at TEXT,news_json TEXT); CREATE TABLE processing_jobs(id TEXT PRIMARY KEY,briefing_id TEXT,raw_message_id TEXT,state TEXT,created_at TEXT,updated_at TEXT);");
  const resource=(await new D1UpstreamResourceStore(db).resolveOrCreate({tenantId:"owner",canonicalSourceUrl:"https://example.com/feed"})).id;
  return {mf,db,resource};
}
