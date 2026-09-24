import { PublicSourceFetchFailure, PublicSourcePolicyError, type PublicSourceFetchPort } from "@distilled/agent-runtime";

const MAX_BODY_BYTES = 512_000;

/** Conservative one-origin, no-redirect HTTP capability for public source assessment. */
export class WorkerPublicSourceFetch implements PublicSourceFetchPort {
  private readonly origin: string;
  constructor(sourceUrl: string, private readonly fetcher: typeof fetch = fetch) {
    const source = admittedUrl(sourceUrl);
    this.origin = source.origin;
  }

  async get(value: string): Promise<{ url: string; contentType: string; body: string; status: number }> {
    const url = admittedUrl(value);
    if (url.origin !== this.origin) throw new PublicSourcePolicyError();
    let response: Response;
    try { response = await this.fetcher(url.href, { redirect: "manual", signal: AbortSignal.timeout(15_000), headers: { accept: "text/html,application/xhtml+xml,application/rss+xml,application/atom+xml,application/xml" } }); }
    catch { throw new PublicSourceFetchFailure("NETWORK_FAILURE"); }
    if (response.status >= 300 && response.status < 400) throw new PublicSourcePolicyError();
    if (Number(response.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) throw new PublicSourceFetchFailure("BODY_BUDGET_EXCEEDED");
    const reader = response.body?.getReader();
    if (!reader) return { url: url.href, contentType: response.headers.get("content-type") ?? "", body: "", status: response.status };
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value: chunk } = await reader.read();
        if (done) break;
        size += chunk.byteLength;
        if (size > MAX_BODY_BYTES) { await reader.cancel(); throw new PublicSourceFetchFailure("BODY_BUDGET_EXCEEDED"); }
        chunks.push(chunk);
      }
    } catch (error) {
      if (error instanceof PublicSourceFetchFailure) throw error;
      throw new PublicSourceFetchFailure("NETWORK_FAILURE");
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return { url: url.href, contentType: response.headers.get("content-type") ?? "", body: new TextDecoder().decode(bytes), status: response.status };
  }
}

function admittedUrl(value: string): URL {
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || url.port || url.username || url.password || !host.includes(".") ||
      host === "localhost" || /\.(?:localhost|local|internal|test|invalid)$/u.test(host) ||
      /^\d+(?:\.\d+){0,3}$/u.test(host) || host.startsWith("[")) {
    throw new PublicSourcePolicyError();
  }
  return url;
}
