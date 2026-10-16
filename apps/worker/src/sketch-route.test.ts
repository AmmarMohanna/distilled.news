import { expect, it } from "vitest";
import { createApp } from "./app";
import { InMemoryRepository } from "./repository";
import type { Env } from "./types";

it("serves old image bytes to the public with a stale marker until regeneration", async () => {
  const repo = new InMemoryRepository();
  const owner = await repo.createAccount({
    email: "owner@example.com", username: "owner", role: "user",
    passwordHash: "test-only", emailVerifiedAt: new Date().toISOString()
  });
  const original = await repo.ensureDefaultBriefing(owner);
  const feed = await repo.upsertBriefing({ ...original, publicFeedEnabled: true });
  const imagePath = `/api/feed/${owner.username}/${feed.slug}/sketch`;

  const archive = {
    get: async () => ({
      body: new Blob(["old sketch"]).stream(),
      customMetadata: {}
    })
  };
  const env = { RAW_ARCHIVE: archive } as unknown as Env;
  const app = createApp({ repository: repo });

  const old = await app.request(imagePath, {}, env);
  expect(old.status).toBe(200);
  expect(old.headers.get("X-Sketch-Stale")).toBeNull();
  expect(old.headers.get("Cache-Control")).toBe("no-store");
  expect(await old.text()).toBe("old sketch");

  const again = await app.request(imagePath, {}, env);
  expect(again.status).toBe(200);
  expect(await again.text()).toBe("old sketch");
});
