import type { z } from "zod";
import type * as Wire from "./types";
import * as schemas from "./schemas";

/** Compile-time check that every frozen object interface has a compatible runtime validator. */
export const wireSchemas = {
  CollectionBounds: schemas.collectionBoundsSchema,
  CollectionCoverage: schemas.collectionCoverageSchema,
  SourceRevision: schemas.sourceRevisionSchema,
  SourceObservation: schemas.sourceObservationSchema,
  CandidateProposal: schemas.candidateProposalSchema,
  IntakeReceipt: schemas.intakeReceiptSchema,
  NormalizedEvidenceItem: schemas.normalizedEvidenceItemSchema,
  EvidenceRevision: schemas.evidenceRevisionSchema,
  EvidenceTombstone: schemas.evidenceTombstoneSchema,
  EvidenceAcceptanceReceipt: schemas.evidenceAcceptanceReceiptSchema,
  EvidenceRevisionConflict: schemas.evidenceRevisionConflictSchema,
  EventVersionRef: schemas.eventVersionRefSchema,
  StorylineVersionRef: schemas.storylineVersionRefSchema,
  EventVersion: schemas.eventVersionSchema,
  EventMembership: schemas.eventMembershipSchema,
  AssessmentTarget: schemas.assessmentTargetSchema,
  EventSalienceAssessment: schemas.eventSalienceAssessmentSchema,
  UserRelevance: schemas.userRelevanceSchema,
  WindowScore: schemas.windowScoreSchema,
  BriefingCandidate: schemas.briefingCandidateSchema
} satisfies {
  CollectionBounds: z.ZodType<Wire.CollectionBounds>;
  CollectionCoverage: z.ZodType<Wire.CollectionCoverage>;
  SourceRevision: z.ZodType<Wire.SourceRevision>;
  SourceObservation: z.ZodType<Wire.SourceObservation>;
  CandidateProposal: z.ZodType<Wire.CandidateProposal>;
  IntakeReceipt: z.ZodType<Wire.IntakeReceipt>;
  NormalizedEvidenceItem: z.ZodType<Wire.NormalizedEvidenceItem>;
  EvidenceRevision: z.ZodType<Wire.EvidenceRevision>;
  EvidenceTombstone: z.ZodType<Wire.EvidenceTombstone>;
  EvidenceAcceptanceReceipt: z.ZodType<Wire.EvidenceAcceptanceReceipt>;
  EvidenceRevisionConflict: z.ZodType<Wire.EvidenceRevisionConflict>;
  EventVersionRef: z.ZodType<Wire.EventVersionRef>;
  StorylineVersionRef: z.ZodType<Wire.StorylineVersionRef>;
  EventVersion: z.ZodType<Wire.EventVersion>;
  EventMembership: z.ZodType<Wire.EventMembership>;
  AssessmentTarget: z.ZodType<Wire.AssessmentTarget>;
  EventSalienceAssessment: z.ZodType<Wire.EventSalienceAssessment>;
  UserRelevance: z.ZodType<Wire.UserRelevance>;
  WindowScore: z.ZodType<Wire.WindowScore>;
  BriefingCandidate: z.ZodType<Wire.BriefingCandidate>;
};
