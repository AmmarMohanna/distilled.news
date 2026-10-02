import { z } from "zod";

export const idSchema = z.string().min(1);
export const timestampSchema = z.string().datetime();
export const positiveIntSchema = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
export const scoreSchema = z.number().finite().min(0).max(1);
export const representationSchema = z.enum(["FULL_ARTICLE", "ARTICLE_EXCERPT", "TELEGRAM_MESSAGE", "SOCIAL_POST", "LISTING_RESULT", "API_RECORD"]);
export const completenessSchema = z.enum(["COMPLETE", "PARTIAL", "UNKNOWN"]);
const operationSchema = z.enum(["UPSERT", "DELETE"]);
const scope = { feedId: idSchema, feedSourceId: idSchema };
const item = { ...scope, sourceId: idSchema, sourceItemKey: idSchema };
const hash = z.string().regex(/^[a-f0-9]{64}$/, "Expected lowercase SHA-256");
const url = z.string().url().refine(value => {
  const parsed = new URL(value);
  return ["http:", "https:"].includes(parsed.protocol) && !parsed.username && !parsed.password;
}, "Expected HTTP(S) URL without credentials");
export const sourceRevisionSchema = z.object({ scheme: idSchema, value: idSchema, comparability: z.enum(["COMPARABLE", "OPAQUE"]), authority: z.enum(["ORIGIN", "PROVIDER"]) }).strict();
export const collectionBoundsSchema = z.object({ startTime: timestampSchema.optional(), endTime: timestampSchema.optional(), startCursor: idSchema.optional(), endCursor: idSchema.optional() }).strict().refine(v => !v.startTime || !v.endTime || Date.parse(v.startTime) <= Date.parse(v.endTime), "Reversed time bounds");
export const collectionCoverageSchema = z.object({
  id: idSchema, ...scope, fetchRunId: idSchema, fetchStartSequence: positiveIntSchema,
  requestedBounds: collectionBoundsSchema, observedBounds: collectionBoundsSchema,
  status: completenessSchema, continuationState: z.enum(["NONE", "PENDING", "EXHAUSTED"]),
  continuationToken: idSchema.optional(), safeCheckpointCursor: idSchema.optional(),
  failureReason: z.enum(["NONE", "RATE_LIMIT", "TRANSIENT_PROVIDER_FAILURE", "AUTH_REQUIRED", "CHALLENGE", "PARTIAL_PAGE", "UNKNOWN"]).optional(), createdAt: timestampSchema
}).strict().refine(v => v.status !== "COMPLETE" || (v.continuationState !== "PENDING" && (!v.failureReason || v.failureReason === "NONE")), "Complete coverage cannot have pending continuation or failure");
export const sourceObservationSchema = z.object({
  id: idSchema, ...item, fetchRunId: idSchema, fetchStartSequence: positiveIntSchema,
  operation: operationSchema, representation: representationSchema, contentCompleteness: completenessSchema,
  contentHash: hash.optional(), sourceRevision: sourceRevisionSchema.optional(), authoritativeCurrentState: z.boolean(),
  upstreamId: idSchema.optional(), canonicalUrl: url.optional(), publisherId: idSchema.optional(),
  titleHint: z.string().optional(), publishedAtHint: timestampSchema.optional(), languageHint: idSchema.optional(),
  suppliedPayloadRef: idSchema.optional(), observedAt: timestampSchema
}).strict().superRefine((v, ctx) => {
  if (v.operation === "DELETE" && !v.authoritativeCurrentState) ctx.addIssue({ code: "custom", message: "Deletion requires authoritative evidence" });
  if (v.operation === "UPSERT" && v.suppliedPayloadRef && !v.contentHash) ctx.addIssue({ code: "custom", message: "Supplied usable content requires contentHash" });
});
export const candidateProposalSchema = z.object({
  observationId: idSchema, ...item, connectorType: idSchema, upstreamId: idSchema.optional(), url: url.optional(),
  titleHint: z.string().optional(), publishedAtHint: timestampSchema.optional(), languageHint: idSchema.optional(),
  representation: representationSchema, contentCompleteness: completenessSchema,
  suppliedPayloadRef: idSchema.optional(), payloadHash: hash.optional(), discoveredAt: timestampSchema, discoveryRunId: idSchema
}).strict();
const intakeReasons = ["ACCEPTED_NEW_ITEM", "ACCEPTED_NEW_OBSERVATION", "REPLAY_IDENTICAL", "IGNORED_STALE_OBSERVATION", "ACCEPTED_DELETION", "REJECT_QUERY_RESTRICTION", "REJECT_INVALID_IDENTITY", "REJECT_UNSUPPORTED", "QUARANTINE_MISSING_VALIDATION_FIELDS", "QUARANTINE_REVISION_CONFLICT"] as const;
export const intakeReceiptSchema = z.object({
  id: idSchema, observationId: idSchema, ...scope, sourceItemKey: idSchema,
  decision: z.enum(["ACCEPTED", "REPLAY", "IGNORED", "DELETION_ACCEPTED", "REJECTED", "QUARANTINED"]), reasonCode: z.enum(intakeReasons),
  checkpointResolution: z.enum(["RESOLVED", "UNRESOLVED"]), candidateItemId: idSchema.optional(), tombstoneId: idSchema.optional(), decidedAt: timestampSchema, intakePolicyVersion: idSchema
}).strict().superRefine((v, ctx) => {
  const allowed = { ACCEPTED: ["ACCEPTED_NEW_ITEM", "ACCEPTED_NEW_OBSERVATION"], REPLAY: ["REPLAY_IDENTICAL"], IGNORED: ["IGNORED_STALE_OBSERVATION"], DELETION_ACCEPTED: ["ACCEPTED_DELETION"], REJECTED: ["REJECT_QUERY_RESTRICTION", "REJECT_INVALID_IDENTITY", "REJECT_UNSUPPORTED"], QUARANTINED: ["QUARANTINE_MISSING_VALIDATION_FIELDS", "QUARANTINE_REVISION_CONFLICT"] };
  if (!allowed[v.decision].includes(v.reasonCode)) ctx.addIssue({ code: "custom", message: "Decision/reason mismatch" });
  if ((v.decision === "QUARANTINED") !== (v.checkpointResolution === "UNRESOLVED")) ctx.addIssue({ code: "custom", message: "Invalid checkpoint resolution" });
  if (["ACCEPTED", "REPLAY"].includes(v.decision) && !v.candidateItemId) ctx.addIssue({ code: "custom", message: "Candidate reference required" });
  if (v.decision === "DELETION_ACCEPTED" && (!v.tombstoneId || v.candidateItemId)) ctx.addIssue({ code: "custom", message: "Deletion requires tombstone and no candidate" });
});
export const normalizedEvidenceItemSchema = z.object({
  id: idSchema, ...item, state: z.enum(["ACTIVE", "DELETED"]), currentRevisionId: idSchema.optional(), currentTombstoneId: idSchema.optional(),
  currentObservationId: idSchema, currentFetchStartSequence: positiveIntSchema, currentSourceRevision: sourceRevisionSchema.optional(), firstSeenAt: timestampSchema, updatedAt: timestampSchema
}).strict().refine(v => v.state === "ACTIVE" ? !!v.currentRevisionId && !v.currentTombstoneId : !!v.currentTombstoneId && !v.currentRevisionId, "Invalid current evidence state");
export const evidenceRevisionSchema = z.object({
  id: idSchema, evidenceId: idSchema, feedId: idSchema, revision: positiveIntSchema, sourceObservationId: idSchema, acquiredContentId: idSchema,
  canonicalUrl: url.optional(), title: z.string().optional(), body: z.string().optional(), language: idSchema.optional(), publishedAt: timestampSchema.optional(),
  representation: representationSchema, contentCompleteness: completenessSchema, contentHash: hash, sourceRevision: sourceRevisionSchema.optional(), fetchStartSequence: positiveIntSchema, acceptedAt: timestampSchema
}).strict();
export const evidenceTombstoneSchema = z.object({ id: idSchema, evidenceId: idSchema, feedId: idSchema, sourceObservationId: idSchema, sourceRevision: sourceRevisionSchema.optional(), fetchStartSequence: positiveIntSchema, acceptedAt: timestampSchema }).strict();
export const evidenceAcceptanceReceiptSchema = z.object({
  id: idSchema, evidenceId: idSchema, sourceObservationId: idSchema, acquiredContentId: idSchema,
  decision: z.enum(["PROMOTED_NEW_REVISION", "REPLAY_CURRENT_CONTENT", "IGNORED_STALE_OBSERVATION", "QUARANTINED_REVISION_CONFLICT"]), resultingRevisionId: idSchema.optional(), conflictId: idSchema.optional(), decidedAt: timestampSchema
}).strict().refine(v => v.decision === "QUARANTINED_REVISION_CONFLICT" ? !!v.conflictId && !v.resultingRevisionId : !v.conflictId && (v.decision === "IGNORED_STALE_OBSERVATION" ? !v.resultingRevisionId : !!v.resultingRevisionId), "Invalid evidence receipt references");
export const evidenceRevisionConflictSchema = z.object({
  id: idSchema, evidenceId: idSchema, sourceObservationId: idSchema, acquiredContentId: idSchema, currentRevisionId: idSchema.optional(), currentTombstoneId: idSchema.optional(), incomingContentHash: hash.optional(), currentContentHash: hash.optional(),
  reason: z.enum(["EQUAL_COMPARABLE_SOURCE_REVISION_DIFFERENT_STATE", "EQUAL_FETCH_SEQUENCE_DIFFERENT_STATE", "INCOMPARABLE_REVISION_REQUIRES_AUTHORITATIVE_CHECK"]),
  state: z.enum(["PENDING_AUTHORITATIVE_RECHECK", "RESOLVED_KEEP_CURRENT", "RESOLVED_BY_LATER_OBSERVATION"]), resolutionObservationId: idSchema.optional(), createdAt: timestampSchema, resolvedAt: timestampSchema.optional()
}).strict().refine(v => v.state === "PENDING_AUTHORITATIVE_RECHECK" ? !v.resolvedAt && !v.resolutionObservationId : !!v.resolvedAt && (v.state !== "RESOLVED_BY_LATER_OBSERVATION" || !!v.resolutionObservationId), "Invalid conflict resolution state");
export const eventVersionRefSchema = z.object({ eventId: idSchema, eventVersionId: idSchema, version: positiveIntSchema }).strict();
export const storylineVersionRefSchema = z.object({ storylineId: idSchema, storylineVersionId: idSchema, version: positiveIntSchema }).strict();
export const eventVersionSchema = z.object({ id: idSchema, eventId: idSchema, feedId: idSchema, version: positiveIntSchema, title: z.string().optional(), type: idSchema.optional(), occurredAt: timestampSchema.optional(), entities: z.array(idSchema), geography: z.array(idSchema), state: z.string(), confidence: scoreSchema, algorithmVersion: idSchema, createdAt: timestampSchema }).strict();
export const eventMembershipSchema = z.object({ id: idSchema, eventVersionId: idSchema, evidenceRevisionId: idSchema, confidence: scoreSchema, algorithmVersion: idSchema, createdAt: timestampSchema }).strict();
const target = { targetType: z.enum(["EVENT", "STORYLINE"]), targetVersionId: idSchema };
export const assessmentTargetSchema = z.object(target).strict();
const assessment = { id: idSchema, feedId: idSchema, feedRevision: positiveIntSchema, ...target, policyVersion: idSchema, computedAt: timestampSchema };
export const eventSalienceAssessmentSchema = z.object({ ...assessment, impact: scoreSchema, novelty: scoreSchema, changeMagnitude: scoreSchema, institutionalSignificance: scoreSchema, corroboration: scoreSchema, persistence: scoreSchema, recency: scoreSchema, overallScore: scoreSchema }).strict();
export const userRelevanceSchema = z.object({ ...assessment, topicMatch: scoreSchema, geographyMatch: scoreSchema, entityMatch: scoreSchema, sourcePreference: scoreSchema, languageFit: scoreSchema, overallScore: scoreSchema }).strict();
export const windowScoreSchema = z.object({
  ...assessment, windowStart: timestampSchema, windowEnd: timestampSchema, windowKind: z.enum(["30M", "HOURLY", "DAILY", "WEEKLY"]),
  components: z.object({ recency: scoreSchema, novelty: scoreSchema, changeMagnitude: scoreSchema, impact: scoreSchema, persistence: scoreSchema, turningPoint: scoreSchema }).strict(), finalScore: scoreSchema,
  reasonCodes: z.array(z.enum(["NEW_DEVELOPMENT", "MAJOR_CHANGE", "HIGH_IMPACT", "HIGH_RELEVANCE", "HIGH_RECENCY", "PERSISTENT_STORYLINE", "TURNING_POINT", "LOW_NOVELTY", "REDUNDANT_UPDATE"])), changeBoundaryVersionId: idSchema.optional()
}).strict().refine(v => Date.parse(v.windowStart) < Date.parse(v.windowEnd), "Publication window must be nonempty");
export const briefingCandidateSchema = z.object({ id: idSchema, feedId: idSchema, feedRevision: positiveIntSchema, ...target, salienceAssessmentId: idSchema, relevanceAssessmentId: idSchema, windowScoreId: idSchema, initialScore: scoreSchema, reasons: z.array(z.string()), selectionState: z.enum(["ELIGIBLE", "SELECTED", "OMITTED"]), selectionPolicyVersion: idSchema }).strict();

/** Structural validation is not proof of durability, authorization, or source authority. */
export function validateCandidateAssessments(candidate: unknown, salience: unknown, relevance: unknown, window: unknown) {
  const c = briefingCandidateSchema.parse(candidate);
  const assessments = [eventSalienceAssessmentSchema.parse(salience), userRelevanceSchema.parse(relevance), windowScoreSchema.parse(window)];
  const ids = [c.salienceAssessmentId, c.relevanceAssessmentId, c.windowScoreId];
  assessments.forEach((a, i) => {
    if (a.id !== ids[i] || a.feedId !== c.feedId || a.feedRevision !== c.feedRevision || a.targetType !== c.targetType || a.targetVersionId !== c.targetVersionId) throw new Error("ASSESSMENT_REFERENCE_MISMATCH");
  });
  return c;
}
