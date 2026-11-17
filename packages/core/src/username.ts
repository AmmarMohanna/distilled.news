/** Keep Unicode letters and their accents in public account identifiers. */
export function normalizeUsername(value: string): string {
  return value.normalize("NFC").toLowerCase().trim()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "") || "user";
}
