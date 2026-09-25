/** Canonical origin identity used at every public-browser policy boundary. */
export function normalizeHttpsOrigin(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("origin must be an HTTPS origin without credentials");
  }
  return url.origin;
}

export function originMatches(value: string, admitted: readonly string[]): boolean {
  try { return admitted.some((candidate) => normalizeHttpsOrigin(candidate) === normalizeHttpsOrigin(value)); }
  catch { return false; }
}
