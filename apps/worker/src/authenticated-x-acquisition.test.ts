import { readFileSync } from "node:fs";
import { Miniflare } from "miniflare";
import { describe,expect,it } from "vitest";
import { createWorkerXAcquisitionService } from "./authenticated-x-acquisition";
import { D1WorkflowRepository } from "./web-operator-workflow-store";
import type { Env } from "./types";

const sourceUrl="https://x.com/source";
const context={tenantId:"owner",ownerId:"owner",profileId:"authenticated_profile_fixture",resourceId:"resource-x",runId:"x-run",idempotencyKey:"x-fixture-first"};
const window={startTime:"2026-09-25T00:00:00Z",endTime:"2026-09-28T00:00:00Z"};
const limits={maxItems:2,maxPages:3,maxScrolls:2,maxPhysicalAttempts:12,maxExecutionMs:90000};
const post=(id:string,date:string)=>({sourceResource:sourceUrl,sourceItemId:id,canonicalItemUrl:`${sourceUrl}/status/${id}`,publishedAt:date,text:`Verified post ${id}`,acquisitionEvidence:{kind:"CDP_DOM_SNAPSHOT",pageRevision:"trusted"}});
const first={url:sourceUrl,pageRevision:"initial",items:[post("1234567890","2026-09-27T10:00:00Z")],challengeState:"NO_CHALLENGE" as const};
const second={url:sourceUrl,pageRevision:"scroll-1",items:[post("1234567890","2026-09-27T10:00:00Z"),post("1234567889","2026-09-26T10:00:00Z")],challengeState:"NO_CHALLENGE" as const};
function port(counts:{discover:number}){let opened=false;return{async open(){opened=true},async observe(){if(!opened)throw Error("closed");return first},async scrollAndObserve(){return second},async close(){opened=false},async discoverWithBrowserUse(){counts.discover++;return{protocol:"distilled.browser-use.discovery.v1" as const,runId:"x-run_browser_use",visitedUrls:[sourceUrl],listingUrls:[sourceUrl],articleUrls:[],continuation:"scroll" as const,timestampHints:[],steps:4,modelCalls:4,browserActions:7,agentBrowserActions:3,challengeObserved:false}}}}

describe("authenticated X workflow lifecycle",()=>{
  it("persists trusted post workflow and replays in a fresh service with zero discovery calls",async()=>{
    const mf=new Miniflare({modules:true,script:"export default {fetch(){return new Response('ok')}}",d1Databases:["DB"]});
    try{
      const db=await mf.getD1Database("DB");
      for(const name of ["0011_agent_runtime.sql","0013_web_operator_workflow_lifecycle.sql","0026_source_acquisition_state.sql","0028_browser_use_discovery_runs.sql","0031_bounded_decision_events.sql","0032_openrouter_decision_metadata.sql"]){
        const sql=readFileSync(new URL(`../migrations/${name}`,import.meta.url),"utf8").replace(/^PRAGMA foreign_keys = ON;\s*/m,"");
        for(const statement of sql.split(/;\s*(?:\r?\n|$)/).map(value=>value.trim()).filter(Boolean))await db.prepare(statement).run();
      }
      const env={DB:db,DISTILLED_LIVE_OPENROUTER_MODEL:"openai/test",OPENROUTER_API_KEY:"test-only"} as Env;
      const counts={discover:0};
      const input={tenantId:"owner",ownerId:"owner",resourceId:"resource-x",source:{sourceFamily:"x",canonicalSourceUrl:sourceUrl},window,limits,authentication:"AUTH_REQUIRED" as const,acquisitionAsOf:"2026-09-27T12:00:00Z"};
      const firstService=createWorkerXAcquisitionService(env,context,{agent:port(counts),verifier:port(counts),replay:port(counts)});
      const acquired=await firstService.acquire(input);
      expect(acquired.status).toBe("SUCCESS");expect(acquired.result?.items).toHaveLength(2);
      expect(acquired.webOperatorCalls).toBe(1);expect(acquired.discoveryModelCalls).toBe(4);
      expect((await new D1WorkflowRepository(db).getActiveWorkflow("resource-x"))?.authenticatedSourceAcquisition?.continuation.kind).toBe("SCROLL");
      const freshService=createWorkerXAcquisitionService(env,{...context,runId:"x-replay",idempotencyKey:"x-fixture-replay"},{replay:port(counts)});
      const replay=await freshService.acquire(input);
      expect(replay.status).toBe("SUCCESS");expect(replay.result?.items.map(item=>item.sourceItemId)).toEqual(["1234567890","1234567889"]);
      expect(replay.webOperatorCalls).toBe(0);expect(replay.discoveryModelCalls).toBeUndefined();expect(counts.discover).toBe(1);
    }finally{await mf.dispose()}
  },30_000);
});
