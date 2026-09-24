import { describe, expect, it } from "vitest";
import { WorkerPublicSourceFetch } from "./public-source-fetch";

describe("public source HTTP admission", () => {
  it("fetches bounded same-origin HTML without following redirects", async () => {
    const called: string[] = [];
    const fetcher = (async (url: string, init: RequestInit) => {
      called.push(url);
      expect(init.redirect).toBe("manual");
      return new Response("<html>News</html>", { headers: { "content-type": "text/html" } });
    }) as typeof fetch;
    const port = new WorkerPublicSourceFetch("https://news.example.com/section", fetcher);
    const result = await port.get("https://news.example.com/article/a");
    expect(result.body).toBe("<html>News</html>");
    await expect(port.get("https://foreign.example.com/article/a")).rejects.toThrow("public source policy denied");
    expect(called).toHaveLength(1);
  });

  it("rejects private, non-HTTPS, redirect, and oversized responses", async () => {
    expect(() => new WorkerPublicSourceFetch("https://127.0.0.1/")).toThrow();
    expect(() => new WorkerPublicSourceFetch("https://metadata.internal/")).toThrow();
    expect(() => new WorkerPublicSourceFetch("http://news.example.com/")).toThrow();
    const redirect = new WorkerPublicSourceFetch("https://news.example.com/", (async () => new Response(null, { status: 302, headers: { location: "https://foreign.example.com/" } })) as typeof fetch);
    await expect(redirect.get("https://news.example.com/")).rejects.toThrow("public source policy denied");
    const oversized = new WorkerPublicSourceFetch("https://news.example.com/", (async () => new Response("x".repeat(512_001))) as typeof fetch);
    await expect(oversized.get("https://news.example.com/")).rejects.toMatchObject({ category: "BODY_BUDGET_EXCEEDED" });
    const rejected = new WorkerPublicSourceFetch("https://news.example.com/", (async () => { throw new TypeError("unsafe provider details must not escape"); }) as typeof fetch);
    await expect(rejected.get("https://news.example.com/")).rejects.toMatchObject({ category: "FETCH_REJECTED", message: "FETCH_REJECTED" });
    const policy = new WorkerPublicSourceFetch("https://news.example.com/", (async () => { throw new TypeError("1024 private platform policy details"); }) as typeof fetch);
    await expect(policy.get("https://news.example.com/")).rejects.toThrow("public source policy denied");
  });
});
