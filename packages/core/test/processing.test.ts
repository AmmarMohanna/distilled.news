import { describe, expect, it } from "vitest";
import {
  buildSummaryPrompt,
  demoMessages,
  personalNewsBriefing,
  processMessages,
  searchBriefingItems
} from "../src";

describe("processMessages", () => {
  it("filters by interest profile and suppresses low-noise defaults", () => {
    const result = processMessages({
      briefing: personalNewsBriefing,
      messages: demoMessages
    });

    expect(result.publishedItems).toHaveLength(1);
    expect(result.publishedItems[0].summary).toContain("Electricite du Liban");
    expect(result.publishedItems[0].evidence).toHaveLength(2);
    expect(result.suppressed.map((entry) => entry.reason)).toContain(
      "political_statement_without_new_facts"
    );
    expect(result.suppressed.map((entry) => entry.reason)).toContain("not_relevant");
  });

  it("merges repeated updates into existing briefing items", () => {
    const first = processMessages({
      briefing: personalNewsBriefing,
      messages: [demoMessages[0]]
    });

    const second = processMessages({
      briefing: personalNewsBriefing,
      messages: [demoMessages[1]],
      existingItems: first.publishedItems
    });

    expect(second.publishedItems).toHaveLength(1);
    expect(second.publishedItems[0].mergedUpdateCount).toBe(1);
    expect(second.publishedItems[0].evidence.map((entry) => entry.messageId)).toEqual([
      "msg_1",
      "msg_2"
    ]);
  });

  it("deduplicates exact repeated messages", () => {
    const duplicate = { ...demoMessages[0], id: "msg_duplicate", messageId: "102" };
    const result = processMessages({
      briefing: personalNewsBriefing,
      messages: [demoMessages[0], duplicate]
    });

    expect(result.publishedItems[0].evidence).toHaveLength(1);
    expect(result.suppressed).toContainEqual(
      expect.objectContaining({ messageId: "msg_duplicate", reason: "duplicate" })
    );
  });

  it("searches retained published items and ignores expired items", () => {
    const result = processMessages({
      briefing: personalNewsBriefing,
      messages: demoMessages
    });

    expect(searchBriefingItems(result.publishedItems, "power supply", new Date("2026-06-16"))).toHaveLength(1);
    expect(searchBriefingItems(result.publishedItems, "power supply", new Date("2026-07-10"))).toHaveLength(0);
  });
});

describe("summary prompt", () => {
  it("locks summary generation to evidence and avoids chatbot behavior", () => {
    const result = processMessages({
      briefing: personalNewsBriefing,
      messages: [demoMessages[0]]
    });
    const prompt = buildSummaryPrompt({
      briefing: personalNewsBriefing,
      evidence: result.publishedItems[0].evidence
    });

    expect(prompt).toContain("Use only the evidence below");
    expect(prompt).toContain("Do not answer questions or speculate");
    expect(prompt).not.toContain("/api/ask");
  });
});
