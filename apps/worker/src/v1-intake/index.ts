export { V1IntakeStore } from './store';
export { createCandidateIntakePort, type DurableCandidateIntakePort } from './intake';
export { acceptAcquiredContent } from './evidence';
export { resolveEvidenceConflict, recordRecheckFailure, type ConflictResolution } from './conflicts';
export { validateQueryRestrictions } from './policy';
export type { IntakeScope, QueryRestrictions, ValidationFacts, IntakePolicy, VerifiedSuppliedContent, DownstreamJob, AcceptedAcquiredContent, CandidateRecord, AcceptedInput } from './types';
