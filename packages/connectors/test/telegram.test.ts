import { describe, expect, it, vi } from "vitest";
import {
  normalizeTelegramUpdate,
  registerTelegramWebhook,
  validateTelegramWebhookSecret
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

describe("webhook helpers", () => {
  it("validates Telegram webhook secret token", () => {
    expect(validateTelegramWebhookSecret("secret", "secret")).toBe(true);
    expect(validateTelegramWebhookSecret("wrong", "secret")).toBe(false);
    expect(validateTelegramWebhookSecret(null, "secret")).toBe(false);
  });

  it("registers Telegram webhook with secret token", async () => {
    const fetcher = vi.fn(async () => {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    const result = await registerTelegramWebhook(
      {
        botToken: "token",
        webhookUrl: "https://worker.test/telegram/webhook/briefing/secret",
        secretToken: "secret"
      },
      fetcher as unknown as typeof fetch
    );

    expect(result.ok).toBe(true);
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.telegram.org/bottoken/setWebhook",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("secret_token")
      })
    );
  });
});
