import type { AccountRecord, Env } from "./types";

type EmailAddressInput = string | { email: string; name: string };

export async function sendVerificationEmail(env: Env, account: AccountRecord, token: string): Promise<void> {
  await sendAuthEmail(env, {
    to: account.email,
    subject: "Verify your email for Low Noise News Feed",
    path: `/verify-email?token=${encodeURIComponent(token)}`,
    action: "Verify email",
    text: "Verify your email to finish setting up your Low Noise News Feed account.",
    expires: "This verification link expires in 24 hours."
  });
}

export async function sendPasswordResetEmail(env: Env, account: AccountRecord, token: string): Promise<void> {
  await sendAuthEmail(env, {
    to: account.email,
    subject: "Reset your Low Noise News Feed password",
    path: `/reset-password?token=${encodeURIComponent(token)}`,
    action: "Reset password",
    text: "Use this link to choose a new Low Noise News Feed password.",
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
  if (!env.EMAIL) throw new Error("Cloudflare Email binding is not configured");
  if (!env.EMAIL_FROM) throw new Error("EMAIL_FROM is not configured");

  const url = new URL(input.path, env.PUBLIC_WEB_BASE_URL || "https://lownoise.news").toString();
  const footer = "If you did not request this email, you can ignore it.";
  await env.EMAIL.send({
    to: input.to,
    from: parseEmailAddress(env.EMAIL_FROM),
    subject: input.subject,
    text: [
      "Low Noise News Feed",
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
      "<h1 style=\"font-size: 18px; margin: 0 0 16px;\">Low Noise News Feed</h1>",
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
