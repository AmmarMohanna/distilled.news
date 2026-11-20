import { afterEach, describe, expect, it, vi } from "vitest";
import { sendVerificationEmail, sendPasswordResetEmail } from "./mailer";
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

it("routes verification to Gmail and leaves password resets on the configured transport", async () => {
  const resetSend = vi.fn();
  const env = {
    VERIFICATION_MAIL_TRANSPORT: "GMAIL_API",
    GMAIL_FROM: "sender@gmail.com",
    GMAIL_CLIENT_ID: "client",
    GMAIL_CLIENT_SECRET: "secret",
    GMAIL_REFRESH_TOKEN: "refresh",
    EMAIL_FROM: "noreply@example.com",
    PUBLIC_WEB_BASE_URL: "https://qa.example.com",
    EMAIL: { send: resetSend }
  } as unknown as Env;
  const fetchMock = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ access_token: "access" }))
    .mockResolvedValueOnce(Response.json({ id: "sent" }));
  vi.stubGlobal("fetch", fetchMock);

  await sendVerificationEmail(env, account, "fixture", "ar");
  await sendPasswordResetEmail(env, account, "reset");

  expect(fetchMock).toHaveBeenCalledTimes(2);
  const [tokenUrl, tokenRequest] = fetchMock.mock.calls[0];
  expect(tokenUrl).toBe("https://oauth2.googleapis.com/token");
  expect((tokenRequest?.body as URLSearchParams).get("grant_type")).toBe("refresh_token");
  const [mailUrl, mailRequest] = fetchMock.mock.calls[1];
  expect(mailUrl).toBe("https://gmail.googleapis.com/gmail/v1/users/sender%40gmail.com/messages/send");
  expect(new Headers(mailRequest?.headers).get("authorization")).toBe("Bearer access");
  const { raw } = JSON.parse(mailRequest?.body as string);
  expect(raw).toMatch(/^[a-zA-Z0-9_-]+$/);
  const mime = atob(raw.replace(/-/g, "+").replace(/_/g, "/"));
  expect(mime).toContain("To: <reader@example.com>\r\n");
  const text = expectVerificationMime(mime, "fixture");
  expect(text).toContain("أكّد بريدك الإلكتروني");
  expect(text).toContain("صالح لمدة ٢٤ ساعة");
  expect(resetSend).toHaveBeenCalledOnce();
});

it.each(['en', 'fr', 'ar'] as const)('localizes the plain verification code and HTML password reset in %s', async language => {
  const messages: any[] = [];
  const env = { EMAIL_FROM: 'Distilled.News <noreply@example.com>', PUBLIC_WEB_BASE_URL: 'https://joud.example', EMAIL: {send: async (message: unknown) => {messages.push(message);}} } as unknown as Env;
  await sendVerificationEmail(env, account, 'verification-fixture', language);
  await sendPasswordResetEmail(env, account, 'reset-fixture', language);
  const copy = {
    en: ['Verify your email address', 'Valid for 24 hours', 'Reset password'],
    fr: ['Vérifiez votre adresse e-mail', 'Valable pendant 24 heures', 'Réinitialiser le mot de passe'],
    ar: ['أكّد بريدك الإلكتروني', 'صالح لمدة ٢٤ ساعة', 'إعادة تعيين كلمة المرور'],
  }[language];
  for (const [index, message] of messages.entries()) {
    if(index===0){
      expect(message.text).toContain('verification-fixture');
      expect(message.text).toContain(copy[0]);
      expect(message.text).toContain(copy[1]);
      expect(message.text).not.toMatch(/https?:|<[^>]+>/);
      expect(message).not.toHaveProperty('html');
      expect(message).not.toHaveProperty('inlineLogo');
      continue;
    }
    expect(message.html).toContain(`lang="${language}" dir="${language === 'ar' ? 'rtl' : 'ltr'}"`);
    expect(message.html).toContain(copy[2]);
    expect(message.html).toContain('role="presentation" dir="ltr"');
    expect(message.text).toContain(`&lang=${language}`);
    expect(message.html).toContain('https://joud.example/');
  }
});

it("keeps the isolated staging verification link in plain text", async () => {
  const send = vi.fn();
  const env = {
    ENVIRONMENT: "staging",
    AGENTOPS_CAMPAIGN_ENABLED: "true",
    AGENTOPS_CAMPAIGN_ISOLATED: "true",
    EMAIL_FROM: "noreply@example.com",
    PUBLIC_WEB_BASE_URL: "https://staging.example.com",
    EMAIL: { send }
  } as unknown as Env;

  await sendVerificationEmail(env, account, "campaign-token");

  expect(send).toHaveBeenCalledWith(expect.objectContaining({
    html: undefined,
    text: expect.stringContaining("https://staging.example.com/verify-email?token=campaign-token&lang=en")
  }));
});

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
    expect(new Headers(requests[2].init?.headers).get("content-type")).toBe("text/plain");
    const mime=atob(String(requests[2].init?.body));
    expect(mime).toContain("To: <reader@example.com>\r\n");
    expect(mime).toContain("Subject: =?UTF-8?B?"+btoa("Your Distilled.News verification code")+"?=");
    expectVerificationMime(mime,"verify-secret");
    expect(JSON.stringify(getStored())).not.toContain("rotated-refresh-token");
    expect(getStored()?.ciphertext).toBeTruthy();

    await sendVerificationEmail(env, account, "another-secret");
    const secondExchange = requests[3].init?.body as URLSearchParams;
    expect(secondExchange.get("refresh_token")).toBe("rotated-refresh-token");
  });

  it("uses the verified staging frontend for password reset and preserves expiry messaging", async () => {
    const {env}=outlookEnv();env.PUBLIC_WEB_BASE_URL="https://distilled-news-staging.distillednews-platform.workers.dev";
    let submitted: any;
    vi.stubGlobal("fetch",vi.fn(async(url:string,init?:RequestInit)=>{
      if(url.includes("/token"))return Response.json({access_token:"test-access",refresh_token:"test-rotated"});
      if(url.includes("/me?"))return Response.json({mail:"distilled.news@outlook.com"});
      submitted=JSON.parse(String(init?.body));return new Response(null,{status:202});
    }));
    await sendPasswordResetEmail(env,account,"test-reset-token");
    expect(submitted.message.subject).toBe("Reset your Distilled.News password");
    expect(submitted.message.body.content).toContain("https://distilled-news-staging.distillednews-platform.workers.dev/reset-password?token=test-reset-token");
    expect(submitted.message.body.content).toContain("expires in 30 minutes");
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


function expectVerificationMime(mime: string, code: string) {
  const [headers, body] = mime.split("\r\n\r\n");
  expect(headers).toContain("Content-Type: text/plain; charset=UTF-8");
  expect(headers).not.toMatch(/multipart\/|text\/html|image\/|Content-ID:|Content-Disposition:/i);
  const text = new TextDecoder().decode(Uint8Array.from(atob(body), character => character.charCodeAt(0)));
  expect(text).toContain("Distilled.News");
  expect(text.split("\r\n")).toContain(code);
  expect(text).not.toMatch(/https?:|<[^>]+>/);
  return text;
}
