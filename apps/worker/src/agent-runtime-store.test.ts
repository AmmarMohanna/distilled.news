import { afterEach,describe,expect,it } from "vitest";
import { readFile } from "node:fs/promises";
import { Miniflare } from "miniflare";
import { WebOperatorAcquisitionStrategy } from "@distilled/agent-runtime/admission";
import { StaleGenerationError } from "@distilled/agent-runtime/persistence";
import type { KnownCandidateInvocation } from "@distilled/agent-runtime/runtime";
import { D1AgentRuntimeStore } from "./agent-runtime-store";
import { relayPendingWebOperatorOutbox } from "./web-operator-admission";
import type { Env,WebOperatorRunMessage } from "./types";

describe("D1 agent runtime fencing and outbox",()=>{
  let mf:Miniflare|undefined;
  afterEach(async()=>{await mf?.dispose();mf=undefined;});

  it("rejects a generation-N late budget write after generation N+1 acquires",async()=>{
    const {db,store}=await setup(); const admitted=await new WebOperatorAcquisitionStrategy(store).admitKnownCandidate(invocation());
    const start=new Date(); const a=await store.acquireLease(admitted.run.runId,"worker-a",10_000,start); expect(a?.generation).toBe(1);
    const budget=await store.getBudget(admitted.run.runId); expect(budget).not.toBeNull();
    await store.saveBrowserSession({id:"session-a",runId:admitted.run.runId,tenantId:"tenant",generation:a!.generation,state:"active",createdAt:start.toISOString()});
    let finishLateOperation!:()=>void;
    const longOperation=new Promise<void>((resolve)=>{finishLateOperation=resolve;});
    const workerALateWrite=(async()=>{await longOperation;return store.saveBudget(budget!,a!.generation);})();
    const b=await store.acquireLease(admitted.run.runId,"worker-b",10_000,new Date(start.getTime()+10_001)); expect(b?.generation).toBe(2);
    finishLateOperation();
    await expect(workerALateWrite).rejects.toBeInstanceOf(StaleGenerationError);
    await expect(store.appendEvent(admitted.run.runId,"late.worker.event",{},undefined,a!.generation)).rejects.toBeInstanceOf(StaleGenerationError);
    await store.saveBudget(budget!,b!.generation);
    const priorSession=await db.prepare("SELECT state FROM agent_browser_sessions WHERE id='session-a'").first<{state:string}>();
    expect(priorSession?.state).toBe("crashed");
  },15_000);

  it("relays an admission committed before publication from a fresh store instance",async()=>{
    const {db,store}=await setup(); const admitted=await new WebOperatorAcquisitionStrategy(store).admitKnownCandidate(invocation());
    const sent:WebOperatorRunMessage[]=[]; const env={WEB_OPERATOR_QUEUE:{send:async(message:WebOperatorRunMessage)=>{sent.push(message);}}} as unknown as Env;
    const restartedStore=new D1AgentRuntimeStore(db);
    expect(await relayPendingWebOperatorOutbox(env,restartedStore)).toBe(1);
    expect(sent).toEqual([{type:"web_operator_run",runId:admitted.run.runId}]);
    expect((await restartedStore.getOutbox(admitted.run.runId))?.state).toBe("delivered");
  });

  it("returns the canonical D1 run for duplicate scoped admission without inserting orphan children",async()=>{
    const {db,store}=await setup(); const strategy=new WebOperatorAcquisitionStrategy(store);
    const first=await strategy.admitKnownCandidate(invocation(),new Date("2026-01-01T00:00:00.000Z"));
    const second=await strategy.admitKnownCandidate({...invocation(),objective:"A duplicate request must not replace canonical state."},new Date("2026-01-01T00:00:01.000Z"));
    expect(second.created).toBe(false);
    expect(second.run.runId).toBe(first.run.runId);
    expect((await store.getOutbox(first.run.runId))?.runId).toBe(first.run.runId);
    const counts=await db.prepare("SELECT (SELECT COUNT(*) FROM agent_runs) runs,(SELECT COUNT(*) FROM agent_outbox) outboxes,(SELECT COUNT(*) FROM agent_run_configurations) configs").first<{runs:number;outboxes:number;configs:number}>();
    expect(counts).toEqual({runs:1,outboxes:1,configs:1});
  });

  it("fails loudly when a scoped idempotency replay changes immutable candidate identity",async()=>{
    const {store}=await setup(); const strategy=new WebOperatorAcquisitionStrategy(store);
    await strategy.admitKnownCandidate(invocation());
    await expect(strategy.admitKnownCandidate({...invocation(),candidate:{...invocation().candidate,canonicalUrl:"https://fixture.test/other"}}))
      .rejects.toThrow(/agent run identity collision/);
  });

  async function setup() {
    mf=new Miniflare({modules:true,script:"export default {fetch(){return new Response('ok')}}",d1Databases:["DB"]});
    const db=await mf.getD1Database("DB");
    const sql=await readFile(new URL("../migrations/0011_agent_runtime.sql",import.meta.url),"utf8");
    for (const statement of sql.split(/;\s*(?:\r?\n|$)/).map((value)=>value.trim()).filter(Boolean)) await db.prepare(statement).run();
    return {db,store:new D1AgentRuntimeStore(db)};
  }
});

function invocation():KnownCandidateInvocation {
  return {tenantId:"tenant",resourceId:"resource",idempotencyKey:"key",objective:"Acquire candidate",enabled:true,
    candidate:{candidateId:"candidate",canonicalUrl:"https://fixture.test/article",publisherId:"fixture",acquisitionAttempt:"attempt"},
    policy:{id:"policy",allowedOrigins:["https://fixture.test"],allowLoopback:false,allowedTools:["browser.navigate@1"],visualReadPurposes:[],
      modelPolicy:{allowedProviders:["fixture"],allowedDeployments:["api"],requiredPrivacyEligibility:["public"],allowedRetentionClasses:["zero_data_retention"]}},
    modelRouting:{mode:"api",apiGateway:"openrouter",selfHostedGateway:"openai_compatible",roles:{NAVIGATION_FAST:{primary:{deployment:"api",model:"fixture"},fallbacks:[]}}},
    modelCapabilities:[{modelRef:"fixture",provider:"fixture",deployment:"api",externallyHosted:true,privacyEligibility:["public"],retentionClass:"zero_data_retention",
      toolCalling:true,vision:false,structuredOutput:true,reasoningClass:"fast",enabled:true,inputCostPerMillion:0,outputCostPerMillion:0}]};
}
