import { afterAll,afterEach,beforeAll,describe,expect,it } from "vitest";
import { readFile } from "node:fs/promises";
import { Miniflare } from "miniflare";
import {
  InjectedCrashError,
  PlaywrightBrowserAdapter,
  ScriptedModelGateway,
  TOOL_NAMES,
  WebOperatorAcquisitionStrategy,
  WebOperatorCoordinator,
  sha256Bytes,
  type ArtifactStore,
  type BoundedActionPlan,
  type FaultPoint,
  type KnownCandidateInvocation,
  type ModelCapability,
  type TestOnlyFaultInjector,
  type ToolName
} from "@distilled/agent-runtime";
import { startHostileFixture,type HostileFixture } from "../../../packages/agent-runtime/test/hostile-fixture";
import { D1AgentRuntimeStore } from "./agent-runtime-store";

const capabilities:ModelCapability[]=[{
  modelRef:"fixture/fast",provider:"fixture",toolCalling:true,vision:false,structuredOutput:true,reasoningClass:"fast",enabled:true,
  inputCostPerMillion:0,outputCostPerMillion:0,deployment:"api",externallyHosted:true,privacyEligibility:["public"],retentionClass:"zero_data_retention"
}];

const crashCases:Array<{point:FaultPoint;first:(origin:string)=>BoundedActionPlan;recovery:(origin:string)=>BoundedActionPlan[];expected:"completed"|"failed"|"already_completed"}>=[
  ...(["after_tool_creation","after_policy_decision","after_budget_reserve","after_tool_intent_insert","after_intent_state_transition","after_intent_before_dispatch","after_terminal_tool_state","after_tool_result_before_checkpoint"] satisfies FaultPoint[]).map((point)=>({
    point,expected:"completed" as const,
    first:(origin:string)=>plan(action("browser.navigate@1",{url:`${origin}/article`},{urlIncludes:"/article"})),
    recovery:(origin:string)=>[completeArticle(origin)]
  })),
  {
    point:"after_dispatch_marker",expected:"failed",
    first:(origin)=>plan(action("browser.navigate@1",{url:`${origin}/article`},{urlIncludes:"/article"})),recovery:()=>[]
  },
  {
    point:"after_effect_before_result",expected:"failed",
    first:(origin)=>plan(action("browser.navigate@1",{url:`${origin}/article`},{urlIncludes:"/article"})),recovery:()=>[]
  },
  {
    point:"after_content_acceptance_before_state",expected:"completed",
    first:(origin)=>plan(action("browser.navigate@1",{url:`${origin}/article`},{urlIncludes:"/article"}),action("browser.extract@1",{})),
    recovery:()=>[plan(action("run.propose_completion@1",{citedObservationIds:["$latestObservation"]}))]
  },
  {
    point:"after_completion_before_ack",expected:"already_completed",
    first:completeArticle,recovery:()=>[]
  }
];

describe.sequential("durable D1/R2 crash recovery",()=>{
  let fixture:HostileFixture;
  let mf:Miniflare|undefined;
  beforeAll(async()=>{fixture=await startHostileFixture();});
  afterEach(async()=>{await mf?.dispose();mf=undefined;});
  afterAll(async()=>{await fixture.close();});

  for (const testCase of crashCases) {
    it(`recovers ${testCase.point} after replacing every process-local runtime object`,async()=>{
      mf=new Miniflare({modules:true,script:"export default {fetch(){return new Response('ok')}}",d1Databases:["DB"],r2Buckets:["ARTIFACTS"]});
      const db=await mf.getD1Database("DB");
      const bucket=await mf.getR2Bucket("ARTIFACTS");
      await applyAgentRuntimeMigrations(db);

      const firstStore=new D1AgentRuntimeStore(db);
      const firstArtifacts=new R2ArtifactStore(bucket);
      const firstBrowser=PlaywrightBrowserAdapter.forTest();
      const firstStrategy=new WebOperatorAcquisitionStrategy(firstStore);
      const firstCoordinator=new WebOperatorCoordinator({
        store:firstStore,artifacts:firstArtifacts,browserExecutor:firstBrowser,structured:firstBrowser,visual:firstBrowser,
        modelGateway:new ScriptedModelGateway([testCase.first(fixture.origin)]),strategy:firstStrategy,faultInjector:new OnceFault(testCase.point)
      });
      const admitted=await firstStrategy.admitKnownCandidate(invocation(fixture.origin,testCase.point));
      await expect(firstCoordinator.process(admitted.run.runId,"crash-worker")).rejects.toBeInstanceOf(InjectedCrashError);

      const recoveryStore=new D1AgentRuntimeStore(db);
      const recoveryArtifacts=new R2ArtifactStore(bucket);
      const recoveryBrowser=PlaywrightBrowserAdapter.forTest();
      const recoveryStrategy=new WebOperatorAcquisitionStrategy(recoveryStore);
      const recoveryCoordinator=new WebOperatorCoordinator({
        store:recoveryStore,artifacts:recoveryArtifacts,browserExecutor:recoveryBrowser,structured:recoveryBrowser,visual:recoveryBrowser,
        modelGateway:new ScriptedModelGateway(testCase.recovery(fixture.origin)),strategy:recoveryStrategy
      });
      const outcome=await recoveryCoordinator.process(admitted.run.runId,"recovery-worker",new Date(Date.now()+20_000));
      expect(outcome.status).toBe(testCase.expected);

      if (testCase.expected==="failed") {
        expect((await recoveryStore.listEvents(admitted.run.runId)).some((event)=>event.type==="agent.tool.effect_unknown")).toBe(true);
      } else {
        expect(outcome.acquiredContent).toHaveLength(1);
        expect(await recoveryStore.listUnsettledToolCalls(admitted.run.runId)).toEqual([]);
        expect((await recoveryStore.getOutbox(admitted.run.runId))?.state).toBe("acknowledged");
        expect((await bucket.list()).objects.length).toBeGreaterThan(0);
      }
    },45_000);
  }

  it("recovers run B from its own provenance after run A accepted identical canonical content",async()=>{
    mf=new Miniflare({modules:true,script:"export default {fetch(){return new Response('ok')}}",d1Databases:["DB"],r2Buckets:["ARTIFACTS"]});
    const db=await mf.getD1Database("DB");
    const bucket=await mf.getR2Bucket("ARTIFACTS");
    await applyAgentRuntimeMigrations(db);
    const sharedInvocation=(suffix:string)=>{
      const value=invocation(fixture.origin,suffix);
      value.tenantId="shared-tenant";value.resourceId="shared-resource";
      value.candidate={candidateId:"shared-candidate",canonicalUrl:`${fixture.origin}/article`,publisherId:"fixture",acquisitionAttempt:suffix};
      return value;
    };

    const storeA=new D1AgentRuntimeStore(db);const artifactsA=new R2ArtifactStore(bucket);const browserA=PlaywrightBrowserAdapter.forTest();
    const strategyA=new WebOperatorAcquisitionStrategy(storeA);
    const runA=await strategyA.admitKnownCandidate(sharedInvocation("run-a"));
    const resultA=await new WebOperatorCoordinator({store:storeA,artifacts:artifactsA,browserExecutor:browserA,structured:browserA,visual:browserA,
      modelGateway:new ScriptedModelGateway([completeArticle(fixture.origin)]),strategy:strategyA}).process(runA.run.runId,"worker-a");
    expect(resultA.status).toBe("completed");

    const storeB=new D1AgentRuntimeStore(db);const artifactsB=new R2ArtifactStore(bucket);const browserB=PlaywrightBrowserAdapter.forTest();
    const strategyB=new WebOperatorAcquisitionStrategy(storeB);
    const runB=await strategyB.admitKnownCandidate(sharedInvocation("run-b"));
    const crashingB=new WebOperatorCoordinator({store:storeB,artifacts:artifactsB,browserExecutor:browserB,structured:browserB,visual:browserB,
      modelGateway:new ScriptedModelGateway([plan(action("browser.navigate@1",{url:`${fixture.origin}/article`} ,{urlIncludes:"/article"}),action("browser.extract@1",{}))]),
      strategy:strategyB,faultInjector:new OnceFault("after_content_acceptance_before_state")});
    await expect(crashingB.process(runB.run.runId,"worker-b")).rejects.toBeInstanceOf(InjectedCrashError);

    const recoveryStore=new D1AgentRuntimeStore(db);const recoveryArtifacts=new R2ArtifactStore(bucket);const recoveryBrowser=PlaywrightBrowserAdapter.forTest();
    const recoveryStrategy=new WebOperatorAcquisitionStrategy(recoveryStore);
    const recovered=await new WebOperatorCoordinator({store:recoveryStore,artifacts:recoveryArtifacts,browserExecutor:recoveryBrowser,
      structured:recoveryBrowser,visual:recoveryBrowser,modelGateway:new ScriptedModelGateway([
        plan(action("run.propose_completion@1",{citedObservationIds:["$latestObservation"]}))
      ]),strategy:recoveryStrategy}).process(runB.run.runId,"worker-b-recovery",new Date(Date.now()+20_000));
    expect(recovered.status).toBe("completed");
    expect(recovered.acquiredContent[0].acceptanceId).toBe(resultA.acquiredContent[0].acceptanceId);
    expect(recovered.acquiredContent[0]).toMatchObject({runId:runB.run.runId,acquisitionAttempt:"run-b"});
    expect(recovered.acquiredContent[0].toolCallId).not.toBe(resultA.acquiredContent[0].toolCallId);
    const modelAttempt=await db.prepare(`SELECT requested_model,actual_model,requested_provider,actual_provider,
      requested_deployment,actual_deployment,requested_gateway,actual_gateway FROM agent_model_call_attempts
      WHERE model_call_id IN (SELECT id FROM agent_model_calls WHERE run_id=?) ORDER BY attempt LIMIT 1`).bind(runB.run.runId).first<Record<string,string>>();
    expect(modelAttempt).toMatchObject({requested_model:"fixture/fast",actual_model:"fixture/fast",requested_provider:"fixture",
      actual_provider:"scripted",requested_deployment:"api",actual_deployment:"api",requested_gateway:"openrouter",actual_gateway:"scripted"});
  },60_000);
});

async function applyAgentRuntimeMigrations(db:D1Database) {
  for (const migration of ["0011_agent_runtime.sql","0012_agent_runtime_security_and_provenance.sql"]) {
    const sql=await readFile(new URL(`../migrations/${migration}`,import.meta.url),"utf8");
    for (const statement of sql.split(/;\s*(?:\r?\n|$)/).map((value)=>value.trim()).filter(Boolean)) await db.prepare(statement).run();
  }
}

class R2ArtifactStore implements ArtifactStore {
  constructor(private readonly bucket:Awaited<ReturnType<Miniflare["getR2Bucket"]>>) {}
  async put(key:string,bytes:Uint8Array,contentType:string) {
    const copy=bytes.slice();
    await this.bucket.put(key,copy,{httpMetadata:{contentType}});
    return {ref:key,hash:await sha256Bytes(copy),size:copy.byteLength};
  }
  async get(ref:string) {
    const object=await this.bucket.get(ref);
    return object ? new Uint8Array(await object.arrayBuffer()) : null;
  }
}

class OnceFault implements TestOnlyFaultInjector {
  readonly testOnly=true;
  private fired=false;
  constructor(private readonly point:FaultPoint) {}
  hit(point:FaultPoint) {
    if (!this.fired && point===this.point) { this.fired=true; throw new InjectedCrashError(point); }
  }
}

function invocation(origin:string,suffix:string):KnownCandidateInvocation {
  return {
    tenantId:`tenant-${suffix}`,resourceId:`resource-${suffix}`,idempotencyKey:`key-${suffix}`,objective:"Acquire the known candidate article.",enabled:true,
    candidate:{candidateId:`candidate-${suffix}`,canonicalUrl:`${origin}/article`,publisherId:"fixture",acquisitionAttempt:`attempt-${suffix}`},
    policy:{id:`policy-${suffix}`,allowedOrigins:[origin],allowLoopback:true,allowedTools:[...TOOL_NAMES],visualReadPurposes:[],
      modelPolicy:{allowedProviders:["fixture"],allowedDeployments:["api"],requiredPrivacyEligibility:["public"],allowedRetentionClasses:["zero_data_retention"]}},
    modelRouting:{mode:"api",apiGateway:"openrouter",selfHostedGateway:"openai_compatible",roles:{NAVIGATION_FAST:{primary:{deployment:"api",model:"fixture/fast"},fallbacks:[]}}},
    modelCapabilities:capabilities
  };
}

function completeArticle(origin:string) {
  return plan(
    action("browser.navigate@1",{url:`${origin}/article`},{urlIncludes:"/article"}),
    action("browser.extract@1",{}),
    action("run.propose_completion@1",{citedObservationIds:["$latestObservation"]})
  );
}
function plan(...actions:BoundedActionPlan["actions"]):BoundedActionPlan { return {version:1,actions}; }
function action(tool:ToolName,arguments_:unknown,expected?:BoundedActionPlan["actions"][number]["expected"]) { return {tool,arguments:arguments_,expected}; }
