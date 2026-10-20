import { BriefingModelError, type Usage } from "./types";

export interface ModelRequest {
  model: string;
  system: string;
  user: string;
  maxTokens: number;
  signal?: AbortSignal;
}

export interface ModelResponse {
  text: string;
  inputTokens: number;
  outputTokens: number;
  costUsd?: number;
  /** "length" means the reply was cut off. */
  finishReason?: string;
}

/** The only thing the engine knows about model providers. */
export interface ModelPort {
  complete(request: ModelRequest): Promise<ModelResponse>;
}

/** USD per million tokens. Unknown models report no cost rather than a guess. */
export type PriceTable = Record<string, { input: number; output: number }>;

export const DEFAULT_PRICES: PriceTable = {
  "openai/gpt-4.1": { input: 2, output: 8 },
  "openai/gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "openai/gpt-4.1-nano": { input: 0.1, output: 0.4 },
  "gpt-4.1": { input: 2, output: 8 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 }
};

function priced(prices: PriceTable, model: string, input: number, output: number): number | undefined {
  const price = prices[model];
  return price ? (input * price.input + output * price.output) / 1_000_000 : undefined;
}

interface TransportOptions {
  fetcher?: typeof fetch;
  timeoutMs?: number;
  retries?: number;
  sleep?: (ms: number) => Promise<void>;
  prices?: PriceTable;
}

async function post(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  options: TransportOptions,
  signal?: AbortSignal
): Promise<unknown> {
  const fetcher = options.fetcher ?? fetch;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const retries = options.retries ?? 2;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 90_000);
    const onAbort = () => controller.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      const response = await fetcher(url, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      if (response.ok) return await response.json();
      const detail = (await response.text().catch(() => "")).slice(0, 300);
      const retryable = response.status === 429 || response.status >= 500;
      lastError = new BriefingModelError(`provider HTTP ${response.status}: ${detail}`, retryable);
      if (!retryable) throw lastError;
    } catch (error) {
      if (error instanceof BriefingModelError && !error.retryable) throw error;
      if (signal?.aborted) throw new BriefingModelError("aborted", false);
      lastError = error instanceof BriefingModelError ? error : new BriefingModelError(`provider unreachable: ${String(error)}`, true);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
    if (attempt < retries) await sleep(600 * 2 ** attempt);
  }
  throw lastError;
}

/** OpenAI-compatible chat completions: OpenRouter, Cloudflare AI Gateway/Workers AI, OpenAI itself. */
export function openAiCompatibleModel(config: {
  url: string;
  apiKey: string;
  headers?: Record<string, string>;
  /** Ask OpenRouter to return the billed cost. */
  reportCost?: boolean;
} & TransportOptions): ModelPort {
  return {
    async complete(request) {
      const payload = (await post(
        config.url,
        { authorization: `Bearer ${config.apiKey}`, ...config.headers },
        {
          model: request.model,
          temperature: 0.1,
          max_tokens: request.maxTokens,
          response_format: { type: "json_object" },
          ...(config.reportCost ? { usage: { include: true } } : {}),
          messages: [
            { role: "system", content: request.system },
            { role: "user", content: request.user }
          ]
        },
        config,
        request.signal
      )) as {
        choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
      };
      const choice = payload.choices?.[0];
      const text = choice?.message?.content;
      if (typeof text !== "string" || !text.trim()) throw new BriefingModelError("empty model reply", true);
      const input = payload.usage?.prompt_tokens ?? 0;
      const output = payload.usage?.completion_tokens ?? 0;
      return {
        text,
        inputTokens: input,
        outputTokens: output,
        costUsd: payload.usage?.cost ?? priced(config.prices ?? DEFAULT_PRICES, request.model, input, output),
        finishReason: choice?.finish_reason
      };
    }
  };
}

export function anthropicModel(config: { apiKey: string; baseUrl?: string } & TransportOptions): ModelPort {
  return {
    async complete(request) {
      const payload = (await post(
        `${config.baseUrl ?? "https://api.anthropic.com"}/v1/messages`,
        { "x-api-key": config.apiKey, "anthropic-version": "2023-06-01" },
        {
          model: request.model,
          max_tokens: request.maxTokens,
          temperature: 0.1,
          system: request.system,
          messages: [{ role: "user", content: request.user }]
        },
        config,
        request.signal
      )) as {
        content?: Array<{ type: string; text?: string }>;
        stop_reason?: string;
        usage?: { input_tokens?: number; output_tokens?: number };
      };
      const text = (payload.content ?? []).map((part) => (part.type === "text" ? part.text ?? "" : "")).join("");
      if (!text.trim()) throw new BriefingModelError("empty model reply", true);
      const input = payload.usage?.input_tokens ?? 0;
      const output = payload.usage?.output_tokens ?? 0;
      return {
        text,
        inputTokens: input,
        outputTokens: output,
        costUsd: priced(config.prices ?? DEFAULT_PRICES, request.model, input, output),
        finishReason: payload.stop_reason === "max_tokens" ? "length" : payload.stop_reason
      };
    }
  };
}

/** Pulls the first JSON object out of a reply, tolerating code fences and chatter around it. */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const attempts = [trimmed];
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) attempts.push(fenced[1].trim());
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) attempts.push(trimmed.slice(start, end + 1));
  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt);
    } catch {
      /* try the next shape */
    }
  }
  throw new Error("reply is not valid JSON");
}

export class UsageMeter {
  readonly usage: Usage = { calls: 0, inputTokens: 0, outputTokens: 0 };
  add(response: ModelResponse): void {
    this.usage.calls += 1;
    this.usage.inputTokens += response.inputTokens;
    this.usage.outputTokens += response.outputTokens;
    if (response.costUsd !== undefined) this.usage.costUsd = (this.usage.costUsd ?? 0) + response.costUsd;
  }
}

/**
 * One model call that must return a JSON object the caller can use. A malformed or unusable
 * reply gets exactly one corrective retry that quotes the problem back; a second failure throws.
 */
export async function callJson<T>(
  port: ModelPort,
  meter: UsageMeter,
  request: ModelRequest,
  parse: (raw: unknown) => T
): Promise<T> {
  let problem = "";
  let lastReply = "";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const user =
      attempt === 0
        ? request.user
        : `${request.user}\n\nYour previous reply could not be used (${problem}). Reply again with only the corrected JSON object.`;
    const response = await port.complete({ ...request, user });
    meter.add(response);
    lastReply = response.text;
    if (response.finishReason === "length") {
      problem = "it was cut off before the JSON finished; be more concise";
      continue;
    }
    try {
      return parse(extractJson(response.text));
    } catch (error) {
      problem = error instanceof Error ? error.message : String(error);
    }
  }
  throw new BriefingModelError(`model did not return usable JSON (${problem}); last reply began: ${lastReply.slice(0, 120)}`, true);
}
