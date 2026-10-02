import { parsePublicTelegramChannelPage } from "../../../packages/connectors/src/telegram.ts";
import { parseRssFeed, parseGoogleNewsRssFeed } from "../../../packages/connectors/src/rss.ts";
import { normalizeApifyDatasetItems } from "../../../packages/connectors/src/apify.ts";

let input = "";
for await (const chunk of process.stdin) {
  input += chunk;
  if (Buffer.byteLength(input) > 110 * 1024 * 1024) throw new Error("Transform input too large");
}
try {
  const { operation, payload, target, fetched_at } = JSON.parse(input);
  let output;
  if (operation === "readability") {
    const { JSDOM } = await import("jsdom");
    const { Readability } = await import("@mozilla/readability");
    const dom = new JSDOM(payload, { url: target.input }); // No scripts or external resource loading.
    try {
      const article = new Readability(dom.window.document).parse();
      output = { title: article?.title ?? "", body: article?.textContent ?? "", published_at: article?.publishedTime ?? null };
    } finally { dom.window.close(); }
  } else {
    const options = { sourceId: target.id, sourceTitle: target.id, sourceUrl: target.input,
      kind: target.kind === "rss" ? "rss_feed" : target.kind, receivedAt: new Date(fetched_at) };
    let baseline;
    if (operation === "telegram") baseline = parsePublicTelegramChannelPage(payload, { username: target.input.replace(/^@/, ""), receivedAt: options.receivedAt });
    else if (operation === "rss") baseline = parseRssFeed(payload, options);
    else if (operation === "google_news") baseline = parseGoogleNewsRssFeed(payload, options);
    else if (operation === "apify") baseline = normalizeApifyDatasetItems(JSON.parse(payload), options);
    else throw new Error("Unknown transform");
    output = { baseline, items: baseline.map((message) => ({
      id: message.messageId, text: message.text, published_at: message.postedAt,
      url: message.sourceUrl ?? null, links: message.links, media: message.media,
      source_id: target.id, author: message.source.title
    })) };
  }
  const serialized = JSON.stringify(output);
  if (Buffer.byteLength(serialized) > 100 * 1024 * 1024) throw new Error("Transform output too large");
  process.stdout.write(serialized);
} catch (error) {
  process.stdout.write(JSON.stringify({ transform_error: error.name }));
  process.exitCode = 1;
}
