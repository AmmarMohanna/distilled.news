import { describe, expect, it } from "vitest";
import { safeObservationIdentity, safeObservationStructure,safeAuthSurfaceContent } from "./authenticated-surface-diagnostic";

describe("bounded auth-surface structure diagnostics", () => {
  it("retains only structural buckets and defaults absent observations safely", () => {
    expect(safeObservationStructure({ documentCountCategory: "few", iframeCountCategory: "one", domNodeCountCategory: "many", accessibilityNodeCountCategory: "few", arbitraryText: "not persisted" } as never)).toEqual({
      documentCountCategory: "few",
      iframeCountCategory: "one",
      domNodeCountCategory: "many",
      accessibilityNodeCountCategory: "few"
    });
    expect(safeObservationStructure({})).toEqual({ documentCountCategory: "unavailable", iframeCountCategory: "unavailable", domNodeCountCategory: "unavailable", accessibilityNodeCountCategory: "unavailable" });
  });

  it("retains only bounded observation contract identity", () => {
    expect(safeObservationIdentity({ bridgeProtocolVersion: "v1", trustedObservationSchemaVersion: "trusted-observation-v1", arbitraryText: "not persisted" } as never)).toEqual({
      bridgeProtocolVersion: "v1",
      trustedObservationSchemaVersion: "trusted-observation-v1"
    });
    expect(safeObservationIdentity({})).toEqual({ bridgeProtocolVersion: "unknown", trustedObservationSchemaVersion: "unknown" });
  });
  it("categorizes a failed SPA shell without persisting secret-bearing content",()=>{
    const result=safeAuthSurfaceContent({title:"X",visibleText:"JavaScript is not available. SECRET_PASSWORD cookie secret"});
    expect(result).toMatchObject({javascriptUnavailable:true,temporaryError:false,titleCategory:"site"});
    expect(JSON.stringify(result)).not.toMatch(/SECRET_PASSWORD|cookie|secret/);
    expect(safeAuthSurfaceContent({visibleText:"Something went wrong. Try again."})).toMatchObject({temporaryError:true});
  });
});
