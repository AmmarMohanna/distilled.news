import type { Env } from "./types";

const DEFAULT_OPENAI_INPUT_PRICE_PER_MILLION_TOKENS_USD = 0.4;
const DEFAULT_OPENAI_OUTPUT_PRICE_PER_MILLION_TOKENS_USD = 1.6;

export function estimateOpenAiCostUsd(input: {
  inputTokens: number;
  outputTokens: number;
  env?: Partial<Env>;
}): number {
  const inputPrice = pricePerMillionTokens(
    input.env?.OPENAI_INPUT_PRICE_USD_PER_MILLION_TOKENS,
    DEFAULT_OPENAI_INPUT_PRICE_PER_MILLION_TOKENS_USD
  );
  const outputPrice = pricePerMillionTokens(
    input.env?.OPENAI_OUTPUT_PRICE_USD_PER_MILLION_TOKENS,
    DEFAULT_OPENAI_OUTPUT_PRICE_PER_MILLION_TOKENS_USD
  );
  return (input.inputTokens * inputPrice + input.outputTokens * outputPrice) / 1_000_000;
}

function pricePerMillionTokens(value: string | undefined, fallback: number): number {
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return fallback;
}
