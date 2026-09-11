import type {
  CompletionAcceptance,
  CompletionProposal,
  ProgressFacts
} from "./contracts";
import { makeId } from "./contracts";

export interface CompletionVerification {
  proposal: CompletionProposal;
  acceptance: CompletionAcceptance;
}

export class CompletionVerifier {
  constructor(readonly contractVersion = "known-candidate-watermark-v1") {}

  verify(input: {
    runId: string;
    toolCallId: string;
    citedObservationIds: string[];
    progress: ProgressFacts;
    now?: string;
  }): CompletionVerification {
    const decidedAt = input.now ?? new Date().toISOString();
    const proposal: CompletionProposal = {
      id: makeId("completion_proposal", input.runId, input.toolCallId),
      runId: input.runId,
      toolCallId: input.toolCallId,
      citedObservationIds: [...input.citedObservationIds],
      proposedAt: decidedAt
    };
    const deficits: string[] = [];
    if (!input.progress.articleExtracted) deficits.push("article_not_extracted");
    if (!input.progress.acceptedContentId) deficits.push("acquired_content_not_accepted");
    if (!input.progress.watermarkObserved && !input.progress.validatedListingBoundaryReached) {
      deficits.push("completion_boundary_not_proven");
    }
    const outcome = deficits.length === 0 ? "accepted" : "not_satisfied";
    return {
      proposal,
      acceptance: {
        id: makeId("completion_acceptance", input.runId, proposal.id, this.contractVersion),
        runId: input.runId,
        proposalId: proposal.id,
        contractVersion: this.contractVersion,
        outcome,
        deficits,
        decidedAt
      }
    };
  }
}
