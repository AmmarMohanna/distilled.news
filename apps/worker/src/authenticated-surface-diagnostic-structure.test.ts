import { describe, expect, it } from "vitest";
import { safeObservationIdentity, safeObservationStructure } from "./authenticated-surface-diagnostic";

describe("bounded auth-surface structure diagnostics", () => {
  it("retains only structural buckets and defaults absent observations safely", () => {
    expect(safeObservationStructure({ documentCountCategory: "few", iframeCountCategory: "one", domNodeCountCategory: "many", accessibilityNodeCountCategory: "few", arbitraryText: "not persisted" } as never)).toEqual({
      documentCountCategory: "few",
      iframeCountCategory: "one",
      domNodeCountCategory: "many",
      accessibilityNodeCountCategory: "few"
    });
    expect(safeObservationStructure({})).toEqual({ documentCountCategory: "none", iframeCountCategory: "none", domNodeCountCategory: "none", accessibilityNodeCountCategory: "none" });
  });

  it("retains only bounded observation contract identity", () => {
    expect(safeObservationIdentity({ bridgeProtocolVersion: "v1", trustedObservationSchemaVersion: "trusted-observation-v1", arbitraryText: "not persisted" } as never)).toEqual({
      bridgeProtocolVersion: "v1",
      trustedObservationSchemaVersion: "trusted-observation-v1"
    });
    expect(safeObservationIdentity({})).toEqual({ bridgeProtocolVersion: "unknown", trustedObservationSchemaVersion: "unknown" });
  });
});
