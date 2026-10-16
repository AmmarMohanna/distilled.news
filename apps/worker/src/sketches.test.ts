import { afterEach, expect, it, vi } from "vitest";
import type { BriefingConfig } from "@distilled/core";
import type { Env } from "./types";
import { generateSketch, sketchPrompt } from "./sketches";

afterEach(() => vi.unstubAllGlobals());

it("sends the interest to Klein 4B as multipart form data and saves the returned JPEG", async () => {
  const image = btoa(String.fromCharCode(0xff, 0xd8, 0xff, 0xd9));
  const fetcher = vi.fn().mockResolvedValue(Response.json({ result: { image } }));
  const put = vi.fn().mockResolvedValue(undefined);
  const head = vi.fn().mockResolvedValue(null);
  vi.stubGlobal("fetch", fetcher);
  const env = {
    CLOUDFLARE_IMAGE_ACCOUNT_ID: "image-account",
    CLOUDFLARE_IMAGE_API_TOKEN: "test-only-token",
    RAW_ARCHIVE: { put, head }
  } as unknown as Env;
  const briefing = { id: "feed-1", title: "World politics", interestProfile: "Parliament news" } as BriefingConfig;

  await generateSketch(env, briefing);

  expect(fetcher).toHaveBeenCalledWith(
    "https://api.cloudflare.com/client/v4/accounts/image-account/ai/run/@cf/black-forest-labs/flux-2-klein-4b",
    expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ Authorization: "Bearer test-only-token" }),
      body: expect.any(FormData)
    })
  );
  const request = new Request(fetcher.mock.calls[0]![0], fetcher.mock.calls[0]![1]);
  expect(request.headers.get("content-type")).toMatch(/^multipart\/form-data; boundary=/);
  const fields = await request.formData();
  expect([...fields.keys()].sort()).toEqual(["height", "prompt", "seed", "width"]);
  expect(fields.get("width")).toBe("1024");
  expect(fields.get("height")).toBe("1024");
  expect(fields.get("seed")).toBe("42");
  expect(fields.get("prompt")).toContain('"Parliament news"');
  expect(fields.get("prompt")).not.toContain("World politics");
  expect(put).toHaveBeenCalledWith("feed-sketches/feed-1.jpg", new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), expect.objectContaining({ httpMetadata: { contentType: "image/jpeg" } }));
});

it("uses only the interest for subject selection and preserves the full allowed interest text", () => {
  const interestProfile = 'Follow "AI" research\n'.repeat(190) + " and the latest partnerships";
  const first = { title: "Unrelated title", interestProfile };
  const renamed = { title: "Another unrelated title", interestProfile };
  const prompt = sketchPrompt(first);
  expect(prompt).toBe(sketchPrompt(renamed));
  expect(prompt).toContain(JSON.stringify(interestProfile));
  expect(prompt).toContain("Monochromatic colored-pencil sketch in #5E5CE6.");
  expect(prompt).toContain("Natural, slightly irregular pencil strokes with visible fine-grained pigment and subtle pressure variation.");
  expect(prompt).toContain("Thin-to-medium pencil lines, never thick marker outlines.");
});

it("does not save an image returned after the queue job has lost its lease", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ result: { image: btoa(String.fromCharCode(0xff, 0xd8, 0xff, 0xd9)) } })));
  const put = vi.fn();
  const env = {
    CLOUDFLARE_IMAGE_ACCOUNT_ID: "image-account",
    CLOUDFLARE_IMAGE_API_TOKEN: "test-only-token",
    RAW_ARCHIVE: { head: vi.fn().mockResolvedValue(null), put }
  } as unknown as Env;
  expect(await generateSketch(env, { id: "feed-1", title: "AI", interestProfile: "AI research" }, async () => false)).toBe(false);
  expect(put).not.toHaveBeenCalled();
});


it("does not call the model or overwrite an existing feed illustration", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const put = vi.fn();
  const env = { RAW_ARCHIVE: { head: vi.fn().mockResolvedValue({ key: "existing" }), put } } as unknown as Env;
  expect(await generateSketch(env, {id:"feed-1",title:"Changed",interestProfile:"New topic"})).toBe(true);
  expect(fetcher).not.toHaveBeenCalled();
  expect(put).not.toHaveBeenCalled();
});
