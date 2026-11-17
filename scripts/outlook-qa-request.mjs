/** Bounded retries for setup requests. Never logs request bodies or tokens. */
export async function requestMicrosoft(url, options, {
  fetchImpl = fetch,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  attempts = 4,
  timeoutMs = 30000
} = {}) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    let response;
    try {
      response = await fetchImpl(url, {...options, signal: AbortSignal.timeout(timeoutMs)});
    } catch (error) {
      if (attempt + 1 === attempts) throw error;
    }
    if (response && response.status !== 408 && response.status !== 429 && response.status < 500) return response;
    if (response && attempt + 1 === attempts) return response;
    if (response) await response.body?.cancel();
    await sleep(Math.min(15000, 2000 * 2 ** attempt));
  }
}
