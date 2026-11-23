import type { BriefingEdition } from "@distilled/core";
import { WorkerPublicSourceFetch } from "./public-source-fetch";

type Photo = { url: string; source: string };
const previews = new Map<string, { expires: number; photo: Promise<Photo | undefined> }>();

/** Use only public metadata from a citation that is already part of the edition. */
export async function briefingPublisherPhoto(edition: BriefingEdition, fetcher: typeof fetch): Promise<Photo | undefined> {
  const evidence = edition.sections.flatMap(section => section.evidence)
    .find(item => item.sourceUrl && item.sourceUrl.startsWith("https://") && !/^https:\/\/(?:www\.)?(?:t\.me|x\.com|twitter\.com|linkedin\.com)\//i.test(item.sourceUrl));
  if (!evidence?.sourceUrl || typeof HTMLRewriter === "undefined") return;
  const key = evidence.sourceUrl;
  const cached = previews.get(key);
  if (cached && cached.expires > Date.now()) return cached.photo;
  const photo = (async () => {
    try {
      const timeout = AbortSignal.timeout(2_500);
      const boundedFetch: typeof fetch = (input, init) => fetcher(input, { ...init, signal: timeout });
      const request = new WorkerPublicSourceFetch(key, boundedFetch, { maxBytes: 384_000 });
      const page = await request.get(key);
      if (page.status !== 200 || !page.contentType.includes("text/html")) return;
      let image: string | null = null;
      const html = new HTMLRewriter().on('meta[property="og:image"]', {
        element(element) { image ??= element.getAttribute("content"); }
      });
      await html.transform(new Response(page.body)).text();
      if (!image) return;
      const url = new URL(image, page.url);
      new WorkerPublicSourceFetch(url.href);
      return { url: url.href, source: evidence.sourceTitle };
    } catch { /* An unavailable publisher preview does not block reading. */ }
  })();
  previews.delete(key);
  previews.set(key, { expires: Date.now() + 30 * 60_000, photo });
  if (previews.size > 128) previews.delete(previews.keys().next().value!);
  return photo;
}
