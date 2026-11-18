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
  const plain = /Content-Type: text\/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n([\s\S]+?)\r\n--/.exec(mime)![1];
  const decoded = new TextDecoder().decode(Uint8Array.from(atob(plain), char => char.charCodeAt(0)));
  expect(decoded).toContain("fixture");
  expect(decoded).not.toMatch(/https?:/);
  expectVerificationMime(mime,"fixture");
  expect(resetSend).toHaveBeenCalledOnce();
});

it.each(['en', 'fr', 'ar'] as const)('localizes both authentication emails in %s, including links and direction', async language => {
  const messages: any[] = [];
  const env = { EMAIL_FROM: 'Distilled.News <noreply@example.com>', PUBLIC_WEB_BASE_URL: 'https://joud.example', EMAIL: {send: async (message: unknown) => {messages.push(message);}} } as unknown as Env;
  await sendVerificationEmail(env, account, 'verification-fixture', language);
  await sendPasswordResetEmail(env, account, 'reset-fixture', language);
  const copy = language === 'ar' ? ['تأكيد البريد الإلكتروني', 'إعادة تعيين كلمة المرور'] : language === 'fr' ? ['Vérifier mon adresse e-mail', 'Réinitialiser le mot de passe'] : ['Verify email', 'Reset password'];
  for (const [index, message] of messages.entries()) {
    if(index===0){
      expect(message.text).toContain('verification-fixture');
      expect(message.text).not.toMatch(/https?:/);
      expect(message.html).toContain('Distilled<span style="color:#5E5CE6;">.</span>News');
      expect(message.html).toContain('verification-fixture');
      expect(message.html).not.toMatch(/https?:|<img/i);
      continue;
    }
    expect(message.html).toContain(`lang="${language}" dir="${language === 'ar' ? 'rtl' : 'ltr'}"`);
    expect(message.html).toContain(copy[index]);
    expect(message.html).toContain('role="presentation" dir="ltr"');
    expect(message.text).toContain(`&lang=${language}`);
    expect(message.html).toContain('https://joud.example/');
    expect(message.subject).not.toBe(language === 'en' ? '' : index === 0 ? 'Verify your email for Distilled.News' : 'Reset your Distilled.News password');
  }
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


function expectVerificationMime(mime:string,code:string){
  const alt=/multipart\/alternative; boundary="([^"]+)"/.exec(mime)![1];
  const related=/multipart\/related; boundary="([^"]+)"; type="text\/html"/.exec(mime)![1];
  expect(alt).not.toBe(related);
  expect(mime).toContain(`--${related}--\r\n--${alt}--\r\n`);
  const content=(type:string)=>{
    const part=mime.split(`Content-Type: ${type}; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n`)[1].split("\r\n--")[0];
    return new TextDecoder().decode(Uint8Array.from(atob(part),c=>c.charCodeAt(0)));
  };
  expect(content("text/plain")).toContain(code);
  expect(content("text/plain")).not.toMatch(/https?:|<[^>]+>/);
  expect(content("text/html")).toContain(code);
  expect(content("text/html")).toContain("cid:distilled-verification-logo");
  expect(content("text/html")).not.toMatch(/https?:|<a\s|<style|<script/i);
  expect(mime).toContain("Content-ID: <distilled-verification-logo>");
  expect(mime).toContain("Content-Type: image/png");
}
