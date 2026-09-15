import { readFile } from "node:fs/promises";
import { OpenRouterGateway } from "@distilled/agent-runtime";
import { Miniflare } from "miniflare";
import { afterEach,describe,expect,it } from "vitest";
import { dispatchPendingOpenRouterModelDiagnostics,processOpenRouterModelDiagnostic } from "./openrouter-model-diagnostic";
import type { Env,OpenRouterModelDiagnosticMessage } from "./types";

describe("operator-controlled OpenRouter model diagnostic",()=>{
  let mf:Miniflare|undefined;
  afterEach(async()=>{await mf?.dispose();mf=undefined;});

  it("is disabled by default and dispatches one durable diagnostic at most once",async()=>{
    const db=await setup();
    await insert(db,"request-a","diagnostic-key-a");
    const messages:OpenRouterModelDiagnosticMessage[]=[];
    const queue={send:async(message:OpenRouterModelDiagnosticMessage)=>{messages.push(message);}};
    expect(await dispatchPendingOpenRouterModelDiagnostics({DB:db,WEB_OPERATOR_QUEUE:queue as never,DISTILLED_OPENROUTER_DIAGNOSTIC_ENABLED:undefined})).toBe(0);
    const env={DB:db,WEB_OPERATOR_QUEUE:queue as never,DISTILLED_OPENROUTER_DIAGNOSTIC_ENABLED:"true"};
    expect(await dispatchPendingOpenRouterModelDiagnostics(env)).toBe(1);
    expect(await dispatchPendingOpenRouterModelDiagnostics(env)).toBe(0);
    expect(messages).toEqual([{type:"openrouter_model_diagnostic",requestId:"request-a"}]);
  });

  it("runs the staged gateway matrix once without allocating a browser or persisting response content",async()=>{
    const db=await setup();
    await insert(db,"request-b","diagnostic-key-b");
    let call=0;
    const gateway=new OpenRouterGateway({apiKey:"test-secret",fetcher:async()=>{
      call+=1;
      const message=call===4
        ? {content:null,tool_calls:[{id:"tool-1",type:"function",function:{name:"report_ok",arguments:'{"ok":true}'}}]}
        : {content:call===3?'{"ok":true}':call>=5?'{"version":1,"actions":[{"tool":"browser.inspect_dom@1","arguments":{}}]}':"OK"};
      return Response.json({id:`response-${call}`,model:"anthropic/claude-sonnet-4.6",provider:"Anthropic",
        choices:[{finish_reason:"stop",message}],usage:{prompt_tokens:2,completion_tokens:2,cost:0.00001}});
    }});
    const env={DB:db,OPENROUTER_API_KEY:"worker-secret",DISTILLED_OPENROUTER_DIAGNOSTIC_ENABLED:"true",
      DISTILLED_LIVE_OPENROUTER_MODEL:"anthropic/claude-sonnet-4.6",DISTILLED_LIVE_OPENROUTER_PROVIDER:"anthropic",
      DISTILLED_OPENROUTER_DIAGNOSTIC_TIMEOUT_MS:"5000",
      DISTILLED_LIVE_PUBLIC_CANDIDATE_URL:"https://matklad.github.io/2024/12/24/minimal-version-selection-revisited.html"} as Env;

    expect((await processOpenRouterModelDiagnostic(env,{type:"openrouter_model_diagnostic",requestId:"request-b"},new Date(),gateway)).status)
      .toBe("completed");
    expect((await processOpenRouterModelDiagnostic(env,{type:"openrouter_model_diagnostic",requestId:"request-b"},new Date(),gateway)).status)
      .toBe("ignored");
    expect(call).toBe(6);
    const row=await db.prepare(`SELECT state,attempt_count,requested_model,requested_provider,stopped_at_stage,result_json,failure_class
      FROM openrouter_model_diagnostic_requests WHERE request_id='request-b'`).first<Record<string,unknown>>();
    expect(row).toMatchObject({state:"completed",attempt_count:1,requested_model:"anthropic/claude-sonnet-4.6",
      requested_provider:"anthropic",stopped_at_stage:null,failure_class:null});
    expect(String(row?.result_json)).not.toContain("worker-secret");
    expect(String(row?.result_json)).not.toContain("Acquire the public article");
    expect(JSON.parse(String(row?.result_json)).stages).toHaveLength(6);
  });

  it("durably fails a claimed diagnostic when required operator configuration is absent",async()=>{
    const db=await setup();
    await insert(db,"request-c","diagnostic-key-c");
    const result=await processOpenRouterModelDiagnostic(
      {DB:db,DISTILLED_OPENROUTER_DIAGNOSTIC_ENABLED:"true"},
      {type:"openrouter_model_diagnostic",requestId:"request-c"}
    );
    expect(result).toEqual({status:"failed",failureClass:"internal_diagnostic_failure"});
    const row=await db.prepare(`SELECT state,attempt_count,failure_class,completed_at
      FROM openrouter_model_diagnostic_requests WHERE request_id='request-c'`).first<Record<string,unknown>>();
    expect(row).toMatchObject({state:"failed",attempt_count:1,failure_class:"internal_diagnostic_failure"});
    expect(row?.completed_at).toEqual(expect.any(String));
  });

  async function setup() {
    mf=new Miniflare({modules:true,script:"export default {fetch(){return new Response('ok')}}",d1Databases:["DB"]});
    const db=await mf.getD1Database("DB");
    const sql=await readFile(new URL("../migrations/0019_openrouter_model_diagnostic.sql",import.meta.url),"utf8");
    for (const statement of sql.split(/;\s*(?:\r?\n|$)/).map((value)=>value.trim()).filter(Boolean)) await db.prepare(statement).run();
    return db;
  }
});

async function insert(db:D1Database,requestId:string,idempotencyKey:string) {
  await db.prepare(`INSERT INTO openrouter_model_diagnostic_requests (request_id,idempotency_key,state,created_at)
    VALUES (?,?,'pending','2026-09-15T00:00:00.000Z')`).bind(requestId,idempotencyKey).run();
}
