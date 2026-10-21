import { PublicSourceFetchFailure } from '@distilled/agent-runtime';

/** Request-local evidence reuse; never shares user preferences or responses across requests. */
export function recommendationFetch(fetcher: typeof fetch, budgetMs = 20_000): typeof fetch {
  const deadline = AbortSignal.timeout(budgetMs);
  const reads = new Map<string, Promise<Response>>();
  return (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
    const key = String(input instanceof Request ? input.url : input);
    const cached = method === 'GET' ? reads.get(key) : undefined;
    if (cached) return (await cached).clone();
    const signal = AbortSignal.any([deadline, AbortSignal.timeout(8_000), ...(init?.signal ? [init.signal] : [])]);
    const work = async () => {
      const response = await fetcher(input, { ...init, signal });
      // Buffer only a bounded body. Reconstructing it permits safe evidence reuse
      // without teeing an unbounded publisher stream into a clone cache.
      const reader = response.body?.getReader();
      if (!reader) return response;
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.byteLength;
          if (size > 512_000) throw new PublicSourceFetchFailure('BODY_BUDGET_EXCEEDED');
          chunks.push(part.value);
        }
      } finally { void reader.cancel().catch(() => undefined); }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      return new Response(bytes, { status: response.status, statusText: response.statusText, headers: response.headers });
    };
    const pending = new Promise<Response>((resolve, reject) => {
      const abort = () => reject(new PublicSourceFetchFailure('FETCH_TIMEOUT'));
      if (signal.aborted) { abort(); return; }
      signal.addEventListener('abort', abort, { once: true });
      work().then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
    });
    if (method === 'GET') reads.set(key, pending);
    return (await pending).clone();
  }) as typeof fetch;
}
