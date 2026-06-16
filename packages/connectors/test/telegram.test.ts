import { describe, expect, it } from "vitest";
import {
  normalizeTelegramUpdate,
  parsePublicTelegramChannelPage,
  parsePublicTelegramChannelUrl
} from "../src";

describe("normalizeTelegramUpdate", () => {
  it("normalizes Telegram channel posts with links and media", () => {
    const normalized = normalizeTelegramUpdate(
      {
        update_id: 123,
        channel_post: {
          message_id: 55,
          date: 1_781_612_800,
          chat: {
            id: -100123,
            type: "channel",
            title: "Calm News",
            username: "calmnews"
          },
          caption: "Power supply update https://example.test",
          caption_entities: [{ type: "url", offset: 20, length: 20 }],
          photo: [{ file_id: "small" }, { file_id: "large" }]
        }
      },
      {
        receivedAt: new Date("2026-06-16T12:00:00.000Z"),
        rawPayloadKey: "raw/123.json"
      }
    );

    expect(normalized).toMatchObject({
      id: "telegram_123_-100123_55",
      messageId: "55",
      text: "Power supply update https://example.test",
      sourceUrl: "https://t.me/calmnews/55",
      rawPayloadKey: "raw/123.json"
    });
    expect(normalized?.links).toEqual(["https://example.test"]);
    expect(normalized?.media).toEqual([{ type: "photo", fileId: "large", label: "Telegram photo" }]);
  });

  it("ignores unsupported private messages", () => {
    expect(
      normalizeTelegramUpdate({
        update_id: 1,
        message: {
          message_id: 1,
          date: 1_781_612_800,
          chat: { id: 1, type: "private", username: "person" },
          text: "hello"
        }
      })
    ).toBeNull();
  });
});

describe("public Telegram channel pages", () => {
  it("parses channel URLs into widget URLs", () => {
    expect(parsePublicTelegramChannelUrl("https://t.me/LebUpdate")).toEqual({
      username: "LebUpdate",
      publicUrl: "https://t.me/LebUpdate",
      widgetUrl: "https://t.me/s/LebUpdate"
    });
    expect(parsePublicTelegramChannelUrl("@EabriLive").widgetUrl).toBe("https://t.me/s/EabriLive");
  });

  it("normalizes public Telegram channel page posts", () => {
    const html = `
      <meta property="og:title" content="Lebanese News and Updates">
      <main>
        <div class="tgme_widget_message_wrap js-widget_message_wrap"><div class="tgme_widget_message text_not_supported_wrap js-widget_message" data-post="LebUpdate/62193">
          <a class="tgme_widget_message_photo_wrap" href="https://t.me/LebUpdate/62193" style="background-image:url('https://cdn.test/photo.jpg')"></a>
          <div class="tgme_widget_message_text js-message_text" dir="auto"><b>Netanyahu:</b><br/>What we did to Gaza, we will do to southern Lebanon. https://example.test</div>
          <a class="tgme_widget_message_date" href="https://t.me/LebUpdate/62193"><time datetime="2026-06-15T18:16:37+00:00" class="time">18:16</time></a>
        </div></div>
        <div class="tgme_widget_message_wrap js-widget_message_wrap"><div class="tgme_widget_message text_not_supported_wrap js-widget_message" data-post="LebUpdate/62194">
          <div class="tgme_widget_message_text js-message_text" dir="auto">اعتراضات صاروخية في سماء المطلة وكريات شمونة</div>
          <a class="tgme_widget_message_date" href="https://t.me/LebUpdate/62194"><time datetime="2026-06-15T18:18:37+00:00" class="time">18:18</time></a>
        </div></div>
      </main>`;

    const messages = parsePublicTelegramChannelPage(html, {
      username: "LebUpdate",
      receivedAt: new Date("2026-06-16T08:00:00.000Z")
    });

    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({
      id: "telegram_public_LebUpdate_62193",
      source: {
        id: "telegram_public_lebupdate",
        title: "Lebanese News and Updates",
        type: "channel",
        username: "LebUpdate"
      },
      sourceUrl: "https://t.me/LebUpdate/62193"
    });
    expect(messages[0].text).toContain("What we did to Gaza");
    expect(messages[0].links).toEqual(["https://example.test"]);
    expect(messages[0].media).toEqual([{ type: "photo", url: "https://cdn.test/photo.jpg", label: "Telegram photo" }]);
    expect(messages[1].text).toContain("اعتراضات صاروخية");
  });
});
