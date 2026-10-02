import { afterEach, describe, expect, it, vi } from "vitest";
import { personalNewsBriefing } from "@distilled/core";
import { ingestPublicTelegramChannel } from "./publicTelegram";
import { InMemoryRepository } from "./repository";
import { refreshSourceById } from "./sources";

const now = new Date("2026-09-01T12:00:00Z");

async function context() {
  const repo = new InMemoryRepository();
  const briefing = await repo.upsertBriefing({ ...personalNewsBriefing, id: "ingestion-regression", paused: false }, now);
  return { repo, briefing, now, bucket: { put: vi.fn(async () => undefined) }, queue: { send: vi.fn(async () => undefined) } };
}

afterEach(() => vi.useRealTimers());

describe.each(["rss_feed", "google_news"] as const)("%s fetch health", (kind) => {
  it("records HTTP 200 HTML as a parse failure and recovers on a valid empty feed", async () => {
    const input = await context();
    const source = await input.repo.upsertConfiguredSource({
      briefingId: input.briefing.id, title: "News", provider: "rss", kind, input: "news",
      sourceUrl: "https://example.com/feed", enabled: true
    }, now);
    const previousSeen = "2026-08-31T09:00:00.000Z";
    await input.repo.updateSourceState({ sourceId: source.id, lastSeenAt: previousSeen });
    const fetcher = vi.fn(async () => new Response("<html>Access denied. Consent required.</html>", { status: 200 }));

    await expect(refreshSourceById({ ...input, sourceId: source.id, fetcher })).rejects.toThrow("not an RSS or Atom feed");
    expect(await input.repo.getSource(source.id)).toMatchObject({
      lastError: expect.stringContaining("Could not parse"), lastSeenAt: previousSeen, lastCheckedAt: now.toISOString()
    });
    expect(await input.repo.getSetting("last_source_fetch_at")).toBeNull();
    expect(input.queue.send).not.toHaveBeenCalled();
    expect(input.bucket.put).toHaveBeenCalledWith(expect.any(String), expect.stringContaining("Access denied"), expect.any(Object));

    fetcher.mockImplementation(async () => new Response("<rss><channel><title>Quiet feed</title></channel></rss>"));
    const result = await refreshSourceById({ ...input, sourceId: source.id, fetcher });
    expect(result).toMatchObject({ fetched: 0, imported: 0 });
    expect((await input.repo.getSource(source.id))?.lastError).toBeUndefined();
    expect(await input.repo.getSetting("last_source_fetch_at")).toBe(now.toISOString());
    expect(input.queue.send).not.toHaveBeenCalled();
  });
});

describe("Telegram end-to-end fetch deadline", () => {
  it.each(["headers", "body"] as const)("aborts a stall during %s at the 12-second deadline", async (phase) => {
    vi.useFakeTimers();
    const input = await context();
    let signal: AbortSignal | undefined;
    const fetcher: typeof fetch = vi.fn(async (_url, init) => {
      signal = init!.signal!;
      if (phase === "headers") {
        return new Promise<Response>((_resolve, reject) => signal!.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true }));
      }
      return new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("<html>partial"));
          signal!.addEventListener("abort", () => controller.error(new DOMException("Aborted", "AbortError")), { once: true });
        }
      }));
    });
    const attempt = ingestPublicTelegramChannel({ ...input, url: "https://t.me/news_channel", fetcher });
    const rejected = expect(attempt).rejects.toThrow("Timed out fetching");
    await vi.advanceTimersByTimeAsync(11_999);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await rejected;
    expect(signal?.aborted).toBe(true);
    expect(input.bucket.put).not.toHaveBeenCalled();
    expect(input.queue.send).not.toHaveBeenCalled();
    expect(await input.repo.getSetting("last_source_fetch_at")).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("allows a body to finish within the deadline and releases its timer", async () => {
    vi.useFakeTimers();
    const input = await context();
    let signal: AbortSignal | undefined;
    const fetcher: typeof fetch = vi.fn(async (_url, init) => {
      signal = init!.signal!;
      return new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          setTimeout(() => {
            controller.enqueue(new TextEncoder().encode('<main><div class="tgme_widget_message_wrap"><div class="tgme_widget_message" data-post="news_channel/1"><div class="tgme_widget_message_text js-message_text">News update</div><time datetime="2026-09-01T09:00:00Z"></time></div></div></main>'));
            controller.close();
          }, 11_000);
        }
      }));
    });
    const attempt = ingestPublicTelegramChannel({ ...input, url: "https://t.me/news_channel", fetcher });
    await vi.advanceTimersByTimeAsync(11_000);
    expect(await attempt).toMatchObject({ fetched: 1, imported: 1 });
    expect(input.queue.send).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(signal?.aborted).toBe(false);
  });
});
