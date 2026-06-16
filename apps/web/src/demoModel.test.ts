import { describe, expect, it } from "vitest";
import { demoMessages, personalNewsBriefing } from "@lownoise/core";
import { buildDemoOutput } from "./demoModel";

describe("buildDemoOutput", () => {
  it("filters sample messages without network or login", () => {
    const result = buildDemoOutput(
      personalNewsBriefing.interestProfile,
      demoMessages.map((message) => message.source.id)
    );

    expect(result.inputMessages.length).toBeGreaterThan(result.items.length);
    expect(result.items[0].summary).toContain("Electricite du Liban");
    expect(result.suppressedCount).toBeGreaterThan(0);
  });
});
