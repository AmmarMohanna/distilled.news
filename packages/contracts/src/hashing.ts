import type { RepresentationKind } from "./types";

export const CONTENT_HASH_POLICY = "text-v1" as const;
export interface ContentHashInput { representation: RepresentationKind; title?: string; body: string }
const normalize = (text: string) => text.normalize("NFKC").replace(/\s+/gu, " ").trim();

/** Hash only usable normalized text and its declared representation. Fetch/provider
 * metadata is excluded. Replay still requires matching representation/quality policy. */
export async function hashContent(input: ContentHashInput): Promise<string> {
  return sha256(JSON.stringify([CONTENT_HASH_POLICY, input.representation, normalize(input.title ?? ""), normalize(input.body)]));
}
export async function sha256(value: string | Uint8Array): Promise<string> {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : new Uint8Array(value);
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), byte => byte.toString(16).padStart(2, "0")).join("");
}
