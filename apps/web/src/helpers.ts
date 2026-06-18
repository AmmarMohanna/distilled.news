import type { BriefingConfig } from "@distilled/core";

const ENGLISH_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];

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

export function formatDateTime(value: string): string {
  const date = new Date(value);
  const month = ENGLISH_MONTHS[date.getMonth()] ?? "";
  const day = String(date.getDate());
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${month} ${day}, ${hour}:${minute}`;
}

export function formatTime(value: string, language: "en" | "ar" | "fr"): string {
  void language;
  return formatDateTime(value);
}
