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
  it("retries 429 and 5xx, then returns text, tokens and the provider-reported cost", async () => {
    const replies = [json({}, 429), json({}, 503), json({ choices: [{ message: { content: "{}" }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 4, cost: 0.0123 } })];
    let calls = 0;
    const port = openAiCompatibleModel({ url: "https://x", apiKey: "k", sleep: noSleep, fetcher: async () => replies[calls++] });
    const res = await port.complete({ model: "m", system: "s", user: "u", maxTokens: 10 });
    expect(calls).toBe(3);
    expect(res).toMatchObject({ text: "{}", inputTokens: 10, outputTokens: 4, costUsd: 0.0123 });
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
