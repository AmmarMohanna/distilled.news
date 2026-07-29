import type { BriefingConfig } from "@distilled/core";

export function uniqueSlug(existing: BriefingConfig[], base: string): string {
  let slug = slugify(base);
  let suffix = 2;
  while (existing.some((item) => item.slug === slug)) {
    slug = `${slugify(base)}-${suffix}`;
    suffix += 1;
  }
  return slug;
}

export function deriveBriefingSlug(existing: BriefingConfig[], title: string, currentId?: string): string {
  return uniqueSlug(
    existing.filter((item) => item.id !== currentId),
    title
  );
}

export function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "briefing"
  );
}

export function publicFeedUrl(username: string, slug: string, origin = window.location.origin): string {
  return new URL(`/${encodeURIComponent(username)}/${encodeURIComponent(slug)}/`, origin).toString();
}

export function verificationEmailSentCopy(hosted: boolean): string {
  const expiry = hosted ? "60 minutes" : "24 hours";
  return `verification email sent. Check your inbox and spam folder. The link expires in ${expiry}.`;
}

export function formatDateTime(value: string, language: "en" | "ar" | "fr" = "en", timezone?: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const locale = language === "ar" ? "ar-LB" : language === "fr" ? "fr-FR" : "en-US";
  const formatter = new Intl.DateTimeFormat(locale, {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: safeTimezone(timezone)
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  const day = parts.day ?? "";
  const month = parts.month ?? "";
  const hour = parts.hour ?? "00";
  const minute = parts.minute ?? "00";

  if (language === "ar") return `${day} ${month}، ${hour}:${minute}`;
  if (language === "fr") return `${day} ${month}, ${hour}:${minute}`;
  return `${month} ${day}, ${hour}:${minute}`;
}

export function formatTime(value: string, language: "en" | "ar" | "fr", timezone?: string): string {
  return formatDateTime(value, language, timezone);
}

function safeTimezone(timezone?: string): string | undefined {
  if (!timezone) return undefined;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date(0));
    return timezone;
  } catch {
    return "UTC";
  }
}
