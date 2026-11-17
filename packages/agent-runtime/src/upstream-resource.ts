export interface UpstreamResource {
  id: string; tenantId: string; canonicalSourceUrl: string; resourceLocator?: string; sourceFamily?: string; createdAt: string; updatedAt: string;
}
export interface UpstreamResourceStore {
  resolveOrCreate(input: { tenantId: string; canonicalSourceUrl: string; resourceLocator?: string; sourceFamily?: string; now?: string }): Promise<UpstreamResource>;
  get(tenantId: string, id: string): Promise<UpstreamResource | undefined>;
}