import { afterEach, describe, expect, it, vi } from "vitest";
import { sendVerificationEmail } from "./mailer";
import type { AccountRecord, Env } from "./types";

const account = { email: "reader@example.com" } as AccountRecord;

function outlookEnv(sender = "distilled.news@outlook.com") {
  let stored: { version: number; iv: string; ciphertext: string } | null = null;
  const db = {
    prepare(sql: string) {
      return {
        async first() { return stored; },
        bind(iv: string, ciphertext: string, expectedVersion: number) {
          return {
            async run() {
              if (stored && stored.version !== expectedVersion) return { success: true, meta: { changes: 0 } };
              stored = { version: (stored?.version ?? 0) + 1, iv, ciphertext };
              return { success: true, meta: { changes: 1 } };
            }
          };
        }
      };
    }
  };
  const env = {
    MAIL_TRANSPORT: "OUTLOOK_GRAPH",
    EMAIL_FROM: `Distilled.news <${sender}>`,
    PUBLIC_WEB_BASE_URL: "https://qa.example.com",
    OUTLOOK_CLIENT_ID: "client-id",
    OUTLOOK_REFRESH_TOKEN: "bootstrap-refresh-token",
    OUTLOOK_TOKEN_ENCRYPTION_KEY: "a-long-test-key-that-is-at-least-thirty-two-bytes",
    DB: db
  } as unknown as Env;
  return { env, getStored: () => stored };
}

afterEach(() => vi.unstubAllGlobals());

describe("Outlook QA mail", () => {
  it("rotates the refresh token into encrypted durable storage and submits the verification email", async () => {
    const { env, getStored } = outlookEnv();
    const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      requests.push({ url, init });
      if (url.includes("/token")) return Response.json({ access_token: "access-token", refresh_token: "rotated-refresh-token" });
      if (url.includes("/me?")) return Response.json({ mail: "distilled.news@outlook.com" });
      return new Response(null, { status: 202 });
    }));

    await sendVerificationEmail(env, account, "verify-secret");

    expect(requests.map(request => request.url)).toEqual([
      "https://login.microsoftonline.com/consumers/oauth2/v2.0/token",
      "https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName",
      "https://graph.microsoft.com/v1.0/me/sendMail"
    ]);
    const body = JSON.parse(String(requests[2].init?.body));
    expect(body.message.toRecipients[0].emailAddress.address).toBe("reader@example.com");
    expect(body.message.body.content).toContain("https://qa.example.com/verify-email?token=verify-secret");
    expect(JSON.stringify(getStored())).not.toContain("rotated-refresh-token");
    expect(getStored()?.ciphertext).toBeTruthy();

    await sendVerificationEmail(env, account, "another-secret");
    const secondExchange = requests[3].init?.body as URLSearchParams;
    expect(secondExchange.get("refresh_token")).toBe("rotated-refresh-token");
  });

  it("refuses to send if the authorized mailbox differs from EMAIL_FROM", async () => {
    const { env } = outlookEnv();
    const fetchMock = vi.fn(async (url: string) => url.includes("/token")
      ? Response.json({ access_token: "access-token", refresh_token: "rotated-refresh-token" })
      : Response.json({ mail: "someone-else@outlook.com" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendVerificationEmail(env, account, "verify-secret"))
      .rejects.toThrow("Connected Outlook mailbox does not match EMAIL_FROM");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
