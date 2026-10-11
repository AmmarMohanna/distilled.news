import { afterEach, expect, it, vi } from "vitest";
import type { BriefingConfig } from "@distilled/core";
import type { Env } from "./types";
import { generateSketch } from "./sketches";

afterEach(() => vi.unstubAllGlobals());

it("requests FLUX.2 Klein 4B from the image account and saves the JPEG in R2", async () => {
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
    "https://api.cloudflare.com/client/v4/accounts/image-account/ai/run/@cf/black-forest-labs/flux-2-klein-4b",
    expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ Authorization: "Bearer test-only-token" }),
      body: expect.any(FormData)
    })
  );
  const request = fetcher.mock.calls[0]![1] as RequestInit;
  expect(request.headers).not.toHaveProperty("Content-Type");
  expect((request.body as FormData).get("prompt")).toContain("World politics");
  expect((request.body as FormData).get("width")).toBe("512");
  expect((request.body as FormData).get("height")).toBe("512");
  expect(put).toHaveBeenCalledWith("feed-sketches/feed-1.jpg", expect.any(Uint8Array), expect.objectContaining({ httpMetadata: { contentType: "image/jpeg" } }));
});
