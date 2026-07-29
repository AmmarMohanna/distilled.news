import type { AccountRecord, Env } from "./types";

type EmailAddressInput = string | { email: string; name: string };

export async function sendVerificationEmail(env: Env, account: AccountRecord, token: string): Promise<void> {
  await sendAuthEmail(env, {
    to: account.email,
    subject: "Verify your email for Distilled.news",
    path: `/verify-email#token=${encodeURIComponent(token)}`,
    action: "Verify email",
    text: "Verify your email to finish setting up your Distilled.news account.",
    expires: verificationLinkExpiryCopy(env)
  });
}

export function verificationLinkExpiryCopy(env: Pick<Env, "ENVIRONMENT">): string {
  const environment = env.ENVIRONMENT?.trim().toLowerCase();
  return environment === "production" || environment === "staging"
    ? "This verification link expires in 60 minutes."
    : "This verification link expires in 24 hours.";
}

export async function sendPasswordResetEmail(env: Env, account: AccountRecord, token: string): Promise<void> {
  await sendAuthEmail(env, {
    to: account.email,
    subject: "Reset your Distilled.news password",
    path: `/reset-password#token=${encodeURIComponent(token)}`,
    action: "Reset password",
    text: "Use this link to choose a new Distilled.news password.",
    expires: "This reset link expires in 30 minutes."
  });
}

export async function sendEmailDeliveryTest(
  env: Env,
  account: Pick<AccountRecord, "email">,
  sentAt = new Date()
): Promise<void> {
  if (!env.EMAIL) throw new Error("Cloudflare Email binding is not configured");
  if (!env.EMAIL_FROM) throw new Error("EMAIL_FROM is not configured");

  const timestamp = sentAt.toISOString();
  const release = (
    env.RELEASE_SHA?.trim() ||
    env.CF_VERSION_METADATA?.tag ||
    env.CF_VERSION_METADATA?.id ||
    "unknown-release"
  ).slice(0, 64);
  const text = [
    "Distilled.news",
    "",
    "Email delivery is working.",
    "",
    `Production test sent at ${timestamp}.`,
    `Release: ${release}.`,
    "No action is required."
  ].join("\n");
  await env.EMAIL.send({
    to: account.email,
    from: parseEmailAddress(env.EMAIL_FROM),
    subject: `Distilled.news email delivery test (${release})`,
    text,
    html: [
      "<div style=\"font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.5; color: #111;\">",
      "<h1 style=\"font-size: 18px; margin: 0 0 16px;\">Distilled.news</h1>",
      "<p>Email delivery is working.</p>",
      `<p style="color: #666;">Production test sent at ${escapeHtml(timestamp)}.</p>`,
      `<p style="color: #666;">Release: ${escapeHtml(release)}.</p>`,
      "<p>No action is required.</p>",
      "</div>"
    ].join("")
  });
}

export async function sendRegistrationEmailReceipt(
  env: Env,
  recipient: string,
  input: {
    nonce: string;
    release: string;
    sentAt: Date;
    expiresAt: string;
  }
): Promise<void> {
  if (!env.EMAIL) throw new Error("Cloudflare Email binding is not configured");
  if (!env.EMAIL_FROM) throw new Error("EMAIL_FROM is not configured");

  const timestamp = input.sentAt.toISOString();
  const text = [
    "Distilled.news",
    "",
    "Email delivery is working.",
    "",
    `Registration receipt nonce: ${input.nonce}`,
    "",
    "Paste this exact one-time nonce into the separate registration open dispatch.",
    `It expires at ${input.expiresAt} and is valid only for release ${input.release}.`,
    `Production test sent at ${timestamp}.`
  ].join("\n");
  await env.EMAIL.send({
    to: recipient,
    from: parseEmailAddress(env.EMAIL_FROM),
    subject: `Distilled.news registration receipt (${input.release})`,
    text,
    html: [
      "<div style=\"font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.5; color: #111;\">",
      "<h1 style=\"font-size: 18px; margin: 0 0 16px;\">Distilled.news</h1>",
      "<p>Email delivery is working.</p>",
      "<p>Registration receipt nonce:</p>",
      `<p><code style="font-size: 16px; word-break: break-all;">${escapeHtml(input.nonce)}</code></p>`,
      "<p>Paste this exact one-time nonce into the separate registration open dispatch.</p>",
      `<p style="color: #666;">Expires at ${escapeHtml(input.expiresAt)} and is valid only for release ${escapeHtml(input.release)}.</p>`,
      `<p style="color: #666;">Production test sent at ${escapeHtml(timestamp)}.</p>`,
      "</div>"
    ].join("")
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
  if (!env.EMAIL) throw new Error("Cloudflare Email binding is not configured");
  if (!env.EMAIL_FROM) throw new Error("EMAIL_FROM is not configured");

  const url = new URL(input.path, env.PUBLIC_WEB_BASE_URL || "https://distilled.news").toString();
  const footer = "If you did not request this email, you can ignore it.";
  await env.EMAIL.send({
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
  });
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
