import {
  applyEditionSynthesis,
  assignFallbackEditionTiers,
  buildBriefingEdition,
  editionSynthesisRejectionReason,
  getDueBriefingWindow,
  sanitizeSummary,
  sectionSummaryMatchesFeedLanguage,
  selectEditionReferenceSections,
  synthesizeEditionNarrativeSummary,
  type BriefingConfig,
  type BriefingEdition,
  type EditionSynthesisAdapter,
  type SummaryAdapter
} from "@distilled/core";
import type { Repository } from "./types";

const MAX_WINDOW_MESSAGES = 500;
export const BRIEFING_PREPARATION_LEAD_MS = 0;
const BRIEFING_WINDOW_LEASE_MS = 90 * 1000;
const MAX_SOURCE_POST_AGE_MS = 2 * 60 * 60 * 1000;
export const EMPTY_WINDOW_RECOVERY_HORIZON_MS = 2 * 60 * 60 * 1000;

/**
 * Edition preparation advances the stored schedule before the publication
 * boundary so the scheduler cannot enqueue the same slot every minute. Keep
 * exposing that prepared boundary until it actually arrives.
 */
export function visibleNextBriefingAt(
  briefing: Pick<BriefingConfig, "briefingCadence" | "briefingTimeOfDay" | "briefingTimezone" | "nextBriefingAt">,
  now = new Date()
): string | undefined {
  if (!briefing.nextBriefingAt) return undefined;
  const storedNext = new Date(briefing.nextBriefingAt);
  if (Number.isNaN(storedNext.getTime())) return briefing.nextBriefingAt;
  const storedWindow = getDueBriefingWindow(briefing as BriefingConfig, storedNext);
  const preparedBoundary = storedWindow ? new Date(storedWindow.windowStart) : null;
  if (preparedBoundary && preparedBoundary.getTime() > now.getTime() &&
    preparedBoundary.getTime() - now.getTime() <= BRIEFING_PREPARATION_LEAD_MS) {
    return preparedBoundary.toISOString();
  }
  return briefing.nextBriefingAt;
}

export async function publishDueBriefingEditions(input: {
  repo: Repository;
  briefings: BriefingConfig[];
  now?: Date;
  summaryAdapter?: SummaryAdapter | null;
  editionSynthesisAdapter?: EditionSynthesisAdapter | null;
  editionSynthesisMode?: string;
  releaseSha?: string;
}): Promise<number> {
  const now = input.now ?? new Date();
  let published = 0;

  for (const briefing of input.briefings) {
    const owner = await input.repo.getAccountById(briefing.ownerAccountId);
    if (briefing.paused || !briefing.publicFeedEnabled || !owner || owner.disabledAt) continue;
    published += await recoverRecentEmptyWindows({
      briefing,
      repo: input.repo,
      now,
      summaryAdapter: input.summaryAdapter,
      editionSynthesisAdapter: input.editionSynthesisAdapter,
      editionSynthesisMode: input.editionSynthesisMode,
      releaseSha: input.releaseSha
    });
    const window = getDueBriefingWindow(
      briefing,
      new Date(now.getTime() + BRIEFING_PREPARATION_LEAD_MS)
    );
    if (!window) continue;
    const claim = await input.repo.claimBriefingWindow({
      briefingId: briefing.id,
      cadence: briefing.briefingCadence,
      windowStart: window.windowStart,
      windowEnd: window.windowEnd,
      leaseMs: BRIEFING_WINDOW_LEASE_MS
    }, now);
    if (!claim) continue;

    try {
      const contentCutoffAt = new Date(Math.min(now.getTime(), new Date(window.windowEnd).getTime())).toISOString();
      const previousCutoffAt = await input.repo.getLatestBriefingWindowCutoff(
        briefing.id,
        briefing.briefingCadence,
        window.windowEnd
      ) ?? window.windowStart;
      const postedAfter = new Date(new Date(window.windowStart).getTime() - MAX_SOURCE_POST_AGE_MS).toISOString();
      const messages = await input.repo.listRawMessagesReceivedBetween(
        briefing.id,
        previousCutoffAt,
        contentCutoffAt,
        postedAfter,
        MAX_WINDOW_MESSAGES
      );
      const edition = await localizeEdition(
        buildBriefingEdition({
          briefing,
          messages,
          windowStart: window.windowStart,
          windowEnd: window.windowEnd,
          now
        }),
        briefing,
        input.summaryAdapter,
        input.editionSynthesisAdapter,
        input.editionSynthesisMode,
        input.repo,
        input.releaseSha
      );
      const enabledSources = (await input.repo.listSources(briefing.id)).filter((source) => source.enabled);
      const healthySourceCount = enabledSources.filter(
        (source) => !source.healthState || source.healthState === "healthy"
      ).length;
      const qualityState = enabledSources.length > 0 && healthySourceCount > 0 ? "ready" : "degraded";

      await input.repo.saveBriefingEdition(edition, now);
      if (edition.status === "published") published += 1;
      await input.repo.completeBriefingWindow({
        id: claim.id,
        leaseToken: claim.leaseToken,
        state: edition.status === "published" ? "published" : "empty",
        messageCount: messages.length,
        editionId: edition.id,
        contentCutoffAt,
        qualityState
      }, now);
      await input.repo.upsertBriefing({ ...briefing, nextBriefingAt: window.nextBriefingAt }, now);
    } catch (error) {
      await input.repo.failBriefingWindow(
        claim.id,
        claim.leaseToken,
        error instanceof Error ? error.message : String(error),
        now
      );
      throw error;
    }
  }

  return published;
}

/**
 * A window with collected source material should get one safe retry when a
 * previously deployed relevance rule rejected everything. This is bounded to
 * recent slots and permanently records the recovery attempt, so an ordinary
 * quiet hour cannot create recurring model work.
 */
async function recoverRecentEmptyWindows(input: {
  briefing: BriefingConfig;
  repo: Repository;
  now: Date;
  summaryAdapter?: SummaryAdapter | null;
  editionSynthesisAdapter?: EditionSynthesisAdapter | null;
  editionSynthesisMode?: string;
  releaseSha?: string;
}): Promise<number> {
  const sinceWindowEnd = new Date(input.now.getTime() - EMPTY_WINDOW_RECOVERY_HORIZON_MS).toISOString();
  const recoverable = await input.repo.listRecoverableEmptyBriefingWindows(
    input.briefing.id,
    input.briefing.briefingCadence,
    sinceWindowEnd
  );
  let published = 0;

  for (const window of recoverable) {
    const claim = await input.repo.claimRecoverableEmptyBriefingWindow(window.id, BRIEFING_WINDOW_LEASE_MS, input.now);
    if (!claim) continue;

    try {
      const previousCutoffAt = await input.repo.getLatestBriefingWindowCutoff(
        input.briefing.id,
        input.briefing.briefingCadence,
        window.windowStart
      ) ?? window.windowStart;
      const postedAfter = new Date(new Date(window.windowStart).getTime() - MAX_SOURCE_POST_AGE_MS).toISOString();
      const messages = await input.repo.listRawMessagesReceivedBetween(
        input.briefing.id,
        previousCutoffAt,
        window.contentCutoffAt,
        postedAfter,
        MAX_WINDOW_MESSAGES
      );
      const edition = await localizeEdition(
        buildBriefingEdition({
          briefing: input.briefing,
          messages,
          windowStart: window.windowStart,
          windowEnd: window.windowEnd,
          now: input.now
        }),
        input.briefing,
        input.summaryAdapter,
        input.editionSynthesisAdapter,
        input.editionSynthesisMode,
        input.repo,
        input.releaseSha
      );
      const qualityState = await briefingWindowQuality(input.repo, input.briefing.id);
      await input.repo.saveBriefingEdition(edition, input.now);
      if (edition.status === "published") published += 1;
      await input.repo.completeBriefingWindow({
        id: claim.id,
        leaseToken: claim.leaseToken,
        state: edition.status === "published" ? "published" : "empty",
        messageCount: messages.length,
        editionId: edition.id,
        contentCutoffAt: window.contentCutoffAt,
        qualityState
      }, input.now);
    } catch (error) {
      await input.repo.failBriefingWindow(
        claim.id,
        claim.leaseToken,
        error instanceof Error ? error.message : String(error),
        input.now
      );
      throw error;
    }
  }

  return published;
}

async function briefingWindowQuality(repo: Repository, briefingId: string): Promise<"ready" | "degraded"> {
  const enabledSources = (await repo.listSources(briefingId)).filter((source) => source.enabled);
  const healthySourceCount = enabledSources.filter(
    (source) => !source.healthState || source.healthState === "healthy"
  ).length;
  return enabledSources.length > 0 && healthySourceCount > 0 ? "ready" : "degraded";
}

async function localizeEdition(
  edition: BriefingEdition,
  briefing: BriefingConfig,
  summaryAdapter?: SummaryAdapter | null,
  editionSynthesisAdapter?: EditionSynthesisAdapter | null,
  editionSynthesisMode = "all",
  repo?: Repository,
  releaseSha?: string
): Promise<BriefingEdition> {
  if (edition.status !== "published") return edition;

  const sections: BriefingEdition["sections"] = [];
  for (const section of edition.sections) {
    if (section.evidence.length === 0) {
      sections.push(section);
      continue;
    }

    if (!shouldLocalizeSectionSummary(section.summary, briefing.language)) {
      if (sectionSummaryMatchesFeedLanguage(section.summary, briefing.language)) {
        sections.push(section);
      }
      continue;
    }

    if (summaryAdapter) {
      try {
        const summary = sanitizeSummary(
          await summaryAdapter.summarize({ briefing, evidence: section.evidence }),
          briefing.language
        );
        if (summary && sectionSummaryMatchesFeedLanguage(summary, briefing.language)) {
          sections.push({ ...section, summary });
          continue;
        }
      } catch {
        // Wrong-language generated text is omitted from public synthesis when localization is unavailable.
      }
    }
  }

  const publicSections = selectEditionReferenceSections(sections, edition.cadence, briefing.language, { strictLanguage: true });
  const normalizedStatus = publicSections.length > 0 ? edition.status : "empty";
  let finalSections = assignFallbackEditionTiers(publicSections);
  let generationMode: BriefingEdition["generationMode"] = "deterministic";
  let finalSummary = synthesizeEditionNarrativeSummary(
    finalSections.filter((section) => section.tier === "top"),
    edition.cadence,
    briefing.language
  );

  if (
    normalizedStatus === "published" &&
    publicSections.length >= 1 &&
    editionSynthesisAdapter &&
    editionSynthesisEnabled(editionSynthesisMode, briefing)
  ) {
    try {
      const synthesisInput = { briefing, cadence: edition.cadence, sections: publicSections };
      const synthesisDraft = await editionSynthesisAdapter.synthesize(synthesisInput);
      const synthesis = applyEditionSynthesis(synthesisInput, synthesisDraft);
      if (synthesis) {
        finalSections = synthesis.sections;
        finalSummary = synthesis.summary;
        generationMode = "ai";
        if (repo) {
          try {
            await repo.recordOperationalEvent({
              category: "model",
              subsystem: "edition_synthesis_validation",
              status: "succeeded",
              bodyType: "edition_summary",
              bodyId: briefing.id,
              releaseSha,
              detail: "validated_synthesis"
            });
          } catch {
            // Model health telemetry must not change publication behavior.
          }
        }
      } else {
        const reason = editionSynthesisRejectionReason(synthesisDraft, synthesisInput);
        console.warn("Rejected invalid edition synthesis", {
          briefingId: briefing.id,
          language: briefing.language,
          reason
        });
        if (repo) {
          try {
            await repo.recordOperationalEvent({
              category: "model",
              subsystem: "edition_synthesis_validation",
              status: "failed",
              bodyType: "edition_summary",
              bodyId: briefing.id,
              releaseSha,
              detail: `invalid_synthesis:${reason}`.slice(0, 200)
            });
          } catch {
            // Model health telemetry must not change deterministic fallback behavior.
          }
        }
      }
    } catch (error) {
      console.warn("Edition synthesis failed; using deterministic fallback", {
        briefingId: briefing.id,
        language: briefing.language,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  return {
    ...edition,
    sections: finalSections,
    summary: finalSummary,
    status: normalizedStatus,
    generationMode
  };
}

function editionSynthesisEnabled(mode: string, briefing: BriefingConfig): boolean {
  const normalized = mode.trim().toLowerCase();
  if (normalized === "all") return true;
  if (normalized === "canary") return briefing.ownerUsername.startsWith("canary-");
  return false;
}

function shouldLocalizeSectionSummary(summary: string, language: BriefingConfig["language"]): boolean {
  const hasArabic = /[\u0600-\u06FF]/u.test(summary);
  const hasLatin = /[A-Za-zÀ-ÖØ-öø-ÿ]/u.test(summary);
  if (sectionSummaryMatchesFeedLanguage(summary, language)) return false;
  if (language === "ar") return hasLatin;
  if (language === "en" || language === "fr") return hasArabic;
  return false;
}
