import { describe, expect, it } from "vitest";
import { estimateOpenAiCostUsd } from "./costs";

describe("LLM usage cost estimates", () => {
  it("estimates GPT-4.1 mini token cost with configurable prices", () => {
    expect(estimateOpenAiCostUsd({ inputTokens: 1_000_000, outputTokens: 1_000_000 })).toBe(2);
    expect(estimateOpenAiCostUsd({
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      env: {
        OPENAI_INPUT_PRICE_USD_PER_MILLION_TOKENS: "1",
        OPENAI_OUTPUT_PRICE_USD_PER_MILLION_TOKENS: "2"
      }
    })).toBe(3);
  });
});
