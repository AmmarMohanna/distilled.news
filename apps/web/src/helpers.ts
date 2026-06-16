import type { BriefingConfig } from "@lownoise/core";

export function uniqueSlug(existing: BriefingConfig[], base: string): string {
  let slug = slugify(base);
  let suffix = 2;
  while (existing.some((item) => item.slug === slug)) {
    slug = `${slugify(base)}-${suffix}`;
    suffix += 1;
  }
  return slug;
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

export function publicFeedUrl(slug: string, origin = window.location.origin): string {
  return new URL(`/feed/${encodeURIComponent(slug)}`, origin).toString();
}

export function formatTime(value: string, language: "en" | "ar"): string {
  const locale = language === "ar" ? "ar-LB-u-nu-latn" : "en-GB";
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(value));
}
