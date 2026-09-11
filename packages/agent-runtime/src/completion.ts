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
    generation: number;
    now?: string;
  }): CompletionVerification {
    const decidedAt = input.now ?? new Date().toISOString();
    const proposal: CompletionProposal = {
      id: makeId("completion_proposal", input.runId, input.toolCallId),
      runId: input.runId,
      toolCallId: input.toolCallId,
      citedObservationIds: [...input.citedObservationIds],
      proposedAt: decidedAt
      ,generation:input.generation
    };
    const deficits: string[] = [];
    if (!input.progress.articleExtracted) deficits.push("article_not_extracted");
    if (!input.progress.acceptedContentId) deficits.push("acquired_content_not_accepted");
    if (!input.progress.acceptedObservationId || !input.citedObservationIds.includes(input.progress.acceptedObservationId)) {
      deficits.push("accepted_observation_not_cited");
    }
    if (!input.progress.expectedCandidateId || input.progress.acceptedCandidateId!==input.progress.expectedCandidateId) {
      deficits.push("candidate_identity_not_proven");
    }
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
        ,generation:input.generation
      }
    };
  }
}
