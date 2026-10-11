import type { AccountRecord, Env } from "./types";

type EmailAddressInput = string | { email: string; name: string };

export async function sendVerificationEmail(env: Env, account: AccountRecord, token: string): Promise<void> {
  await sendAuthEmail(env, {
    to: account.email,
    subject: "Verify your email for Distilled.news",
    path: `/verify-email?token=${encodeURIComponent(token)}`,
    action: "Verify email",
    text: "Verify your email to finish setting up your Distilled.news account.",
    expires: "This verification link expires in 24 hours."
  });
}

export async function sendPasswordResetEmail(env: Env, account: AccountRecord, token: string): Promise<void> {
  await sendAuthEmail(env, {
    to: account.email,
    subject: "Reset your Distilled.news password",
    path: `/reset-password?token=${encodeURIComponent(token)}`,
    action: "Reset password",
    text: "Use this link to choose a new Distilled.news password.",
    expires: "This reset link expires in 30 minutes."
  });
}

async function sendAuthEmail(
  env: Env,
  input: {
    to: string;
    subject: string;
    path: string;
    action: string;
    text: string;
    expires: string;
  }
): Promise<void> {
  if (!env.EMAIL_FROM) throw new Error("EMAIL_FROM is not configured");

  const url = new URL(input.path, env.PUBLIC_WEB_BASE_URL || "https://distilled.news").toString();
  const footer = "If you did not request this email, you can ignore it.";
  const message = {
    to: input.to,
    from: parseEmailAddress(env.EMAIL_FROM),
    subject: input.subject,
    text: [
      "Distilled.news",
      "",
      input.text,
      "",
      `${input.action}: ${url}`,
      "",
      input.expires,
      footer
    ].join("\n"),
    html: [
      "<div style=\"font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; line-height: 1.5; color: #111;\">",
      "<h1 style=\"font-size: 18px; margin: 0 0 16px;\">Distilled.news</h1>",
      `<p>${escapeHtml(input.text)}</p>`,
      `<p><a href="${escapeHtml(url)}" style="display: inline-block; padding: 10px 14px; border: 1px solid #111; border-radius: 6px; color: #111; text-decoration: none;">${escapeHtml(input.action)}</a></p>`,
      `<p style="word-break: break-all;"><a href="${escapeHtml(url)}">${escapeHtml(url)}</a></p>`,
      `<p>${escapeHtml(input.expires)}</p>`,
      `<p>${escapeHtml(footer)}</p>`,
      "</div>"
    ].join("")
  };
  if (env.MAIL_TRANSPORT === "OUTLOOK_GRAPH") {
    await sendOutlookEmail(env, message);
    return;
  }
  if (!env.EMAIL) throw new Error("Cloudflare Email binding is not configured");
  await env.EMAIL.send(message);
}

async function sendOutlookEmail(
  env: Env,
  message: { to: string; from: EmailAddressInput; subject: string; text: string; html: string }
): Promise<void> {
  const clientId = env.OUTLOOK_CLIENT_ID?.trim();
  const bootstrapToken = env.OUTLOOK_REFRESH_TOKEN?.trim();
  const encryptionKey = env.OUTLOOK_TOKEN_ENCRYPTION_KEY?.trim();
  if (!clientId || !bootstrapToken || !encryptionKey || !env.DB) {
    throw new Error("Outlook mail is not configured");
  }
  const from = typeof message.from === "string" ? message.from : message.from.email;
  const current = await env.DB.prepare(
    "SELECT version, iv, ciphertext FROM mail_oauth_tokens WHERE provider = 'outlook'"
  ).first<{ version: number; iv: string; ciphertext: string }>();
  const refreshToken = current
    ? await decryptToken(current.iv, current.ciphertext, encryptionKey)
    : bootstrapToken;
  const response = await fetch("https://login.microsoftonline.com/consumers/oauth2/v2.0/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      scope: "offline_access Mail.Send User.Read"
    }),
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) throw new Error(`Outlook token exchange failed (${response.status})`);
  const tokens = await response.json() as { access_token?: string; refresh_token?: string };
  if (!tokens.access_token || !tokens.refresh_token) throw new Error("Outlook token exchange returned incomplete credentials");
  const encrypted = await encryptToken(tokens.refresh_token, encryptionKey);
  const saved = await env.DB.prepare(`INSERT INTO mail_oauth_tokens (provider, version, iv, ciphertext, updated_at)
    VALUES ('outlook', 1, ?, ?, datetime('now'))
    ON CONFLICT(provider) DO UPDATE SET version = mail_oauth_tokens.version + 1,
      iv = excluded.iv, ciphertext = excluded.ciphertext, updated_at = excluded.updated_at
    WHERE mail_oauth_tokens.version = ?`)
    .bind(encrypted.iv, encrypted.ciphertext, current?.version ?? 0).run();
  if (!saved.success) throw new Error("Outlook token persistence failed");

  const authorization = { authorization: `Bearer ${tokens.access_token}` };
  const profileResponse = await fetch("https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName", {
    headers: authorization,
    signal: AbortSignal.timeout(10_000)
  });
  if (!profileResponse.ok) throw new Error(`Outlook mailbox lookup failed (${profileResponse.status})`);
  const profile = await profileResponse.json() as { mail?: string; userPrincipalName?: string };
  const sender = from.trim().toLowerCase();
  if (![profile.mail, profile.userPrincipalName].some(value => value?.trim().toLowerCase() === sender)) {
    throw new Error("Connected Outlook mailbox does not match EMAIL_FROM");
  }
  const sendResponse = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
    method: "POST",
    headers: { ...authorization, "content-type": "application/json" },
    body: JSON.stringify({
      message: {
        subject: message.subject,
        body: { contentType: "HTML", content: message.html },
        toRecipients: [{ emailAddress: { address: message.to } }]
      },
      saveToSentItems: true
    }),
    signal: AbortSignal.timeout(10_000)
  });
  if (sendResponse.status !== 202) throw new Error(`Outlook mail submission failed (${sendResponse.status})`);
}

async function importTokenKey(secret: string): Promise<CryptoKey> {
  const bytes = new TextEncoder().encode(secret);
  if (bytes.length < 32) throw new Error("Outlook token encryption key is too short");
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encryptToken(value: string, secret: string): Promise<{ iv: string; ciphertext: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv }, await importTokenKey(secret), new TextEncoder().encode(value)
  ));
  return { iv: encodeBase64(iv), ciphertext: encodeBase64(ciphertext) };
}

async function decryptToken(iv: string, ciphertext: string, secret: string): Promise<string> {
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: decodeBase64(iv) },
    await importTokenKey(secret),
    decodeBase64(ciphertext)
  );
  return new TextDecoder().decode(plaintext);
}

function encodeBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function decodeBase64(value: string): Uint8Array<ArrayBuffer> {
  const decoded = atob(value);
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index++) bytes[index] = decoded.charCodeAt(index);
  return bytes;
}

function parseEmailAddress(value: string): EmailAddressInput {
  const trimmed = value.trim();
  const match = trimmed.match(/^(.+?)\s*<([^<>]+)>$/);
  if (!match) return trimmed;
  return { email: match[2].trim(), name: match[1].trim().replace(/^"|"$/g, "") };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
