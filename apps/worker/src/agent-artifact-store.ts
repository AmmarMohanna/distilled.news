import type { ArtifactReference } from "@distilled/agent-runtime/contracts";
import type { ArtifactStore } from "@distilled/agent-runtime/observations";

export class R2AgentArtifactStore implements ArtifactStore {
  constructor(private readonly bucket: R2Bucket) {}

  async put(key: string, bytes: Uint8Array, contentType: string): Promise<ArtifactReference> {
    const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes).buffer);
    const hash = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2,"0")).join("");
    const ref = `agent-runtime/${key}`;
    const existing = await this.bucket.head(ref);
    if (existing) {
      if (existing.customMetadata?.sha256 !== hash || existing.size !== bytes.byteLength) {
        throw new Error(`immutable artifact collision: ${ref}`);
      }
      return { ref,hash,size:bytes.byteLength };
    }
    const stored = await this.bucket.put(ref, bytes, {
      httpMetadata:{ contentType },
      customMetadata:{ sha256:hash, immutable:"true" },
      onlyIf:{ etagDoesNotMatch:"*" }
    });
    if (!stored) {
      const raced = await this.bucket.head(ref);
      if (raced?.customMetadata?.sha256 !== hash || raced.size !== bytes.byteLength) {
        throw new Error(`immutable artifact collision after conditional write: ${ref}`);
      }
    }
    return { ref,hash,size:bytes.byteLength };
  }

  async get(ref: string): Promise<Uint8Array | null> {
    const object = await this.bucket.get(ref);
    return object ? new Uint8Array(await object.arrayBuffer()) : null;
  }
}
