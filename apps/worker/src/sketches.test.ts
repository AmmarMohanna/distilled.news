import { describe, expect, it, vi } from "vitest";
import { createApp } from "./app";
import { createSession } from "./auth";
import { InMemoryRepository } from "./repository";
import { sketchPrompt, sketchDiagnostic } from "./sketches";
import type { Env } from "./types";

async function fixture() {
  const repo = new InMemoryRepository();
  const account = await repo.createAccount({ email: "sketch@example.test", username: "artist", role: "user", passwordHash: "unused", emailVerifiedAt: new Date().toISOString() });
  const feed = await repo.ensureDefaultBriefing(account);
  let stored: { customMetadata: { fingerprint: string }; body: Uint8Array } | null = null;
  const run = vi.fn(async () => ({ image: btoa(String.fromCharCode(255, 216, 255, 217)) }));
  const env = {
    ADMIN_SESSION_SECRET: "test-secret",
    AI: { run },
    RAW_ARCHIVE: {
      head: vi.fn(async () => stored), get: vi.fn(async () => stored),
      put: vi.fn(async (_key, bytes, options) => { stored = { body: bytes, customMetadata: options.customMetadata }; }),
      delete: vi.fn(async () => { stored = null; })
    }
  } as unknown as Env;
  const app = createApp({ repository: repo });
  const headers = { cookie: `dn_session=${await createSession(env.ADMIN_SESSION_SECRET!, account)}` };
  const path = `/api/me/briefings/${feed.id}/sketch`;
  const publicPath = `/api/feed/artist/${feed.slug}/sketch`;
  return { repo, account, feed, env, app, headers, path, publicPath, run };
}

describe("feed sketches", () => {
  it("automatically generates unfamiliar saved topics and reuses the image", async () => {
    const f = await fixture();
    const save = () => f.app.request("/api/me/briefings", { method: "POST", headers: { ...f.headers, "content-type": "application/json" }, body: JSON.stringify({ ...f.feed, title: "Underwater archaeology", interestProfile: "Ancient shipwreck excavation" }) }, f.env);
    expect((await save()).status).toBe(200);
    expect(f.run).toHaveBeenCalledTimes(1);
    expect(f.run.mock.calls[0]).toBeDefined();
    expect(JSON.stringify(f.run.mock.calls)).toContain("Ancient shipwreck excavation");
    expect((await save()).status).toBe(200);
    expect(f.run).toHaveBeenCalledTimes(1);
  });

  it("saves the feed even when automatic image generation fails", async () => {
    const f = await fixture();
    f.run.mockRejectedValueOnce(new Error("provider unavailable"));
    const response = await f.app.request("/api/me/briefings", { method: "POST", headers: { ...f.headers, "content-type": "application/json" }, body: JSON.stringify({ ...f.feed, title: "Ocean exploration" }) }, f.env);
    expect(response.status).toBe(200);
    expect((await f.repo.getBriefingById(f.feed.id))?.title).toBe("Ocean exploration");
    expect(f.env.RAW_ARCHIVE.put).not.toHaveBeenCalled();
  });
  it("redacts credentials and feed text from provider diagnostics", () => {
    const detail = sketchDiagnostic(new Error("private politics cfoat_example123 Bearer sensitive-value api_key=another-secret"), ["private politics"]);
    expect(detail).not.toContain("private politics");
    expect(detail).not.toContain("example123");
    expect(detail).not.toContain("sensitive-value");
    expect(detail).not.toContain("another-secret");
    expect(detail).toContain("[redacted]");
  });
  it("requires authentication and ownership before generating", async () => {
    const f = await fixture();
    expect((await f.app.request(f.path, { method: "POST" }, f.env)).status).toBe(401);
    const other = await f.repo.createAccount({ email: "other@example.test", username: "other", role: "user", passwordHash: "unused", emailVerifiedAt: new Date().toISOString() });
    const cookie = `dn_session=${await createSession(f.env.ADMIN_SESSION_SECRET!, other)}`;
    expect((await f.app.request(f.path, { method: "POST", headers: { cookie } }, f.env)).status).toBe(404);
    expect(f.run).not.toHaveBeenCalled();
  });

  it("stores, serves and reuses a sketch, and keeps it visible until replacement", async () => {
    const f = await fixture();
    expect((await f.app.request(f.publicPath, {}, f.env)).status).toBe(404);
    expect((await f.app.request(f.path, { method: "POST", headers: f.headers }, f.env)).status).toBe(200);
    const image = await f.app.request(f.publicPath, {}, f.env);
    expect(image.headers.get("content-type")).toBe("image/jpeg");
    expect(image.headers.get("x-sketch-current")).toBe("true");
    expect(new Uint8Array(await image.arrayBuffer())).toEqual(new Uint8Array([255, 216, 255, 217]));
    await f.app.request(f.path, { method: "POST", headers: f.headers }, f.env);
    expect(f.run).toHaveBeenCalledTimes(1);
    await f.repo.upsertBriefing({ ...f.feed, interestProfile: "Cedar forests and conservation" });
    const stale = await f.app.request(f.publicPath, {}, f.env);
    expect(stale.status).toBe(200);
    expect(stale.headers.get("x-sketch-current")).toBe("false");
    expect((await f.app.request(f.path, { method: "POST", headers: f.headers }, f.env)).status).toBe(200);
    expect(f.run).toHaveBeenCalledTimes(2);
  });

  it("reports missing AI and provider failures without saving broken images", async () => {
    const f = await fixture();
    expect((await f.app.request(f.path, { method: "POST", headers: f.headers }, { ...f.env, AI: undefined })).status).toBe(503);
    f.run.mockRejectedValueOnce(new Error("provider unavailable"));
    expect((await f.app.request(f.path, { method: "POST", headers: f.headers }, f.env)).status).toBe(502);
    expect(f.env.RAW_ARCHIVE.put).not.toHaveBeenCalled();
  });

  it("limits repeated attempts with a short cooldown", async () => {
    const f = await fixture();
    for (let index = 0; index < 5; index++) await f.repo.recordAuthAttempt({ key: f.account.id, action: "feed_sketch" });
    const response = await f.app.request(f.path, { method: "POST", headers: f.headers }, f.env);
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("600");
    expect(await response.json()).toMatchObject({ code: "SKETCH_RETRY_LIMIT" });
    expect(f.run).not.toHaveBeenCalled();
  });

  it("allows recovery from legacy failed attempts after ten minutes", async () => {
    const f = await fixture();
    const earlier = new Date(Date.now() - 11 * 60_000);
    for (let index = 0; index < 5; index++) await f.repo.recordAuthAttempt({ key: f.account.id, action: "feed_sketch" }, earlier);
    expect((await f.app.request(f.path, { method: "POST", headers: f.headers }, f.env)).status).toBe(200);
    expect(f.run).toHaveBeenCalledTimes(1);
  });

  it("counts only saved images toward the daily allowance", async () => {
    const f = await fixture();
    f.run.mockRejectedValueOnce(new Error("provider unavailable"));
    expect((await f.app.request(f.path, { method: "POST", headers: f.headers }, f.env)).status).toBe(502);
    vi.mocked(f.env.RAW_ARCHIVE.put).mockRejectedValueOnce(new Error("storage unavailable"));
    expect((await f.app.request(f.path, { method: "POST", headers: f.headers }, f.env)).status).toBe(502);
    const count = () => f.repo.countRecentAuthAttempts({ key: f.account.id, action: "feed_sketch_saved", since: new Date(Date.now() - 86_400_000).toISOString() });
    expect(await count()).toBe(0);
    expect((await f.app.request(f.path, { method: "POST", headers: f.headers }, f.env)).status).toBe(200);
    expect(await count()).toBe(1);
    expect((await f.app.request(f.path, { method: "POST", headers: f.headers }, f.env)).status).toBe(200);
    expect(await count()).toBe(1);
  });

  it("enforces the saved-image limit while still serving and reusing cached images", async () => {
    const f = await fixture();
    await f.app.request(f.path, { method: "POST", headers: f.headers }, f.env);
    for (let index = 0; index < 4; index++) await f.repo.recordAuthAttempt({ key: f.account.id, action: "feed_sketch_saved" });
    expect((await f.app.request(f.path, { method: "POST", headers: f.headers }, f.env)).status).toBe(200);
    await f.repo.upsertBriefing({ ...f.feed, title: "New topic" });
    const response = await f.app.request(f.path, { method: "POST", headers: f.headers }, f.env);
    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ code: "SKETCH_DAILY_LIMIT" });
    expect((await f.app.request(f.publicPath, {}, f.env)).status).toBe(200);
    expect(f.run).toHaveBeenCalledTimes(1);
  });

  it("uses the same daily allowance for automatic generation", async () => {
    const f = await fixture();
    for (let index = 0; index < 5; index++) await f.repo.recordAuthAttempt({ key: f.account.id, action: "feed_sketch_saved" });
    const response = await f.app.request("/api/me/briefings", { method: "POST", headers: { ...f.headers, "content-type": "application/json" }, body: JSON.stringify({ ...f.feed, title: "New topic" }) }, f.env);
    expect(response.status).toBe(200);
    expect(f.run).not.toHaveBeenCalled();
  });

  it("does not save or charge an illustration when its feed changes during inference", async () => {
    const f = await fixture();
    f.run.mockImplementationOnce(async () => {
      await f.repo.upsertBriefing({ ...f.feed, title: "Changed during inference" });
      return { image: btoa(String.fromCharCode(255, 216, 255, 217)) };
    });
    const response = await f.app.request(f.path, { method: "POST", headers: f.headers }, f.env);
    expect(await response.json()).toMatchObject({ generated: false });
    expect(f.env.RAW_ARCHIVE.put).not.toHaveBeenCalled();
    expect(await f.repo.countRecentAuthAttempts({ key: f.account.id, action: "feed_sketch_saved", since: new Date(0).toISOString() })).toBe(0);
  });

  it.each([
    ["403 permission denied: secret-canary", "AI_ACCESS_DENIED"],
    ["429 rate limit", "AI_LIMIT"],
    ["network connection timed out", "AI_CONNECTION"]
  ])("classifies provider failure %s without exposing its payload", async (message, code) => {
    const f = await fixture();
    f.run.mockRejectedValueOnce(new Error(message));
    const response = await f.app.request(f.path, { method: "POST", headers: f.headers }, f.env);
    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body).toMatchObject({ code });
    expect(JSON.stringify(body)).not.toContain("secret-canary");
    expect(f.env.RAW_ARCHIVE.put).not.toHaveBeenCalled();
  });

  it("distinguishes storage read and write failures from AI failure", async () => {
    const f = await fixture();
    vi.mocked(f.env.RAW_ARCHIVE.head).mockRejectedValueOnce(new Error("storage unavailable"));
    const first = await f.app.request(f.path, { method: "POST", headers: f.headers }, f.env);
    expect(await first.json()).toMatchObject({ code: "SKETCH_STORAGE_READ" });
    expect(f.run).not.toHaveBeenCalled();
    vi.mocked(f.env.RAW_ARCHIVE.put).mockRejectedValueOnce(new Error("storage unavailable"));
    const second = await f.app.request(f.path, { method: "POST", headers: f.headers }, f.env);
    expect(await second.json()).toMatchObject({ code: "SKETCH_STORAGE_WRITE" });
    expect(f.run).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed image data before storage", async () => {
    const f = await fixture();
    f.run.mockResolvedValueOnce({ image: "not base64!!!" });
    const response = await f.app.request(f.path, { method: "POST", headers: f.headers }, f.env);
    expect(await response.json()).toMatchObject({ code: "AI_INVALID_IMAGE" });
    expect(f.env.RAW_ARCHIVE.put).not.toHaveBeenCalled();
  });

  it("bounds the provider prompt and includes the saved subject", () => {
    expect(sketchPrompt({ title: "Cedar forests", interestProfile: "Lebanon conservation" })).toContain("Lebanon conservation");
    expect(sketchPrompt({ title: "x".repeat(500), interestProfile: "x".repeat(10000) }).length).toBeLessThanOrEqual(2048);
  });

  it("gives broad topics concrete subjects in the app's line-art style", () => {
    const politics = sketchPrompt({ title: "politics", interestProfile: "politics" });
    expect(politics).toContain("ballot box");
    expect(politics).toContain("#5E5CE6");
    expect(politics).toContain("Exclude pencils");
    expect(sketchPrompt({ title: "football", interestProfile: "football" })).toContain("football beside a simple trophy");
  });

  it("serves cached covers from the previous style while generating replacements", async () => {
    const f = await fixture();
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(["lavender-line-v2", f.feed.title, f.feed.interestProfile])));
    const fingerprint = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
    await f.env.RAW_ARCHIVE.put("old-cover", new Uint8Array([255, 216]), { customMetadata: { fingerprint } });
    expect((await f.app.request(f.publicPath, {}, f.env)).status).toBe(200);
    expect((await f.app.request(f.path, { method: "POST", headers: f.headers }, f.env)).status).toBe(200);
    expect(f.run).toHaveBeenCalledTimes(1);
  });
});
