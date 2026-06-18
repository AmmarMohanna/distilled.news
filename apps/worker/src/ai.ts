import {
  buildSummaryPrompt,
  sanitizeSummary,
  type EventEquivalenceInput,
  type EventReviewAdapter,
  type ImportanceReviewInput,
  type SummaryAdapter,
  type SummaryInput
} from "@distilled/core";
import type { Env } from "./types";

export class OpenAIGatewaySummaryAdapter implements SummaryAdapter {
  constructor(
    private readonly options: {
      accountId: string;
      gatewayId: string;
      apiKey: string;
      gatewayAuthToken?: string;
      model: string;
      fetcher?: typeof fetch;
    }
  ) {}

  async summarize(input: SummaryInput): Promise<string> {
    const fetcher = this.options.fetcher ?? fetch;
    const response = await fetcher(
      `https://gateway.ai.cloudflare.com/v1/${this.options.accountId}/${this.options.gatewayId}/openai/chat/completions`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.options.apiKey}`,
          ...(this.options.gatewayAuthToken
            ? { "cf-aig-authorization": `Bearer ${this.options.gatewayAuthToken}` }
            : {}),
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model: this.options.model,
          temperature: 0.1,
          messages: [
            {
              role: "system",
              content:
                "You produce short Distilled.news briefing summaries. You never answer questions or add facts outside evidence. If the evidence lacks a clear standalone factual update, return exactly NO_POST."
            },
            { role: "user", content: buildSummaryPrompt(input) }
          ]
        })
      }
    );

    if (!response.ok) {
      throw new Error(`AI Gateway summary request failed: ${response.status}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error("AI Gateway returned an empty summary");
    return sanitizeSummary(content);
  }
}

export class OpenAIGatewayEventReviewAdapter implements EventReviewAdapter {
  constructor(
    private readonly options: {
      accountId: string;
      gatewayId: string;
      apiKey: string;
      gatewayAuthToken?: string;
      model: string;
      fetcher?: typeof fetch;
    }
  ) {}

  async areSameEvent(input: EventEquivalenceInput): Promise<boolean> {
    const result = await this.reviewJson([
      "Decide whether the two evidence groups describe the same concrete news event.",
      "Use only the evidence text, links, source names, and timestamps below.",
      "Return strict JSON only: {\"same_event\":true} or {\"same_event\":false}.",
      `Interest profile: ${input.briefing.interestProfile}`,
      "Left evidence:",
      formatEvidence(input.left),
      "Right evidence:",
      formatEvidence(input.right)
    ].join("\n"));
    return result.same_event === true;
  }

  async isImportant(input: ImportanceReviewInput): Promise<boolean> {
    const result = await this.reviewJson([
      "Decide whether this message is an important concrete update for the briefing interest profile.",
      "Important means official decisions, security incidents, casualties, major infrastructure disruption, economic/currency moves, border/regional escalation, or another concrete high-impact change.",
      "Do not mark generic commentary, vague reactions, teasers, or unrelated world news as important.",
      "Use only the supplied message and interest profile.",
      "Return strict JSON only: {\"important\":true} or {\"important\":false}.",
      `Interest profile: ${input.briefing.interestProfile}`,
      `Source: ${input.message.source.title}`,
      `Time: ${input.message.postedAt}`,
      `Text: ${input.message.text}`,
      `Links: ${input.message.links.join(" ")}`
    ].join("\n"));
    return result.important === true;
  }

  private async reviewJson(prompt: string): Promise<{ same_event?: boolean; important?: boolean }> {
    const fetcher = this.options.fetcher ?? fetch;
    const response = await fetcher(
      `https://gateway.ai.cloudflare.com/v1/${this.options.accountId}/${this.options.gatewayId}/openai/chat/completions`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.options.apiKey}`,
          ...(this.options.gatewayAuthToken
            ? { "cf-aig-authorization": `Bearer ${this.options.gatewayAuthToken}` }
            : {}),
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model: this.options.model,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                "You are an evidence-bound Distilled.news classifier. Return only strict JSON. Do not add facts, explanations, markdown, or prose."
            },
            { role: "user", content: prompt }
          ]
        })
      }
    );

    if (!response.ok) throw new Error(`AI Gateway review request failed: ${response.status}`);
    const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = payload.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error("AI Gateway returned an empty review");
    return JSON.parse(content) as { same_event?: boolean; important?: boolean };
  }
}

export function createSummaryAdapterFromEnv(env: Env): OpenAIGatewaySummaryAdapter | null {
  if (!env.CLOUDFLARE_ACCOUNT_ID || !env.CLOUDFLARE_AI_GATEWAY_ID || !env.OPENAI_API_KEY) return null;
  return new OpenAIGatewaySummaryAdapter({
    accountId: env.CLOUDFLARE_ACCOUNT_ID,
    gatewayId: env.CLOUDFLARE_AI_GATEWAY_ID,
    apiKey: env.OPENAI_API_KEY,
    gatewayAuthToken: env.CLOUDFLARE_AI_GATEWAY_TOKEN,
    model: env.OPENAI_MODEL ?? "gpt-4.1-mini"
  });
}

export function createEventReviewAdapterFromEnv(env: Env): OpenAIGatewayEventReviewAdapter | null {
  if (!env.CLOUDFLARE_ACCOUNT_ID || !env.CLOUDFLARE_AI_GATEWAY_ID || !env.OPENAI_API_KEY) return null;
  return new OpenAIGatewayEventReviewAdapter({
    accountId: env.CLOUDFLARE_ACCOUNT_ID,
    gatewayId: env.CLOUDFLARE_AI_GATEWAY_ID,
    apiKey: env.OPENAI_API_KEY,
    gatewayAuthToken: env.CLOUDFLARE_AI_GATEWAY_TOKEN,
    model: env.OPENAI_MODEL ?? "gpt-4.1-mini"
  });
}

function formatEvidence(evidence: EventEquivalenceInput["left"]): string {
  return evidence
    .slice(0, 8)
    .map((entry, index) =>
      `${index + 1}. ${entry.sourceTitle} at ${entry.postedAt}: ${entry.text} ${[entry.sourceUrl, ...entry.links].filter(Boolean).join(" ")}`
    )
    .join("\n");
}
