import { readFileSync } from "node:fs";
import { Miniflare } from "miniflare";
import { describe, expect, it, vi } from "vitest";
import { dispatchPendingPublicAcquisitionRequests, processPublicAcquisitionRequest } from "./public-acquisition-request";
import type { Env } from "./types";

describe("queued protected acquisition", () => {
  it("returns a durable bounded result after client detachment and ignores duplicate queue delivery", async () => {
    const mf = new Miniflare({ modules:true,script:"export default {fetch(){return new Response('ok')}}",d1Databases:["DB"] });
    try {
      const db=await mf.getD1Database("DB");
      await db.exec("CREATE TABLE source_acquisition_leases(scope_key TEXT PRIMARY KEY,request_id TEXT NOT NULL,expires_at TEXT NOT NULL);");
      await db.exec("CREATE TABLE browser_use_discovery_runs(state TEXT,outcome TEXT,completed_at TEXT,started_at TEXT);");
      const sql=readFileSync(new URL("../migrations/0029_public_acquisition_requests.sql",import.meta.url),"utf8");
      for(const statement of sql.split(/;\s*(?:\r?\n|$)/).map(value=>value.trim()).filter(Boolean))await db.prepare(statement).run();
      const payload={sourceUrl:"https://news.example/listing",ownerAccountId:"owner",startTime:"2026-09-20T00:00:00Z",endTime:"2026-09-21T00:00:00Z",idempotencyKey:"fixture-run"};
      await db.prepare("INSERT INTO public_acquisition_requests(request_id,idempotency_key,owner_account_id,request_json,state,created_at) VALUES(?,?,?,?,'pending',?)")
        .bind("request-1",payload.idempotencyKey,"owner",JSON.stringify(payload),new Date().toISOString()).run();
      const messages:unknown[]=[];
      const env={DB:db,DISTILLED_LIVE_PUBLIC_ACQUISITION_SMOKE:"false",WEB_OPERATOR_RUNTIME_TOKEN:"worker-held-secret",WEB_OPERATOR_QUEUE:{send:async(message:unknown)=>{messages.push(message)}}} as unknown as Env;
      expect(await dispatchPendingPublicAcquisitionRequests(env)).toBe(1);
      expect(messages).toEqual([{type:"public_acquisition_request",requestId:"request-1"}]);
      const invoke=vi.fn(async(request:Request)=>{
        expect(new URL(request.url).pathname).toBe("/v1/sources/acquisition");
        expect(request.headers.get("authorization")).toBe("Bearer worker-held-secret");
        expect(await request.json()).toEqual(payload);
        return Response.json({status:"SUCCESS",webOperatorCalls:1,discoveryModelCalls:6,discoveryBrowserOperations:17,items:[{sourceItemId:"post-1",publishedAt:"2026-09-20T12:00:00Z",contentLength:4200,title:"title",text:"raw secret-bearing body"}]});
      });
      await processPublicAcquisitionRequest(env,{type:"public_acquisition_request",requestId:"request-1"},invoke);
      await processPublicAcquisitionRequest(env,{type:"public_acquisition_request",requestId:"request-1"},invoke);
      expect(invoke).toHaveBeenCalledTimes(1);
      const fresh=await db.prepare("SELECT state,outcome,result_json FROM public_acquisition_requests WHERE request_id='request-1'").first<{state:string;outcome:string;result_json:string}>();
      expect(fresh?.state).toBe("completed");
      expect(JSON.parse(fresh!.result_json)).toMatchObject({status:"SUCCESS",discoveryModelCalls:6,items:[{sourceItemId:"post-1",contentLength:4200}]});
      expect(fresh!.result_json).not.toMatch(/raw secret-bearing|title|worker-held-secret/);
    } finally { await mf.dispose(); }
  });
});
