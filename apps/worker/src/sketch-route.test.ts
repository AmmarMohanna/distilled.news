import { expect, it } from "vitest";
import {createSession} from "./auth";
import { createApp } from "./app";
import { InMemoryRepository } from "./repository";
import type { Env } from "./types";

it("serves saved public artwork with browser caching and conditional reads", async () => {
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
      customMetadata: {}, httpEtag: '"saved-art"'
    })
  };
  const env = { RAW_ARCHIVE: archive } as unknown as Env;
  const app = createApp({ repository: repo });

  const old = await app.request(imagePath, {}, env);
  expect(old.status).toBe(200);
  expect(old.headers.get("X-Sketch-Stale")).toBeNull();
  expect(old.headers.get("Cache-Control")).toBe("private, max-age=300");
  expect(await old.text()).toBe("old sketch");

  const again = await app.request(imagePath, {}, env);
  expect(again.status).toBe(200);
  expect(await again.text()).toBe("old sketch");
  const unchanged = await app.request(imagePath, {headers:{"If-None-Match":'"saved-art"'}}, env);
  expect(unchanged.status).toBe(304);
  expect(await unchanged.text()).toBe('');
  await repo.upsertBriefing({...feed,publicFeedEnabled:false});
  const denied = await app.request(imagePath, {headers:{"If-None-Match":'"saved-art"'}}, env);
  expect(denied.status).toBe(404);
  const secret = 'fixture-session-secret';
  const cookie = 'dn_session=' + await createSession(secret,owner);
  const privateImage = await app.request(imagePath,{headers:{cookie}},{...env,ADMIN_SESSION_SECRET:secret});
  expect(privateImage.status).toBe(200);
  expect(privateImage.headers.get('Cache-Control')).toBe('no-store');
  const missingEnv = {...env,RAW_ARCHIVE:{get:async()=>null}} as unknown as Env;
  await repo.upsertBriefing({...feed,publicFeedEnabled:true});
  const missing = await app.request(imagePath,{},missingEnv);
  expect(missing.status).toBe(404);
  expect(missing.headers.get('Retry-After')).toBeNull();
  const pendingEnv = {...missingEnv,DB:{prepare:()=>({bind:()=>({first:async()=>({state:'pending'})})})}} as unknown as Env;
  const pending = await app.request(imagePath,{},pendingEnv);
  expect(pending.status).toBe(404);
  expect(pending.headers.get('Retry-After')).toBe('3');
});
