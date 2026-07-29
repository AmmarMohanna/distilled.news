export interface PublicEdgeCache {
  match(request: RequestInfo | URL, options?: CacheQueryOptions): Promise<Response | undefined>;
  put(request: RequestInfo | URL, response: Response): Promise<void>;
  delete(request: RequestInfo | URL, options?: CacheQueryOptions): Promise<boolean>;
}

export interface PublicEdgePolicy {
  namespace: "status" | "capabilities" | "explore" | "feed" | "edition" | "search" | "sitemap";
  ttlSeconds: number;
  release?: string;
  keyParts?: string[];
}

export interface PublicEdgeCoordinator {
  respond(
    request: Request,
    policy: PublicEdgePolicy,
    producer: () => Promise<Response>
  ): Promise<Response>;
  invalidate(request: Request, policy: PublicEdgePolicy): Promise<void>;
}

const MAX_IN_FLIGHT_KEYS = 128;
const PRIVATE_REQUEST_HEADERS = ["authorization", "cookie"] as const;

/**
 * Cloudflare's Cache API is POP-local and does not collapse simultaneous
 * misses. This coordinator adds an isolate-local single flight for anonymous
 * public reads. It is only a cost/availability optimization: no correctness,
 * authentication, or user state depends on the ephemeral map.
 */
export function createPublicEdgeCoordinator(
  cacheResolver: () => PublicEdgeCache | undefined = defaultCache
): PublicEdgeCoordinator {
  const inFlight = new Map<string, Promise<Response>>();

  return {
    async respond(request, policy, producer) {
      if (shouldBypassPublicEdge(request)) {
        return withOutcome(await producer(), "BYPASS");
      }

      const cache = cacheResolver();
      if (!cache) return withOutcome(await producer(), "BYPASS");

      const cacheRequest = cacheKeyRequest(request, policy);
      const cacheKey = cacheRequest.url;
      const cached = await cache.match(cacheRequest).catch((error) => {
        console.warn("Public edge cache lookup failed", publicCacheError(policy, error));
        return undefined;
      });
      if (cached) return withOutcome(cached, "HIT");

      const shared = inFlight.get(cacheKey);
      if (shared) return withOutcome((await shared).clone(), "COALESCED");

      if (inFlight.size >= MAX_IN_FLIGHT_KEYS) {
        return withOutcome(await producer(), "BYPASS");
      }

      const flight = produceAndCache(cache, cacheRequest, policy, producer);
      inFlight.set(cacheKey, flight);
      try {
        return withOutcome((await flight).clone(), "MISS");
      } finally {
        if (inFlight.get(cacheKey) === flight) inFlight.delete(cacheKey);
      }
    },

    async invalidate(request, policy) {
      const cache = cacheResolver();
      if (!cache) return;
      await cache.delete(cacheKeyRequest(request, policy)).catch((error) => {
        console.warn("Public edge cache invalidation failed", publicCacheError(policy, error));
        return false;
      });
    }
  };
}

async function produceAndCache(
  cache: PublicEdgeCache,
  cacheRequest: Request,
  policy: PublicEdgePolicy,
  producer: () => Promise<Response>
): Promise<Response> {
  const produced = await producer();
  if (!isCacheablePublicResponse(produced)) return produced;

  const stored = new Response(produced.body, produced);
  stored.headers.set(
    "cache-control",
    `public, max-age=${policy.ttlSeconds}, s-maxage=${policy.ttlSeconds}, must-revalidate`
  );
  stored.headers.set("cache-tag", `distilled-public-${policy.namespace}`);
  stored.headers.delete("set-cookie");
  stored.headers.delete("x-distilled-cache");
  await cache.put(cacheRequest, stored.clone()).catch((error) => {
    console.warn("Public edge cache write failed", publicCacheError(policy, error));
  });
  return stored;
}

function cacheKeyRequest(request: Request, policy: PublicEdgePolicy): Request {
  const source = new URL(request.url);
  const key = new URL(source.origin);
  key.pathname = "/__distilled_public_edge__";
  key.searchParams.set("v", "1");
  key.searchParams.set("namespace", policy.namespace);
  key.searchParams.set("release", boundedKeyPart(policy.release ?? "unversioned"));
  key.searchParams.set("path", source.pathname);
  for (const part of policy.keyParts ?? []) key.searchParams.append("key", boundedKeyPart(part));
  return new Request(key, { method: "GET" });
}

function boundedKeyPart(value: string): string {
  return value.normalize("NFKC").slice(0, 512);
}

function shouldBypassPublicEdge(request: Request): boolean {
  if (request.method !== "GET") return true;
  if (PRIVATE_REQUEST_HEADERS.some((header) => Boolean(request.headers.get(header)))) return true;
  if (request.headers.has("range")) return true;
  const cacheControl = request.headers.get("cache-control")?.toLowerCase() ?? "";
  if (cacheControl.includes("no-cache") || cacheControl.includes("no-store")) return true;
  return request.headers.get("pragma")?.toLowerCase().includes("no-cache") ?? false;
}

function isCacheablePublicResponse(response: Response): boolean {
  if (response.status !== 200 || response.headers.has("set-cookie")) return false;
  if (response.headers.get("x-distilled-snapshot") === "stale") return false;
  const cacheControl = response.headers.get("cache-control")?.toLowerCase() ?? "";
  return !cacheControl.includes("private") && !cacheControl.includes("no-store");
}

function withOutcome(response: Response, outcome: "HIT" | "MISS" | "COALESCED" | "BYPASS"): Response {
  const result = new Response(response.body, response);
  result.headers.set("x-distilled-cache", outcome);
  return result;
}

function publicCacheError(policy: PublicEdgePolicy, error: unknown): Record<string, string> {
  return {
    namespace: policy.namespace,
    error: error instanceof Error ? error.message : String(error)
  };
}

function defaultCache(): PublicEdgeCache | undefined {
  if (typeof caches === "undefined") return undefined;
  const workerCaches = caches as CacheStorage & { readonly default?: PublicEdgeCache };
  return workerCaches.default;
}
