import { describe, expect, it } from "vitest";
import {
  createPublicEdgeCoordinator,
  type PublicEdgeCache
} from "./publicEdge";

class MemoryEdgeCache implements PublicEdgeCache {
  readonly values = new Map<string, Response>();
  puts = 0;
  deletes = 0;

  async match(request: RequestInfo | URL): Promise<Response | undefined> {
    return this.values.get(requestUrl(request))?.clone();
  }

  async put(request: RequestInfo | URL, response: Response): Promise<void> {
    this.puts += 1;
    this.values.set(requestUrl(request), response.clone());
  }

  async delete(request: RequestInfo | URL): Promise<boolean> {
    this.deletes += 1;
    return this.values.delete(requestUrl(request));
  }
}

const policy = {
  namespace: "status" as const,
  ttlSeconds: 15,
  release: "a".repeat(40)
};

describe("public edge coordinator", () => {
  it("serves subsequent anonymous reads from the explicit Cache API", async () => {
    const cache = new MemoryEdgeCache();
    const edge = createPublicEdgeCoordinator(() => cache);
    let produced = 0;
    const producer = async () => {
      produced += 1;
      return Response.json({ produced });
    };

    const first = await edge.respond(new Request("https://distilled.news/api/status"), policy, producer);
    const second = await edge.respond(new Request("https://distilled.news/api/status"), policy, producer);

    expect(await first.json()).toEqual({ produced: 1 });
    expect(first.headers.get("x-distilled-cache")).toBe("MISS");
    expect(second.headers.get("x-distilled-cache")).toBe("HIT");
    expect(second.headers.get("cache-control")).toBe(
      "public, max-age=15, s-maxage=15, must-revalidate"
    );
    expect(cache.puts).toBe(1);
    expect(produced).toBe(1);
  });

  it("coalesces concurrent misses without sharing a consumed response body", async () => {
    const cache = new MemoryEdgeCache();
    const edge = createPublicEdgeCoordinator(() => cache);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let produced = 0;
    const producer = async () => {
      produced += 1;
      await gate;
      return Response.json({ ok: true });
    };

    const request = new Request("https://distilled.news/api/status");
    const first = edge.respond(request, policy, producer);
    const second = edge.respond(request, policy, producer);
    await Promise.resolve();
    release();
    const responses = await Promise.all([first, second]);

    expect(produced).toBe(1);
    expect(responses.map((response) => response.headers.get("x-distilled-cache")).sort())
      .toEqual(["COALESCED", "MISS"]);
    await expect(responses[0].json()).resolves.toEqual({ ok: true });
    await expect(responses[1].json()).resolves.toEqual({ ok: true });
  });

  it("bypasses cache and coalescing for cookie, authorization, and no-cache requests", async () => {
    const cache = new MemoryEdgeCache();
    const edge = createPublicEdgeCoordinator(() => cache);
    let produced = 0;
    const producer = async () => Response.json({ produced: ++produced });
    const requests = [
      new Request("https://distilled.news/api/status", { headers: { cookie: "dn_session=private" } }),
      new Request("https://distilled.news/api/status", { headers: { authorization: "Bearer private" } }),
      new Request("https://distilled.news/api/status", { headers: { "cache-control": "no-cache" } })
    ];

    for (const request of requests) {
      const response = await edge.respond(request, policy, producer);
      expect(response.headers.get("x-distilled-cache")).toBe("BYPASS");
    }
    expect(produced).toBe(3);
    expect(cache.puts).toBe(0);
  });

  it("does not cache stale fallbacks, errors, or responses carrying cookies", async () => {
    const cache = new MemoryEdgeCache();
    const edge = createPublicEdgeCoordinator(() => cache);
    const responses = [
      new Response("stale", { headers: { "x-distilled-snapshot": "stale" } }),
      new Response("unavailable", { status: 503 }),
      new Response("private", { headers: { "set-cookie": "secret=value" } })
    ];
    for (const [index, response] of responses.entries()) {
      await edge.respond(
        new Request(`https://distilled.news/api/status?case=${index}`),
        { ...policy, keyParts: [String(index)] },
        async () => response
      );
    }
    expect(cache.puts).toBe(0);
  });

  it("versions keys by release and supports explicit POP-local invalidation", async () => {
    const cache = new MemoryEdgeCache();
    const edge = createPublicEdgeCoordinator(() => cache);
    const request = new Request("https://distilled.news/api/status");
    await edge.respond(request, policy, async () => Response.json({ release: "a" }));
    await edge.respond(request, { ...policy, release: "b".repeat(40) }, async () =>
      Response.json({ release: "b" })
    );
    expect(cache.values.size).toBe(2);

    await edge.invalidate(request, policy);
    expect(cache.deletes).toBe(1);
    expect(cache.values.size).toBe(1);
  });
});

function requestUrl(request: RequestInfo | URL): string {
  if (typeof request === "string") return request;
  if (request instanceof URL) return request.toString();
  return request.url;
}
