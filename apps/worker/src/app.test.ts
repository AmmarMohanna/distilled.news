import { describe, expect, it, vi } from "vitest";
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
    TELEGRAM_BOT_TOKEN: "telegram-token",
    TELEGRAM_WEBHOOK_SECRET: "webhook-secret",
    ADMIN_SESSION_SECRET: "admin-secret",
    ADMIN_SETUP_TOKEN: "setup-token",
    INTERNAL_MAINTENANCE_SECRET: "internal-secret",
    PUBLIC_API_BASE_URL: "https://worker.test"
  } as Env;
}

function telegramUpdate(updateId: number, text: string) {
  return {
    update_id: updateId,
    channel_post: {
      message_id: updateId,
      date: 1_781_612_800 + updateId,
      chat: {
        id: -100123,
        type: "channel",
        title: "Beirut Local",
        username: "beirutlocal"
      },
      text
    }
  };
}

describe("worker app", () => {
  it("redirects www and http custom-domain traffic to the canonical apex", async () => {
    const app = createApp({ repository: new InMemoryRepository() });

    const wwwResponse = await app.request("https://www.lownoise.news/demo", {}, env());
    expect(wwwResponse.status).toBe(301);
    expect(wwwResponse.headers.get("location")).toBe("https://lownoise.news/demo");

    const httpResponse = await app.request("http://lownoise.news/feed/personal", {}, env());
    expect(httpResponse.status).toBe(301);
    expect(httpResponse.headers.get("location")).toBe("https://lownoise.news/feed/personal");
  });

  it("detects disabled Telegram sources without queueing processing", async () => {
    const repo = new InMemoryRepository();
    const briefing = await repo.ensureDefaultBriefing();
    const bucket = new FakeBucket();
    const queue = new FakeQueue();
    const app = createApp({ repository: repo, bucket, queue });

    const response = await app.request(
      `/telegram/webhook/${briefing.id}/webhook-secret`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "X-Telegram-Bot-Api-Secret-Token": "webhook-secret"
        },
        body: JSON.stringify(telegramUpdate(1, "Electricite du Liban announced two extra hours of power supply."))
      },
      env()
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, queued: false, sourceDetected: true });
    expect(bucket.objects.has(`telegram/${briefing.id}/1.json`)).toBe(true);
    expect(queue.messages).toHaveLength(0);
    expect(await repo.listSources(briefing.id)).toEqual([
      expect.objectContaining({ title: "Beirut Local", enabled: false })
    ]);
  });

  it("processes enabled sources into published briefing items with evidence and search", async () => {
    const repo = new InMemoryRepository();
    const briefing = await repo.ensureDefaultBriefing();
    const bucket = new FakeBucket();
    const queue = new FakeQueue();
    const app = createApp({ repository: repo, bucket, queue });
    const runtimeEnv = env();

    await app.request(
      `/telegram/webhook/${briefing.id}/webhook-secret`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "X-Telegram-Bot-Api-Secret-Token": "webhook-secret"
        },
        body: JSON.stringify(telegramUpdate(1, "Electricite du Liban announced two extra hours of power supply."))
      },
      runtimeEnv
    );

    await app.request(
      "/api/admin/sources",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-lownoise-admin": "admin-secret"
        },
        body: JSON.stringify({ sourceId: "telegram_-100123", enabled: true })
      },
      runtimeEnv
    );

    const webhookResponse = await app.request(
      `/telegram/webhook/${briefing.id}/webhook-secret`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "X-Telegram-Bot-Api-Secret-Token": "webhook-secret"
        },
        body: JSON.stringify(
          telegramUpdate(2, "Electricite du Liban confirmed two extra hours of power supply tonight.")
        )
      },
      runtimeEnv
    );

    expect(await webhookResponse.json()).toMatchObject({ ok: true, queued: true });
    expect(queue.messages).toHaveLength(1);

    await processQueueMessage(repo, queue.messages[0], new Date("2026-06-16T08:00:00.000Z"));

    const privateFeedResponse = await app.request(`/api/feed/${briefing.slug}`, {}, runtimeEnv);
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
      runtimeEnv
    );

    const feedResponse = await app.request(`/api/feed/${briefing.slug}`, {}, runtimeEnv);
    expect(feedResponse.status).toBe(200);
    const feed = (await feedResponse.json()) as { items: Array<{ summary: string; evidence: Array<{ sourceTitle: string; sourceUrl: string }> }> };
    expect(feed.items).toHaveLength(1);
    expect(feed.items[0].summary).toContain("Electricite du Liban");
    expect(feed.items[0].evidence[0]).toMatchObject({
      sourceTitle: "Beirut Local",
      sourceUrl: "https://t.me/beirutlocal/2"
    });
    expect(JSON.stringify(feed)).not.toMatch(/confidence|sourceCount|chatbot|Q&A/i);

    const searchResponse = await app.request(`/api/feed/${briefing.slug}/search?q=power%20supply`, {}, runtimeEnv);
    const search = (await searchResponse.json()) as { items: unknown[] };
    expect(search.items).toHaveLength(1);
  });

  it("registers Telegram webhook and reports setup health", async () => {
    const repo = new InMemoryRepository();
    await repo.ensureDefaultBriefing();
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const app = createApp({ repository: repo, fetcher: fetcher as unknown as typeof fetch });

    const response = await app.request(
      "/api/admin/telegram/register-webhook",
      {
        method: "POST",
        headers: { "x-lownoise-admin": "admin-secret" }
      },
      env()
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      result: { ok: true },
      webhookUrl: "https://worker.test/telegram/webhook/briefing_default/webhook-secret"
    });

    const healthResponse = await app.request(
      "/api/admin/health",
      { headers: { "x-lownoise-admin": "admin-secret" } },
      env()
    );
    expect(await healthResponse.json()).toMatchObject({
      health: {
        tokenConfigured: true,
        webhookRegistered: true
      }
    });
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

  it("does not expose an ask or chatbot API", async () => {
    const app = createApp({ repository: new InMemoryRepository() });
    const response = await app.request("/api/ask/personal", {}, env());

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not found" });
  });
});
