import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app";
import { hashPassword } from "./auth";
import { publishDueBriefingEditions } from "./editions";
import { processQueueMessage } from "./processor";
import { ingestPublicTelegramChannel } from "./publicTelegram";
import { InMemoryRepository } from "./repository";
import { describeUnusableApifyDataset, enqueueDueSourceRefreshJobs, pollApifySourceRuns, refreshSourceById } from "./sources";
import type { BriefingEdition, BriefingItem, EditionSynthesisAdapter, EventReviewAdapter, NormalizedMessage, SummaryAdapter } from "@distilled/core";
import type { DistilledQueueMessage, Env, ProcessingJobMessage } from "./types";

class FakeBucket {
  objects = new Map<string, string>();

  async put(key: string, value: string): Promise<void> {
    this.objects.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }
}

class FakeQueue {
  messages: ProcessingJobMessage[] = [];

  async send(message: ProcessingJobMessage): Promise<void> {
    this.messages.push(message);
  }
}

class FakeDistilledQueue {
  messages: DistilledQueueMessage[] = [];

  async send(message: DistilledQueueMessage): Promise<void> {
    this.messages.push(message);
  }
}

class FakeEmail {
  messages: Array<{ to: string; from?: string | { email: string; name?: string }; subject: string; text?: string; html?: string }> = [];

  async send(message: { to: string; from?: string | { email: string; name?: string }; subject: string; text?: string; html?: string }): Promise<void> {
    this.messages.push(message);
  }
}

class FailingEmail {
  async send(): Promise<void> {
    const error = new Error("Domain not available for sending") as Error & { code: string };
    error.code = "E_SENDER_DOMAIN_NOT_AVAILABLE";
    throw error;
  }
}

function env(email = new FakeEmail()): Env {
  return {
    ADMIN_SESSION_SECRET: "admin-secret",
    ADMIN_SETUP_TOKEN: "setup-token",
    INTERNAL_MAINTENANCE_SECRET: "internal-secret",
    PUBLIC_WEB_BASE_URL: "https://distilled.news",
    EMAIL_FROM: "Distilled.news <noreply@distilled.news>",
    EMAIL: email
  } as unknown as Env;
}

const publicTelegramHtml = `
  <meta property="og:title" content="Lebanon Updates">
  <main>
    <div class="tgme_widget_message_wrap js-widget_message_wrap"><div class="tgme_widget_message text_not_supported_wrap js-widget_message" data-post="LebUpdate/10">
      <div class="tgme_widget_message_text js-message_text" dir="auto">Electricite du Liban announced two extra hours of power supply tonight.</div>
      <a class="tgme_widget_message_date" href="https://t.me/LebUpdate/10"><time datetime="2026-06-24T23:16:37+00:00" class="time">23:16</time></a>
    </div></div>
  </main>`;

const FIXTURE_NOW = new Date("2026-06-25T00:00:00.000Z");

afterEach(() => {
  vi.useRealTimers();
});

describe("worker app accounts", () => {
  it("keeps a configured feed identity when an imported item has an article title and URL", async () => {
    const repo = new InMemoryRepository();
    const app = createApp({ repository: repo });
    const user = await createVerifiedUser(app, repo, "source-identity@test.com", "Source Identity");
    const briefing = (await repo.getBriefingBySlug(user.account.id, "personal"))!;
    const configured = await repo.upsertConfiguredSource({
      briefingId: briefing.id,
      title: "BBC World",
      provider: "rss",
      kind: "rss_feed",
      input: "rss: https://feeds.bbci.co.uk/news/world/rss.xml",
      sourceUrl: "https://feeds.bbci.co.uk/news/world/rss.xml",
      enabled: true
    });

    const resolved = await repo.upsertSourceFromMessage(briefing.id, {
      id: `${briefing.id}::bbc-article`,
      source: {
        id: configured.id,
        title: "An article headline",
        type: "channel",
        provider: "rss",
        kind: "rss_feed"
      },
      messageId: "bbc-article",
      text: "An article body with enough information for processing.",
      links: ["https://www.bbc.com/news/articles/example"],
      media: [],
      postedAt: "2026-06-25T00:00:00.000Z",
      receivedAt: "2026-06-25T00:00:01.000Z",
      sourceUrl: "https://www.bbc.com/news/articles/example",
      expiresAt: "2026-07-10T00:00:00.000Z"
    });

    expect(resolved).toMatchObject({
      title: "BBC World",
      input: "rss: https://feeds.bbci.co.uk/news/world/rss.xml",
      sourceUrl: "https://feeds.bbci.co.uk/news/world/rss.xml",
      canonicalKey: configured.canonicalKey,
      enabled: true
    });
  });

  it("creates at most one processing job for a raw message", async () => {
    const repo = new InMemoryRepository();
    const app = createApp({ repository: repo });
    const user = await createVerifiedUser(app, repo, "idempotent@test.com", "Idempotent Feed");
    const briefing = await repo.getBriefingBySlug(user.account.id, "personal");
    expect(briefing).not.toBeNull();
    const message: NormalizedMessage = {
      id: `${briefing!.id}::idempotent-message`,
      source: {
        id: "idempotent-source",
        title: "Idempotent Source",
        type: "channel",
        provider: "telegram",
        kind: "telegram_channel"
      },
      messageId: "idempotent-message",
      text: "The transport ministry reopened the coastal road after an inspection.",
      links: [],
      media: [],
      postedAt: "2026-06-25T00:00:00.000Z",
      receivedAt: "2026-06-25T00:00:01.000Z",
      expiresAt: "2026-07-10T00:00:00.000Z"
    };
    const first = await repo.saveRawMessageAndCreateProcessingJob(briefing!.id, message, FIXTURE_NOW);
    const second = await repo.saveRawMessageAndCreateProcessingJob(briefing!.id, message, FIXTURE_NOW);

    expect(second).toBe(first);
    expect(await repo.listProcessingJobs({ briefingId: briefing!.id })).toHaveLength(1);
  });

  it("claims a processing job once so duplicate queue deliveries cannot repeat AI work", async () => {
    const repo = new InMemoryRepository();
    const app = createApp({ repository: repo });
    const user = await createVerifiedUser(app, repo, "lease@test.com", "Lease Feed");
    const briefing = (await repo.getBriefingBySlug(user.account.id, "personal"))!;
    const source = await repo.upsertConfiguredSource({
      briefingId: briefing.id,
      title: "Beirut Wire",
      provider: "rss",
      kind: "rss_feed",
      sourceUrl: "https://example.com/lease.xml",
      enabled: true
    }, FIXTURE_NOW);
    const message: NormalizedMessage = {
      id: `${briefing.id}::lease-message`,
      source: { id: source.id, title: source.title, type: "channel", provider: "rss", kind: "rss_feed" },
      messageId: "lease-message",
      text: "The Lebanese central bank announced a new currency measure in Beirut.",
      links: [], media: [],
      postedAt: "2026-06-25T00:00:00.000Z",
      receivedAt: "2026-06-25T00:00:01.000Z",
      expiresAt: "2026-07-10T00:00:00.000Z"
    };
    const jobId = await repo.saveRawMessageAndCreateProcessingJob(briefing.id, message, FIXTURE_NOW);
    const summarize = vi.fn(async () => "Lebanon's central bank announced a new currency measure in Beirut.");
    const queueMessage = { jobId, briefingId: briefing.id, rawMessageId: message.id };

    await processQueueMessage(repo, queueMessage, FIXTURE_NOW, { summarize });
    await processQueueMessage(repo, queueMessage, FIXTURE_NOW, { summarize });

    expect(summarize).toHaveBeenCalledTimes(1);
    expect((await repo.listProcessingJobs({ briefingId: briefing.id }))[0]).toMatchObject({ state: "completed", attemptCount: 1 });
  });

  it("suggests sources for an owned feed and queues manual refresh asynchronously", async () => {
    const repo = new InMemoryRepository();
    const queue = new FakeDistilledQueue();
    const app = createApp({
      repository: repo,
      queue,
      fetcher: (async () => new Response(JSON.stringify({ articles: [] }), { headers: { "content-type": "application/json" } })) as typeof fetch
    });
    const setup = await app.request("/api/auth/setup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "owner@example.com", username: "owner", password: "password123", setupToken: "setup-token" }) }, env());
    const cookie = setup.headers.get("set-cookie")?.split(";")[0] ?? "";
    const account = await repo.getAccountByEmail("owner@example.com");
    const briefing = (await repo.listBriefings(account!.id))[0];
    const suggestions = await app.request("/api/me/source-suggestions", { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ briefingId: briefing.id, interestProfile: "Lebanon economy and energy", language: "en" }) }, env());
    expect(suggestions.status).toBe(200);
    expect(await suggestions.json()).toMatchObject({ degraded: false, suggestions: expect.arrayContaining([expect.objectContaining({ region: "MENA" })]) });

    await repo.upsertConfiguredSource({ briefingId: briefing.id, title: "Example", provider: "rss", kind: "rss_feed", input: "rss: https://example.com/rss.xml", sourceUrl: "https://example.com/rss.xml", enabled: true }, FIXTURE_NOW);
    const refresh = await app.request("/api/me/sources/refresh", { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ briefingId: briefing.id }) }, env());
    expect(refresh.status).toBe(202);
    expect(await refresh.json()).toMatchObject({ queued: 1, status: "queued", refreshId: expect.stringMatching(/^refresh_/) });
    expect(queue.messages).toEqual([expect.objectContaining({ type: "refresh_source", briefingId: briefing.id })]);
  });

  it("sets up the first verified admin account and session", async () => {
    const repo = new InMemoryRepository();
    const app = createApp({ repository: repo });

    const response = await app.request(
      "/api/auth/setup",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "Admin@Example.com",
          username: "Ammar Mohanna",
          password: "password123",
          setupToken: "setup-token"
        })
      },
      env()
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("dn_session=");
    expect(await response.json()).toMatchObject({
      account: {
        email: "admin@example.com",
        username: "ammar-mohanna",
        role: "admin"
      }
    });
    expect(await repo.countAdmins()).toBe(1);
  });

  it("prevents multiple accounts for the same email and reserves usernames", async () => {
    const repo = new InMemoryRepository();
    const app = createApp({ repository: repo });
    const email = new FakeEmail();

    const first = await app.request(
      "/api/auth/register",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "User@Test.com", username: "User One", password: "password123" })
      },
      env(email)
    );
    expect(first.status).toBe(200);

    const duplicateEmail = await app.request(
      "/api/auth/register",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "user@test.com", username: "Other User", password: "password123" })
      },
      env(email)
    );
    expect(duplicateEmail.status).toBe(409);

    const duplicateUsername = await app.request(
      "/api/auth/register",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "other@test.com", username: "User One", password: "password123" })
      },
      env(email)
    );
    expect(duplicateUsername.status).toBe(409);
  });

  it("returns JSON validation errors for invalid signup payloads", async () => {
    const app = createApp({ repository: new InMemoryRepository() });

    const response = await app.request(
      "/api/auth/register",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "not-an-email", username: "Bad User", password: "short" })
      },
      env()
    );

    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toHaveProperty("error");
  });

  it("rolls back signup accounts when verification email sending fails", async () => {
    const repo = new InMemoryRepository();
    const app = createApp({ repository: repo });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      const response = await app.request(
        "/api/auth/register",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email: "failed@test.com", username: "Failed User", password: "password123" })
        },
        env(new FailingEmail() as unknown as FakeEmail)
      );

      expect(response.status).toBe(502);
      expect(response.headers.get("content-type")).toContain("application/json");
      expect(await response.json()).toEqual({ error: "could not send verification email" });
      expect(await repo.getAccountByEmail("failed@test.com")).toBeNull();
      expect(errorSpy).toHaveBeenCalledWith("Could not send verification email", {
        accountId: "account_1",
        emailDomain: "test.com",
        senderDomain: "distilled.news",
        errorCode: "E_SENDER_DOMAIN_NOT_AVAILABLE",
        error: "Domain not available for sending"
      });
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("verifies email before login and supports password reset", async () => {
    const repo = new InMemoryRepository();
    const app = createApp({ repository: repo });
    const email = new FakeEmail();

    await app.request(
      "/api/auth/register",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "user@test.com", username: "User One", password: "password123" })
      },
      env(email)
    );
    expect(email.messages[0].from).toEqual({ email: "noreply@distilled.news", name: "Distilled.news" });

    const rejectedLogin = await app.request(
      "/api/auth/login",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "user@test.com", password: "password123" })
      },
      env(email)
    );
    expect(rejectedLogin.status).toBe(403);

    const verifyToken = tokenFromMessage(email.messages[0].text);
    const verifyResponse = await app.request(
      "/api/auth/verify-email",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: verifyToken })
      },
      env(email)
    );
    expect(verifyResponse.status).toBe(200);

    const repeatedVerifyResponse = await app.request(
      "/api/auth/verify-email",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: verifyToken })
      },
      env(email)
    );
    expect(repeatedVerifyResponse.status).toBe(200);
    expect(await repeatedVerifyResponse.json()).toMatchObject({
      account: {
        email: "user@test.com",
        emailVerifiedAt: expect.any(String)
      }
    });

    await app.request(
      "/api/auth/password/forgot",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "user@test.com" })
      },
      env(email)
    );
    const resetToken = tokenFromMessage(email.messages[1].text);
    const resetResponse = await app.request(
      "/api/auth/password/reset",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: resetToken, password: "newpass123" })
      },
      env(email)
    );
    expect(resetResponse.status).toBe(200);

    const loginResponse = await app.request(
      "/api/auth/login",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "user@test.com", password: "newpass123" })
      },
      env(email)
    );
    expect(loginResponse.status).toBe(200);
  });

  it("scopes user feed management to the logged-in account", async () => {
    const repo = new InMemoryRepository();
    const app = createApp({ repository: repo });
    const first = await createVerifiedUser(app, repo, "first@test.com", "First User");
    const second = await createVerifiedUser(app, repo, "second@test.com", "Second User");

    const firstBriefings = await app.request("/api/me/briefings", { headers: { cookie: first.cookie } }, env());
    const firstPayload = (await firstBriefings.json()) as { briefings: Array<{ id: string }> };

    const forbidden = await app.request(
      `/api/me/sources?briefingId=${encodeURIComponent(firstPayload.briefings[0].id)}`,
      { headers: { cookie: second.cookie } },
      env()
    );
    expect(forbidden.status).toBe(404);
  });

  it("rejects cross-account source changes and duplicate owner feed slugs", async () => {
    const repo = new InMemoryRepository();
    const app = createApp({ repository: repo });
    const first = await createVerifiedUser(app, repo, "first@test.com", "First User");
    const second = await createVerifiedUser(app, repo, "second@test.com", "Second User");

    const firstBriefingsResponse = await app.request("/api/me/briefings", { headers: { cookie: first.cookie } }, env());
    const secondBriefingsResponse = await app.request("/api/me/briefings", { headers: { cookie: second.cookie } }, env());
    const firstBriefings = (await firstBriefingsResponse.json()) as { briefings: Array<{ id: string }> };
    const secondBriefings = (await secondBriefingsResponse.json()) as { briefings: Array<{ id: string }> };
    const firstSource = await repo.upsertSourceFromMessage(firstBriefings.briefings[0].id, {
      id: "message_1",
      source: { id: "source_1", title: "First Source", type: "channel", username: "FirstSource" },
      messageId: "1",
      text: "first owner message",
      links: [],
      media: [],
      postedAt: "2026-06-16T08:00:00.000Z",
      receivedAt: "2026-06-16T08:00:00.000Z",
      sourceUrl: "https://t.me/FirstSource/1",
      expiresAt: "2026-07-01T08:00:00.000Z"
    });

    const toggleOtherSource = await app.request(
      "/api/me/sources",
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie: second.cookie },
        body: JSON.stringify({
          briefingId: secondBriefings.briefings[0].id,
          sourceId: firstSource.id,
          enabled: true
        })
      },
      env()
    );
    expect(toggleOtherSource.status).toBe(404);

    const deleteOtherSource = await app.request(
      `/api/me/sources/${encodeURIComponent(firstSource.id)}?briefingId=${encodeURIComponent(secondBriefings.briefings[0].id)}`,
      { method: "DELETE", headers: { cookie: second.cookie } },
      env()
    );
    expect(deleteOtherSource.status).toBe(404);
    expect(await repo.getSource(firstSource.id)).not.toBeNull();

    const createCollision = await app.request(
      "/api/me/briefings",
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie: first.cookie },
        body: JSON.stringify({
          id: "briefing_collision",
          slug: "personal",
          title: "Another Feed",
          interestProfile: "Track infrastructure",
          publicFeedEnabled: false,
          paused: false,
          language: "en",
          retentionDays: 15,
          stars: 0
        })
      },
      env()
    );
    expect(createCollision.status).toBe(409);
  });

  it("ingests enabled sources into the owner-scoped public feed", async () => {
    const repo = new InMemoryRepository();
    const bucket = new FakeBucket();
    const queue = new FakeQueue();
    const fetcher = vi.fn(async () => new Response(publicTelegramHtml, { status: 200 }));
    const app = createApp({ repository: repo, bucket, queue, fetcher: fetcher as unknown as typeof fetch, now: () => FIXTURE_NOW });
    const user = await createVerifiedUser(app, repo, "owner@test.com", "Feed Owner");

    const briefingsResponse = await app.request("/api/me/briefings", { headers: { cookie: user.cookie } }, env());
    const { briefings } = (await briefingsResponse.json()) as { briefings: Array<{ id: string; slug: string }> };
    const briefingId = briefings[0].id;

    await app.request(
      "/api/me/briefings",
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie: user.cookie },
        body: JSON.stringify({ ...briefings[0], title: "Personal Briefing", interestProfile: "Track Lebanese infrastructure", publicFeedEnabled: true, paused: false, language: "en", intensity: "medium", retentionDays: 15, stars: 0 })
      },
      env()
    );

    const sourceResponse = await app.request(
      "/api/me/sources",
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie: user.cookie },
        body: JSON.stringify({ briefingId, url: "https://t.me/LebUpdate" })
      },
      env()
    );
    expect(sourceResponse.status).toBe(200);
    expect(queue.messages).toHaveLength(1);
    const savedBriefing = await repo.getBriefingById(briefingId);
    expect(savedBriefing).not.toBeNull();
    await publishDueBriefingEditions({
      repo,
      briefings: [{ ...savedBriefing!, nextBriefingAt: "2026-06-25T00:00:00.000Z" }],
      now: new Date("2026-06-25T00:08:00.000Z")
    });

    const feedResponse = await app.request("/api/feed/feed-owner/personal", {}, env());
    expect(feedResponse.status).toBe(200);
    const feed = (await feedResponse.json()) as {
      briefing: { nextBriefingAt?: string };
      editions: Array<{ id: string; summary: string; sections: unknown[] }>;
    };
    expect(feed.briefing.nextBriefingAt).toBe("2026-06-25T01:00:00.000Z");
    expect(feed.editions[0].summary).toContain("Electricite du Liban");
    expect(feed.editions[0].summary).toContain("[1]");
    expect(feed.editions[0].sections).toEqual([]);

    const editionResponse = await app.request(`/api/feed/feed-owner/personal/editions/${feed.editions[0].id}`, {}, env());
    expect(editionResponse.status).toBe(200);
    const edition = (await editionResponse.json()) as { edition: { sections: Array<{ evidence: Array<{ sourceUrl: string }> }> } };
    expect(edition.edition.sections[0].evidence[0].sourceUrl).toBe("https://t.me/LebUpdate/10");

    const oldRoute = await app.request("/api/feed/personal", {}, env());
    expect(oldRoute.status).toBe(404);
  });

  it("falls back across Telegram public hosts when the primary host is unavailable", async () => {
    const repo = new InMemoryRepository();
    const bucket = new FakeBucket();
    const queue = new FakeQueue();
    const fetcher = vi.fn(async (request: RequestInfo | URL) => {
      const host = new URL(String(request)).hostname;
      if (host === "telegram.me") return new Response("upstream unavailable", { status: 530 });
      if (host === "telegram.dog") return new Response(publicTelegramHtml, { status: 200 });
      return new Response("unexpected host", { status: 500 });
    });
    const app = createApp({ repository: repo });
    const user = await createVerifiedUser(app, repo, "owner@test.com", "Feed Owner");
    const briefing = await repo.getBriefingBySlug(user.account.id, "personal");
    expect(briefing).not.toBeNull();

    const result = await ingestPublicTelegramChannel({
      briefing: briefing!,
      url: "https://t.me/LebUpdate",
      repo,
      bucket,
      queue,
      activateSource: true,
      fetcher: fetcher as unknown as typeof fetch,
      now: FIXTURE_NOW
    });

    expect(result.imported).toBe(1);
    expect(new Set(fetcher.mock.calls.map(([request]) => new URL(String(request)).hostname))).toEqual(new Set([
      "telegram.me",
      "telegram.dog",
      "t.me"
    ]));
  });

  it("advances scheduled windows and publishes an explicit empty hourly slot", async () => {
    const repo = new InMemoryRepository();
    const app = createApp({ repository: repo });
    const user = await createVerifiedUser(app, repo, "owner@test.com", "Feed Owner");
    const briefing = await repo.getBriefingBySlug(user.account.id, "personal");
    expect(briefing).not.toBeNull();

    const scheduled = { ...briefing!, nextBriefingAt: "2026-06-16T09:00:00.000Z" };
    const published = await publishDueBriefingEditions({
      repo,
      briefings: [scheduled],
      now: new Date("2026-06-16T09:08:00.000Z")
    });
    const duplicate = await publishDueBriefingEditions({
      repo,
      briefings: [scheduled],
      now: new Date("2026-06-16T09:09:00.000Z")
    });

    expect(published).toBe(0);
    expect(duplicate).toBe(0);
    expect(Array.from(repo.briefingWindows.values())).toEqual([
      expect.objectContaining({ briefingId: briefing!.id, state: "empty", messageCount: 0 })
    ]);
    expect(await repo.listBriefingEditions(briefing!.id, true)).toEqual([
      expect.objectContaining({ status: "empty", windowEnd: "2026-06-16T09:00:00.000Z" })
    ]);
    const saved = await repo.getBriefingById(briefing!.id);
    expect(saved?.nextBriefingAt).toBe("2026-06-16T10:00:00.000Z");
  });

  it("recovers a recent empty window once when it contains qualifying source evidence", async () => {
    const repo = new InMemoryRepository();
    const app = createApp({ repository: repo });
    const user = await createVerifiedUser(app, repo, "recovery-owner@test.com", "Recovery Owner");
    const briefing = await repo.getBriefingBySlug(user.account.id, "personal");
    const scheduled = await repo.upsertBriefing({
      ...briefing!,
      interestProfile: "Track Lebanese infrastructure and public safety updates.",
      intensity: "medium",
      nextBriefingAt: "2026-06-16T10:00:00.000Z"
    });
    await repo.saveRawMessage(scheduled.id, {
      id: `${scheduled.id}::recoverable-power-update`,
      source: { id: "src_power", title: "Power Wire", type: "channel", provider: "rss", kind: "rss_feed" },
      messageId: "recoverable-power-update",
      text: "Electricite du Liban approved two extra hours of power supply after fuel deliveries arrived.",
      links: [],
      media: [],
      postedAt: "2026-06-16T08:30:00.000Z",
      receivedAt: "2026-06-16T08:31:00.000Z",
      sourceUrl: "https://example.com/power",
      expiresAt: "2026-07-01T08:30:00.000Z"
    });
    const claim = await repo.claimBriefingWindow({
      briefingId: scheduled.id,
      cadence: "hourly",
      windowStart: "2026-06-16T08:00:00.000Z",
      windowEnd: "2026-06-16T09:00:00.000Z",
      leaseMs: 90_000
    }, new Date("2026-06-16T08:58:00.000Z"));
    await repo.completeBriefingWindow({
      id: claim!.id,
      leaseToken: claim!.leaseToken,
      state: "empty",
      messageCount: 1,
      contentCutoffAt: "2026-06-16T08:58:00.000Z",
      qualityState: "ready"
    }, new Date("2026-06-16T08:58:00.000Z"));

    expect(await publishDueBriefingEditions({
      repo,
      briefings: [scheduled],
      now: new Date("2026-06-16T09:02:00.000Z")
    })).toBe(1);
    const [edition] = await repo.listBriefingEditions(scheduled.id, true, new Date("2026-06-16T09:02:00.000Z"));
    expect(edition).toMatchObject({ windowStart: "2026-06-16T08:00:00.000Z", windowEnd: "2026-06-16T09:00:00.000Z" });
    expect(edition.summary).toContain("Electricite du Liban");
    expect(await publishDueBriefingEditions({
      repo,
      briefings: [scheduled],
      now: new Date("2026-06-16T09:03:00.000Z")
    })).toBe(0);
  });

  it("carries news received after the boundary into the following hourly brief", async () => {
    const repo = new InMemoryRepository();
    const app = createApp({ repository: repo });
    const user = await createVerifiedUser(app, repo, "owner@test.com", "Feed Owner");
    const briefing = await repo.getBriefingBySlug(user.account.id, "personal");
    expect(briefing).not.toBeNull();
    const scheduledBriefing = await repo.upsertBriefing({
      ...briefing!,
      nextBriefingAt: "2026-06-16T09:00:00.000Z"
    });

    await repo.saveRawMessage(scheduledBriefing.id, {
      id: `${scheduledBriefing.id}::power_update`,
      source: { id: "src_power", title: "Power Wire", type: "channel", provider: "telegram", kind: "telegram_channel" },
      messageId: "power-update",
      text: "Electricite du Liban confirmed two extra hours of power supply tonight.",
      links: [],
      media: [],
      postedAt: "2026-06-16T08:30:00.000Z",
      receivedAt: "2026-06-16T09:04:00.000Z",
      sourceUrl: "https://t.me/power/1",
      expiresAt: "2026-07-01T08:30:00.000Z"
    });

    const published = await publishDueBriefingEditions({
      repo,
      briefings: [scheduledBriefing],
      now: new Date("2026-06-16T09:07:00.000Z")
    });
    expect(published).toBe(0);
    const nextBriefing = await repo.getBriefingById(scheduledBriefing.id);
    expect(nextBriefing?.nextBriefingAt).toBe("2026-06-16T10:00:00.000Z");

    const carriedForward = await publishDueBriefingEditions({
      repo,
      briefings: [nextBriefing!],
      now: new Date("2026-06-16T10:00:00.000Z")
    });
    expect(carriedForward).toBe(1);
    const [edition] = await repo.listBriefingEditions(
      scheduledBriefing.id,
      true,
      new Date("2026-06-16T10:00:00.000Z")
    );
    expect(edition.windowStart).toBe("2026-06-16T09:00:00.000Z");
    expect(edition.summary).toContain("Electricite du Liban");
  });

  it("publishes an idempotent hourly edition at the boundary", async () => {
    const repo = new InMemoryRepository();
    const app = createApp({ repository: repo });
    const user = await createVerifiedUser(app, repo, "owner@test.com", "Feed Owner");
    const briefing = await repo.getBriefingBySlug(user.account.id, "personal");
    const scheduled = await repo.upsertBriefing({
      ...briefing!,
      nextBriefingAt: "2026-06-16T10:00:00.000Z"
    });
    await repo.saveRawMessage(scheduled.id, {
      id: `${scheduled.id}::prepared_update`,
      source: { id: "src_wire", title: "News Wire", type: "channel", provider: "telegram", kind: "telegram_channel" },
      messageId: "prepared-update",
      text: "Electricite du Liban announced two additional hours of power supply after fuel deliveries arrived.",
      links: [],
      media: [],
      postedAt: "2026-06-16T09:45:00.000Z",
      receivedAt: "2026-06-16T09:50:00.000Z",
      sourceUrl: "https://t.me/newswire/1",
      expiresAt: "2026-07-01T09:45:00.000Z"
    });

    expect(await publishDueBriefingEditions({ repo, briefings: [scheduled], now: new Date("2026-06-16T09:59:59.000Z") })).toBe(0);
    expect(await repo.listBriefingEditions(scheduled.id, true, new Date("2026-06-16T09:59:59.000Z"))).toEqual([]);
    expect(await publishDueBriefingEditions({ repo, briefings: [scheduled], now: new Date("2026-06-16T10:00:00.000Z") })).toBe(1);
    const [visible] = await repo.listBriefingEditions(scheduled.id, true, new Date("2026-06-16T10:00:00.000Z"));
    expect(visible.summary).toContain("Electricite du Liban");
    expect(Array.from(repo.briefingWindows.values())).toHaveLength(1);
    expect(await publishDueBriefingEditions({
      repo,
      briefings: [(await repo.getBriefingById(scheduled.id))!],
      now: new Date("2026-06-16T09:59:00.000Z")
    })).toBe(0);

    const beforeBoundaryApp = createApp({
      repository: repo,
      now: () => new Date("2026-06-16T09:59:00.000Z")
    });
    const beforeBoundaryResponse = await beforeBoundaryApp.request("/api/feed/feed-owner/personal", {}, env());
    const beforeBoundaryFeed = await beforeBoundaryResponse.json() as {
      briefing: { nextBriefingAt?: string };
    };
    expect(beforeBoundaryFeed.briefing.nextBriefingAt).toBe("2026-06-16T11:00:00.000Z");
    expect((await repo.getHealth(scheduled.id, new Date("2026-06-16T09:59:00.000Z"))).nextBriefingAt)
      .toBe("2026-06-16T11:00:00.000Z");

    const atBoundaryApp = createApp({
      repository: repo,
      now: () => new Date("2026-06-16T10:00:00.000Z")
    });
    const atBoundaryResponse = await atBoundaryApp.request("/api/feed/feed-owner/personal", {}, env());
    const atBoundaryFeed = await atBoundaryResponse.json() as {
      briefing: { nextBriefingAt?: string };
    };
    expect(atBoundaryFeed.briefing.nextBriefingAt).toBe("2026-06-16T11:00:00.000Z");
  });

  it("retires public manual briefing requests", async () => {
    const repo = new InMemoryRepository();
    const app = createApp({
      repository: repo,
      now: () => new Date("2026-06-16T09:30:00.000Z")
    });
    const user = await createVerifiedUser(app, repo, "owner@test.com", "Feed Owner");
    const briefing = await repo.getBriefingBySlug(user.account.id, "personal");
    expect(briefing).not.toBeNull();
    const scheduledBriefing = await repo.upsertBriefing({
      ...briefing!,
      interestProfile: "Track Lebanese infrastructure and public service updates.",
      nextBriefingAt: "2026-06-16T10:00:00.000Z"
    });

    await repo.saveBriefingEdition({
      id: "edition_previous",
      briefingId: scheduledBriefing.id,
      cadence: "hourly",
      windowStart: "2026-06-16T08:00:00.000Z",
      windowEnd: "2026-06-16T09:00:00.000Z",
      title: "Verified updates",
      summary: "Verified updates: Earlier public service update [1].",
      sections: [
        {
          title: "Infrastructure",
          summary: "Earlier public service update.",
          evidence: []
        }
      ],
      status: "published",
      publishedAt: "2026-06-16T09:00:00.000Z",
      createdAt: "2026-06-16T09:00:00.000Z",
      updatedAt: "2026-06-16T09:00:00.000Z"
    });
    await repo.saveRawMessage(scheduledBriefing.id, {
      id: `${scheduledBriefing.id}::manual_power_update`,
      source: { id: "src_power", title: "Power Wire", type: "channel", provider: "telegram", kind: "telegram_channel" },
      messageId: "manual-power-update",
      text: "Electricite du Liban confirmed two extra hours of power supply tonight.",
      links: [],
      media: [],
      postedAt: "2026-06-16T09:15:00.000Z",
      receivedAt: "2026-06-16T09:15:10.000Z",
      sourceUrl: "https://t.me/power/2",
      expiresAt: "2026-07-01T09:15:00.000Z"
    });

    const response = await app.request(
      "/api/feed/feed-owner/personal/request-summary",
      { method: "POST" },
      env()
    );
    expect(response.status).toBe(410);
    expect(await response.json()).toEqual({
      error: "Hourly briefs publish automatically; manual briefing is retired."
    });
    expect((await repo.getBriefingById(scheduledBriefing.id))?.nextBriefingAt).toBe("2026-06-16T10:00:00.000Z");
  });

  it("publishes every arrival in the canonical hourly window", async () => {
    const repo = new InMemoryRepository();
    const app = createApp({ repository: repo });
    const user = await createVerifiedUser(app, repo, "owner@test.com", "Feed Owner");
    const briefing = await repo.getBriefingBySlug(user.account.id, "personal");
    expect(briefing).not.toBeNull();
    const scheduledBriefing = await repo.upsertBriefing({
      ...briefing!,
      interestProfile: "Track Lebanese infrastructure and public service updates.",
      nextBriefingAt: "2026-06-16T10:00:00.000Z"
    });

    await repo.saveBriefingEdition({
      id: "edition_previous",
      briefingId: scheduledBriefing.id,
      cadence: "hourly",
      windowStart: "2026-06-16T08:00:00.000Z",
      windowEnd: "2026-06-16T09:00:00.000Z",
      title: "Verified updates",
      summary: "Verified updates: Earlier public service update [1].",
      sections: [
        {
          title: "Infrastructure",
          summary: "Earlier public service update.",
          evidence: []
        }
      ],
      status: "published",
      publishedAt: "2026-06-16T09:00:00.000Z",
      createdAt: "2026-06-16T09:00:00.000Z",
      updatedAt: "2026-06-16T09:00:00.000Z"
    });

    await repo.saveRawMessage(scheduledBriefing.id, {
      id: `${scheduledBriefing.id}::manual_power_update`,
      source: { id: "src_power", title: "Power Wire", type: "channel", provider: "telegram", kind: "telegram_channel" },
      messageId: "manual-power-update",
      text: "Electricite du Liban confirmed two extra hours of power supply tonight.",
      links: [],
      media: [],
      postedAt: "2026-06-16T09:15:00.000Z",
      receivedAt: "2026-06-16T09:15:10.000Z",
      sourceUrl: "https://t.me/power/2",
      expiresAt: "2026-07-01T09:15:00.000Z"
    });
    await repo.saveRawMessage(scheduledBriefing.id, {
      id: `${scheduledBriefing.id}::scheduled_water_update`,
      source: { id: "src_water", title: "Water Wire", type: "channel", provider: "telegram", kind: "telegram_channel" },
      messageId: "scheduled-water-update",
      text: "Beirut Water Authority announced a maintenance outage from 10 p.m. tonight.",
      links: [],
      media: [],
      postedAt: "2026-06-16T09:45:00.000Z",
      receivedAt: "2026-06-16T09:45:10.000Z",
      sourceUrl: "https://t.me/water/3",
      expiresAt: "2026-07-01T09:45:00.000Z"
    });

    const published = await publishDueBriefingEditions({
      repo,
      briefings: [(await repo.getBriefingById(scheduledBriefing.id))!],
      now: new Date("2026-06-16T10:07:00.000Z")
    });
    expect(published).toBe(1);

    const editions = await repo.listBriefingEditions(
      scheduledBriefing.id,
      true,
      new Date("2026-06-16T10:01:00.000Z"),
      5
    );
    expect(editions[0].windowStart).toBe("2026-06-16T09:00:00.000Z");
    expect(editions[0].windowEnd).toBe("2026-06-16T10:00:00.000Z");
    expect(editions[0].summary).toContain("Beirut Water Authority");
    expect(editions[0].summary).toContain("Electricite du Liban");
    expect((await repo.getBriefingById(scheduledBriefing.id))?.nextBriefingAt).toBe("2026-06-16T11:00:00.000Z");
  });

  it("processes stale catch-up windows oldest first without assigning future arrivals backward", async () => {
    const repo = new InMemoryRepository();
    const app = createApp({ repository: repo });
    const user = await createVerifiedUser(app, repo, "owner@test.com", "Feed Owner");
    const briefing = await repo.getBriefingBySlug(user.account.id, "personal");
    expect(briefing).not.toBeNull();

    await repo.saveRawMessage(briefing!.id, {
      id: `${briefing!.id}::latest_power_update`,
      source: { id: "src_power", title: "Power Wire", type: "channel", provider: "telegram", kind: "telegram_channel" },
      messageId: "latest-power-update",
      text: "Electricite du Liban confirmed two extra hours of power supply tonight.",
      links: [],
      media: [],
      postedAt: "2026-06-16T08:30:00.000Z",
      receivedAt: "2026-06-16T09:04:00.000Z",
      sourceUrl: "https://t.me/power/1",
      expiresAt: "2026-07-01T08:30:00.000Z"
    });

    const published = await publishDueBriefingEditions({
      repo,
      briefings: [{ ...briefing!, nextBriefingAt: "2026-06-16T03:00:00.000Z" }],
      now: new Date("2026-06-16T09:08:00.000Z")
    });

    expect(published).toBe(0);
    const editions = await repo.listBriefingEditions(briefing!.id, true);
    expect(editions).toEqual([
      expect.objectContaining({ status: "empty", windowEnd: "2026-06-16T03:00:00.000Z" })
    ]);
    expect(Array.from(repo.briefingWindows.values())[0]).toMatchObject({
      windowEnd: "2026-06-16T03:00:00.000Z",
      state: "empty",
      contentCutoffAt: "2026-06-16T03:00:00.000Z"
    });
    expect((await repo.getBriefingById(briefing!.id))?.nextBriefingAt).toBe("2026-06-16T04:00:00.000Z");
  });

  it("shows explicit empty editions in the public feed and detail", async () => {
    const repo = new InMemoryRepository();
    const app = createApp({ repository: repo });
    const user = await createVerifiedUser(app, repo, "owner@test.com", "Feed Owner");
    const briefing = await repo.getBriefingBySlug(user.account.id, "personal");
    expect(briefing).not.toBeNull();

    await repo.saveBriefingEdition({
      id: "edition_empty",
      briefingId: briefing!.id,
      cadence: "hourly",
      windowStart: "2026-06-16T07:00:00.000Z",
      windowEnd: "2026-06-16T08:00:00.000Z",
      title: "Hourly brief",
      summary: "No verified updates in this hourly brief.",
      sections: [
        {
          title: "No updates",
          summary: "No verified updates in this hourly brief.",
          evidence: []
        }
      ],
      status: "empty",
      publishedAt: "2026-06-16T08:00:00.000Z",
      createdAt: "2026-06-16T08:00:00.000Z",
      updatedAt: "2026-06-16T08:00:00.000Z"
    });

    const feedResponse = await app.request("/api/feed/feed-owner/personal", {}, env());
    expect(feedResponse.status).toBe(200);
    const feed = (await feedResponse.json()) as { editions: unknown[] };
    expect(feed.editions).toEqual([expect.objectContaining({ id: "edition_empty", status: "empty" })]);

    const detailResponse = await app.request("/api/feed/feed-owner/personal/editions/edition_empty", {}, env());
    expect(detailResponse.status).toBe(200);

    const searchResponse = await app.request("/api/feed/feed-owner/personal/search?q=verified", {}, env());
    expect(searchResponse.status).toBe(200);
    const search = (await searchResponse.json()) as { editions: unknown[] };
    expect(search.editions).toEqual([expect.objectContaining({ id: "edition_empty", status: "empty" })]);
  });

  it("saves supported feed cadence while keeping briefing time internal", async () => {
    const repo = new InMemoryRepository();
    const app = createApp({ repository: repo });
    const user = await createVerifiedUser(app, repo, "owner@test.com", "Feed Owner");
    const briefing = await repo.getBriefingBySlug(user.account.id, "personal");
    expect(briefing).not.toBeNull();

    const saveResponse = await app.request(
      "/api/me/briefings",
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie: user.cookie },
        body: JSON.stringify({
          ...briefing!,
          briefingCadence: "daily",
          briefingTimeOfDay: "08:30",
          briefingTimezone: "Asia/Beirut"
        })
      },
      env()
    );
    expect(saveResponse.status).toBe(200);

    const listResponse = await app.request("/api/me/briefings", { headers: { cookie: user.cookie } }, env());
    const payload = (await listResponse.json()) as {
      briefings: Array<{ briefingCadence: string; briefingTimeOfDay: string; briefingTimezone: string; nextBriefingAt?: string }>;
    };
    expect(payload.briefings[0].briefingCadence).toBe("daily");
    expect(payload.briefings[0].briefingTimeOfDay).toBe("00:00");
    expect(payload.briefings[0].briefingTimezone).toBe("Asia/Beirut");
    expect(payload.briefings[0].nextBriefingAt).toBeTruthy();
  });

  it("normalizes monthly cadence to weekly", async () => {
    const repo = new InMemoryRepository();
    const app = createApp({ repository: repo });
    const user = await createVerifiedUser(app, repo, "owner@test.com", "Feed Owner");
    const briefing = await repo.getBriefingBySlug(user.account.id, "personal");
    expect(briefing).not.toBeNull();

    const saveResponse = await app.request(
      "/api/me/briefings",
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie: user.cookie },
        body: JSON.stringify({
          ...briefing!,
          briefingCadence: "monthly",
          briefingTimeOfDay: "08:30"
        })
      },
      env()
    );
    expect(saveResponse.status).toBe(200);
    const payload = (await saveResponse.json()) as {
      briefing: { briefingCadence: string; briefingTimeOfDay: string };
    };
    expect(payload.briefing.briefingCadence).toBe("weekly");
    expect(payload.briefing.briefingTimeOfDay).toBe("00:00");
  });

  it("serves synthesized public summaries for old count-style edition rows", async () => {
    const repo = new InMemoryRepository();
    const app = createApp({ repository: repo });
    const user = await createVerifiedUser(app, repo, "owner@test.com", "Feed Owner");
    const briefing = await repo.getBriefingBySlug(user.account.id, "personal");
    expect(briefing).not.toBeNull();

    await repo.saveBriefingEdition({
      id: "edition_count_summary",
      briefingId: briefing!.id,
      cadence: "hourly",
      windowStart: "2026-06-16T07:00:00.000Z",
      windowEnd: "2026-06-16T08:00:00.000Z",
      title: "Hourly brief",
      summary: "2 updates in this hourly brief.",
      sections: [
        {
          title: "Infrastructure",
          summary: "Electricite du Liban confirmed two extra hours of power supply tonight.",
          evidence: []
        },
        {
          title: "Security",
          summary: "The coastal road reopened after an overnight security closure.",
          evidence: []
        }
      ],
      status: "published",
      publishedAt: "2026-06-16T08:00:00.000Z",
      createdAt: "2026-06-16T08:00:00.000Z",
      updatedAt: "2026-06-16T08:00:00.000Z"
    });

    const feedResponse = await app.request("/api/feed/feed-owner/personal", {}, env());
    expect(feedResponse.status).toBe(200);
    const feed = (await feedResponse.json()) as { editions: Array<{ summary: string; sections: unknown[] }> };
    expect(feed.editions[0].summary).toContain("Electricite du Liban");
    expect(feed.editions[0].summary).toContain("[1]");
    expect(feed.editions[0].summary).not.toContain("2 updates in this hourly brief");
    expect(feed.editions[0].sections).toEqual([]);

    const detailResponse = await app.request("/api/feed/feed-owner/personal/editions/edition_count_summary", {}, env());
    expect(detailResponse.status).toBe(200);
    const detail = (await detailResponse.json()) as { edition: { summary: string; sections: unknown[] } };
    expect(detail.edition.summary).toBe(feed.editions[0].summary);
    expect(detail.edition.sections).toHaveLength(2);
  });

  it("preserves a validated saved editorial summary and its tiers in the public API", async () => {
    const repo = new InMemoryRepository();
    const app = createApp({ repository: repo });
    const user = await createVerifiedUser(app, repo, "owner@test.com", "Feed Owner");
    const briefing = await repo.getBriefingBySlug(user.account.id, "personal");
    expect(briefing).not.toBeNull();

    await repo.saveBriefingEdition({
      id: "edition_editorial",
      briefingId: briefing!.id,
      cadence: "hourly",
      windowStart: "2026-06-16T07:00:00.000Z",
      windowEnd: "2026-06-16T08:00:00.000Z",
      title: "Verified updates",
      summary: "The coastal road and airport runway reopened after separate inspections and maintenance [1] [2].",
      sections: [
        { title: "Coastal road reopens", summary: "The army reopened the coastal road after completing a security inspection.", evidence: [], tier: "top" },
        { title: "Airport runway reopens", summary: "The airport announced that the eastern runway reopened after maintenance.", evidence: [], tier: "top" },
        { title: "Water service restored", summary: "The water authority restored service to three northern districts after repairs.", evidence: [], tier: "additional" }
      ],
      status: "published",
      publishedAt: "2026-06-16T08:00:00.000Z",
      createdAt: "2026-06-16T08:00:00.000Z",
      updatedAt: "2026-06-16T08:00:00.000Z"
    });

    const response = await app.request("/api/feed/feed-owner/personal/editions/edition_editorial", {}, env());
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { edition: BriefingEdition };
    expect(payload.edition.summary).toBe("The coastal road and airport runway reopened after separate inspections and maintenance [1] [2].");
    expect(payload.edition.sections.map((section) => section.tier)).toEqual(["top", "top", "additional"]);
  });

  it("publishes a deterministic tiered fallback when edition synthesis fails", async () => {
    const repo = new InMemoryRepository();
    const app = createApp({ repository: repo });
    const user = await createVerifiedUser(app, repo, "owner@test.com", "Feed Owner");
    const briefing = await repo.getBriefingBySlug(user.account.id, "personal");
    expect(briefing).not.toBeNull();
    const scheduled = await repo.upsertBriefing({ ...briefing!, nextBriefingAt: "2026-06-16T09:00:00.000Z" });
    for (const [id, text, minute] of [
      ["power", "Electricite du Liban confirmed two extra hours of power supply tonight.", "10"],
      ["bank", "Lebanon's central bank announced that the monthly inflation rate fell to 4 percent.", "20"]
    ] as const) {
      await repo.saveRawMessage(scheduled.id, {
        id: `${scheduled.id}::${id}`,
        source: { id: `source_${id}`, title: id === "power" ? "Power Wire" : "Economy Wire", type: "channel", provider: "telegram", kind: "telegram_channel" },
        messageId: id,
        text,
        links: [], media: [],
        postedAt: `2026-06-16T08:${minute}:00.000Z`, receivedAt: `2026-06-16T08:${minute}:10.000Z`,
        sourceUrl: `https://t.me/public/${id}`, expiresAt: "2026-07-01T08:00:00.000Z"
      });
    }
    const synthesisAdapter: EditionSynthesisAdapter = { synthesize: vi.fn(async () => { throw new Error("timeout"); }) };

    expect(await publishDueBriefingEditions({
      repo, briefings: [scheduled], now: new Date("2026-06-16T09:08:00.000Z"),
      editionSynthesisAdapter: synthesisAdapter, editionSynthesisMode: "all"
    })).toBe(1);
    const [edition] = await repo.listBriefingEditions(scheduled.id, true, new Date("2026-06-16T09:02:00.000Z"), 1);
    expect(edition.summary).toContain("Electricite du Liban");
    expect(edition.sections).toHaveLength(2);
    expect(edition.sections.every((section) => section.tier === "top")).toBe(true);
  });

  it("uses edition synthesis to make a single story standalone", async () => {
    const repo = new InMemoryRepository();
    const app = createApp({ repository: repo });
    const user = await createVerifiedUser(app, repo, "single-story@test.com", "Single Story");
    const briefing = (await repo.getBriefingBySlug(user.account.id, "personal"))!;
    const scheduled = await repo.upsertBriefing({
      ...briefing,
      nextBriefingAt: "2026-06-16T09:00:00.000Z"
    });
    await repo.saveRawMessage(scheduled.id, {
      id: `${scheduled.id}::power`,
      source: {
        id: "source_power", title: "Power Wire", type: "channel",
        provider: "telegram", kind: "telegram_channel"
      },
      messageId: "power",
      text: "Electricite du Liban confirmed two extra hours of power supply tonight after fuel deliveries arrived.",
      links: [], media: [],
      postedAt: "2026-06-16T08:10:00.000Z",
      receivedAt: "2026-06-16T08:10:10.000Z",
      sourceUrl: "https://t.me/public/power",
      expiresAt: "2026-07-01T08:10:00.000Z"
    });
    const synthesize = vi.fn(async () => ({
      overview: [{
        text: "Electricite du Liban confirmed two extra hours of power supply tonight after fuel deliveries arrived.",
        sectionIndexes: [1]
      }],
      topSectionIndexes: [1],
      sections: [{
        sectionIndexes: [1],
        title: "Power supply extended",
        summary: "Electricite du Liban confirmed two extra hours of power supply tonight after fuel deliveries arrived."
      }]
    }));

    expect(await publishDueBriefingEditions({
      repo,
      briefings: [scheduled],
      now: new Date("2026-06-16T09:08:00.000Z"),
      editionSynthesisAdapter: { synthesize },
      editionSynthesisMode: "all"
    })).toBe(1);
    const [edition] = await repo.listBriefingEditions(
      scheduled.id,
      true,
      new Date("2026-06-16T09:02:00.000Z"),
      1
    );
    expect(synthesize).toHaveBeenCalledTimes(1);
    expect(edition).toMatchObject({
      generationMode: "ai",
      summary: "Electricite du Liban confirmed two extra hours of power supply tonight after fuel deliveries arrived [1]."
    });
    expect(edition.sections[0].summary).toBe(
      "Electricite du Liban confirmed two extra hours of power supply tonight after fuel deliveries arrived."
    );
  });

  it("uses the summary adapter to localize scheduled Arabic edition sections", async () => {
    const repo = new InMemoryRepository();
    const app = createApp({ repository: repo });
    const user = await createVerifiedUser(app, repo, "owner@test.com", "Feed Owner");
    const briefing = await repo.getBriefingBySlug(user.account.id, "personal");
    expect(briefing).not.toBeNull();
    await repo.upsertBriefing({
      ...briefing!,
      language: "ar",
      interestProfile: "Track Lebanese infrastructure and power supply updates."
    });
    const savedBriefing = await repo.getBriefingById(briefing!.id);
    expect(savedBriefing).not.toBeNull();

    const message: NormalizedMessage = {
      id: `${briefing!.id}::english_power_update`,
      source: { id: "src_power", title: "Power Wire", type: "channel", provider: "telegram", kind: "telegram_channel" },
      messageId: "english-power-update",
      text: "Electricite du Liban announced two extra hours of power supply tonight.",
      links: [],
      media: [],
      postedAt: "2026-06-16T08:15:00.000Z",
      receivedAt: "2026-06-16T08:15:10.000Z",
      sourceUrl: "https://t.me/power/1",
      expiresAt: "2026-07-01T08:15:00.000Z"
    };
    await repo.saveRawMessage(briefing!.id, message);
    const summarize = vi.fn(async () => "أعلنت كهرباء لبنان زيادة التغذية ساعتين هذه الليلة.");
    const summaryAdapter: SummaryAdapter = { summarize };

    await publishDueBriefingEditions({
      repo,
      briefings: [{ ...savedBriefing!, nextBriefingAt: "2026-06-16T09:00:00.000Z" }],
      now: new Date("2026-06-16T09:08:00.000Z"),
      summaryAdapter
    });

    const feedResponse = await app.request("/api/feed/feed-owner/personal", {}, env());
    expect(feedResponse.status).toBe(200);
    const feed = (await feedResponse.json()) as { editions: Array<{ id: string; summary: string }> };
    expect(feed.editions[0].summary).toContain("أعلنت كهرباء لبنان");
    expect(feed.editions[0].summary).toContain("أعلنت كهرباء لبنان");
    expect(feed.editions[0].summary).not.toContain("Electricite du Liban");

    const editionResponse = await app.request(`/api/feed/feed-owner/personal/editions/${feed.editions[0].id}`, {}, env());
    expect(editionResponse.status).toBe(200);
    const edition = (await editionResponse.json()) as { edition: { sections: Array<{ title: string; summary: string }> } };
    expect(edition.edition.sections[0].title).toBe("بنية تحتية");
    expect(edition.edition.sections[0].summary).toBe("أعلنت كهرباء لبنان زيادة التغذية ساعتين هذه الليلة.");
    expect(summarize).toHaveBeenCalledTimes(1);
  });

  it("normalizes old Arabic section titles in public edition detail", async () => {
    const repo = new InMemoryRepository();
    const app = createApp({ repository: repo });
    const user = await createVerifiedUser(app, repo, "owner@test.com", "Feed Owner");
    const briefing = await repo.getBriefingBySlug(user.account.id, "personal");
    expect(briefing).not.toBeNull();
    await repo.upsertBriefing({ ...briefing!, language: "ar" });

    await repo.saveBriefingEdition({
      id: "edition_old_arabic_title",
      briefingId: briefing!.id,
      cadence: "hourly",
      windowStart: "2026-06-16T07:00:00.000Z",
      windowEnd: "2026-06-16T08:00:00.000Z",
      title: "Hourly brief",
      summary: "في هذه الساعة: أعلنت كهرباء لبنان زيادة التغذية ساعتين هذه الليلة [1].",
      sections: [
        {
          title: "Infrastructure",
          summary: "أعلنت كهرباء لبنان زيادة التغذية ساعتين هذه الليلة.",
          evidence: []
        }
      ],
      status: "published",
      publishedAt: "2026-06-16T08:00:00.000Z",
      createdAt: "2026-06-16T08:00:00.000Z",
      updatedAt: "2026-06-16T08:00:00.000Z"
    });

    const editionResponse = await app.request("/api/feed/feed-owner/personal/editions/edition_old_arabic_title", {}, env());
    expect(editionResponse.status).toBe(200);
    const detail = (await editionResponse.json()) as { edition: { sections: Array<{ title: string; summary: string }> } };
    expect(detail.edition.sections[0].title).toBe("بنية تحتية");
    expect(detail.edition.sections[0].summary).not.toContain("Infrastructure");
  });

  it("removes bilingual Telegram artifacts from saved Arabic public editions", async () => {
    const repo = new InMemoryRepository();
    const app = createApp({ repository: repo });
    const user = await createVerifiedUser(app, repo, "owner@test.com", "Feed Owner");
    const briefing = await repo.getBriefingBySlug(user.account.id, "personal");
    expect(briefing).not.toBeNull();
    await repo.upsertBriefing({ ...briefing!, language: "ar" });

    const rawText = "نتنياهو: وجهنا ضربة إلى إيران ووكلائها في المنطقة وهي عملية لم تنته بعد Netanyahu: We have struck Iran and its proxies in the region, and the operation is not over yet ــــــــــــــ قناة موقع بنت جبيل على واتساب";
    await repo.saveBriefingEdition({
      id: "edition_saved_artifact_arabic",
      briefingId: briefing!.id,
      cadence: "hourly",
      windowStart: "2026-06-23T09:00:00.000Z",
      windowEnd: "2026-06-23T10:00:00.000Z",
      title: "تحديثات موثوقة",
      summary: `تحديثات موثوقة: ${rawText} [1].`,
      sections: [
        {
          title: "Security",
          summary: rawText,
          evidence: [
            {
              messageId: "msg_bintjbeil",
              sourceId: "src_bintjbeil",
              sourceTitle: "bintjbeil.org - موقع بنت جبيل",
              sourceType: "channel",
              sourceProvider: "telegram",
              sourceKind: "telegram_channel",
              postedAt: "2026-06-23T09:58:00.000Z",
              text: rawText,
              links: [],
              media: [],
              sourceUrl: "https://t.me/bintjbeilnews/1"
            }
          ]
        }
      ],
      status: "published",
      publishedAt: "2026-06-23T10:00:00.000Z",
      createdAt: "2026-06-23T10:00:00.000Z",
      updatedAt: "2026-06-23T10:00:00.000Z"
    });

    const feedResponse = await app.request("/api/feed/feed-owner/personal", {}, env());
    expect(feedResponse.status).toBe(200);
    const feed = (await feedResponse.json()) as { editions: Array<{ id: string; summary: string }> };
    expect(feed.editions[0].summary).toBe("نتنياهو: وجهنا ضربة إلى إيران ووكلائها في المنطقة وهي عملية لم تنته بعد [1].");
    expect(feed.editions[0].summary).not.toContain("Netanyahu");
    expect(feed.editions[0].summary).not.toContain("ــــ");

    const editionResponse = await app.request("/api/feed/feed-owner/personal/editions/edition_saved_artifact_arabic", {}, env());
    expect(editionResponse.status).toBe(200);
    const detail = (await editionResponse.json()) as { edition: { sections: Array<{ summary: string; evidence: Array<{ text: string }> }> } };
    expect(detail.edition.sections[0].summary).toBe("نتنياهو: وجهنا ضربة إلى إيران ووكلائها في المنطقة وهي عملية لم تنته بعد");
    expect(detail.edition.sections[0].evidence[0].text).toBe("نتنياهو: وجهنا ضربة إلى إيران ووكلائها في المنطقة وهي عملية لم تنته بعد");
  });

  it("does not publish wrong-language Arabic editions when localization is unavailable", async () => {
    const repo = new InMemoryRepository();
    const app = createApp({ repository: repo });
    const user = await createVerifiedUser(app, repo, "owner@test.com", "Feed Owner");
    const briefing = await repo.getBriefingBySlug(user.account.id, "personal");
    expect(briefing).not.toBeNull();
    await repo.upsertBriefing({
      ...briefing!,
      language: "ar",
      interestProfile: "Track Lebanese infrastructure and power supply updates."
    });
    const savedBriefing = await repo.getBriefingById(briefing!.id);
    expect(savedBriefing).not.toBeNull();

    await repo.saveRawMessage(briefing!.id, {
      id: `${briefing!.id}::english_power_update`,
      source: { id: "src_power", title: "Power Wire", type: "channel", provider: "telegram", kind: "telegram_channel" },
      messageId: "english-power-update",
      text: "Electricite du Liban announced two extra hours of power supply tonight.",
      links: [],
      media: [],
      postedAt: "2026-06-16T08:15:00.000Z",
      receivedAt: "2026-06-16T08:15:10.000Z",
      sourceUrl: "https://t.me/power/1",
      expiresAt: "2026-07-01T08:15:00.000Z"
    });

    await publishDueBriefingEditions({
      repo,
      briefings: [{ ...savedBriefing!, nextBriefingAt: "2026-06-16T09:00:00.000Z" }],
      now: new Date("2026-06-16T09:08:00.000Z")
    });

    const feedResponse = await app.request("/api/feed/feed-owner/personal", {}, env());
    expect(feedResponse.status).toBe(200);
    const feed = (await feedResponse.json()) as { editions: Array<{ id: string; summary: string }> };
    expect(feed.editions).toEqual([]);

    const saved = await repo.getBriefingById(briefing!.id);
    expect(saved?.nextBriefingAt).toBe("2026-06-16T10:00:00.000Z");
  });

  it("keeps a manually paused Telegram source paused across later ingest passes", async () => {
    const repo = new InMemoryRepository();
    const bucket = new FakeBucket();
    const queue = new FakeQueue();
    const fetcher = vi.fn(async () => new Response(publicTelegramHtml, { status: 200 }));
    const app = createApp({
      repository: repo,
      bucket,
      queue,
      fetcher: fetcher as unknown as typeof fetch,
      now: () => FIXTURE_NOW
    });
    const user = await createVerifiedUser(app, repo, "owner@test.com", "Feed Owner");
    const briefing = await repo.getBriefingBySlug(user.account.id, "personal");
    expect(briefing).not.toBeNull();

    const addResponse = await app.request(
      "/api/me/sources",
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie: user.cookie },
        body: JSON.stringify({ briefingId: briefing!.id, input: "https://t.me/LebUpdate" })
      },
      env()
    );
    expect(addResponse.status).toBe(200);
    let sources = await repo.listSources(briefing!.id);
    expect(sources[0].enabled).toBe(true);

    const pauseResponse = await app.request(
      "/api/me/sources",
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie: user.cookie },
        body: JSON.stringify({ briefingId: briefing!.id, sourceId: sources[0].id, enabled: false })
      },
      env()
    );
    expect(pauseResponse.status).toBe(200);
    sources = await repo.listSources(briefing!.id);
    expect(sources[0].enabled).toBe(false);

    await ingestPublicTelegramChannel({
      briefing: briefing!,
      url: "https://t.me/LebUpdate",
      repo,
      bucket,
      queue,
      fetcher: fetcher as unknown as typeof fetch,
      now: new Date("2026-06-16T08:02:00.000Z")
    });

    sources = await repo.listSources(briefing!.id);
    expect(sources[0].enabled).toBe(false);
  });

  it("does not publish a new item when the summary adapter returns no-post", async () => {
    const repo = new InMemoryRepository();
    const bucket = new FakeBucket();
    const queue = new FakeQueue();
    const fetcher = vi.fn(async () => new Response(publicTelegramHtml, { status: 200 }));
    const app = createApp({
      repository: repo,
      bucket,
      queue,
      fetcher: fetcher as unknown as typeof fetch,
      now: () => FIXTURE_NOW
    });
    const user = await createVerifiedUser(app, repo, "owner@test.com", "Feed Owner");
    const briefing = await repo.getBriefingBySlug(user.account.id, "personal");
    expect(briefing).not.toBeNull();
    await repo.upsertBriefing({ ...briefing!, interestProfile: "Track Lebanese infrastructure", intensity: "medium" });

    const sourceResponse = await app.request(
      "/api/me/sources",
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie: user.cookie },
        body: JSON.stringify({ briefingId: briefing!.id, input: "t: LebUpdate" })
      },
      env()
    );
    expect(sourceResponse.status).toBe(200);
    expect(queue.messages).toHaveLength(1);

    const rawMessages = await repo.listRawMessagesForWindow(
      briefing!.id,
      "2026-06-24T23:00:00.000Z",
      "2026-06-25T00:00:00.000Z"
    );
    expect(rawMessages).toHaveLength(1);
    const jobId = queue.messages[0].jobId;

    await processQueueMessage(repo, { jobId, briefingId: briefing!.id, rawMessageId: rawMessages[0].id }, FIXTURE_NOW, {
      summarize: async () => "NO_POST"
    });

    const feedItems = await repo.listFeedItems(user.account.id, "personal", true, FIXTURE_NOW);
    expect(feedItems).toHaveLength(0);
  });

  it("completes queue jobs with the deterministic summary when AI summary fails", async () => {
    const repo = new InMemoryRepository();
    const bucket = new FakeBucket();
    const queue = new FakeQueue();
    const fetcher = vi.fn(async () => new Response(publicTelegramHtml, { status: 200 }));
    const app = createApp({
      repository: repo,
      bucket,
      queue,
      fetcher: fetcher as unknown as typeof fetch,
      now: () => FIXTURE_NOW
    });
    const user = await createVerifiedUser(app, repo, "owner@test.com", "Feed Owner");
    const briefing = await repo.getBriefingBySlug(user.account.id, "personal");
    expect(briefing).not.toBeNull();
    await repo.upsertBriefing({ ...briefing!, interestProfile: "Track Lebanese infrastructure", intensity: "medium" });

    const sourceResponse = await app.request(
      "/api/me/sources",
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie: user.cookie },
        body: JSON.stringify({ briefingId: briefing!.id, input: "t: LebUpdate" })
      },
      env()
    );
    expect(sourceResponse.status).toBe(200);
    expect(queue.messages).toHaveLength(1);

    const rawMessages = await repo.listRawMessagesForWindow(
      briefing!.id,
      "2026-06-24T23:00:00.000Z",
      "2026-06-25T00:00:00.000Z"
    );
    expect(rawMessages).toHaveLength(1);
    const jobId = queue.messages[0].jobId;

    await expect(processQueueMessage(repo, { jobId, briefingId: briefing!.id, rawMessageId: rawMessages[0].id }, FIXTURE_NOW, {
      summarize: async () => {
        throw new Error("summary timeout");
      }
    })).resolves.toBeDefined();

    const jobs = await repo.listProcessingJobs({ briefingId: briefing!.id, states: ["completed"] });
    expect(jobs).toHaveLength(1);
    const feedItems = await repo.listFeedItems(user.account.id, "personal", true, FIXTURE_NOW);
    expect(feedItems).toHaveLength(1);
    expect(feedItems[0].summary).toContain("Electricite du Liban");
  });

  it("keeps one published item when later AI summaries differ for the same event", async () => {
    const repo = new InMemoryRepository();
    const app = createApp({ repository: repo });
    const user = await createVerifiedUser(app, repo, "owner@test.com", "Feed Owner");
    const briefing = await repo.getBriefingBySlug(user.account.id, "personal");
    expect(briefing).not.toBeNull();
    await repo.upsertBriefing({ ...briefing!, title: "Regional News", interestProfile: "", intensity: "medium" });

    const firstMessage: NormalizedMessage = {
      id: `${briefing!.id}::msg_ai_drift_1`,
      source: { id: "src_lbci", title: "LBCI_NEWS", type: "channel", provider: "telegram", kind: "telegram_channel", username: "LBCI_NEWS" },
      messageId: "303821",
      text: "وزير الخارجية الإسرائيلي: قطع جميع الاتصالات مع مسؤولة السياسة الخارجية في الاتحاد الأوروبي",
      links: ["https://twitter.com/LBCI_NEWS/status/2067527301990900181"],
      media: [],
      postedAt: "2026-06-18T08:38:00.000Z",
      receivedAt: "2026-06-18T08:38:10.000Z",
      sourceUrl: "https://t.me/LBCI_NEWS/303821",
      expiresAt: "2026-07-03T08:38:00.000Z"
    };
    const secondMessage: NormalizedMessage = {
      ...firstMessage,
      id: `${briefing!.id}::msg_ai_drift_2`,
      messageId: "303822",
      text: "وزير الخارجية الإسرائيليّ: سأقطع الاتصالات مع مسؤولة السياسة الخارجية في الاتحاد الأوروبيّ",
      links: ["https://twitter.com/LBCI_NEWS/status/2067527529599062343"],
      postedAt: "2026-06-18T08:43:00.000Z",
      receivedAt: "2026-06-18T08:43:10.000Z",
      sourceUrl: "https://t.me/LBCI_NEWS/303822"
    };

    const source = await repo.upsertSourceFromMessage(briefing!.id, firstMessage);
    await repo.setSourceEnabled(source.id, true);
    const persistedFirst = { ...firstMessage, source: { ...firstMessage.source, id: source.id } };
    const persistedSecond = { ...secondMessage, source: { ...secondMessage.source, id: source.id } };
    await repo.saveRawMessage(briefing!.id, persistedFirst);
    const firstJobId = await repo.createProcessingJob(briefing!.id, persistedFirst.id);
    await processQueueMessage(repo, { jobId: firstJobId, briefingId: briefing!.id, rawMessageId: persistedFirst.id }, new Date("2026-06-18T08:40:00.000Z"), {
      summarize: async () => "أعلن وزير الخارجية الإسرائيلي قطع الاتصالات مع مسؤولة السياسة الخارجية الأوروبية."
    });

    await repo.saveRawMessage(briefing!.id, persistedSecond);
    const secondJobId = await repo.createProcessingJob(briefing!.id, persistedSecond.id);
    await processQueueMessage(repo, { jobId: secondJobId, briefingId: briefing!.id, rawMessageId: persistedSecond.id }, new Date("2026-06-18T08:44:00.000Z"), {
      summarize: async () => "وزير الخارجية الإسرائيلي: قطع جميع الاتصالات مع مسؤولة السياسة الخارجية في الاتحاد الأوروبي"
    });

    const feedItems = await repo.listFeedItems(user.account.id, "personal", true, FIXTURE_NOW);
    expect(feedItems).toHaveLength(1);
    expect(feedItems[0].evidence.map((entry) => entry.messageId)).toEqual([
      persistedFirst.id,
      persistedSecond.id
    ]);
  });

  it.each([
    [true, 1],
    [false, 2]
  ])("uses LLM event equivalence review result %s when deterministic matching is inconclusive", async (sameEvent, expectedCount) => {
    const repo = new InMemoryRepository();
    const app = createApp({ repository: repo });
    const user = await createVerifiedUser(app, repo, "owner@test.com", "Feed Owner");
    const briefing = await repo.getBriefingBySlug(user.account.id, "personal");
    expect(briefing).not.toBeNull();
    await repo.upsertBriefing({ ...briefing!, interestProfile: "Track central bank and economy news", intensity: "medium" });

    const existing: BriefingItem = {
      id: "item_existing_bank",
      clusterId: "cluster_existing_bank",
      summary: "Central bank ordered banks to limit cash withdrawals.",
      itemAt: "2026-06-18T08:00:00.000Z",
      updatedAt: "2026-06-18T08:00:00.000Z",
      expiresAt: "2026-07-03T08:00:00.000Z",
      mergedUpdateCount: 0,
      evidence: [
        {
          messageId: `${briefing!.id}::existing_bank_raw`,
          sourceId: "src_existing_bank",
          sourceTitle: "Banking Wire",
          sourceType: "channel",
          sourceProvider: "rss",
          sourceKind: "rss_feed",
          postedAt: "2026-06-18T08:00:00.000Z",
          text: "Central bank ordered banks to limit cash withdrawals.",
          links: [],
          media: []
        }
      ]
    };
    await repo.saveBriefingItems(briefing!.id, [existing]);

    const message: NormalizedMessage = {
      id: `${briefing!.id}::bank_review_raw`,
      source: { id: "src_bank_review", title: "Economy News", type: "channel", provider: "telegram", kind: "telegram_channel" },
      messageId: "bank-review",
      text: "Central bank announced new withdrawal caps for commercial banks.",
      links: [],
      media: [],
      postedAt: "2026-06-18T08:05:00.000Z",
      receivedAt: "2026-06-18T08:05:10.000Z",
      sourceUrl: "https://t.me/economy/1",
      expiresAt: "2026-07-03T08:05:00.000Z"
    };
    const source = await repo.upsertSourceFromMessage(briefing!.id, message);
    await repo.setSourceEnabled(source.id, true);
    const persisted = { ...message, source: { ...message.source, id: source.id } };
    await repo.saveRawMessage(briefing!.id, persisted);
    const jobId = await repo.createProcessingJob(briefing!.id, persisted.id);
    const reviewAdapter: EventReviewAdapter = {
      areSameEvent: async () => sameEvent,
      isImportant: async () => false
    };

    await processQueueMessage(repo, { jobId, briefingId: briefing!.id, rawMessageId: persisted.id }, new Date("2026-06-18T08:06:00.000Z"), null, reviewAdapter);

    const feedItems = await repo.listFeedItems(user.account.id, "personal", true, FIXTURE_NOW);
    expect(feedItems).toHaveLength(expectedCount);
  });

  it("does not rerun advisory importance review for every recent message in each queue job", async () => {
    const repo = new InMemoryRepository();
    const app = createApp({ repository: repo });
    const user = await createVerifiedUser(app, repo, "owner@test.com", "Feed Owner");
    const briefing = await repo.getBriefingBySlug(user.account.id, "personal");
    expect(briefing).not.toBeNull();
    await repo.upsertBriefing({ ...briefing!, interestProfile: "Track economy updates", intensity: "medium" });

    const baseMessage: NormalizedMessage = {
      id: `${briefing!.id}::economy_current`,
      source: { id: "src_economy_review", title: "Economy Wire", type: "channel", provider: "telegram", kind: "telegram_channel" },
      messageId: "economy-current",
      text: "Economy index reached 2 today.",
      links: [],
      media: [],
      postedAt: "2026-06-18T08:05:00.000Z",
      receivedAt: "2026-06-18T08:05:10.000Z",
      sourceUrl: "https://t.me/economy/10",
      expiresAt: "2026-07-03T08:05:00.000Z"
    };
    const source = await repo.upsertSourceFromMessage(briefing!.id, baseMessage);
    await repo.setSourceEnabled(source.id, true);

    for (let index = 0; index < 5; index += 1) {
      await repo.saveRawMessage(briefing!.id, {
        ...baseMessage,
        id: `${briefing!.id}::economy_recent_${index}`,
        source: { ...baseMessage.source, id: source.id },
        messageId: `economy-recent-${index}`,
        text: `Economy index reached ${index + 3} today.`,
        postedAt: `2026-06-18T08:0${index}:00.000Z`,
        receivedAt: `2026-06-18T08:0${index}:10.000Z`,
        sourceUrl: `https://t.me/economy/${index}`
      });
    }

    const persistedCurrent = { ...baseMessage, source: { ...baseMessage.source, id: source.id } };
    await repo.saveRawMessage(briefing!.id, persistedCurrent);
    const jobId = await repo.createProcessingJob(briefing!.id, persistedCurrent.id);
    const isImportant = vi.fn(async () => false);
    const reviewAdapter: EventReviewAdapter = {
      areSameEvent: async () => false,
      isImportant
    };

    await processQueueMessage(
      repo,
      { jobId, briefingId: briefing!.id, rawMessageId: persistedCurrent.id },
      new Date("2026-06-18T08:06:00.000Z"),
      null,
      reviewAdapter
    );

    expect(isImportant).toHaveBeenCalledTimes(1);
    expect(isImportant).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.objectContaining({ id: persistedCurrent.id })
    }));
  });

  it("returns a clear error when Apify-backed X sources are added without a token", async () => {
    const repo = new InMemoryRepository();
    const app = createApp({ repository: repo, bucket: new FakeBucket(), queue: new FakeQueue() });
    const user = await createVerifiedUser(app, repo, "owner@test.com", "Feed Owner");
    const briefing = await repo.getBriefingBySlug(user.account.id, "personal");
    expect(briefing).not.toBeNull();

    const response = await app.request(
      "/api/me/sources",
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie: user.cookie },
        body: JSON.stringify({ briefingId: briefing!.id, input: "x: @ALJADEEDNEWS" })
      },
      env()
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "APIFY_API_TOKEN is not configured." });
  });

  it("claims a dispatch lease before enqueueing and suppresses duplicate cron delivery", async () => {
    const repo = new InMemoryRepository();
    const queue = new FakeDistilledQueue();
    const app = createApp({ repository: repo, bucket: new FakeBucket(), queue: new FakeQueue() });
    const user = await createVerifiedUser(app, repo, "owner@test.com", "Feed Owner");
    const briefing = await repo.getBriefingBySlug(user.account.id, "personal");
    expect(briefing).not.toBeNull();

    const source = await repo.upsertConfiguredSource({
      briefingId: briefing!.id,
      title: "Example RSS",
      provider: "rss",
      kind: "rss_feed",
      sourceUrl: "https://example.com/feed.xml",
      enabled: true
    }, new Date("2026-06-18T08:00:00.000Z"));

    const first = await enqueueDueSourceRefreshJobs({
      briefing: briefing!,
      repo,
      queue,
      now: new Date("2026-06-18T08:05:00.000Z")
    });
    const second = await enqueueDueSourceRefreshJobs({
      briefing: briefing!,
      repo,
      queue,
      now: new Date("2026-06-18T08:06:00.000Z")
    });

    expect(first).toBe(1);
    expect(second).toBe(0);
    expect(queue.messages).toEqual([
      expect.objectContaining({
        type: "refresh_source",
        briefingId: briefing!.id,
        sourceId: source.id,
        force: undefined,
        canonicalLeaseToken: expect.any(String)
      })
    ]);
    expect((await repo.getSource(source.id))?.lastCheckedAt).toBeUndefined();

    const [message] = queue.messages;
    if (message.type !== "refresh_source") throw new Error("Expected a source refresh message.");
    const fetcher = vi.fn(async () => new Response(
      `<rss><channel><item><guid>dispatch-lease</guid><title>One update</title><pubDate>Thu, 18 Jun 2026 08:04:00 GMT</pubDate><link>https://example.com/update</link></item></channel></rss>`,
      { headers: { "content-type": "application/rss+xml" } }
    ));
    const firstDelivery = await refreshSourceById({
      briefing: briefing!,
      sourceId: source.id,
      repo,
      bucket: new FakeBucket(),
      queue: new FakeQueue(),
      fetcher: fetcher as typeof fetch,
      canonicalLeaseToken: message.canonicalLeaseToken,
      now: new Date("2026-06-18T08:05:05.000Z")
    });
    const duplicateDelivery = await refreshSourceById({
      briefing: briefing!,
      sourceId: source.id,
      repo,
      bucket: new FakeBucket(),
      queue: new FakeQueue(),
      fetcher: fetcher as typeof fetch,
      canonicalLeaseToken: message.canonicalLeaseToken,
      now: new Date("2026-06-18T08:05:06.000Z")
    });
    expect(firstDelivery).toMatchObject({ imported: 1 });
    expect(duplicateDelivery).toBeUndefined();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("uses the canonical due time and suppresses duplicate Google News dispatch", async () => {
    const repo = new InMemoryRepository();
    const queue = new FakeDistilledQueue();
    const app = createApp({ repository: repo, bucket: new FakeBucket(), queue: new FakeQueue() });
    const user = await createVerifiedUser(app, repo, "owner@test.com", "Feed Owner");
    const briefing = await repo.getBriefingBySlug(user.account.id, "personal");
    expect(briefing).not.toBeNull();

    const sources = [];
    for (let index = 0; index < 15; index += 1) {
      const source = await repo.upsertConfiguredSource({
        briefingId: briefing!.id,
        title: `Google News: topic ${index}`,
        provider: "rss",
        kind: "google_news",
        sourceUrl: `https://news.google.com/rss/search?q=topic+${index}&hl=en-US&gl=US&ceid=US%3Aen`,
        enabled: true
      }, new Date("2026-06-18T08:00:00.000Z"));
      await repo.updateSourceState({ sourceId: source.id, lastCheckedAt: "2026-06-18T08:00:00.000Z" });
      sources.push(source);
    }

    const first = await enqueueDueSourceRefreshJobs({
      briefing: briefing!,
      repo,
      queue,
      now: new Date("2026-06-18T09:00:00.000Z")
    });
    const duplicate = await enqueueDueSourceRefreshJobs({
      briefing: briefing!,
      repo,
      queue,
      now: new Date("2026-06-18T09:01:00.000Z")
    });

    expect(first).toBe(sources.length);
    expect(duplicate).toBe(0);
    expect(queue.messages).toHaveLength(sources.length);
  });

  it("spreads simultaneous Google News failure retries across a full hourly interval", async () => {
    const repo = new InMemoryRepository();
    const app = createApp({ repository: repo });
    const user = await createVerifiedUser(app, repo, "owner@test.com", "Feed Owner");
    const briefing = await repo.getBriefingBySlug(user.account.id, "personal");
    const failedAt = new Date("2026-06-18T08:15:00.000Z");
    const retryMinutes = new Set<number>();

    for (let index = 0; index < 15; index += 1) {
      const source = await repo.upsertConfiguredSource({
        briefingId: briefing!.id,
        title: `Google News: retry topic ${index}`,
        provider: "rss",
        kind: "google_news",
        sourceUrl: `https://news.google.com/rss/search?q=retry+topic+${index}&hl=en-US&gl=US&ceid=US%3Aen`,
        enabled: true
      }, failedAt);
      await expect(refreshSourceById({
        briefing: briefing!,
        sourceId: source.id,
        repo,
        bucket: new FakeBucket(),
        queue: new FakeQueue(),
        fetcher: (async () => new Response("unavailable", { status: 503 })) as typeof fetch,
        now: failedAt,
        force: true
      })).rejects.toThrow("Could not fetch Google News RSS source: 503");
      const nextRetryAt = (await repo.getSource(source.id))?.nextRetryAt;
      expect(nextRetryAt).toBeDefined();
      retryMinutes.add(Math.floor((new Date(nextRetryAt!).getTime() - failedAt.getTime()) / 60_000));
    }

    expect(retryMinutes.size).toBeGreaterThanOrEqual(10);
    expect(Math.min(...retryMinutes)).toBeGreaterThanOrEqual(2);
    expect(Math.max(...retryMinutes)).toBeLessThan(62);
  });

  it("anchors hourly Apify collection fifteen minutes before publication", async () => {
    const repo = new InMemoryRepository();
    const queue = new FakeDistilledQueue();
    const app = createApp({ repository: repo });
    const user = await createVerifiedUser(app, repo, "owner@test.com", "Feed Owner");
    const briefing = await repo.getBriefingBySlug(user.account.id, "personal");
    expect(briefing).not.toBeNull();

    const source = await repo.upsertConfiguredSource({
      briefingId: briefing!.id,
      title: "@LebanonWire",
      provider: "apify",
      kind: "x_profile",
      username: "LebanonWire",
      actorId: "example/x-actor",
      actorInput: { searchTerms: ["from:LebanonWire"] },
      enabled: true
    }, new Date("2026-06-18T10:50:00.000Z"));
    await repo.updateSourceState({ sourceId: source.id, lastCheckedAt: "2026-06-18T10:50:00.000Z" });
    const initialLease = await repo.claimCanonicalSourceRefresh(source.id, 60 * 60 * 1000, 60_000, new Date("2026-06-18T10:50:00.000Z"));
    await repo.completeCanonicalSourceRefresh(
      source.id,
      initialLease!,
      "2026-06-18T11:45:00.000Z",
      undefined,
      new Date("2026-06-18T10:50:00.000Z"),
      false
    );

    const early = await enqueueDueSourceRefreshJobs({
      briefing: briefing!,
      repo,
      queue,
      now: new Date("2026-06-18T11:44:59.000Z")
    });
    const onSlot = await enqueueDueSourceRefreshJobs({
      briefing: briefing!,
      repo,
      queue,
      now: new Date("2026-06-18T11:45:00.000Z")
    });

    expect(early).toBe(0);
    expect(onSlot).toBe(1);
    expect(queue.messages).toEqual([
      expect.objectContaining({
        type: "refresh_source",
        briefingId: briefing!.id,
        sourceId: source.id,
        force: undefined,
        canonicalLeaseToken: expect.any(String)
      })
    ]);
  });

  it("uses RSS validators and avoids duplicate archives and jobs for unchanged feeds", async () => {
    const repo = new InMemoryRepository();
    const bucket = new FakeBucket();
    const queue = new FakeQueue();
    const app = createApp({ repository: repo, bucket, queue });
    const user = await createVerifiedUser(app, repo, "rss-owner@test.com", "RSS Owner");
    const briefing = await repo.getBriefingBySlug(user.account.id, "personal");
    const source = await repo.upsertConfiguredSource({ briefingId: briefing!.id, title: "Example RSS", provider: "rss", kind: "rss_feed", sourceUrl: "https://example.com/feed.xml", enabled: true }, FIXTURE_NOW);
    const xml = `<rss><channel><title>Example</title><item><guid>one</guid><title>One concrete update</title><pubDate>Wed, 25 Jun 2026 00:00:00 GMT</pubDate><link>https://example.com/one</link></item></channel></rss>`;
    let calls = 0;
    const fetcher = async (_url: string | URL | Request, init?: RequestInit) => {
      calls += 1;
      const headers = new Headers(init?.headers);
      if (calls === 2) {
        expect(headers.get("if-none-match")).toBe('"v1"');
        return new Response(null, { status: 304 });
      }
      return new Response(xml, { headers: { "content-type": "application/rss+xml", etag: '"v1"' } });
    };
    const first = await refreshSourceById({ briefing: briefing!, sourceId: source.id, repo, bucket, queue, fetcher: fetcher as typeof fetch, now: FIXTURE_NOW });
    const second = await refreshSourceById({ briefing: briefing!, sourceId: source.id, repo, bucket, queue, fetcher: fetcher as typeof fetch, now: new Date(FIXTURE_NOW.getTime() + 300_000), force: true });
    expect(first).toMatchObject({ imported: 1, queued: 1 });
    expect(second).toMatchObject({ imported: 0, queued: 0 });
    expect(bucket.objects.size).toBe(1);
    expect(queue.messages).toHaveLength(1);
  });

  it("ingests a direct publisher JSON feed through the RSS source path", async () => {
    const repo = new InMemoryRepository();
    const bucket = new FakeBucket();
    const queue = new FakeQueue();
    const app = createApp({ repository: repo, bucket, queue });
    const user = await createVerifiedUser(app, repo, "json-owner@test.com", "JSON Owner");
    const briefing = (await repo.getBriefingBySlug(user.account.id, "personal"))!;
    const source = await repo.upsertConfiguredSource({
      briefingId: briefing.id,
      title: "MTV Lebanon",
      provider: "rss",
      kind: "rss_feed",
      sourceUrl: "https://www.mtv.com.lb/api/articles?start=0&end=20&type=&removeAds=true",
      enabled: true
    }, FIXTURE_NOW);
    const fetcher = vi.fn(async () => new Response(JSON.stringify([{
      articleid: 1717046,
      title: "تحديث من بيروت",
      publishDate: "2026-06-25T02:07:50.04",
      Url: "/news/local/1717046/update",
      Text: "<p>أعلنت الجهة الرسمية بدء التنفيذ.</p>"
    }]), { headers: { "content-type": "application/json; charset=utf-8" } }));

    const result = await refreshSourceById({
      briefing,
      sourceId: source.id,
      repo,
      bucket,
      queue,
      fetcher: fetcher as unknown as typeof fetch,
      now: FIXTURE_NOW
    });

    expect(result).toMatchObject({ imported: 1, queued: 1, provider: "rss", kind: "rss_feed" });
    expect(Array.from(bucket.objects.keys())[0]).toContain("json-feed/");
    expect(queue.messages).toHaveLength(1);
  });

  it("fetches an identical source once and fans the result out to every subscribed feed", async () => {
    const repo = new InMemoryRepository();
    const bucket = new FakeBucket();
    const queue = new FakeQueue();
    const app = createApp({ repository: repo, bucket, queue });
    const firstUser = await createVerifiedUser(app, repo, "fanout-one@test.com", "Fanout One");
    const secondUser = await createVerifiedUser(app, repo, "fanout-two@test.com", "Fanout Two");
    const firstBriefing = (await repo.getBriefingBySlug(firstUser.account.id, "personal"))!;
    const secondBriefing = (await repo.getBriefingBySlug(secondUser.account.id, "personal"))!;
    const url = "https://example.com/shared.xml";
    const firstSource = await repo.upsertConfiguredSource({ briefingId: firstBriefing.id, title: "Shared RSS", provider: "rss", kind: "rss_feed", sourceUrl: url, enabled: true }, FIXTURE_NOW);
    const secondSource = await repo.upsertConfiguredSource({ briefingId: secondBriefing.id, title: "Shared RSS", provider: "rss", kind: "rss_feed", sourceUrl: url, enabled: true }, FIXTURE_NOW);
    const xml = `<rss><channel><title>Shared</title><item><guid>shared-one</guid><title>Lebanon central bank announced a new currency measure</title><pubDate>Wed, 25 Jun 2026 00:00:00 GMT</pubDate><link>https://example.com/shared-one</link></item></channel></rss>`;
    const fetcher = vi.fn(async () => new Response(xml, { headers: { "content-type": "application/rss+xml" } }));

    const first = await refreshSourceById({ briefing: firstBriefing, sourceId: firstSource.id, repo, bucket, queue, fetcher: fetcher as typeof fetch, now: FIXTURE_NOW });
    const duplicate = await refreshSourceById({ briefing: secondBriefing, sourceId: secondSource.id, repo, bucket, queue, fetcher: fetcher as typeof fetch, now: FIXTURE_NOW });

    expect(first).toMatchObject({ imported: 2, queued: 2 });
    expect(duplicate).toBeUndefined();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(new Set(queue.messages.map((message) => message.briefingId))).toEqual(new Set([firstBriefing.id, secondBriefing.id]));
  });

  it("propagates source failure and recovery across canonical subscribers", async () => {
    const repo = new InMemoryRepository();
    const bucket = new FakeBucket();
    const queue = new FakeQueue();
    const app = createApp({ repository: repo });
    const firstUser = await createVerifiedUser(app, repo, "health-one@test.com", "Health One");
    const secondUser = await createVerifiedUser(app, repo, "health-two@test.com", "Health Two");
    const firstBriefing = (await repo.getBriefingBySlug(firstUser.account.id, "personal"))!;
    const secondBriefing = (await repo.getBriefingBySlug(secondUser.account.id, "personal"))!;
    const url = "https://example.com/health.xml";
    const firstSource = await repo.upsertConfiguredSource({ briefingId: firstBriefing.id, title: "Health RSS", provider: "rss", kind: "rss_feed", sourceUrl: url, enabled: true }, FIXTURE_NOW);
    const secondSource = await repo.upsertConfiguredSource({ briefingId: secondBriefing.id, title: "Health RSS", provider: "rss", kind: "rss_feed", sourceUrl: url, enabled: true }, FIXTURE_NOW);

    await expect(refreshSourceById({
      briefing: firstBriefing,
      sourceId: firstSource.id,
      repo,
      bucket,
      queue,
      fetcher: (async () => new Response("unavailable", { status: 503 })) as typeof fetch,
      now: new Date("2026-06-25T00:02:00.000Z"),
      force: true
    })).rejects.toThrow("Could not fetch RSS source: 503");
    expect(await repo.getSource(firstSource.id)).toMatchObject({ healthState: "degraded", failureClass: "upstream_503" });
    expect(await repo.getSource(secondSource.id)).toMatchObject({ healthState: "degraded", failureClass: "upstream_503" });

    const xml = `<rss><channel><title>Health</title><item><guid>recovered</guid><title>Source recovered with a new report</title><pubDate>Wed, 25 Jun 2026 00:03:00 GMT</pubDate><link>https://example.com/recovered</link></item></channel></rss>`;
    await refreshSourceById({
      briefing: secondBriefing,
      sourceId: secondSource.id,
      repo,
      bucket,
      queue,
      fetcher: (async () => new Response(xml, { headers: { "content-type": "application/rss+xml" } })) as typeof fetch,
      now: new Date("2026-06-25T00:04:00.000Z"),
      force: true
    });

    expect(await repo.getSource(firstSource.id)).toMatchObject({ healthState: "healthy", consecutiveFailures: 0 });
    expect((await repo.getSource(firstSource.id))?.lastError).toBeUndefined();
    expect(await repo.getSource(secondSource.id)).toMatchObject({ healthState: "healthy", consecutiveFailures: 0 });
  });

  it("blocks RSS requests to local and private destinations", async () => {
    const repo = new InMemoryRepository();
    const app = createApp({ repository: repo, bucket: new FakeBucket(), queue: new FakeQueue() });
    const user = await createVerifiedUser(app, repo, "safe-owner@test.com", "Safe Owner");
    const briefing = await repo.getBriefingBySlug(user.account.id, "personal");
    const source = await repo.upsertConfiguredSource({ briefingId: briefing!.id, title: "Unsafe", provider: "rss", kind: "rss_feed", sourceUrl: "http://127.0.0.1/feed.xml", enabled: true }, FIXTURE_NOW);
    await expect(refreshSourceById({ briefing: briefing!, sourceId: source.id, repo, bucket: new FakeBucket(), queue: new FakeQueue(), fetcher: vi.fn() as unknown as typeof fetch, now: FIXTURE_NOW })).rejects.toThrow(/private or local address/);
  });

  it("drops expired and publication-ineligible feed history before D1 and queue work", async () => {
    const repo = new InMemoryRepository();
    const queue = new FakeQueue();
    const app = createApp({ repository: repo, bucket: new FakeBucket(), queue });
    const user = await createVerifiedUser(app, repo, "stale-owner@test.com", "Stale Owner");
    const briefing = await repo.getBriefingBySlug(user.account.id, "personal");
    const source = await repo.upsertConfiguredSource({ briefingId: briefing!.id, title: "Old RSS", provider: "rss", kind: "rss_feed", sourceUrl: "https://example.com/old.xml", enabled: true }, FIXTURE_NOW);
    const oldXml = `<rss><channel><title>Old</title>
      <item><guid>expired</guid><title>Very old story</title><pubDate>Wed, 1 Jan 2020 00:00:00 GMT</pubDate></item>
      <item><guid>outside-hourly-horizon</guid><title>Four-hour-old story</title><pubDate>Wed, 24 Jun 2026 20:00:00 GMT</pubDate></item>
      <item><guid>eligible</guid><title>Grid service restored after repairs</title><pubDate>Wed, 24 Jun 2026 21:30:00 GMT</pubDate></item>
    </channel></rss>`;
    const result = await refreshSourceById({ briefing: briefing!, sourceId: source.id, repo, bucket: new FakeBucket(), queue, fetcher: (async () => new Response(oldXml)) as typeof fetch, now: FIXTURE_NOW });
    expect(result).toMatchObject({ fetched: 3, imported: 1, queued: 1, skipped: 2 });
    expect(queue.messages).toHaveLength(1);
    const persisted = await repo.listRawMessagesForWindow(
      briefing!.id,
      "2026-06-24T21:00:00.000Z",
      "2026-06-25T00:01:00.000Z"
    );
    expect(persisted).toHaveLength(1);
    expect(persisted[0]).toMatchObject({
      text: "Grid service restored after repairs",
      postedAt: "2026-06-24T21:30:00.000Z"
    });
  });

  it("skips scheduled source refreshes while a feed has a large processing backlog", async () => {
    const repo = new InMemoryRepository();
    const queue = new FakeDistilledQueue();
    const app = createApp({ repository: repo, bucket: new FakeBucket(), queue: new FakeQueue() });
    const user = await createVerifiedUser(app, repo, "owner@test.com", "Feed Owner");
    const briefing = await repo.getBriefingBySlug(user.account.id, "personal");
    expect(briefing).not.toBeNull();

    await repo.upsertConfiguredSource({
      briefingId: briefing!.id,
      title: "Example RSS",
      provider: "rss",
      kind: "rss_feed",
      sourceUrl: "https://example.com/feed.xml",
      enabled: true
    }, new Date("2026-06-18T08:00:00.000Z"));
    for (let index = 0; index < 500; index += 1) {
      await repo.createProcessingJob(briefing!.id, `raw_${index}`, new Date("2026-06-18T08:00:00.000Z"));
    }

    const enqueued = await enqueueDueSourceRefreshJobs({
      briefing: briefing!,
      repo,
      queue,
      now: new Date("2026-06-18T09:00:00.000Z")
    });

    expect(enqueued).toBe(0);
    expect(queue.messages).toHaveLength(0);
  });

  it("backs off active Google News failures and automatically retries legacy quarantined rows", async () => {
    const repo = new InMemoryRepository();
    const queue = new FakeDistilledQueue();
    const app = createApp({ repository: repo, bucket: new FakeBucket(), queue: new FakeQueue() });
    const user = await createVerifiedUser(app, repo, "owner@test.com", "Feed Owner");
    const briefing = await repo.getBriefingBySlug(user.account.id, "personal");
    expect(briefing).not.toBeNull();

    const source = await repo.upsertConfiguredSource({
      briefingId: briefing!.id,
      title: "Google News: Lebanon security",
      provider: "rss",
      kind: "google_news",
      sourceUrl: "https://news.google.com/rss/search?q=Lebanon+security&hl=en-US&gl=US&ceid=US%3Aen",
      enabled: true
    }, new Date("2026-06-18T08:00:00.000Z"));
    await repo.recordSourceFailure({
      sourceId: source.id,
      error: "Could not fetch Google News RSS source: 503",
      failureClass: "upstream_503",
      nextRetryAt: "2026-06-18T10:02:00.000Z"
    }, new Date("2026-06-18T08:00:00.000Z"));

    const quarantined = await repo.upsertConfiguredSource({
      briefingId: briefing!.id,
      title: "Google News: South Lebanon",
      provider: "rss",
      kind: "google_news",
      sourceUrl: "https://news.google.com/rss/search?q=South+Lebanon&hl=en-US&gl=US&ceid=US%3Aen",
      enabled: true
    }, new Date("2026-06-18T08:00:00.000Z"));
    await repo.updateSourceState({
      sourceId: quarantined.id,
      lastCheckedAt: "2026-06-17T08:00:00.000Z",
      lastError: "Paused after repeated source failures: Could not fetch Google News RSS source: 503"
    });

    const legacyRetry = await enqueueDueSourceRefreshJobs({
      briefing: briefing!,
      repo,
      queue,
      now: new Date("2026-06-18T10:00:00.000Z")
    });
    expect(legacyRetry).toBe(1);
    expect(queue.messages).toEqual([
      expect.objectContaining({
        type: "refresh_source",
        briefingId: briefing!.id,
        sourceId: quarantined.id,
        force: undefined,
        canonicalLeaseToken: expect.any(String)
      })
    ]);
    expect((await repo.getSource(quarantined.id))?.lastError).toContain("Paused after repeated source failures");
    queue.messages = [];

    const backedOff = await enqueueDueSourceRefreshJobs({
      briefing: briefing!,
      repo,
      queue,
      now: new Date("2026-06-18T10:01:00.000Z")
    });
    const dueAfterBackoff = await enqueueDueSourceRefreshJobs({
      briefing: briefing!,
      repo,
      queue,
      now: new Date("2026-06-18T10:02:00.000Z")
    });

    expect(backedOff).toBe(0);
    expect(dueAfterBackoff).toBe(1);
    expect(queue.messages).toEqual([
      expect.objectContaining({
        type: "refresh_source",
        briefingId: briefing!.id,
        sourceId: source.id,
        force: undefined,
        canonicalLeaseToken: expect.any(String)
      })
    ]);
  });

  it("fetches, imports, and processes Google News through the bounded Apify actor", async () => {
    const repo = new InMemoryRepository();
    const bucket = new FakeBucket();
    const queue = new FakeQueue();
    const fetcher = vi.fn(async (request: RequestInfo | URL, init?: RequestInit) => {
      const url = String(request);
      if (url.includes("/actors/groupoject~google-news-scraper/runs")) {
        expect(new URL(url).searchParams.get("maxItems")).toBe("10");
        expect(JSON.parse(String(init?.body))).toMatchObject({
          queries: ["central bank lebanon"],
          postedWithinDays: 1,
          language: "en",
          geo: "US",
          monitoringMode: true,
          monitoringInitialRun: "emit",
          enableAnalysis: false,
          maxItemsPerQuery: 10
        });
        return new Response(JSON.stringify({ data: {
          id: "run_google_primary",
          status: "RUNNING",
          defaultDatasetId: "dataset_google_primary",
          startedAt: "2026-06-25T00:00:00.000Z"
        } }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("/actor-runs/run_google_primary")) {
        return new Response(JSON.stringify({ data: {
          id: "run_google_primary",
          status: "SUCCEEDED",
          defaultDatasetId: "dataset_google_primary",
          usageTotalUsd: 0.0015
        } }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("/datasets/dataset_google_primary/items")) {
        return new Response(JSON.stringify([{
          title: "Central bank announced a new circular",
          source: "Reuters",
          url: "https://news.google.com/read/bank-circular",
          publishedAt: "2026-06-24T23:01:00.000Z",
          scrapedAt: "2026-06-25T00:00:00.000Z"
        }]), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response("not found", { status: 404 });
    });
    const app = createApp({ repository: repo, bucket, queue, fetcher: fetcher as unknown as typeof fetch, now: () => FIXTURE_NOW });
    const user = await createVerifiedUser(app, repo, "owner@test.com", "Feed Owner");
    const briefing = await repo.getBriefingBySlug(user.account.id, "personal");
    expect(briefing).not.toBeNull();
    await repo.upsertBriefing({ ...briefing!, interestProfile: "Track central bank and economy news", intensity: "low" });

    const addResponse = await app.request(
      "/api/me/sources",
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie: user.cookie },
        body: JSON.stringify({ briefingId: briefing!.id, input: "news: central bank lebanon" })
      },
      { ...env(), APIFY_API_TOKEN: "token", APIFY_GOOGLE_NEWS_ACTOR_ID: "groupoject/google-news-scraper" } as Env
    );
    expect(addResponse.status).toBe(200);
    expect(queue.messages).toHaveLength(0);
    await pollApifySourceRuns({
      repo,
      bucket,
      queue,
      env: { ...env(), APIFY_API_TOKEN: "token" } as Env,
      fetcher: fetcher as unknown as typeof fetch,
      now: FIXTURE_NOW
    });
    expect(queue.messages).toHaveLength(1);
    expect(Array.from(bucket.objects.keys()).some((key) => key.includes("apify/"))).toBe(true);
    const sources = await repo.listSources(briefing!.id);
    expect(sources.find((source) => source.kind === "google_news")).toMatchObject({
      provider: "apify",
      actorId: "groupoject/google-news-scraper",
      title: "Google News: central bank lebanon"
    });
    const googleNewsSource = sources.find((source) => source.kind === "google_news")!;
    const canonicalKey = googleNewsSource.canonicalKey;
    const repeated = await refreshSourceById({
      briefing: briefing!,
      sourceId: googleNewsSource.id,
      repo,
      bucket,
      queue,
      env: { ...env(), APIFY_API_TOKEN: "token" } as Env,
      fetcher: fetcher as unknown as typeof fetch,
      now: new Date(FIXTURE_NOW.getTime() + 5 * 60 * 1000),
      force: true
    });
    expect(repeated).toMatchObject({ imported: 0, queued: 0, runStarted: true });
    expect(queue.messages).toHaveLength(1);
    expect((await repo.getSource(googleNewsSource.id))?.canonicalKey).toBe(canonicalKey);
    const savedBriefing = await repo.getBriefingById(briefing!.id);
    expect(savedBriefing).not.toBeNull();
    await publishDueBriefingEditions({
      repo,
      briefings: [{ ...savedBriefing!, nextBriefingAt: "2026-06-25T00:00:00.000Z" }],
      now: new Date("2026-06-25T00:08:00.000Z")
    });

    const feedResponse = await app.request("/api/feed/feed-owner/personal", {}, env());
    expect(feedResponse.status).toBe(200);
    const feed = (await feedResponse.json()) as { briefing: { briefingCadence?: string }; editions: Array<{ id: string; summary: string }> };
    expect(feed.briefing.briefingCadence).toBe("hourly");
    expect(feed.editions[0].summary).toContain("Central bank announced a new circular");
    expect(feed.editions[0].summary).toContain("[1]");

    const editionResponse = await app.request(
      `/api/feed/feed-owner/personal/editions/${encodeURIComponent(feed.editions[0].id)}`,
      {},
      env()
    );
    expect(editionResponse.status).toBe(200);
    const edition = (await editionResponse.json()) as { edition: { sections: Array<{ evidence: Array<{ sourceTitle: string }> }> } };
    expect(edition.edition.sections[0].evidence[0].sourceTitle).toBe("Reuters");
  });

  it("starts the secondary Google News actor when the primary actor cannot start", async () => {
    const repo = new InMemoryRepository();
    const bucket = new FakeBucket();
    const queue = new FakeQueue();
    const fetcher = vi.fn(async (request: RequestInfo | URL, init?: RequestInit) => {
      const url = String(request);
      if (url.includes("/actors/groupoject~google-news-scraper/runs")) {
        return new Response(JSON.stringify({ error: { message: "Primary actor is temporarily unavailable" } }), {
          status: 503,
          headers: { "content-type": "application/json" }
        });
      }
      if (url.includes("/actors/solidcode~google-news-scraper/runs")) {
        expect(JSON.parse(String(init?.body))).toMatchObject({
          keywords: ["lebanon economy"],
          timeFilter: "hour",
          language: "en",
          country: "US",
          maxResults: 10
        });
        return new Response(JSON.stringify({ data: {
          id: "run_google_fallback",
          status: "RUNNING",
          defaultDatasetId: "dataset_google_fallback",
          startedAt: "2026-06-25T00:00:00.000Z"
        } }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response("not found", { status: 404 });
    });
    const app = createApp({ repository: repo, bucket, queue, fetcher: fetcher as unknown as typeof fetch, now: () => FIXTURE_NOW });
    const user = await createVerifiedUser(app, repo, "fallback@test.com", "Fallback Owner");
    const briefing = await repo.getBriefingBySlug(user.account.id, "personal");
    expect(briefing).not.toBeNull();

    const response = await app.request(
      "/api/me/sources",
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie: user.cookie },
        body: JSON.stringify({ briefingId: briefing!.id, input: "news: lebanon economy" })
      },
      {
        ...env(),
        APIFY_API_TOKEN: "token",
        APIFY_GOOGLE_NEWS_ACTOR_ID: "groupoject/google-news-scraper",
        APIFY_GOOGLE_NEWS_FALLBACK_ACTOR_ID: "solidcode/google-news-scraper"
      } as Env
    );

    expect(response.status).toBe(200);
    const source = (await repo.listSources(briefing!.id)).find((candidate) => candidate.kind === "google_news");
    expect(source).toMatchObject({ actorId: "groupoject/google-news-scraper" });
    expect(await repo.listSourceRuns({ sourceId: source!.id })).toEqual([
      expect.objectContaining({
        actorId: "solidcode/google-news-scraper",
        actorRunId: "run_google_fallback",
        state: "running",
        estimatedCostUsd: 0.01005
      })
    ]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("refreshes legacy RSS Google News sources through the compatibility path", async () => {
    const repo = new InMemoryRepository();
    const bucket = new FakeBucket();
    const queue = new FakeQueue();
    const staleArticleUrl = "https://news.google.com/rss/articles/stale-power-grid?oc=5";
    const fetcher = vi.fn(async (request: RequestInfo | URL) => {
      const url = String(request);
      expect(url).not.toBe(staleArticleUrl);
      if (url.startsWith("https://news.google.com/rss/search")) {
        expect(new URL(url).searchParams.get("q")).toBe("lebanon electricity");
        return new Response(
          `<?xml version="1.0"?>
          <rss><channel>
            <title>"lebanon electricity" - Google News</title>
            <item>
              <title>Power grid repairs completed - Daily Wire</title>
              <link>https://news.google.com/rss/articles/power-grid?oc=5</link>
              <guid isPermaLink="false">power-grid</guid>
              <pubDate>Tue, 16 Jun 2026 08:10:00 GMT</pubDate>
              <source url="https://example.com">Daily Wire</source>
            </item>
          </channel></rss>`,
          { status: 200, headers: { "content-type": "application/rss+xml" } }
        );
      }
      return new Response("not found", { status: 404 });
    });
    const user = await createVerifiedUser(createApp({ repository: repo }), repo, "owner@test.com", "Feed Owner");
    const briefing = await repo.getBriefingBySlug(user.account.id, "personal");
    expect(briefing).not.toBeNull();
    const source = await repo.upsertConfiguredSource({
      briefingId: briefing!.id,
      title: "Google News: lebanon electricity",
      provider: "rss",
      kind: "google_news",
      sourceUrl: staleArticleUrl,
      actorId: "groupoject/google-news-scraper",
      actorInput: { queries: ["lebanon electricity"], geo: "US", language: "en" },
      enabled: true
    });

    await refreshSourceById({
      briefing: briefing!,
      sourceId: source.id,
      repo,
      bucket,
      queue,
      env: env(),
      fetcher: fetcher as unknown as typeof fetch,
      now: new Date("2026-06-16T08:15:00.000Z")
    });

    expect(queue.messages).toHaveLength(1);
    expect(Array.from(bucket.objects.keys()).some((key) => key.includes("google-news/"))).toBe(true);
    const refreshedSource = await repo.getSource(source.id);
    expect(refreshedSource).toMatchObject({
      title: "Google News: lebanon electricity",
      provider: "rss",
      kind: "google_news",
      sourceUrl: "https://news.google.com/rss/search?q=lebanon+electricity&hl=en-US&gl=US&ceid=US%3Aen"
    });
  });

  it("does not use a paid Google News fallback without confirmed storage rights", async () => {
    const repo = new InMemoryRepository();
    const bucket = new FakeBucket();
    const queue = new FakeQueue();
    const fetcher = vi.fn(async (request: RequestInfo | URL, init?: RequestInit) => {
      const url = String(request);
      if (url.startsWith("https://news.google.com/rss/search")) {
        return new Response("unavailable", { status: 503 });
      }
      if (url.includes("/actors/groupoject~google-news-scraper/runs")) {
        expect(new URL(url).searchParams.get("maxItems")).toBeNull();
        expect(JSON.parse(String(init?.body))).toEqual({
          queries: ["lebanon economy"],
          geo: "US",
          language: "en",
          maxItemsPerQuery: 20
        });
        return new Response(JSON.stringify({
          data: {
            id: "run_google_news",
            status: "RUNNING",
            defaultDatasetId: "dataset_google_news",
            startedAt: "2026-06-16T08:15:00.000Z"
          }
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response("not found", { status: 404 });
    });
    const user = await createVerifiedUser(createApp({ repository: repo }), repo, "owner@test.com", "Feed Owner");
    const briefing = await repo.getBriefingBySlug(user.account.id, "personal");
    expect(briefing).not.toBeNull();
    const source = await repo.upsertConfiguredSource({
      briefingId: briefing!.id,
      title: "Google News: lebanon economy",
      provider: "rss",
      kind: "google_news",
      input: "news: lebanon economy",
      sourceUrl: "https://news.google.com/rss/search?q=lebanon+economy&hl=en-US&gl=US&ceid=US%3Aen",
      enabled: true
    });

    await expect(refreshSourceById({
      briefing: briefing!,
      sourceId: source.id,
      repo,
      bucket,
      queue,
      env: { ...env(), APIFY_API_TOKEN: "token", BRAVE_SEARCH_API_KEY: "brave-token" } as Env,
      fetcher: fetcher as unknown as typeof fetch,
      now: new Date("2026-06-16T08:15:00.000Z")
    })).rejects.toThrow("Could not fetch Google News RSS source: 503");
    const runs = await repo.listSourceRuns({ sourceId: source.id });
    expect(runs).toEqual([
      expect.objectContaining({ actorId: "rss-direct", state: "failed", actualCostUsd: 0 })
    ]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("recovers a transient Google News 503 with browser-compatible request headers", async () => {
    const repo = new InMemoryRepository();
    const bucket = new FakeBucket();
    const queue = new FakeQueue();
    const fetcher = vi.fn(async (_request: RequestInfo | URL, init?: RequestInit) => {
      if (fetcher.mock.calls.length === 1) return new Response("unavailable", { status: 503 });
      expect(new Headers(init?.headers).get("user-agent")).toContain("Chrome/126.0");
      return new Response(
        `<rss><channel><item><guid>recovered</guid><title>Lebanon cabinet approves energy plan - Wire</title><pubDate>Tue, 16 Jun 2026 08:10:00 GMT</pubDate><link>https://example.com/recovered</link></item></channel></rss>`,
        { status: 200, headers: { "content-type": "application/rss+xml" } }
      );
    });
    const user = await createVerifiedUser(createApp({ repository: repo }), repo, "owner@test.com", "Feed Owner");
    const briefing = (await repo.getBriefingBySlug(user.account.id, "personal"))!;
    const source = await repo.upsertConfiguredSource({
      briefingId: briefing.id,
      title: "Google News: Lebanon energy",
      provider: "rss",
      kind: "google_news",
      input: "news: Lebanon energy",
      sourceUrl: "https://news.google.com/rss/search?q=Lebanon+energy&hl=en-US&gl=US&ceid=US%3Aen",
      enabled: true
    });

    const result = await refreshSourceById({
      briefing,
      sourceId: source.id,
      repo,
      bucket,
      queue,
      fetcher: fetcher as unknown as typeof fetch,
      now: new Date("2026-06-16T08:15:00.000Z")
    });

    expect(result).toMatchObject({ imported: 1, queued: 1 });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(await repo.getSource(source.id)).toMatchObject({ healthState: "healthy", consecutiveFailures: 0 });
  });

  it("uses the budgeted Brave News API after Google News rejects both free requests", async () => {
    const repo = new InMemoryRepository();
    const bucket = new FakeBucket();
    const queue = new FakeQueue();
    const fetcher = vi.fn(async (request: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(request));
      if (url.hostname === "news.google.com") return new Response("unavailable", { status: 503 });
      expect(url.toString()).toContain("api.search.brave.com/res/v1/news/search");
      expect(url.searchParams.get("freshness")).toBe("pd");
      expect(url.searchParams.get("search_lang")).toBe("en");
      expect(new Headers(init?.headers).get("x-subscription-token")).toBe("brave-token");
      return new Response(JSON.stringify({
        type: "news",
        results: [{
          title: "Lebanon cabinet approves energy plan",
          url: "https://wire.example/lebanon-energy",
          description: "The cabinet approved a new national electricity plan.",
          page_age: "2026-06-16T08:10:00Z",
          meta_url: { hostname: "wire.example" }
        }]
      }), { status: 200, headers: { "content-type": "application/json" } });
    });
    const user = await createVerifiedUser(createApp({ repository: repo }), repo, "owner@test.com", "Feed Owner");
    const briefing = (await repo.getBriefingBySlug(user.account.id, "personal"))!;
    const source = await repo.upsertConfiguredSource({
      briefingId: briefing.id,
      title: "Google News: Lebanon energy",
      provider: "rss",
      kind: "google_news",
      input: "news: Lebanon energy",
      sourceUrl: "https://news.google.com/rss/search?q=Lebanon+energy&hl=en-US&gl=US&ceid=US%3Aen",
      enabled: true
    });

    const result = await refreshSourceById({
      briefing,
      sourceId: source.id,
      repo,
      bucket,
      queue,
      env: {
        ...env(),
        BRAVE_SEARCH_API_KEY: "brave-token",
        BRAVE_SEARCH_DAILY_BUDGET_USD: "0.50",
        BRAVE_SEARCH_STORAGE_RIGHTS_CONFIRMED: "true"
      },
      fetcher: fetcher as unknown as typeof fetch,
      now: new Date("2026-06-16T08:15:00.000Z")
    });

    expect(result).toMatchObject({ imported: 1, queued: 1, provider: "rss", kind: "google_news" });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(Array.from(bucket.objects.keys()).some((key) => key.startsWith("brave-news/"))).toBe(true);
    expect(await repo.listSourceRuns({ sourceId: source.id })).toEqual(expect.arrayContaining([
      expect.objectContaining({
        provider: "rss",
        actorId: "brave-news-search",
        state: "succeeded",
        itemCount: 1,
        actualCostUsd: 0.005
      })
    ]));
    expect(await repo.listSourceRuns({ sourceId: source.id })).toHaveLength(2);
    expect(await repo.getSource(source.id)).toMatchObject({ healthState: "healthy", consecutiveFailures: 0 });
  });

  it("keeps Google News RSS free even when historical paid fallback rows exist", async () => {
    const repo = new InMemoryRepository();
    const bucket = new FakeBucket();
    const queue = new FakeQueue();
    const fetcher = vi.fn(async (request: RequestInfo | URL) => {
      const url = String(request);
      if (url.startsWith("https://news.google.com/rss/search")) {
        return new Response("unavailable", { status: 503 });
      }
      return new Response("not found", { status: 404 });
    });
    const user = await createVerifiedUser(createApp({ repository: repo }), repo, "owner@test.com", "Feed Owner");
    const briefing = await repo.getBriefingBySlug(user.account.id, "personal");
    expect(briefing).not.toBeNull();
    const source = await repo.upsertConfiguredSource({
      briefingId: briefing!.id,
      title: "Google News: lebanon economy",
      provider: "rss",
      kind: "google_news",
      input: "news: lebanon economy",
      sourceUrl: "https://news.google.com/rss/search?q=lebanon+economy&hl=en-US&gl=US&ceid=US%3Aen",
      enabled: true
    });
    for (let hour = 0; hour < 4; hour += 1) {
      const startedAt = `2026-06-16T0${hour}:00:00.000Z`;
      await repo.createSourceRun({
        sourceId: source.id,
        briefingId: briefing!.id,
        provider: "apify",
        actorId: "groupoject/google-news-scraper",
        actorRunId: `run_google_news_${hour}`,
        state: "succeeded",
        estimatedCostUsd: 0.02,
        startedAt
      }, new Date(startedAt));
    }

    await expect(refreshSourceById({
      briefing: briefing!,
      sourceId: source.id,
      repo,
      bucket,
      queue,
      env: { ...env(), APIFY_API_TOKEN: "token" } as Env,
      fetcher: fetcher as unknown as typeof fetch,
      now: new Date("2026-06-16T08:00:00.000Z")
    })).rejects.toThrow("Could not fetch Google News RSS source: 503");
    const runs = await repo.listSourceRuns({ sourceId: source.id });

    expect(runs).toHaveLength(5);
    expect(runs).toContainEqual(expect.objectContaining({ actorId: "rss-direct", state: "failed" }));
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("marks Apify demo placeholder datasets as source errors", async () => {
    const repo = new InMemoryRepository();
    const bucket = new FakeBucket();
    const queue = new FakeQueue();
    const fetcher = vi.fn(async (request: RequestInfo | URL, init?: RequestInit) => {
      const url = String(request);
      if (url.includes("/actors/kaitoeasyapi~twitter-x-data-tweet-scraper-pay-per-result-cheapest/runs")) {
        expect(new URL(url).searchParams.get("maxItems")).toBe("20");
        expect(JSON.parse(String(init?.body))).toMatchObject({
          searchTerms: ["from:ALJADEEDNEWS"],
          queryType: "Latest",
          maxItems: 20
        });
        return new Response(JSON.stringify({
          data: {
            id: "run_x",
            status: "RUNNING",
            defaultDatasetId: "dataset_x",
            startedAt: "2026-06-16T08:00:00.000Z"
          }
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("/actor-runs/run_x")) {
        return new Response(JSON.stringify({
          data: {
            id: "run_x",
            status: "SUCCEEDED",
            defaultDatasetId: "dataset_x"
          }
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("/datasets/dataset_x/items")) {
        return new Response(JSON.stringify([{ demo: true }, { demo: true }]), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      return new Response("not found", { status: 404 });
    });
    const app = createApp({ repository: repo, bucket, queue, fetcher: fetcher as unknown as typeof fetch });
    const user = await createVerifiedUser(app, repo, "owner@test.com", "Feed Owner");
    const briefing = await repo.getBriefingBySlug(user.account.id, "personal");
    expect(briefing).not.toBeNull();

    const addResponse = await app.request(
      "/api/me/sources",
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie: user.cookie },
        body: JSON.stringify({ briefingId: briefing!.id, input: "x: @ALJADEEDNEWS" })
      },
      {
        ...env(),
        APIFY_API_TOKEN: "token",
        APIFY_X_ACTOR_ID: "kaitoeasyapi/twitter-x-data-tweet-scraper-pay-per-result-cheapest"
      } as Env
    );
    expect(addResponse.status).toBe(200);

    await pollApifySourceRuns({
      repo,
      bucket,
      queue,
      env: {
        ...env(),
        APIFY_API_TOKEN: "token",
        APIFY_X_ACTOR_ID: "kaitoeasyapi/twitter-x-data-tweet-scraper-pay-per-result-cheapest"
      } as Env,
      fetcher: fetcher as unknown as typeof fetch
    });

    const sources = await repo.listSources(briefing!.id);
    const source = sources.find((item) => item.kind === "x_profile");
    expect(source?.lastError).toContain("demo placeholders");
    const runs = await repo.listSourceRuns({ sourceId: source!.id });
    expect(runs[0]).toMatchObject({
      state: "failed",
      itemCount: 0
    });
    expect(runs[0].error).toContain("paid Apify plan");
    expect(queue.messages).toHaveLength(0);
  });

  it("treats Xquik zero-output diagnostics as a successful empty result", () => {
    expect(describeUnusableApifyDataset([
      { resultType: "diagnostic", status: "zero-output", message: "No matching tweets" }
    ], 0)).toEqual({
      message: "Apify returned no results for this X source input.",
      failed: false
    });
  });

  it("serves feed links without auth even when an old row has the removed private flag", async () => {
    const repo = new InMemoryRepository();
    const app = createApp({ repository: repo });
    const user = await createVerifiedUser(app, repo, "owner@test.com", "Feed Owner");
    const briefing = await repo.getBriefingBySlug(user.account.id, "personal");
    expect(briefing).not.toBeNull();
    await repo.upsertBriefing({ ...briefing!, publicFeedEnabled: false, retentionDays: 60 });

    const edition: BriefingEdition = {
      id: "edition_old_private",
      briefingId: briefing!.id,
      cadence: "hourly",
      windowStart: "2026-06-16T07:00:00.000Z",
      windowEnd: "2026-06-16T08:00:00.000Z",
      title: "Hourly briefing",
      summary: "Old private rows now serve through normal feed links.",
      sections: [
        {
          title: "Update",
          summary: "Old private rows now serve through normal feed links.",
          evidence: []
        }
      ],
      status: "published",
      publishedAt: "2026-06-16T08:00:00.000Z",
      createdAt: "2026-06-16T08:00:00.000Z",
      updatedAt: "2026-06-16T08:00:00.000Z"
    };
    await repo.saveBriefingEdition(edition);

    const feedResponse = await app.request("/api/feed/feed-owner/personal", {}, env());
    expect(feedResponse.status).toBe(200);
    const feed = (await feedResponse.json()) as {
      briefing: { publicFeedEnabled: boolean; retentionDays: number };
      editions: Array<{ summary: string }>;
    };
    expect(feed.briefing.publicFeedEnabled).toBe(true);
    expect(feed.briefing.retentionDays).toBe(15);
    expect(feed.editions[0].summary).toContain("Old private rows");

    const searchResponse = await app.request("/api/feed/feed-owner/personal/search?q=private", {}, env());
    expect(searchResponse.status).toBe(200);

    const starResponse = await app.request(
      "/api/feed/feed-owner/personal/star",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ starred: true })
      },
      env()
    );
    expect(starResponse.status).toBe(200);
  });

  it("merges saved items that reuse the same raw evidence", async () => {
    const repo = new InMemoryRepository();
    const app = createApp({ repository: repo });
    const user = await createVerifiedUser(app, repo, "owner@test.com", "Feed Owner");
    const briefing = await repo.getBriefingBySlug(user.account.id, "personal");
    expect(briefing).not.toBeNull();

    const evidence = {
      messageId: `${briefing!.id}::raw_duplicate`,
      sourceId: "src_duplicate",
      sourceTitle: "LBCI_NEWS",
      sourceType: "channel" as const,
      sourceProvider: "telegram" as const,
      sourceKind: "telegram_channel" as const,
      sourceUrl: "https://t.me/LBCI_NEWS/303821",
      postedAt: "2026-06-18T08:38:00.000Z",
      text: "وزير الخارجية الإسرائيلي: قطع جميع الاتصالات مع مسؤولة السياسة الخارجية في الاتحاد الأوروبي",
      links: ["https://twitter.com/LBCI_NEWS/status/2067527301990900181"],
      media: []
    };
    const first: BriefingItem = {
      id: "item_duplicate_a",
      clusterId: "cluster_duplicate_a",
      summary: "first summary",
      itemAt: "2026-06-18T08:38:00.000Z",
      updatedAt: "2026-06-18T08:38:00.000Z",
      expiresAt: "2026-07-03T08:38:00.000Z",
      mergedUpdateCount: 0,
      evidence: [evidence]
    };
    const second: BriefingItem = {
      ...first,
      id: "item_duplicate_b",
      clusterId: "cluster_duplicate_b",
      summary: "second summary"
    };

    await repo.saveBriefingItems(briefing!.id, [first, second]);
    const feedItems = await repo.listFeedItems(user.account.id, "personal", true, FIXTURE_NOW);
    expect(feedItems).toHaveLength(1);
    expect(feedItems[0].evidence).toHaveLength(1);
  });

  it("lists top explored feeds by stars and oldest tie", async () => {
    const repo = new InMemoryRepository();
    const app = createApp({ repository: repo });

    const older = await createVerifiedUser(app, repo, "older@test.com", "Older Owner");
    const newer = await createVerifiedUser(app, repo, "newer@test.com", "Newer Owner");
    const top = await createVerifiedUser(app, repo, "top@test.com", "Top Owner");
    const disabled = await createVerifiedUser(app, repo, "disabled@test.com", "Disabled Owner");
    const lowerOwners = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        createVerifiedUser(app, repo, `lower-${index}@test.com`, `Lower Owner ${index}`)
      )
    );
    const owners = [older, newer, top, disabled, ...lowerOwners];

    const updates = [
      { owner: owners[0], title: "Older Tie", stars: 5 },
      { owner: owners[1], title: "Newer Tie", stars: 5 },
      { owner: owners[2], title: "Top Feed", stars: 9 },
      { owner: owners[3], title: "Disabled Feed", stars: 99 },
      ...owners.slice(4).map((owner, index) => ({ owner, title: `Lower Feed ${index}`, stars: 4 - (index % 4) }))
    ];

    for (const update of updates) {
      const briefing = await repo.getBriefingBySlug(update.owner.account.id, "personal");
      expect(briefing).not.toBeNull();
      await repo.upsertBriefing({ ...briefing!, title: update.title, stars: update.stars });
    }
    await repo.updateAccount({ id: owners[3].account.id, disabled: true });

    const response = await app.request("/api/explore/feeds", {}, env());
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { feeds: Array<{ title: string; stars: number }> };
    expect(payload.feeds).toHaveLength(10);
    expect(payload.feeds.map((feed) => feed.title).slice(0, 3)).toEqual(["Top Feed", "Older Tie", "Newer Tie"]);
    expect(payload.feeds.some((feed) => feed.title === "Disabled Feed")).toBe(false);
  });

  it("redirects reserved old usernames after username changes", async () => {
    const repo = new InMemoryRepository();
    const app = createApp({ repository: repo });
    const user = await createVerifiedUser(app, repo, "owner@test.com", "Old Name");
    const briefingsResponse = await app.request("/api/me/briefings", { headers: { cookie: user.cookie } }, env());
    const { briefings } = (await briefingsResponse.json()) as { briefings: Array<Record<string, unknown>> };
    await app.request(
      "/api/me/briefings",
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie: user.cookie },
        body: JSON.stringify({ ...briefings[0], publicFeedEnabled: true })
      },
      env()
    );

    const rename = await app.request(
      "/api/me/account",
      {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie: user.cookie },
        body: JSON.stringify({ username: "New Name" })
      },
      env()
    );
    expect(rename.status).toBe(200);

    const redirect = await app.request("/api/feed/old-name/personal", {}, env());
    expect(redirect.status).toBe(301);
    expect(redirect.headers.get("location")).toBe("http://localhost/api/feed/new-name/personal");
  });

  it("redirects legacy domains to the canonical Distilled domain", async () => {
    const app = createApp({ repository: new InMemoryRepository() });

    const legacy = await app.request("https://lownoise.news/ammar-mohanna/personal/?q=power", {}, env());
    expect(legacy.status).toBe(301);
    expect(legacy.headers.get("location")).toBe("https://distilled.news/ammar-mohanna/personal/?q=power");

    const canonicalWww = await app.request("https://www.distilled.news/", {}, env());
    expect(canonicalWww.status).toBe(301);
    expect(canonicalWww.headers.get("location")).toBe("https://distilled.news/");
  });

  it("returns security headers and rejects common sensitive-path probes", async () => {
    const app = createApp({ repository: new InMemoryRepository() });
    const session = await app.request("/api/auth/session", {}, env());
    expect(session.status).toBe(200);
    expect(session.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(session.headers.get("strict-transport-security")).toContain("max-age=31536000");
    expect(session.headers.get("x-content-type-options")).toBe("nosniff");

    expect((await app.request("/.env", {}, env())).status).toBe(404);
    expect((await app.request("/.git/config", {}, env())).status).toBe(404);
    expect((await app.request("/wp-login.php", {}, env())).status).toBe(404);

    const robots = await app.request("/robots.txt", {}, env());
    expect(robots.status).toBe(200);
    expect(await robots.text()).toContain("Disallow: /api/");
  });

  it("requires the current password before changing account passwords", async () => {
    const repo = new InMemoryRepository();
    const app = createApp({ repository: repo });
    const user = await createVerifiedUser(app, repo, "owner@test.com", "Owner User");

    const rejected = await app.request(
      "/api/me/account",
      {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie: user.cookie },
        body: JSON.stringify({ currentPassword: "wrong-password", newPassword: "newpassword123" })
      },
      env()
    );
    expect(rejected.status).toBe(401);

    const changed = await app.request(
      "/api/me/account",
      {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie: user.cookie },
        body: JSON.stringify({ currentPassword: "password123", newPassword: "newpassword123" })
      },
      env()
    );
    expect(changed.status).toBe(200);

    const oldLogin = await app.request(
      "/api/auth/login",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "owner@test.com", password: "password123" })
      },
      env()
    );
    expect(oldLogin.status).toBe(401);

    const newLogin = await app.request(
      "/api/auth/login",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "owner@test.com", password: "newpassword123" })
      },
      env()
    );
    expect(newLogin.status).toBe(200);
  });

  it("treats malformed session cookies as unauthenticated", async () => {
    const app = createApp({ repository: new InMemoryRepository() });

    const response = await app.request(
      "/api/me/account",
      { headers: { cookie: "dn_session=not-a-valid-session" } },
      env()
    );

    expect(response.status).toBe(401);
  });

  it("fails closed for retention cleanup and deletes expired R2 archives when authorized", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FIXTURE_NOW);

    const repo = new InMemoryRepository();
    const bucket = new FakeBucket();
    const app = createApp({ repository: repo, bucket, queue: new FakeQueue() });
    const user = await createVerifiedUser(app, repo, "owner@test.com", "Owner User");
    const briefing = await repo.getBriefingBySlug(user.account.id, "personal");
    expect(briefing).not.toBeNull();

    const archiveKey = "telegram-public/briefing_1/source/expired.html";
    await bucket.put(archiveKey, "<html>old</html>");
    const message: NormalizedMessage = {
      id: `${briefing!.id}::expired_message`,
      source: { id: "src_expired", title: "Expired Source", type: "channel", provider: "telegram", kind: "telegram_channel" },
      messageId: "expired_message",
      text: "Expired source post.",
      links: [],
      media: [],
      postedAt: "2026-05-01T10:00:00.000Z",
      receivedAt: "2026-05-01T10:00:10.000Z",
      sourceUrl: "https://t.me/source/1",
      rawPayloadKey: archiveKey,
      expiresAt: "2026-05-16T10:00:00.000Z"
    };
    const source = await repo.upsertSourceFromMessage(briefing!.id, message);
    await repo.saveRawMessage(briefing!.id, { ...message, source: { ...message.source, id: source.id } });

    const blocked = await app.request(
      "/api/internal/retention/run",
      { method: "POST" },
      { ...env(), INTERNAL_MAINTENANCE_SECRET: undefined } as Env
    );
    expect(blocked.status).toBe(401);
    expect(await repo.getRawMessage(message.id)).not.toBeNull();
    expect(bucket.objects.has(archiveKey)).toBe(true);

    const authorized = await app.request(
      "/api/internal/retention/run",
      { method: "POST", headers: { "x-distilled-internal": "internal-secret" } },
      env()
    );
    expect(authorized.status).toBe(200);
    expect(await authorized.json()).toEqual({ deleted: 1, archivesDeleted: 1, archiveDeleteFailures: 0 });
    expect(await repo.getRawMessage(message.id)).toBeNull();
    expect(bucket.objects.has(archiveKey)).toBe(false);
  });

  it("keeps shared R2 archives while any referencing raw message is still active", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FIXTURE_NOW);

    const repo = new InMemoryRepository();
    const bucket = new FakeBucket();
    const app = createApp({ repository: repo, bucket, queue: new FakeQueue() });
    const user = await createVerifiedUser(app, repo, "owner@test.com", "Owner User");
    const briefing = await repo.getBriefingBySlug(user.account.id, "personal");
    expect(briefing).not.toBeNull();

    const archiveKey = "rss/briefing_1/source/shared.xml";
    await bucket.put(archiveKey, "<rss>mixed</rss>");
    const expired: NormalizedMessage = {
      id: `${briefing!.id}::expired_shared`,
      source: { id: "src_shared", title: "Shared Source", type: "channel", provider: "rss", kind: "rss_feed" },
      messageId: "expired_shared",
      text: "Expired source post.",
      links: [],
      media: [],
      postedAt: "2026-05-01T10:00:00.000Z",
      receivedAt: "2026-05-01T10:00:10.000Z",
      sourceUrl: "https://example.com/feed.xml#old",
      rawPayloadKey: archiveKey,
      expiresAt: "2026-05-16T10:00:00.000Z"
    };
    const active: NormalizedMessage = {
      ...expired,
      id: `${briefing!.id}::active_shared`,
      messageId: "active_shared",
      text: "Active source post.",
      postedAt: "2026-06-20T10:00:00.000Z",
      receivedAt: "2026-06-20T10:00:10.000Z",
      sourceUrl: "https://example.com/feed.xml#new",
      expiresAt: "2026-07-05T10:00:00.000Z"
    };
    const source = await repo.upsertSourceFromMessage(briefing!.id, expired);
    await repo.saveRawMessage(briefing!.id, { ...expired, source: { ...expired.source, id: source.id } });
    await repo.saveRawMessage(briefing!.id, { ...active, source: { ...active.source, id: source.id } });

    const authorized = await app.request(
      "/api/internal/retention/run",
      { method: "POST", headers: { "x-distilled-internal": "internal-secret" } },
      env()
    );

    expect(authorized.status).toBe(200);
    expect(await authorized.json()).toEqual({ deleted: 1, archivesDeleted: 0, archiveDeleteFailures: 0 });
    expect(await repo.getRawMessage(expired.id)).toBeNull();
    expect(await repo.getRawMessage(active.id)).not.toBeNull();
    expect(bucket.objects.has(archiveKey)).toBe(true);
  });

  it("lets admins view and manage accounts while preserving at least one admin", async () => {
    const repo = new InMemoryRepository();
    const app = createApp({ repository: repo });
    const admin = await createVerifiedUser(app, repo, "admin@test.com", "Admin User", "admin");
    const user = await createVerifiedUser(app, repo, "user@test.com", "Normal User");

    const accountsResponse = await app.request("/api/admin/accounts", { headers: { cookie: admin.cookie } }, env());
    expect(accountsResponse.status).toBe(200);
    const accounts = (await accountsResponse.json()) as { accounts: Array<{ id: string; email: string }> };
    expect(accounts.accounts.map((account) => account.email)).toContain("user@test.com");

    const legacySecretResponse = await app.request(
      "/api/admin/accounts",
      { headers: { "x-distilled-admin": "admin-secret" } },
      env()
    );
    expect(legacySecretResponse.status).toBe(401);

    const disabled = await app.request(
      `/api/admin/accounts/${user.account.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie: admin.cookie },
        body: JSON.stringify({ disabled: true })
      },
      env()
    );
    expect(disabled.status).toBe(200);

    const userBriefing = await repo.getBriefingBySlug(user.account.id, "personal");
    expect(userBriefing).not.toBeNull();

    const briefingsResponse = await app.request("/api/admin/briefings", { headers: { cookie: admin.cookie } }, env());
    expect(briefingsResponse.status).toBe(200);
    const adminBriefings = (await briefingsResponse.json()) as { briefings: Array<{ id: string; ownerAccountId: string }> };
    expect(adminBriefings.briefings.some((briefing) => briefing.ownerAccountId === user.account.id)).toBe(true);

    const pauseFeed = await app.request(
      `/api/admin/briefings/${userBriefing!.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie: admin.cookie },
        body: JSON.stringify({ paused: true })
      },
      env()
    );
    expect(pauseFeed.status).toBe(200);
    expect((await repo.getBriefingById(userBriefing!.id))?.paused).toBe(true);

    const deleteFeed = await app.request(
      `/api/admin/briefings/${userBriefing!.id}`,
      { method: "DELETE", headers: { cookie: admin.cookie } },
      env()
    );
    expect(deleteFeed.status).toBe(200);
    expect(await repo.getBriefingById(userBriefing!.id)).toBeNull();

    const deleteUser = await app.request(
      `/api/admin/accounts/${user.account.id}`,
      { method: "DELETE", headers: { cookie: admin.cookie } },
      env()
    );
    expect(deleteUser.status).toBe(200);
    expect(await repo.getAccountById(user.account.id)).toBeNull();

    const rejectSelfDelete = await app.request(
      `/api/admin/accounts/${admin.account.id}`,
      { method: "DELETE", headers: { cookie: admin.cookie } },
      env()
    );
    expect(rejectSelfDelete.status).toBe(400);

    const rejectLastAdminDisable = await app.request(
      `/api/admin/accounts/${admin.account.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie: admin.cookie },
        body: JSON.stringify({ disabled: true })
      },
      env()
    );
    expect(rejectLastAdminDisable.status).toBe(400);
  });

  it("lets an admin test email delivery only to their own account", async () => {
    const repo = new InMemoryRepository();
    const email = new FakeEmail();
    const app = createApp({ repository: repo, now: () => FIXTURE_NOW });
    const admin = await createVerifiedUser(app, repo, "admin@test.com", "Admin User", "admin");
    const user = await createVerifiedUser(app, repo, "user@test.com", "Normal User");
    const environment = env(email);

    const unauthorized = await app.request("/api/admin/email/test", { method: "POST", headers: { cookie: user.cookie } }, environment);
    expect(unauthorized.status).toBe(401);

    const response = await app.request("/api/admin/email/test", { method: "POST", headers: { cookie: admin.cookie } }, environment);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      recipientDomain: "test.com",
      sentAt: FIXTURE_NOW.toISOString()
    });
    expect(email.messages).toHaveLength(1);
    expect(email.messages[0]).toMatchObject({
      to: "admin@test.com",
      from: { email: "noreply@distilled.news", name: "Distilled.news" },
      subject: "Distilled.news email delivery test"
    });
    const status = await app.request("/api/admin/email/status", { headers: { cookie: admin.cookie } }, environment);
    expect(status.status).toBe(200);
    expect(await status.json()).toEqual({
      configured: true,
      senderDomain: "distilled.news",
      lastSuccessAt: FIXTURE_NOW.toISOString()
    });
  });

  it("reports email delivery-test failures without exposing provider details", async () => {
    const repo = new InMemoryRepository();
    const app = createApp({ repository: repo, now: () => FIXTURE_NOW });
    const admin = await createVerifiedUser(app, repo, "admin@test.com", "Admin User", "admin");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const response = await app.request(
        "/api/admin/email/test",
        { method: "POST", headers: { cookie: admin.cookie } },
        env(new FailingEmail() as unknown as FakeEmail)
      );
      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({ error: "could not send test email" });
      expect(errorSpy).toHaveBeenCalledWith("Could not send admin delivery test email", expect.objectContaining({
        accountId: admin.account.id,
        senderDomain: "distilled.news",
        errorCode: "E_SENDER_DOMAIN_NOT_AVAILABLE"
      }));
      const status = await app.request(
        "/api/admin/email/status",
        { headers: { cookie: admin.cookie } },
        env(new FailingEmail() as unknown as FakeEmail)
      );
      expect(await status.json()).toMatchObject({
        configured: true,
        lastFailureAt: FIXTURE_NOW.toISOString()
      });
    } finally {
      errorSpy.mockRestore();
    }
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

async function createVerifiedUser(
  app: ReturnType<typeof createApp>,
  repo: InMemoryRepository,
  email: string,
  username: string,
  role: "admin" | "user" = "user"
) {
  const account = await repo.createAccount({
    email,
    username: username.toLowerCase().replace(/\s+/g, "-"),
    role,
    passwordHash: await hashPassword("password123"),
    emailVerifiedAt: new Date("2026-06-16T10:00:00.000Z").toISOString()
  });
  await repo.ensureDefaultBriefing(account);
  const login = await app.request(
    "/api/auth/login",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: "password123" })
    },
    env()
  );
  return { account, cookie: login.headers.get("set-cookie")?.split(";")[0] ?? "" };
}

function tokenFromMessage(text: string | undefined): string {
  const token = text?.match(/token=([^\s]+)/)?.[1];
  if (!token) throw new Error("token not found in email");
  return decodeURIComponent(token);
}
