import { PublicSourceFetchFailure, PublicSourcePolicyError, type PublicSourceFetchPort } from "@distilled/agent-runtime";

const MAX_BODY_BYTES = 2_000_000;

/** Conservative one-origin HTTP capability. Redirects require explicit opt-in
 * and remain bounded and confined to the original public HTTPS origin. */
export class WorkerPublicSourceFetch implements PublicSourceFetchPort {
  private readonly origin: string;
  constructor(sourceUrl: string, private readonly fetcher: typeof fetch = fetch,private readonly options:{followSameOriginRedirects?:boolean;maxBytes?:number}={}) {
    if(options.maxBytes!==undefined&&(!Number.isSafeInteger(options.maxBytes)||options.maxBytes<1||options.maxBytes>15_000_000))throw Error('INVALID_HTTP_LIMITS');
    const source = admittedUrl(sourceUrl);
    this.origin = source.origin;
  }

  async get(value: string): Promise<{ url: string; contentType: string; body: string; status: number; authenticationRequired?:boolean;retryAfter?:string }> {
    return this.read(value,new Set());
  }
  private async read(value:string,seen:Set<string>):Promise<{url:string;contentType:string;body:string;status:number;authenticationRequired?:boolean;retryAfter?:string}>{
    const url = admittedUrl(value);
    url.hash='';
    if (url.origin !== this.origin||seen.has(url.href)||seen.size>3) throw new PublicSourcePolicyError();
    seen.add(url.href);
    let response: Response;
    const signal = AbortSignal.timeout(60_000);
    const fetcher=this.fetcher;
    try { response = await fetcher(url.href, { redirect: "manual", signal, headers: { accept: "text/html,application/xhtml+xml,application/rss+xml,application/atom+xml,application/xml" } }); }
    catch (error) {
      if (error instanceof PublicSourceFetchFailure) throw error;
      if (knownCloudflareSubrequestDenial(error)) throw new PublicSourcePolicyError();
      throw new PublicSourceFetchFailure(signal.aborted ? "FETCH_TIMEOUT" : "FETCH_REJECTED");
    }
    if (response.status >= 300 && response.status < 400){
      const location=response.headers.get('location');await response.body?.cancel();
      if(!this.options.followSameOriginRedirects||![301,302,303,307,308].includes(response.status)||!location)throw new PublicSourcePolicyError();
      return this.read(new URL(location,url).href,seen);
    }
    const maxBytes=this.options.maxBytes??MAX_BODY_BYTES;
    if (Number(response.headers.get("content-length") ?? 0) > maxBytes) {await response.body?.cancel();throw new PublicSourceFetchFailure("BODY_BUDGET_EXCEEDED");}
    const reader = response.body?.getReader();
    if (!reader) return { url: url.href, contentType: response.headers.get("content-type") ?? "", body: "", status: response.status, ...(response.headers.has('www-authenticate')?{authenticationRequired:true}:{}),...(response.headers.has('retry-after')?{retryAfter:response.headers.get('retry-after')!}:{}) };
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value: chunk } = await reader.read();
        if (done) break;
        size += chunk.byteLength;
        if (size > maxBytes) { await reader.cancel(); throw new PublicSourceFetchFailure("BODY_BUDGET_EXCEEDED"); }
        chunks.push(chunk);
      }
    } catch (error) {
      if (error instanceof PublicSourceFetchFailure) throw error;
      throw new PublicSourceFetchFailure(signal.aborted ? "FETCH_TIMEOUT" : "BODY_STREAM_FAILURE");
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return { url: url.href, contentType: response.headers.get("content-type") ?? "", body: new TextDecoder().decode(bytes), status: response.status, ...(response.headers.has('www-authenticate')?{authenticationRequired:true}:{}),...(response.headers.has('retry-after')?{retryAfter:response.headers.get('retry-after')!}:{}) };
  }
}

/** Only documented platform denial codes are classified; raw provider text is never returned. */
function knownCloudflareSubrequestDenial(error: unknown): boolean {
  const message = error instanceof Error ? error.message : "";
  return /\b(?:1021|1024|1042)\b/u.test(message);
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
