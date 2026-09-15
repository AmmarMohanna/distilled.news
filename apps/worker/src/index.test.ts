import { describe, expect, it } from "vitest";
import { processWebOperatorRunMessage, shouldQuarantineQueueFailure } from "./index";
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
