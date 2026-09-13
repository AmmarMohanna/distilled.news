import { describe, expect, it } from "vitest";
import { createWorkerWebOperatorRuntimeHandler, workerCloudflareBrowser } from "./web-operator-runtime";
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
});
