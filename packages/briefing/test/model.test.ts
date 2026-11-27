import { describe, expect, it } from "vitest";
import { anthropicModel, callJson, extractJson, openAiCompatibleModel, UsageMeter } from "../src/model";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const noSleep = async () => {};

describe("extractJson", () => {
  it("accepts fences and surrounding chatter", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Here you go: {"a":{"b":2}} hope that helps')).toEqual({ a: { b: 2 } });
    expect(() => extractJson("no json")).toThrow();
  });
});

describe("openAiCompatibleModel", () => {
  it('forwards an opt-in strict schema while ordinary callers keep their JSON-object contract',async()=>{
    const seen:any[]=[];const port=openAiCompatibleModel({url:'https://x',apiKey:'k',fetcher:async(_url,init)=>{seen.push(JSON.parse(String(init?.body)));return json({choices:[{message:{content:'{}'}}],usage:{prompt_tokens:1,completion_tokens:1,cost:0}})}});
    const schema={type:'object',properties:{},required:[],additionalProperties:false};
    await port.complete({model:'m',system:'s',user:'u',maxTokens:10,responseSchema:schema});
    await port.complete({model:'m',system:'s',user:'u',maxTokens:10});
    expect(seen[0].response_format).toEqual({type:'json_schema',json_schema:{name:'source_bindings',strict:true,schema}});
    expect(seen[1].response_format).toEqual({type:'json_object'});
  });
  it("retries 429 and 5xx, then returns text, tokens and the provider-reported cost", async () => {
    const replies = [json({}, 429), json({}, 503), json({ choices: [{ message: { content: "{}" }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 4, cost: 0.0123 } })];
    let calls = 0;
    const port = openAiCompatibleModel({ url: "https://x", apiKey: "k", sleep: noSleep, fetcher: async () => replies[calls++] });
    const res = await port.complete({ model: "m", system: "s", user: "u", maxTokens: 10 });
    expect(calls).toBe(3);
    expect(res).toMatchObject({ text: "{}", inputTokens: 10, outputTokens: 4, costUsd: 0.0123 });
  });

  it("never auto-retries an outcome that may have been billed: other 5xx, timeouts and dropped connections are uncertain", async () => {
    for (const fetcher of [async () => json({}, 500), async () => { throw new Error("socket hang up"); }]) {
      let calls = 0;
      const port = openAiCompatibleModel({ url: "https://x", apiKey: "k", sleep: noSleep, fetcher: async (...a) => (calls++, (fetcher as never as typeof fetch)(...a)) });
      const error = await port.complete({ model: "m", system: "", user: "", maxTokens: 1 }).catch((e) => e);
      expect(calls).toBe(1);
      expect(error).toMatchObject({ name: "BriefingModelError", uncertain: true });
    }
    const refused = await openAiCompatibleModel({ url: "https://x", apiKey: "k", retries: 0, sleep: noSleep, fetcher: async () => json({}, 429) }).complete({ model: "m", system: "", user: "", maxTokens: 1 }).catch((e) => e);
    expect(refused).toMatchObject({ retryable: true, uncertain: false });
  });

  it("does not retry a 4xx and prices known models from the table when no cost is reported", async () => {
    let calls = 0;
    const bad = openAiCompatibleModel({ url: "https://x", apiKey: "k", sleep: noSleep, fetcher: async () => (calls++, json({ error: "bad" }, 400)) });
    await expect(bad.complete({ model: "m", system: "", user: "", maxTokens: 1 })).rejects.toThrow(/400/);
    expect(calls).toBe(1);

    const ok = openAiCompatibleModel({
      url: "https://x", apiKey: "k", sleep: noSleep,
      fetcher: async () => json({ choices: [{ message: { content: "{}" } }], usage: { prompt_tokens: 1_000_000, completion_tokens: 0 } })
    });
    expect((await ok.complete({ model: "openai/gpt-4.1-mini", system: "", user: "", maxTokens: 1 })).costUsd).toBeCloseTo(0.4);
    expect((await ok.complete({ model: "unknown/model", system: "", user: "", maxTokens: 1 })).costUsd).toBeUndefined();
  });
});

describe("anthropicModel", () => {
  it("sends the Messages API shape and maps max_tokens to a truncation signal", async () => {
    let sent: { headers: Record<string, string>; body: { system: string } } | undefined;
    const port = anthropicModel({
      apiKey: "k", sleep: noSleep,
      fetcher: async (_url, init) => {
        sent = { headers: init!.headers as Record<string, string>, body: JSON.parse(init!.body as string) };
        return json({ content: [{ type: "text", text: "{}" }], stop_reason: "max_tokens", usage: { input_tokens: 5, output_tokens: 6 } });
      }
    });
    const res = await port.complete({ model: "claude-sonnet-5-5", system: "sys", user: "u", maxTokens: 9 });
    expect(sent?.headers["x-api-key"]).toBe("k");
    expect(sent?.body.system).toBe("sys");
    expect(res.finishReason).toBe("length");
  });
});

describe("callJson", () => {
  it("retries a truncated reply once, asking for a shorter one", async () => {
    const replies = [{ text: '{"items":[', inputTokens: 1, outputTokens: 1, finishReason: "length" }, { text: '{"ok":true}', inputTokens: 1, outputTokens: 1 }];
    const users: string[] = [];
    const meter = new UsageMeter();
    const out = await callJson({ complete: async (r) => (users.push(r.user), replies.shift()!) }, meter, { model: "m", system: "", user: "u", maxTokens: 1 }, (raw) => raw as { ok: boolean });
    expect(out.ok).toBe(true);
    expect(users[1]).toContain("cut off");
    expect(meter.usage.calls).toBe(2);
  });
});

it('uses a single alternate only after two received invalid responses, with the failed validation as feedback', async () => {
  const users: string[] = [];
  const reply = (text: string) => ({text, inputTokens: 1, outputTokens: 1});
  const meter = new UsageMeter();
  const parse = (v: unknown) => {
    if (v !== true) throw Error('missing evidence for F1');
    return v;
  };
  const result = await callJson({
    complete: async r => { users.push(r.user); return reply('{"valid":false}'); },
    recoverInvalid: async r => { users.push(r.user); return reply('{"valid":true}'); },
  }, meter, {model:'primary', system:'', user:'item A', maxTokens:100}, raw => parse((raw as {valid:boolean}).valid));
  expect(result).toBe(true);
  expect(meter.usage.calls).toBe(3);
  expect(users[0]).toBe('item A');
  expect(users.slice(1).every(user => user.includes('missing evidence for F1'))).toBe(true);
});

it('propagates a transport failure without dispatching an alternate model', async () => {
  let switched = false;
  await expect(callJson({
    complete: async () => { throw Error('transport'); },
    recoverInvalid: async () => { switched=true; throw Error('unexpected alternate'); },
  }, new UsageMeter(), {model:'primary',system:'',user:'item',maxTokens:100}, x=>x)).rejects.toThrow('transport');
  expect(switched).toBe(false);
});

it('uses the exact same schema and validator once on the alternate after a schema-capacity rejection', async () => {
  const primary = openAiCompatibleModel({
    url: 'https://x', apiKey: 'k',
    fetcher: async () => json({error: 'The specified schema produces a constraint that has too many states for serving.'}, 400),
  });
  const request = {model:'primary', system:'verify', user:'item', maxTokens:100, responseSchema:{type:'object'}};
  let alternates = 0;
  await expect(callJson({
    complete: primary.complete,
    recoverInvalid: async retried => {
      alternates++;
      expect(retried).toEqual(request);
      return {text:'{}',inputTokens:1,outputTokens:1};
    },
  }, new UsageMeter(), request, () => { throw Error('missing evidence'); })).rejects.toThrow('missing evidence');
  expect(alternates).toBe(1);
});
