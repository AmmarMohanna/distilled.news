/** Stable Worker import for source-specific connectors. No briefing internals. */
export {CandidateIntake,acquireCandidate,canonicalizeCandidateUrl} from "./candidate-pipeline";
export type {AcquisitionPayload,AcquisitionStrategies} from "./candidate-pipeline";
export type {CandidateProposal,CandidateItem,CandidateEligibilityDecision,AcquiredContent,NormalizedEvidenceItem,AcquisitionMethod} from "@distilled/core";
export type {SourceAcquisitionCoverage,SourceAcquisitionResult,SourceHighWaterState,SourceHighWaterStore} from "@distilled/agent-runtime";
