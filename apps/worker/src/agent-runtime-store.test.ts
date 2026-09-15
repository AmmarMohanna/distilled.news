import { afterEach,describe,expect,it } from "vitest";
import { readFile } from "node:fs/promises";
import { Miniflare } from "miniflare";
import { WebOperatorAcquisitionStrategy } from "@distilled/agent-runtime/admission";
import { StaleGenerationError } from "@distilled/agent-runtime/persistence";
import type { KnownCandidateInvocation } from "@distilled/agent-runtime/runtime";
import { D1AgentRuntimeStore } from "./agent-runtime-store";
import { relayPendingWebOperatorOutbox } from "./web-operator-admission";
import type { Env,WebOperatorRunMessage } from "./types";
import { shouldQuarantineQueueFailure } from "./index";

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

  it("reconciles repeated Web Operator queue failures at the retry ceiling to an operator-visible terminal state",async()=>{
    const {store}=await setup();
    const admitted=await new WebOperatorAcquisitionStrategy(store).admitKnownCandidate(invocation());
    const lease=await store.acquireLease(admitted.run.runId,"stalled-worker",10_000,new Date());
    expect(lease).not.toBeNull();
    await store.transitionRun(admitted.run.runId,lease!.generation,"running");
    const failure=new Error("Web Operator runtime failed: 503");
    for (let attempts=1;attempts<5;attempts+=1) {
      expect(shouldQuarantineQueueFailure(failure,attempts)).toBe(false);
      expect((await store.getRun(admitted.run.runId))?.state).toBe("running");
    }
    expect(shouldQuarantineQueueFailure(failure,5)).toBe(true);
    await store.failRunDelivery(admitted.run.runId,"Quarantined after repeated queue failures: Web Operator runtime failed: 503");
    expect((await store.getRun(admitted.run.runId))?.state).toBe("failed");
    expect(await store.getOutbox(admitted.run.runId)).toMatchObject({
      state:"failed",failureReason:"Quarantined after repeated queue failures: Web Operator runtime failed: 503"
    });
    expect((await store.listEvents(admitted.run.runId)).at(-1)).toMatchObject({type:"agent.run.delivery_failed"});
    await expect(store.assertGeneration(admitted.run.runId,lease!.generation)).rejects.toBeInstanceOf(StaleGenerationError);
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

  it("persists unconfirmed model-timeout provenance without replacing reserved usage",async()=>{
    const {db,store}=await setup();const strategy=new WebOperatorAcquisitionStrategy(store);
    const admitted=await strategy.admitKnownCandidate({...invocation(),idempotencyKey:"timeout-key"});
    const now=new Date();const lease=await store.acquireLease(admitted.run.runId,"timeout-worker",30_000,now);
    await store.transitionRun(admitted.run.runId,lease!.generation,"running",now.toISOString());
    await store.saveTurn({id:"timeout-turn",runId:admitted.run.runId,sequence:1,state:"model_streaming",createdAt:now.toISOString(),generation:lease!.generation});
    await store.saveModelCall({id:"timeout-call",runId:admitted.run.runId,turnId:"timeout-turn",generation:lease!.generation,
      role:"NAVIGATION_FAST",route:{} as never,contextManifestHash:"context",stableInstructionsHash:"stable",state:"streaming",createdAt:now.toISOString()});
    const startedAt=now.toISOString();const completedAt=new Date(now.getTime()+29_500).toISOString();
    const base={id:"timeout-attempt",modelCallId:"timeout-call",attempt:1,requestedGateway:"openrouter",requestedDeployment:"api" as const,
      requestedModel:"fixture/model",requestedProvider:"fixture",inputTokens:0,outputTokens:0,costUsd:0,startedAt,
      reservation:{inputTokens:1000,outputTokens:500,costUsd:0.01}};
    await store.saveModelAttempt({...base,latencyMs:0,usageConfirmed:false,state:"started"});
    await store.saveModelAttempt({...base,actualGateway:"openrouter",actualDeployment:"api",latencyMs:29_500,completedAt,
      usageConfirmed:false,failureClass:"deadline_exceeded",fallbackReason:"model gateway deadline exceeded",state:"failed"});

    const row=await db.prepare(`SELECT started_at,completed_at,usage_confirmed,failure_class,latency_ms,input_tokens,output_tokens,cost_usd,
      reserved_input_tokens,reserved_output_tokens,reserved_cost_usd,actual_model,actual_provider FROM agent_model_call_attempts WHERE id='timeout-attempt'`)
      .first<Record<string,string|number|null>>();
    expect(row).toEqual({started_at:startedAt,completed_at:completedAt,usage_confirmed:0,failure_class:"deadline_exceeded",latency_ms:29_500,
      input_tokens:0,output_tokens:0,cost_usd:0,reserved_input_tokens:1000,reserved_output_tokens:500,reserved_cost_usd:0.01,
      actual_model:null,actual_provider:null});
  });

  it("migrates legacy shared content into canonical data plus each run's own relational provenance",async()=>{
    mf=new Miniflare({modules:true,script:"export default {fetch(){return new Response('ok')}}",d1Databases:["DB"]});
    const db=await mf.getD1Database("DB");
    await applyMigration(db,"0011_agent_runtime.sql");
    const legacyStore=new D1AgentRuntimeStore(db);const strategy=new WebOperatorAcquisitionStrategy(legacyStore);
    const firstInput=invocation();firstInput.candidate={...firstInput.candidate,acquisitionAttempt:"run-a"};
    const secondInput={...invocation(),idempotencyKey:"key-b",candidate:{...invocation().candidate,acquisitionAttempt:"run-b"}};
    const first=await strategy.admitKnownCandidate(firstInput);const second=await strategy.admitKnownCandidate(secondInput);
    for (const [suffix,runId] of [["a",first.run.runId],["b",second.run.runId]] as const) {
      await db.prepare("INSERT INTO agent_turns (id,run_id,sequence,state,created_at,generation) VALUES (?,?,1,'completed',?,1)")
        .bind(`turn-${suffix}`,runId,"2026-01-01T00:00:00.000Z").run();
      await db.prepare(`INSERT INTO agent_model_calls
        (id,run_id,turn_id,generation,role,route_json,context_manifest_hash,stable_instructions_hash,state,created_at)
        VALUES (?,?,?,1,'NAVIGATION_FAST',?,'context','stable','completed',?)`).bind(
          `model-${suffix}`,runId,`turn-${suffix}`,JSON.stringify({deployment:"api"}),"2026-01-01T00:00:00.000Z").run();
      await db.prepare(`INSERT INTO agent_tool_calls
        (id,run_id,turn_id,model_call_id,plan_index,tool,arguments_json,state,created_at,generation)
        VALUES (?,?,?,?,0,'browser.extract@1','{}','succeeded',?,1)`).bind(
          `tool-${suffix}`,runId,`turn-${suffix}`,`model-${suffix}`,"2026-01-01T00:00:00.000Z").run();
      await db.prepare("INSERT INTO agent_observations (id,run_id,turn_id,tool_call_id,envelope_json,retrieved_at) VALUES (?,?,?,?,?,?)").bind(
        `observation-${suffix}`,runId,`turn-${suffix}`,`tool-${suffix}`,JSON.stringify({raw:{ref:`artifact-${suffix}`},finalUrl:"https://fixture.test/article"}),
        "2026-01-01T00:00:00.000Z").run();
    }
    const legacyContent={acceptanceId:"accepted",runId:first.run.runId,tenantId:"tenant",resourceId:"resource",candidateId:"candidate",
      acquisitionAttempt:"run-a",generation:1,turnId:"turn-a",modelCallId:"model-a",toolCallId:"tool-a",observationId:"observation-a",
      rawArtifactRef:"artifact-a",canonicalUrl:"https://fixture.test/article",finalUrl:"https://fixture.test/article",publisherTimestamp:"2026-01-01",
      title:"article",excerpt:"excerpt",body:"body",contentHash:"hash",acceptedAt:"2026-01-01T00:00:00.000Z"};
    await db.prepare(`INSERT INTO acquired_content
      (acceptance_id,run_id,tenant_id,resource_id,candidate_id,acquisition_attempt,generation,canonical_url,content_hash,observation_id,content_json,accepted_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).bind("accepted",first.run.runId,"tenant","resource","candidate","run-a",1,
      "https://fixture.test/article","hash","observation-a",JSON.stringify(legacyContent),"2026-01-01T00:00:00.000Z").run();
    await db.prepare("INSERT INTO agent_run_acquired_content (run_id,acceptance_id,observation_id,linked_at) VALUES (?,?,?,?)")
      .bind(first.run.runId,"accepted","observation-a","2026-01-01T00:00:00.000Z").run();
    await db.prepare("INSERT INTO agent_run_acquired_content (run_id,acceptance_id,observation_id,linked_at) VALUES (?,?,?,?)")
      .bind(second.run.runId,"accepted","observation-b","2026-01-02T00:00:00.000Z").run();

    await applyMigration(db,"0012_agent_runtime_security_and_provenance.sql");
    const migrated=new D1AgentRuntimeStore(db);const secondContent=(await migrated.getAcceptedContent(second.run.runId))[0];
    expect(secondContent).toMatchObject({runId:second.run.runId,acquisitionAttempt:"run-b",turnId:"turn-b",modelCallId:"model-b",
      toolCallId:"tool-b",observationId:"observation-b",rawArtifactRef:"artifact-b",acceptedAt:"2026-01-02T00:00:00.000Z"});
  });

  it("migrates existing model attempts with explicit confirmation and timing provenance",async()=>{
    mf=new Miniflare({modules:true,script:"export default {fetch(){return new Response('ok')}}",d1Databases:["DB"]});
    const db=await mf.getD1Database("DB");
    await applyMigration(db,"0011_agent_runtime.sql");
    await applyMigration(db,"0012_agent_runtime_security_and_provenance.sql");
    await db.prepare(`INSERT INTO agent_runs
      (run_id,tenant_id,resource_id,idempotency_key,candidate_id,candidate_url,publisher_id,acquisition_attempt,objective,mode,state,generation,policy_snapshot_id,completion_contract_version,created_at,updated_at)
      VALUES ('run-model','tenant','resource','model-key','candidate','https://fixture.test/article','fixture','attempt','Acquire','known_candidate','completed',1,'policy','contract','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')`).run();
    await db.prepare(`INSERT INTO agent_turns (id,run_id,sequence,state,created_at,generation)
      VALUES ('turn-model','run-model',1,'completed','2026-01-01T00:00:01Z',1)`).run();
    await db.prepare(`INSERT INTO agent_model_calls
      (id,run_id,turn_id,generation,role,route_json,context_manifest_hash,stable_instructions_hash,state,created_at)
      VALUES ('call-model','run-model','turn-model',1,'NAVIGATION_FAST','{}','context','stable','completed','2026-01-01T00:00:02Z')`).run();
    await db.prepare(`INSERT INTO agent_model_call_attempts
      (id,model_call_id,requested_provider,actual_provider,requested_model,actual_model,requested_deployment,actual_deployment,attempt,requested_gateway,actual_gateway,state,input_tokens,output_tokens,cost_usd,latency_ms)
      VALUES ('attempt-model','call-model','fixture','fixture','fixture/model','fixture/model','api','api',1,'openrouter','openrouter','completed',10,2,0.01,50)`).run();

    await applyMigration(db,"0016_model_attempt_timeout_provenance.sql");

    const attempt=await db.prepare(`SELECT started_at,completed_at,usage_confirmed,failure_class,
      reserved_input_tokens,reserved_output_tokens,reserved_cost_usd FROM agent_model_call_attempts WHERE id='attempt-model'`)
      .first<Record<string,string|number|null>>();
    expect(attempt).toEqual({started_at:"2026-01-01T00:00:02Z",completed_at:null,usage_confirmed:1,failure_class:null,
      reserved_input_tokens:0,reserved_output_tokens:0,reserved_cost_usd:0});
  });

  async function setup() {
    mf=new Miniflare({modules:true,script:"export default {fetch(){return new Response('ok')}}",d1Databases:["DB"]});
    const db=await mf.getD1Database("DB");
    for (const migration of ["0011_agent_runtime.sql","0012_agent_runtime_security_and_provenance.sql","0016_model_attempt_timeout_provenance.sql"]) {
      await applyMigration(db,migration);
    }
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

async function applyMigration(db:D1Database,migration:string) {
  const sql=await readFile(new URL(`../migrations/${migration}`,import.meta.url),"utf8");
  for (const statement of sql.split(/;\s*(?:\r?\n|$)/).map((value)=>value.trim()).filter(Boolean)) await db.prepare(statement).run();
}
