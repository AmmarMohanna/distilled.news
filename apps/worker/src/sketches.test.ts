import { afterEach, expect, it, vi } from "vitest";
import type { BriefingConfig } from "@distilled/core";
import type { Env } from "./types";
import { generateSketch, sketchFingerprint, sketchPrompt } from "./sketches";

afterEach(() => vi.unstubAllGlobals());

it("requests FLUX.1 Schnell with JSON and saves the JPEG in R2", async () => {
  const image = btoa(String.fromCharCode(0xff, 0xd8, 0xff, 0xd9));
  const fetcher = vi.fn().mockResolvedValue(Response.json({ result: { image } }));
  const put = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("fetch", fetcher);
  const env = {
    CLOUDFLARE_IMAGE_ACCOUNT_ID: "image-account",
    CLOUDFLARE_IMAGE_API_TOKEN: "test-only-token",
    RAW_ARCHIVE: { put }
  } as unknown as Env;
  const briefing = { id: "feed-1", title: "World politics", interestProfile: "Parliament news" } as BriefingConfig;

  await generateSketch(env, briefing);

  expect(fetcher).toHaveBeenCalledWith(
    "https://api.cloudflare.com/client/v4/accounts/image-account/ai/run/@cf/black-forest-labs/flux-1-schnell",
    expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ Authorization: "Bearer test-only-token" }),
      body: expect.any(String)
    })
  );
  const request = fetcher.mock.calls[0]![1] as RequestInit;
  expect(request.headers).toEqual(expect.objectContaining({ "Content-Type": "application/json" }));
  const payload = JSON.parse(request.body as string) as { prompt: string; steps: number };
  expect(payload).toEqual({ prompt: sketchPrompt(briefing), steps: 4 });
  expect(payload.prompt).toContain("World politics");
  expect(put).toHaveBeenCalledWith("feed-sketches/feed-1.jpg", expect.any(Uint8Array), expect.objectContaining({ httpMetadata: { contentType: "image/jpeg" } }));
});

it("uses arbitrary feed details rather than hardcoded categories and stays within Schnell's limit", () => {
  const prompt = sketchPrompt({
    title: "AI Industry Watch3",
    interestProfile: "News about AI including model releases, launches, research and partnerships"
  });
  expect(prompt).toContain("AI Industry Watch3");
  expect(prompt).toContain("research and partnerships");
  expect(prompt).toContain("#5E5CE6");
  expect(prompt).toContain("pencil grain");
  expect(prompt).not.toContain("Draw this subject: A ballot");
  expect(prompt.length).toBeLessThanOrEqual(2048);

  expect(sketchPrompt({ title: "Other", interestProfile: "very long ".repeat(800) }).length)
    .toBeLessThanOrEqual(2048);
});

it("changes the sketch fingerprint when the feed context changes", async () => {
  const original = await sketchFingerprint({ title: "AI news", interestProfile: "models" });
  expect(await sketchFingerprint({ title: "AI news", interestProfile: "research" })).not.toBe(original);
});

it("fingerprints the effective model request rather than unused description text", async () => {
  const topic = "a".repeat(1200);
  const briefing = { title: "Space news", interestProfile: topic };
  const sameRenderedPrompt = { ...briefing, interestProfile: topic + " extra invisible tail" };
  expect(sketchPrompt(briefing)).toBe(sketchPrompt(sameRenderedPrompt));
  expect(await sketchFingerprint(briefing)).toBe(await sketchFingerprint(sameRenderedPrompt));

  const altered = { ...briefing, interestProfile: "Different topic" };
  expect(await sketchFingerprint(briefing)).not.toBe(await sketchFingerprint(altered));
});
