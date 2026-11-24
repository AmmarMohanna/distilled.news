import type { BriefingConfig } from "@distilled/core";
import type { Env } from "./types";

const SKETCH_MODEL = "@cf/black-forest-labs/flux-2-klein-4b";
export const PENCIL_COVER_STYLE = "pencil-cover-v1";
export const IMPORTED_COVER_DISPOSITION = 'inline; filename="feed-cover.jpg"';

export class SketchError extends Error {
  constructor(public readonly code: string, message: string) { super(message); }
}

export function sketchDiagnostic(error: unknown, privateText: string[] = []): string {
  let message = error instanceof Error ? `${error.name}: ${error.message}` : "Unknown Workers AI error";
  for (const value of privateText.filter(Boolean).sort((a, b) => b.length - a.length)) message = message.split(value).join("[feed text]");
  return message
    .replace(/(?:cfoat_|cfut_)[A-Za-z0-9._-]+/g, "[redacted]")
    .replace(/Bearer\s+[^\s"',}]+/gi, "Bearer [redacted]")
    .replace(/((?:token|secret|password|api[_-]?key|authorization)["']?\s*[:=]\s*)[^\s,}]+/gi, "$1[redacted]")
    .replace(/[\r\n]/g, " ").slice(0, 800);
}

export function sketchAiError(error: unknown): SketchError {
  const message = error instanceof Error ? error.message : String(error);
  if (/invalid.*(?:input|prompt)|validation|too long/i.test(message)) return new SketchError("AI_INVALID_REQUEST", "Workers AI rejected the image request. Check the feed_sketch_provider_error line in the server terminal for details.");
  // Classify provider errors without returning their raw payloads or credentials.
  if (/401|403|unauthori[sz]ed|forbidden|authentication|permission/i.test(message)) return new SketchError("AI_ACCESS_DENIED", "Cloudflare denied image generation. Check Workers AI access for the account and credentials used to start Wrangler.");
  if (/429|quota|neurons|rate.limit|budget|payment|billing/i.test(message)) return new SketchError("AI_LIMIT", "Cloudflare reports an AI usage, rate or billing limit. Check Workers AI usage in your account before retrying.");
  if (/timeout|timed out|fetch failed|network|connection/i.test(message)) return new SketchError("AI_CONNECTION", "The connection to Workers AI failed or timed out. Check connectivity and restart the development server before retrying.");
  return new SketchError("AI_GENERATION_FAILED", "Workers AI could not generate the sketch. Storage was not attempted. Check Workers AI availability and model access.");
}

export function sketchKey(briefing: Pick<BriefingConfig, "id">): string {
  return `feed-sketches/${encodeURIComponent(briefing.id)}.jpg`;
}


export function sketchPrompt(briefing: Pick<BriefingConfig, "title" | "interestProfile">): string {
  return [
    "Create a premium cinematic editorial illustration in a 4:1 panoramic landscape format. Make it feel like a sophisticated hand-painted digital illustration with subtle pencil-like outlines, soft painterly shading, fine textures, and polished storybook lighting.",
    `Feed title: ${JSON.stringify(briefing.title)}. Feed description: ${JSON.stringify(briefing.interestProfile)}. Draw the primary topic described by both, using immediately recognizable objects, environments, or architecture specific to it. Use an original composition suited to the subject.`,
    "Build realistic depth through layered foreground details near the lower corners, a clear central or slightly right-of-center focal point, and softly lit atmospheric distance. In the middle quarter of the panorama, put the recognizable subject and context below the horizon so that a centered square crop communicates the topic by itself. Leave the upper-middle area visually calm.",
    "Paint one continuous edge-to-edge scene with gentle left-to-right transitions: indigo #5764B5 and periwinkle #7779CB shadows on the left, lavender #9984D5 and soft orchid #C58BD3 through the middle, and pastel pink #F0A4C1 and warm peach #FFC3A4 where light reaches the scene on the right. Integrate the palette into the sky, shadows, light, and surfaces so local colors remain visible.",
    "Use soft contrast. Avoid obvious graphite sketching, harsh crosshatching, neon, oversaturation, and flat monochromatic overlays. Output artwork only. The supplied title and description are topic context only. Never draw words, letters, pseudo-writing, numbers, typography, logos, or watermarks anywhere, including in the sky, on signage, or on buildings. No inset artwork, picture frames, panels, borders, UI elements, cartoons, anime, or photorealism."
  ].join("\n");
}

export async function generateSketch(env: Env, briefing: Pick<BriefingConfig, 'id' | 'title' | 'interestProfile'>, stillCurrent?: () => Promise<boolean>): Promise<boolean> {
  if (await env.RAW_ARCHIVE.head(sketchKey(briefing))) return true;
  if (!env.CLOUDFLARE_IMAGE_ACCOUNT_ID || !env.CLOUDFLARE_IMAGE_API_TOKEN) throw new SketchError("AI_NOT_CONFIGURED", "Image generation needs the new Cloudflare account ID and Workers AI API token.");
  const prompt = sketchPrompt(briefing);
  // Klein uses multipart input and a fixed four-step inference process.
  const form = new FormData();
  form.append("prompt", prompt);
  form.append("width", "1920");
  form.append("height", "480");
  form.append("seed", "42");
  let result;
  try {
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(env.CLOUDFLARE_IMAGE_ACCOUNT_ID)}/ai/run/${SKETCH_MODEL}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.CLOUDFLARE_IMAGE_API_TOKEN}`
      },
      body: form,
      // Leave time for R2 persistence within the queue job's two-minute lease.
      signal: AbortSignal.timeout(90_000)
    });
    if (!response.ok) throw new Error(`Workers AI HTTP ${response.status}`);
    result = (await response.json() as { result?: { image?: string } }).result;
  } catch (error) {
    console.error(JSON.stringify({ event: "feed_sketch_provider_error", model: SKETCH_MODEL, detail: sketchDiagnostic(error, [prompt, briefing.title, briefing.interestProfile]) }));
    throw sketchAiError(error);
  }
  if (!result || typeof result.image !== "string" || !result.image || result.image.length > 14_000_000) throw new SketchError("AI_INVALID_IMAGE", "Workers AI returned an empty or invalid image response. No sketch was saved.");
  let bytes: Uint8Array;
  try { bytes = Uint8Array.from(atob(result.image), character => character.charCodeAt(0)); }
  catch { throw new SketchError("AI_INVALID_IMAGE", "Workers AI returned invalid image encoding. No sketch was saved."); }
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new SketchError("AI_IMAGE_FORMAT", "Workers AI returned an unexpected image format instead of JPEG. No sketch was saved.");
  if (stillCurrent && !await stillCurrent()) return false;
  if (await env.RAW_ARCHIVE.head(sketchKey(briefing))) return true;
  try { await env.RAW_ARCHIVE.put(sketchKey(briefing), bytes, {
    httpMetadata: { contentType: "image/jpeg" },
    customMetadata: { artworkStyle: PENCIL_COVER_STYLE }
  }); } catch { throw new SketchError("SKETCH_STORAGE_WRITE", "The image was generated, but saving it to R2 failed. Check the RAW_ARCHIVE binding."); }
  return true;
}
