import { describe, expect, it, vi } from "vitest";
// Queue helpers are tested in Node; Container class executes only in workerd.
vi.mock("./cloudflare-container-browser",()=>({AuthenticatedBrowserContainer:class {}}));
import worker, { processWebOperatorRunMessage, shouldQuarantineQueueFailure } from "./index";
import type { Env } from "./types";

describe("queue retry classification", () => {
  it("quarantines permanent failures immediately and transient failures only after the retry ceiling", () => {
    expect(shouldQuarantineQueueFailure(new Error("Could not fetch RSS source: 404"), 1)).toBe(true);
    expect(shouldQuarantineQueueFailure(new Error("APIFY_API_TOKEN is not configured."), 1)).toBe(true);
    expect(shouldQuarantineQueueFailure(new Error("Could not fetch RSS source: 500"), 1)).toBe(false);
    expect(shouldQuarantineQueueFailure(new Error("Could not fetch RSS source: 500"), 5)).toBe(true);
  });
});

describe("Web Operator queue dispatch", () => {
  it("invokes the authenticated runtime handler in-process without recursive network fetch", async () => {
    const requests: Request[] = [];
    const handler = async (request: Request) => {
      requests.push(request);
      return Response.json({ status: "completed" });
    };
    const env = {
      WEB_OPERATOR_RUNTIME_URL: "https://lownoise-news.distilled-news-dev.workers.dev",
      WEB_OPERATOR_RUNTIME_TOKEN: "worker-held-secret"
    } as Env;

    await processWebOperatorRunMessage(env, {
      type: "web_operator_run",
      runId: "agent_run_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    }, handler);

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://lownoise-news.distilled-news-dev.workers.dev/v1/agent-runs/process");
    expect(requests[0].headers.get("authorization")).toBe("Bearer worker-held-secret");
    expect(await requests[0].json()).toEqual({
      type: "web_operator_run",
      runId: "agent_run_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    });
  });
});

it('legacy queued manual work is retired without collection or a continuation',async()=>{
 const {createIntakeDatabase}=await import('./v1-intake/test-utils');
 const ctx=await createIntakeDatabase(),send=vi.fn(),ack=vi.fn();
 try{
  const env={DB:ctx.db,PROCESSING_QUEUE:{send}} as unknown as Env;
  await worker.queue({messages:[{id:'old-manual',attempts:1,body:{type:'v1_manual_briefing',feedId:'missing',requestId:'historic'},ack,retry:vi.fn()}]} as any,env);
  expect(ack).toHaveBeenCalledTimes(1);expect(send).not.toHaveBeenCalled();
 }finally{await ctx.dispose()}
});
it('acknowledging a rejected V1 delivery preserves its durable reason',async()=>{
 const logs=vi.spyOn(console,'info').mockImplementation(()=>{});
 const {createIntakeDatabase}=await import('./v1-intake/test-utils');const ctx=await createIntakeDatabase(),ack=vi.fn();
 try{
  await worker.queue({messages:[{id:'rejected',attempts:1,body:{type:'v1_briefing',feedId:'missing',window:{start:'2026-10-03T00:00:00Z',end:'2026-10-03T01:00:00Z',kind:'HOURLY'}},ack,retry:vi.fn()}]} as any,{DB:ctx.db,V1_DOWNSTREAM_ENABLED:'true'} as Env);
  expect(ack).toHaveBeenCalledTimes(1);
  expect((await ctx.db.prepare('SELECT outcome,reason FROM v1_queue_outcomes').all()).results).toEqual([{outcome:'DELIVERY_REJECTED',reason:'SCOPE_DENIED'}]);
  const {windowIdentity}=await import('./v1-intelligence/runtime');
  const expected=await windowIdentity('missing',{start:'2026-10-03T00:00:00Z',end:'2026-10-03T01:00:00Z',kind:'HOURLY'});
  expect(logs.mock.calls.map(([raw])=>{try{return JSON.parse(raw)}catch{return null}}).find(r=>r?.type==='V1_QUEUE_LATENCY')).toMatchObject({workType:'v1_briefing',workId:expected,outcome:'SCOPE_DENIED'});
 }finally{logs.mockRestore();await ctx.dispose()}
});
