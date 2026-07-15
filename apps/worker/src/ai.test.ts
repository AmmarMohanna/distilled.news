import { describe, expect, it, vi } from "vitest";
import { personalNewsBriefing } from "@distilled/core";
import { OpenAIGatewaySummaryAdapter } from "./ai";

describe("OpenAIGatewaySummaryAdapter edition synthesis", () => {
  it("requests structured JSON and records edition usage", async () => {
    const usageRecorder = vi.fn(async () => undefined);
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body));
      expect(request.response_format).toEqual({ type: "json_object" });
      expect(request.messages[1].content).toContain("Return JSON only");
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({
          overview: [{ text: "The road reopened after the inspection.", sectionIndexes: [1] }],
          topSectionIndexes: [1],
          sections: [
            { sectionIndexes: [1], title: "Road reopens", summary: "The road reopened after the inspection." },
            { sectionIndexes: [2], title: "Rate unchanged", summary: "The central bank kept the policy rate unchanged." }
          ]
        }) } }],
        usage: { prompt_tokens: 500, completion_tokens: 120 }
      }), { status: 200, headers: { "content-type": "application/json" } });
    });
    const adapter = new OpenAIGatewaySummaryAdapter({
      accountId: "account", gatewayId: "gateway", apiKey: "key", model: "gpt-4.1-mini",
      usageRecorder, fetcher: fetcher as unknown as typeof fetch
    });

    const result = await adapter.synthesize({
      briefing: personalNewsBriefing,
      cadence: "hourly",
      sections: [
        { title: "Update", summary: "The road reopened after the inspection.", evidence: [] },
        { title: "Economy", summary: "The central bank kept the policy rate unchanged.", evidence: [] }
      ]
    });

    expect(result.topSectionIndexes).toEqual([1]);
    expect(usageRecorder).toHaveBeenCalledWith(expect.objectContaining({ purpose: "edition_summary", inputTokens: 500, outputTokens: 120 }));
  });

  it("fails closed on malformed model JSON", async () => {
    const adapter = new OpenAIGatewaySummaryAdapter({
      accountId: "account", gatewayId: "gateway", apiKey: "key", model: "gpt-4.1-mini",
      fetcher: (async () => new Response(JSON.stringify({ choices: [{ message: { content: "not-json" } }] }), { status: 200 })) as typeof fetch
    });
    await expect(adapter.synthesize({
      briefing: personalNewsBriefing,
      cadence: "hourly",
      sections: [
        { title: "One", summary: "The first update was confirmed.", evidence: [] },
        { title: "Two", summary: "The second update was confirmed.", evidence: [] }
      ]
    })).rejects.toBeInstanceOf(SyntaxError);
  });

  it("uses the faster fallback model when the primary edition request fails", async () => {
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body));
      if (request.model === "gpt-4.1-mini") throw new DOMException("aborted", "AbortError");
      expect(request.model).toBe("gpt-4.1-nano");
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
        overview: [{ text: "The road reopened after the inspection.", sectionIndexes: [1] }],
        topSectionIndexes: [1],
        sections: [
          { sectionIndexes: [1], title: "Road reopens", summary: "The road reopened after the inspection." },
          { sectionIndexes: [2], title: "Rate unchanged", summary: "The central bank kept the policy rate unchanged." }
        ]
      }) } }] }), { status: 200 });
    });
    const adapter = new OpenAIGatewaySummaryAdapter({
      accountId: "account", gatewayId: "gateway", apiKey: "key", model: "gpt-4.1-mini",
      editionFallbackModel: "gpt-4.1-nano", fetcher: fetcher as unknown as typeof fetch
    });
    const result = await adapter.synthesize({
      briefing: personalNewsBriefing,
      cadence: "hourly",
      sections: [
        { title: "One", summary: "The road reopened after the inspection.", evidence: [] },
        { title: "Two", summary: "The central bank kept the policy rate unchanged.", evidence: [] }
      ]
    });
    expect(result.topSectionIndexes).toEqual([1]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
