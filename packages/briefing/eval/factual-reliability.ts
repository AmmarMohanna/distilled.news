import type { ModelPort, ModelRequest, ModelResponse } from "../src/model";

export interface LabelledCase {
  id: string;
  expected: string;
}

/** Offline evaluation only; never part of briefing publication or its call count. */
export async function evaluateVerifierCases(port: ModelPort, request: ModelRequest, cases: LabelledCase[]) {
  const started = Date.now();
  const response = await port.complete(request); // No automatic evaluation retry.
  return { request, response, wallMs: Date.now() - started, ...scoreVerifierCases(response, cases) };
}

export function scoreVerifierCases(response: Pick<ModelResponse, "text">, cases: LabelledCase[]) {
  const parsed = JSON.parse(response.text) as { results?: Array<{ i: number; verdict: string; issues: string[] }> };
  if (!Array.isArray(parsed.results)) throw new Error("Missing evaluation verdicts");
  const rows = cases.map((c, index) => {
    const matches = parsed.results!.filter(r => r.i === index);
    const row = matches.length === 1 ? matches[0] : undefined;
    const valid = row && ["ok", "fix", "drop", "redundant"].includes(row.verdict);
    return {
      id: c.id, expected: c.expected, verdict: valid ? row.verdict : "invalid_or_missing",
      issues: valid && Array.isArray(row.issues) ? row.issues : [],
      detectedMaterialError: Boolean(valid && c.expected !== "ok" && ["fix", "drop"].includes(row.verdict) && Array.isArray(row.issues) && row.issues.length),
      falseApproval: Boolean(valid && c.expected !== "ok" && row.verdict === "ok"),
      falseRejection: Boolean(valid && c.expected === "ok" && row.verdict !== "ok")
    };
  });
  return {
    rows,
    missedErrors: rows.filter(r => r.expected !== "ok" && !r.detectedMaterialError).length,
    falseApprovals: rows.filter(r => r.falseApproval).length,
    falseRejections: rows.filter(r => r.falseRejection).length,
    invalidOrMissing: rows.filter(r => r.verdict === "invalid_or_missing").length,
    unexpectedIndices: parsed.results.filter(r => !Number.isInteger(r.i) || r.i < 0 || r.i >= cases.length).length
  };
}
