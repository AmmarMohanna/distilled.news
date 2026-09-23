import { describe, expect, it } from "vitest";
import { safeObservationStructure } from "./authenticated-surface-diagnostic";

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
});
