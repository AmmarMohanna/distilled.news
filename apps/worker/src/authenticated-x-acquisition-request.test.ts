import { readFileSync } from "node:fs";
import { Miniflare } from "miniflare";
import { describe,expect,it,vi } from "vitest";
import { dispatchPendingAuthenticatedXAcquisitionRequests,processAuthenticatedXAcquisitionRequest } from "./authenticated-x-acquisition-request";
import type { Env } from "./types";

describe("queued authenticated X acquisition",()=>{
  it("persists a bounded result across contexts and ignores duplicate delivery",async()=>{
    const mf=new Miniflare({modules:true,script:"export default {fetch(){return new Response('ok')}}",d1Databases:["DB"]});
    try{
      const db=await mf.getD1Database("DB");
      const sql=readFileSync(new URL("../migrations/0030_authenticated_x_acquisition_requests.sql",import.meta.url),"utf8");
      for(const statement of sql.split(/;\s*(?:\r?\n|$)/).map(value=>value.trim()).filter(Boolean))await db.prepare(statement).run();
      const payload={authenticatedProfileId:"authenticated_profile_fixture",ownerAccountId:"owner",sourceUrl:"https://x.com/source",startTime:"2026-09-25T00:00:00Z",endTime:"2026-09-28T00:00:00Z",idempotencyKey:"x-fixture-run"};
      await db.prepare("INSERT INTO authenticated_x_acquisition_requests(request_id,idempotency_key,owner_account_id,authenticated_profile_id,request_json,state,created_at) VALUES(?,?,?,?,?,'pending',?)")
        .bind("request-1",payload.idempotencyKey,"owner",payload.authenticatedProfileId,JSON.stringify(payload),new Date().toISOString()).run();
      const messages:unknown[]=[];
      const env={DB:db,WEB_OPERATOR_RUNTIME_TOKEN:"worker-held-secret",WEB_OPERATOR_QUEUE:{send:async(value:unknown)=>{messages.push(value)}}} as unknown as Env;
      expect(await dispatchPendingAuthenticatedXAcquisitionRequests(env)).toBe(1);
      expect(messages).toEqual([{type:"authenticated_x_acquisition_request",requestId:"request-1"}]);
      const invoke=vi.fn(async(request:Request)=>{
        expect(request.headers.get("authorization")).toBe("Bearer worker-held-secret");
        expect(await request.json()).toEqual(payload);
        return Response.json({status:"SUCCESS",webOperatorCalls:1,discoveryModelCalls:4,discoveryBrowserOperations:7,activeWorkflow:{id:"workflow-x",version:1,state:"ACTIVE",secret:"untrusted"},coverage:{rangeCovered:false,truncated:true,stopReason:"MAX_ITEMS_REACHED",secret:"untrusted"},items:[{sourceItemId:"123",publishedAt:"2026-09-27T00:00:00Z",contentLength:80,text:"secret body",canonicalItemUrl:"https://x.com/source/status/123"}]});
      });
      await processAuthenticatedXAcquisitionRequest(env,{type:"authenticated_x_acquisition_request",requestId:"request-1"},invoke);
      await processAuthenticatedXAcquisitionRequest(env,{type:"authenticated_x_acquisition_request",requestId:"request-1"},invoke);
      expect(invoke).toHaveBeenCalledTimes(1);
      const row=await db.prepare("SELECT state,outcome,result_json FROM authenticated_x_acquisition_requests WHERE request_id='request-1'").first<{state:string;outcome:string;result_json:string}>();
      expect(row?.state).toBe("completed");
      expect(JSON.parse(row!.result_json)).toMatchObject({status:"SUCCESS",discoveryModelCalls:4,activeWorkflow:{id:"workflow-x",version:1,state:"ACTIVE"},items:[{sourceItemId:"123",contentLength:80}]});
      expect(row!.result_json).not.toMatch(/secret body|untrusted|worker-held-secret|canonicalItemUrl/);
    }finally{await mf.dispose()}
  });
});
