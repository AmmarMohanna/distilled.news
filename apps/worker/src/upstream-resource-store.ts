import type { UpstreamResource, UpstreamResourceStore } from "@distilled/agent-runtime";

export class D1UpstreamResourceStore implements UpstreamResourceStore {
  constructor(private readonly db: D1Database) {}

  async resolveOrCreate(input: Parameters<UpstreamResourceStore["resolveOrCreate"]>[0]): Promise<UpstreamResource> {
    const now = input.now ?? new Date().toISOString();
    const id = `upstream_${hashIdentity(input.tenantId, input.canonicalSourceUrl, input.resourceLocator ?? "")}`;
    const existing = await this.db.prepare("SELECT id FROM upstream_resources WHERE tenant_id=? AND canonical_source_url=? AND (resource_locator=? OR (resource_locator IS NULL AND ? IS NULL)) LIMIT 1")
      .bind(input.tenantId, input.canonicalSourceUrl, input.resourceLocator ?? null, input.resourceLocator ?? null).first<Record<string, unknown>>();
    if (existing) {
      await this.db.prepare("UPDATE upstream_resources SET source_family=COALESCE(?,source_family), updated_at=? WHERE id=? AND tenant_id=?")
        .bind(input.sourceFamily ?? null, now, String(existing.id), input.tenantId).run();
    } else {
      await this.db.prepare("INSERT INTO upstream_resources (id,tenant_id,canonical_source_url,resource_locator,source_family,created_at,updated_at) VALUES (?,?,?,?,?,?,?)")
        .bind(id, input.tenantId, input.canonicalSourceUrl, input.resourceLocator ?? null, input.sourceFamily ?? null, now, now).run();
    }
    const resource = await this.get(input.tenantId, id);
    if (!resource) throw new Error("upstream resource was not persisted");
    return resource;
  }

  async get(tenantId: string, id: string): Promise<UpstreamResource | undefined> {
    const row = await this.db.prepare("SELECT id,tenant_id,canonical_source_url,resource_locator,source_family,created_at,updated_at FROM upstream_resources WHERE tenant_id=? AND id=?")
      .bind(tenantId, id).first<Record<string, unknown>>();
    if (!row) return undefined;
    return {
      id: String(row.id), tenantId: String(row.tenant_id), canonicalSourceUrl: String(row.canonical_source_url),
      resourceLocator: row.resource_locator == null ? undefined : String(row.resource_locator),
      sourceFamily: row.source_family == null ? undefined : String(row.source_family),
      createdAt: String(row.created_at), updatedAt: String(row.updated_at)
    };
  }
}

function hashIdentity(...values: string[]): string {
  let hash = 2166136261;
  for (const char of values.join("\u0000")) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(16).padStart(8, "0");
}