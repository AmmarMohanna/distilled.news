import type { FeedHttpPort, FeedResponse } from './ports';

/** Dispatch must enforce authorized-source egress/DNS rules at connection time.
 * This package deliberately does not fall back to unrestricted global fetch. */
export type AuthorizedFeedFetch = (url: string, init: RequestInit) => Promise<Response>;
export class BoundedFeedHttp implements FeedHttpPort {
  constructor(private readonly dispatch: AuthorizedFeedFetch, private readonly options: {
    attempts?: number; timeoutMs?: number; maxBytes?: number; maxBackoffMs?: number;
    sleep?: (ms: number) => Promise<void>; clock?: () => number;
  } = {}) {}
  async get(url: string, headers: Record<string,string>, bounds?: {attempts?:number;timeoutMs?:number}): Promise<FeedResponse> {
    const parsed = new URL(url);
    if (!['http:','https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('INVALID_SOURCE_URL');
    const attempts = bounds?.attempts ?? this.options.attempts ?? 3, timeoutMs = bounds?.timeoutMs ?? this.options.timeoutMs ?? 15_000;
    const maxBytes = this.options.maxBytes ?? 2_000_000, maxBackoff = this.options.maxBackoffMs ?? 5_000;
    if (!Number.isInteger(attempts) || attempts < 1 || attempts > 5 || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000 || !Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > 10_000_000 || !Number.isInteger(maxBackoff) || maxBackoff < 0 || maxBackoff > 60_000) throw new Error('INVALID_HTTP_LIMITS');
    const clock = this.options.clock ?? Date.now, start = clock();
    const sleep = this.options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
    let requests = 0;
    for (let attempt = 0; attempt < attempts; attempt++) {
      let status: number | undefined, responseHeaders: Record<string,string> = {};
      try {
        const signal=AbortSignal.timeout(timeoutMs);
        const bounded=async <T>(operation:Promise<T>):Promise<T> => {
          signal.throwIfAborted();
          let abort:()=>void = ()=>{};
          const deadline=new Promise<never>((_resolve,reject)=>{abort=()=>reject(new Error('FETCH_TIMEOUT'));signal.addEventListener('abort',abort,{once:true});});
          try {return await Promise.race([operation,deadline]);} finally {signal.removeEventListener('abort',abort);}
        };
        const response = await bounded(this.dispatch(url, { method:'GET', headers, redirect:'manual', signal }));
        requests++;
        status = response.status; responseHeaders = Object.fromEntries(response.headers.entries());
        if (status === 429 || status >= 500) {
          await response.body?.cancel();
          if (attempt + 1 < attempts) {
            const raw = response.headers.get('retry-after');
            const delay = raw ? /^\d+$/.test(raw) ? Number(raw)*1000 : Date.parse(raw)-clock() : 250*2**attempt;
            // Never retry earlier than a provider's larger Retry-After. Return it for scheduling.
            if (Number.isFinite(delay) && delay > maxBackoff) return this.result(status,responseHeaders,new Uint8Array(),requests,clock()-start);
            await sleep(Math.max(0, Number.isFinite(delay) ? delay : 250*2**attempt)); continue;
          }
          return this.result(status,responseHeaders,new Uint8Array(),requests,clock()-start);
        }
        if (status !== 200) { await response.body?.cancel(); return this.result(status,responseHeaders,new Uint8Array(),requests,clock()-start); }
        if (Number(response.headers.get('content-length')) > maxBytes) { await response.body?.cancel(); throw new Error('FEED_TOO_LARGE'); }
        const reader = response.body?.getReader();
        const chunks: Uint8Array[] = []; let length = 0;
        if (reader) {
          try { while (true) { const part = await bounded(reader.read()); if (part.done) break; length += part.value.length; if (length > maxBytes) throw new Error('FEED_TOO_LARGE'); chunks.push(part.value); } }
          catch (e) { void reader.cancel().catch(()=>{}); throw e; }
          finally { reader.releaseLock(); }
        }
        const bytes = new Uint8Array(length); let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.length; }
        return this.result(status,responseHeaders,bytes,requests,clock()-start);
      } catch (error) {
        if (!status) requests++;
        if (error instanceof Error && error.message === 'FEED_TOO_LARGE') throw error;
        if (attempt + 1 === attempts) return this.result(0,{},new Uint8Array(),requests,clock()-start);
        await sleep(Math.min(maxBackoff,250*2**attempt));
      }
    }
    throw new Error('UNREACHABLE');
  }
  private result(status:number,headers:Record<string,string>,bytes:Uint8Array,requests:number,latencyMs:number): FeedResponse {
    return {status,headers,bytes,telemetry:{requests,latencyMs:Math.max(0,latencyMs),providerCostUsd:0,status}};
  }
}
