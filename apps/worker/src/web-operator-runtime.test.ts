import { describe, expect, it, vi } from "vitest";
import { createWorkerWebOperatorRuntimeHandler, workerCloudflareBrowser,workerRuntimeTiming } from "./web-operator-runtime";
import type { Env } from "./types";

describe("Worker Web Operator runtime composition", () => {
  it("preserves local browser backend selection without requiring a Browser Run binding", () => {
    expect(workerCloudflareBrowser({
      DISTILLED_BROWSER_BACKEND: "local",
      BROWSER: undefined as never
    })).toBeUndefined();
  });

  it("wires the Cloudflare Browser Run binding when the cloudflare backend is selected", () => {
    const binding = {
      fetch: async () => new Response(null, { status: 204 }),
      quickAction: async () => new Response(null, { status: 204 })
    };
    const cloudflare = workerCloudflareBrowser({
      DISTILLED_BROWSER_BACKEND: "cloudflare",
      BROWSER: binding as unknown as Env["BROWSER"]
    });
    expect(cloudflare?.binding).toBe(binding);
    expect(cloudflare?.launch).toBeInstanceOf(Function);
  });

  it("latches admitted domains into Browser Run session guardrails", async () => {
    const launch=vi.fn(async()=>({}));
    vi.doMock("@cloudflare/playwright",()=>({launch}));
    try {
      const binding={fetch:async()=>new Response(null,{status:204})};
      const cloudflare=workerCloudflareBrowser({
        DISTILLED_BROWSER_BACKEND:"cloudflare",
        BROWSER:binding as unknown as Env["BROWSER"]
      });
      await cloudflare!.launch(cloudflare!.binding,{allowedDomains:["publisher.example"]});
      expect(launch).toHaveBeenCalledWith(binding,{
        guardrails:{allowedDomains:["publisher.example"]}
      });
    } finally {
      vi.doUnmock("@cloudflare/playwright");
    }
  });

  it("fails explicitly instead of falling back to local when Cloudflare is selected without a binding", () => {
    expect(() => workerCloudflareBrowser({
      DISTILLED_BROWSER_BACKEND: "cloudflare",
      BROWSER: undefined as never
    })).toThrow(/BROWSER binding/);
  });

  it("requires an explicit runtime token before exposing the processing handler", () => {
    expect(() => createWorkerWebOperatorRuntimeHandler({
      DISTILLED_BROWSER_BACKEND: "local",
      WEB_OPERATOR_RUNTIME_TOKEN: " ",
      DB: undefined,
      RAW_ARCHIVE: undefined
    } as unknown as Env)).toThrow(/WEB_OPERATOR_RUNTIME_TOKEN/);
  });

  it("parses explicit model operation and settlement timing independently from the lease",()=>{
    expect(workerRuntimeTiming({DISTILLED_MODEL_CALL_TIMEOUT_MS:"45000",DISTILLED_RUN_SETTLEMENT_RESERVE_MS:"5000"}))
      .toEqual({modelCallTimeoutMs:45_000,runSettlementReserveMs:5_000});
    expect(()=>workerRuntimeTiming({DISTILLED_MODEL_CALL_TIMEOUT_MS:"999",DISTILLED_RUN_SETTLEMENT_RESERVE_MS:"5000"}))
      .toThrow(/DISTILLED_MODEL_CALL_TIMEOUT_MS/);
  });
});
