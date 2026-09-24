import { Miniflare } from "miniflare";
import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import { InMemoryRepository } from "./repository";
import type { Env } from "./types";

const source = "https://news.example.com/";
const feed = "https://news.example.com/feed.xml";
const request = { sourceUrl: source, ownerAccountId: "account_1", startTime: "2026-09-20T00:00:00Z", endTime: "2026-09-22T00:00:00Z", idempotencyKey: "bounded-source-run-1" };

describe("generic live source route", () => {
  it("requires runtime authority, resolves durable resource, runs real native stage, and reloads state", async () => {
    const mf = new Miniflare({ modules: true, script: "export default {fetch(){return new Response('ok')}}", d1Databases: ["DB"] });
    try {
      const db = await mf.getD1Database("DB");
      await db.exec("CREATE TABLE upstream_resources(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,canonical_source_url TEXT NOT NULL,resource_locator TEXT,source_family TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(tenant_id,canonical_source_url,resource_locator));");
      await db.exec("CREATE TABLE source_acquisition_state(scope_key TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,resource_id TEXT NOT NULL,last_successful_boundary TEXT,unresolved_start TEXT,unresolved_end TEXT,state_version INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL,UNIQUE(tenant_id,resource_id));");
      const repo = new InMemoryRepository();
      await repo.createAccount({ email: "owner@example.com", username: "owner", role: "admin", passwordHash: "not-a-real-password" });
      const fetcher = (async (url: string) => {
        if (url === source) return new Response(`<link rel="alternate" type="application/rss+xml" href="${feed}">`, { headers: { "content-type": "text/html" } });
        if (url === feed) return new Response(`<rss><channel><item><title>A</title><description>Full A</description><link>https://news.example.com/a</link><pubDate>2026-09-21T00:00:00Z</pubDate></item><item><title>Old</title><description>Full old</description><link>https://news.example.com/old</link><pubDate>2026-09-19T00:00:00Z</pubDate></item></channel></rss>`, { headers: { "content-type": "application/rss+xml" } });
        throw new Error("unexpected fetch");
      }) as typeof fetch;
      const env = { DB: db, DISTILLED_LIVE_PUBLIC_ACQUISITION_SMOKE: "true", WEB_OPERATOR_RUNTIME_TOKEN: "runtime-secret" } as Env;
      const body = JSON.stringify(request);
      const firstApp = createApp({ repository: repo, fetcher, now: () => new Date("2026-09-23T00:00:00Z") });
      const denied = await firstApp.request("/v1/live-smoke/public-acquisition", { method: "POST", headers: { "content-type": "application/json" }, body }, env);
      expect(denied.status).toBe(401);
      expect(await db.prepare("SELECT COUNT(*) AS count FROM upstream_resources").first()).toEqual({ count: 0 });
      const headers = { authorization: "Bearer runtime-secret", "content-type": "application/json" };
      const first = await firstApp.request("/v1/live-smoke/public-acquisition", { method: "POST", headers, body }, env);
      expect(first.status).toBe(200);
      const result = await first.json() as Record<string, any>;
      expect(result.stages).toEqual([{ stage: "STRUCTURED", status: "SUCCESS" }]);
      expect(result.webOperatorCalls).toBe(0);
      expect(result.coverage.rangeCovered).toBe(true);
      expect(result.items).toHaveLength(1);
      expect(result.committedHighWater.lastSuccessfulBoundary).toBe("2026-09-22T00:00:00.000Z");
      const freshApp = createApp({ repository: repo, fetcher, now: () => new Date("2026-09-23T00:00:00Z") });
      const replay = await freshApp.request("/v1/live-smoke/public-acquisition", { method: "POST", headers, body: JSON.stringify({ ...request, idempotencyKey: "bounded-source-run-2" }) }, env);
      const repeated = await replay.json() as Record<string, any>;
      expect(repeated.upstreamResourceId).toBe(result.upstreamResourceId);
      expect(repeated.items).toEqual(result.items);
      expect(repeated.committedHighWater).toEqual(result.committedHighWater);
    } finally { await mf.dispose(); }
  });
});
