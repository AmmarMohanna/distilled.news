import { describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { D1UpstreamResourceStore } from "./upstream-resource-store";

describe("D1 upstream resource store", () => {
  it("resolves stable identities and isolates tenants", async () => {
    const mf = new Miniflare({ modules:true, script:"export default {fetch(){return new Response('ok')}}", d1Databases:["DB"] });
    try {
      const db = await mf.getD1Database("DB");
      await db.exec("CREATE TABLE upstream_resources(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,canonical_source_url TEXT NOT NULL,resource_locator TEXT,source_family TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(tenant_id,canonical_source_url,resource_locator));");
      const store = new D1UpstreamResourceStore(db);
      const a = await store.resolveOrCreate({tenantId:"tenant-a",canonicalSourceUrl:"https://example.com",sourceFamily:"news",now:"2026-09-24T00:00:00Z"});
      const a2 = await store.resolveOrCreate({tenantId:"tenant-a",canonicalSourceUrl:"https://example.com",sourceFamily:"news",now:"2026-09-24T01:00:00Z"});
      const b = await store.resolveOrCreate({tenantId:"tenant-b",canonicalSourceUrl:"https://example.com",sourceFamily:"news",now:"2026-09-24T00:00:00Z"});
      expect(a.id).toBe(a2.id); expect(b.id).not.toBe(a.id); expect(await store.get("tenant-a",a.id)).toMatchObject({canonicalSourceUrl:"https://example.com"}); expect(await store.get("tenant-b",a.id)).toBeUndefined();
    } finally { await mf.dispose(); }
  });
});