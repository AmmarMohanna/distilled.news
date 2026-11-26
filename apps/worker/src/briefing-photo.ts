import type { BriefingEdition } from "@distilled/core";
import { WorkerPublicSourceFetch } from "./public-source-fetch";

type Photo = { url: string; source: string };
const previews = new Map<string, { expires: number; images: Promise<string[]> }>();

/** Read only public preview metadata from articles cited by the edition. */
export async function briefingPublisherPhotos(edition: BriefingEdition, fetcher: typeof fetch): Promise<Photo[]> {
  if (typeof HTMLRewriter === "undefined") return [];
  const pages = new Map<string, string>();
  for (const section of edition.sections) for (const evidence of section.evidence) {
    const link = [evidence.sourceUrl, ...evidence.links].find(value =>
      value?.startsWith("https://") && !/^https:\/\/(?:www\.)?(?:t\.me|x\.com|twitter\.com|linkedin\.com)\//i.test(value));
    if (link && !pages.has(link) && pages.size < 6) pages.set(link, evidence.sourceTitle);
  }
  const results = await Promise.all([...pages].map(async ([url, source]) =>
    (await publisherImages(url, fetcher)).map(image => ({ url: image, source }))));
  const unique = new Map<string, Photo>();
  for (const photo of results.flat()) if (!unique.has(photo.url)) unique.set(photo.url, photo);
  return [...unique.values()].slice(0, 3);
}

function publisherImages(key: string, fetcher: typeof fetch): Promise<string[]> {
  const cached = previews.get(key);
  if (cached && cached.expires > Date.now()) return cached.images;
  const images = (async () => {
    try {
      const timeout = AbortSignal.timeout(2_500);
      const boundedFetch: typeof fetch = (input, init) => fetcher(input, { ...init, signal: timeout });
      const request = new WorkerPublicSourceFetch(key, boundedFetch, { maxBytes: 384_000 });
      const page = await request.get(key);
      if (page.status !== 200 || !page.contentType.includes("text/html")) return [];
      const urls = new Set<string>();
      const html = new HTMLRewriter().on('meta[property="og:image"]', {
        element(element) {
          const image = element.getAttribute("content");
          if (!image || urls.size >= 3) return;
          try {
            const url = new URL(image, page.url);
            new WorkerPublicSourceFetch(url.href);
            urls.add(url.href);
          } catch { /* Ignore invalid or unsupported image URLs. */ }
        }
      });
      await html.transform(new Response(page.body)).text();
      return [...urls];
    } catch { return []; }
  })();
  previews.delete(key);
  previews.set(key, { expires: Date.now() + 30 * 60_000, images });
  if (previews.size > 128) previews.delete(previews.keys().next().value!);
  return images;
}
