import { describe, expect, it, vi } from "vitest";
import { personalNewsBriefing } from "@lownoise/core";
import { createApp } from "./app";
import { processQueueMessage } from "./processor";
import { InMemoryRepository } from "./repository";
import type { Env, ProcessingJobMessage } from "./types";

class FakeBucket {
  objects = new Map<string, string>();

  async put(key: string, value: string): Promise<void> {
    this.objects.set(key, value);
  }
}

class FakeQueue {
  messages: ProcessingJobMessage[] = [];

  async send(message: ProcessingJobMessage): Promise<void> {
    this.messages.push(message);
  }
}

function env(): Env {
  return {
    ADMIN_SESSION_SECRET: "admin-secret",
    ADMIN_SETUP_TOKEN: "setup-token",
    INTERNAL_MAINTENANCE_SECRET: "internal-secret",
    PUBLIC_API_BASE_URL: "https://worker.test"
  } as Env;
}

const publicTelegramHtml = `
  <meta property="og:title" content="Lebanon Updates">
  <main>
    <div class="tgme_widget_message_wrap js-widget_message_wrap"><div class="tgme_widget_message text_not_supported_wrap js-widget_message" data-post="LebUpdate/10">
      <div class="tgme_widget_message_text js-message_text" dir="auto">Electricite du Liban announced two extra hours of power supply tonight.</div>
      <a class="tgme_widget_message_date" href="https://t.me/LebUpdate/10"><time datetime="2026-06-15T18:16:37+00:00" class="time">18:16</time></a>
    </div></div>
  </main>`;

describe("worker app", () => {
  it("redirects www and http custom-domain traffic to the canonical apex", async () => {
    const app = createApp({ repository: new InMemoryRepository() });

    const wwwResponse = await app.request("https://www.lownoise.news/feed/personal", {}, env());
    expect(wwwResponse.status).toBe(301);
    expect(wwwResponse.headers.get("location")).toBe("https://lownoise.news/feed/personal");

    const httpResponse = await app.request("http://lownoise.news/feed/personal", {}, env());
    expect(httpResponse.status).toBe(301);
    expect(httpResponse.headers.get("location")).toBe("https://lownoise.news/feed/personal");

    const demoResponse = await app.request("/demo", {}, env());
    expect(demoResponse.status).toBe(302);
    expect(demoResponse.headers.get("location")).toBe("/");
  });

  it("adds a public Telegram channel URL as an enabled source and queues posts", async () => {
    const repo = new InMemoryRepository();
    const bucket = new FakeBucket();
    const queue = new FakeQueue();
    const fetcher = vi.fn(async () => new Response(publicTelegramHtml, { status: 200 }));
    const app = createApp({ repository: repo, bucket, queue, fetcher: fetcher as unknown as typeof fetch });
    const briefing = await repo.ensureDefaultBriefing();

    const response = await app.request(
      "/api/admin/sources",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-lownoise-admin": "admin-secret"
        },
        body: JSON.stringify({ briefingId: briefing.id, url: "https://t.me/LebUpdate" })
      },
      env()
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      sources: Array<{ id: string; title: string; url?: string; enabled: boolean }>;
      result: { fetched: number; queued: number };
    };
    expect(fetcher).toHaveBeenCalledWith("https://t.me/s/LebUpdate", expect.any(Object));
    expect(payload.sources).toEqual([
      expect.objectContaining({
        id: `${briefing.id}::telegram_public_lebupdate`,
        title: "Lebanon Updates",
        url: "https://t.me/LebUpdate",
        enabled: true
      })
    ]);
    expect(payload.result).toMatchObject({ fetched: 1, queued: 1 });
    expect(queue.messages).toHaveLength(1);
    expect(Array.from(bucket.objects.keys())[0]).toContain(`telegram-public/${briefing.id}/LebUpdate/`);
  });

  it("scopes the same public channel independently across multiple briefings", async () => {
    const repo = new InMemoryRepository();
    const bucket = new FakeBucket();
    const queue = new FakeQueue();
    const fetcher = vi.fn(async () => new Response(publicTelegramHtml, { status: 200 }));
    const app = createApp({ repository: repo, bucket, queue, fetcher: fetcher as unknown as typeof fetch });
    const first = await repo.ensureDefaultBriefing();
    const second = await repo.upsertBriefing({
      ...personalNewsBriefing,
      id: "briefing_second",
      slug: "second",
      title: "Second Briefing"
    });

    for (const briefing of [first, second]) {
      const response = await app.request(
        "/api/admin/sources",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-lownoise-admin": "admin-secret"
          },
          body: JSON.stringify({ briefingId: briefing.id, url: "https://t.me/LebUpdate" })
        },
        env()
      );
      expect(response.status).toBe(200);
    }

    const firstSources = await repo.listSources(first.id);
    const secondSources = await repo.listSources(second.id);
    expect(firstSources).toHaveLength(1);
    expect(secondSources).toHaveLength(1);
    expect(firstSources[0].id).not.toBe(secondSources[0].id);

    const firstResult = await processQueueMessage(repo, queue.messages[0], new Date("2026-06-16T08:00:00.000Z"));
    const secondResult = await processQueueMessage(repo, queue.messages[1], new Date("2026-06-16T08:01:00.000Z"));
    expect(firstResult?.publishedItems).toHaveLength(1);
    expect(secondResult?.publishedItems).toHaveLength(1);
    expect(await repo.getExistingItems(first.id)).toHaveLength(1);
    expect(await repo.getExistingItems(second.id)).toHaveLength(1);
  });

  it("skips refresh and processing when a briefing is paused", async () => {
    const repo = new InMemoryRepository();
    const bucket = new FakeBucket();
    const queue = new FakeQueue();
    const fetcher = vi.fn(async () => new Response(publicTelegramHtml, { status: 200 }));
    const app = createApp({ repository: repo, bucket, queue, fetcher: fetcher as unknown as typeof fetch });
    const briefing = await repo.ensureDefaultBriefing();

    await app.request(
      "/api/admin/briefings",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-lownoise-admin": "admin-secret"
        },
        body: JSON.stringify({ ...briefing, paused: true })
      },
      env()
    );

    await app.request(
      "/api/admin/sources",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-lownoise-admin": "admin-secret"
        },
        body: JSON.stringify({ briefingId: briefing.id, url: "https://t.me/LebUpdate" })
      },
      env()
    );

    const refreshResponse = await app.request(
      "/api/admin/sources/refresh",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-lownoise-admin": "admin-secret"
        },
        body: JSON.stringify({ briefingId: briefing.id })
      },
      env()
    );
    expect(await refreshResponse.json()).toMatchObject({ sources: [expect.any(Object)], results: [] });

    const result = await processQueueMessage(repo, queue.messages[0], new Date("2026-06-16T08:00:00.000Z"));
    expect(result).toBeUndefined();
    expect(await repo.getExistingItems(briefing.id)).toHaveLength(0);

    const healthResponse = await app.request(
      `/api/admin/health?briefingId=${briefing.id}`,
      { headers: { "x-lownoise-admin": "admin-secret" } },
      env()
    );
    expect(await healthResponse.json()).toMatchObject({
      health: {
        processing: { queued: 0, completed: 1, failed: 0 }
      }
    });
  });

  it("processes enabled sources into published briefing items with evidence and search", async () => {
    const repo = new InMemoryRepository();
    const briefing = await repo.ensureDefaultBriefing();
    const bucket = new FakeBucket();
    const queue = new FakeQueue();
    const fetcher = vi.fn(async () => new Response(publicTelegramHtml, { status: 200 }));
    const app = createApp({ repository: repo, bucket, queue, fetcher: fetcher as unknown as typeof fetch });

    await app.request(
      "/api/admin/sources",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-lownoise-admin": "admin-secret"
        },
        body: JSON.stringify({ briefingId: briefing.id, url: "https://t.me/LebUpdate" })
      },
      env()
    );

    await processQueueMessage(repo, queue.messages[0], new Date("2026-06-16T08:00:00.000Z"));

    const privateFeedResponse = await app.request(`/api/feed/${briefing.slug}`, {}, env());
    expect(privateFeedResponse.status).toBe(401);

    await app.request(
      "/api/admin/briefings",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-lownoise-admin": "admin-secret"
        },
        body: JSON.stringify({ ...briefing, publicFeedEnabled: true })
      },
      env()
    );

    const feedResponse = await app.request(`/api/feed/${briefing.slug}`, {}, env());
    expect(feedResponse.status).toBe(200);
    const feed = (await feedResponse.json()) as {
      items: Array<{ summary: string; evidence: Array<{ sourceTitle: string; sourceUrl: string }> }>;
    };
    expect(feed.items).toHaveLength(1);
    expect(feed.items[0].summary).toContain("Electricite du Liban");
    expect(feed.items[0].evidence[0]).toMatchObject({
      sourceTitle: "Lebanon Updates",
      sourceUrl: "https://t.me/LebUpdate/10"
    });
    expect(JSON.stringify(feed)).not.toMatch(/confidence|sourceCount|chatbot|Q&A/i);

    const searchResponse = await app.request(`/api/feed/${briefing.slug}/search?q=power%20supply`, {}, env());
    const search = (await searchResponse.json()) as { items: unknown[] };
    expect(search.items).toHaveLength(1);
  });

  it("supports admin username and password login", async () => {
    const repo = new InMemoryRepository();
    const app = createApp({ repository: repo });

    const setupResponse = await app.request(
      "/api/admin/session",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: "admin", password: "admin", setupToken: "setup-token" })
      },
      env()
    );
    expect(setupResponse.status).toBe(200);

    const wrongUsernameResponse = await app.request(
      "/api/admin/session",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: "root", password: "admin" })
      },
      env()
    );
    expect(wrongUsernameResponse.status).toBe(401);

    const loginResponse = await app.request(
      "/api/admin/session",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: "admin", password: "admin" })
      },
      env()
    );
    expect(loginResponse.status).toBe(200);
  });

  it("does not expose removed webhook or ask endpoints", async () => {
    const app = createApp({ repository: new InMemoryRepository() });

    const askResponse = await app.request("/api/ask/personal", {}, env());
    expect(askResponse.status).toBe(404);
    expect(await askResponse.json()).toEqual({ error: "not found" });

    const webhookResponse = await app.request("/telegram/webhook/briefing_default/secret", { method: "POST" }, env());
    expect(webhookResponse.status).toBe(404);
  });
});
