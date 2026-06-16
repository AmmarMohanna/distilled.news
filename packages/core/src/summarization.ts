import type { BriefingConfig, BriefingEvidence, SummaryAdapter, SummaryInput } from "./types";
import { firstSentence } from "./text";

export class DeterministicSummaryAdapter implements SummaryAdapter {
  async summarize(input: SummaryInput): Promise<string> {
    return createEvidenceOnlySummary(input.briefing, input.evidence);
  }
}

export function createEvidenceOnlySummary(
  _briefing: BriefingConfig,
  evidence: BriefingEvidence[]
): string {
  const primary = evidence[0];
  if (!primary) return "";

  const sentence = firstSentence(primary.text);
  return sentence.replace(/\bBREAKING:?\s*/gi, "").trim();
}

export function buildSummaryPrompt(input: SummaryInput): string {
  const evidenceLines = input.evidence
    .map((item, index) => {
      return `${index + 1}. ${item.sourceTitle} at ${item.postedAt}: ${item.text}`;
    })
    .join("\n");

  return [
    "You write LowNoise.news briefing items.",
    "Use only the evidence below.",
    "Use balanced wording.",
    "Do not add political framing labels unless the user's instruction explicitly asks for them.",
    "Do not answer questions or speculate.",
    `Interest profile: ${input.briefing.interestProfile}`,
    input.briefing.styleInstruction ? `Style instruction: ${input.briefing.styleInstruction}` : "",
    "Evidence:",
    evidenceLines
  ]
    .filter(Boolean)
    .join("\n");
}
