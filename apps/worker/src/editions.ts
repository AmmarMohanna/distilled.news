import {
  buildBriefingEdition,
  getDueBriefingWindow,
  sanitizeSummary,
  sectionSummaryMatchesFeedLanguage,
  selectEditionReferenceSections,
  synthesizeEditionNarrativeSummary,
  type BriefingWindow,
  type BriefingConfig,
  type BriefingEdition,
  type SummaryAdapter
} from "@distilled/core";
import type { Repository } from "./types";

const MAX_WINDOW_MESSAGES = 500;
export const BRIEFING_PUBLICATION_DELAY_MS = 0;
const MAX_CATCH_UP_WINDOWS = 24 * 15;

export async function publishDueBriefingEditions(input: {
  repo: Repository;
  briefings: BriefingConfig[];
  now?: Date;
  summaryAdapter?: SummaryAdapter | null;
}): Promise<number> {
  const now = input.now ?? new Date();
  let published = 0;

  for (const briefing of input.briefings) {
    if (briefing.paused) continue;
    const window = latestSettledDueWindow(briefing, now);
    if (!window) continue;
    const contentWindow = await unsummarizedScheduledWindow(input.repo, briefing, window, now);
    // Acquisition data is durable, but publication waits for its processing jobs.
    const pending=await input.repo.listProcessingJobs({briefingId:briefing.id,states:["queued","failed"],limit:500});
    if((await Promise.all(pending.map(job=>input.repo.getRawMessage(job.rawMessageId)))).some(message=>message?.news))continue;

    const messages = contentWindow
      ? await input.repo.listRawMessagesForWindow(
          briefing.id,
          contentWindow.windowStart,
          contentWindow.windowEnd,
          MAX_WINDOW_MESSAGES
        )
      : [];
    const edition = await localizeEdition(
      buildBriefingEdition({
        briefing,
        messages,
        windowStart: contentWindow?.windowStart ?? window.windowEnd,
        windowEnd: contentWindow?.windowEnd ?? window.windowEnd,
        now,
        processedItems:await developmentWindow(input.repo,briefing.id,contentWindow?.windowStart??window.windowEnd,contentWindow?.windowEnd??window.windowEnd,now)
      }),
      briefing,
      input.summaryAdapter
    );
    if (edition.status === "published") {
      await input.repo.saveBriefingEdition(edition, now);
      published += 1;
    }
    await input.repo.upsertBriefing({ ...briefing, nextBriefingAt: window.nextBriefingAt }, now);
  }

  return published;
}

export async function publishManualBriefingEdition(input: {
  repo: Repository;
  briefing: BriefingConfig;
  now?: Date;
  summaryAdapter?: SummaryAdapter | null;
}): Promise<BriefingEdition | null> {
  const now = input.now ?? new Date();
  const windowEnd = now.toISOString();
  const windowStart = await manualWindowStart(input.repo, input.briefing, now);
  if (new Date(windowStart).getTime() >= now.getTime()) return null;

  const messages = await input.repo.listRawMessagesForWindow(
    input.briefing.id,
    windowStart,
    windowEnd,
    MAX_WINDOW_MESSAGES
  );
  const edition = await localizeEdition(
    buildBriefingEdition({
      briefing: input.briefing,
      messages,
      windowStart,
      windowEnd,
      now,
      processedItems:await developmentWindow(input.repo,input.briefing.id,windowStart,windowEnd,now)
    }),
    input.briefing,
    input.summaryAdapter
  );
  if (edition.status !== "published") return null;

  await input.repo.saveBriefingEdition(edition, now);
  return edition;
}

function latestSettledDueWindow(briefing: BriefingConfig, now: Date) {
  const settledNow = new Date(now.getTime() - BRIEFING_PUBLICATION_DELAY_MS);
  let latest = getDueBriefingWindow(briefing, settledNow);
  if (!latest) return null;

  for (let index = 0; index < MAX_CATCH_UP_WINDOWS; index += 1) {
    const next = getDueBriefingWindow({ ...briefing, nextBriefingAt: latest.nextBriefingAt }, settledNow);
    if (!next) break;
    latest = next;
  }

  return latest;
}

async function unsummarizedScheduledWindow(
  repo: Repository,
  briefing: BriefingConfig,
  window: BriefingWindow,
  now: Date
): Promise<Pick<BriefingWindow, "windowStart" | "windowEnd"> | null> {
  const [latestEdition] = await repo.listBriefingEditions(briefing.id, false, now, 1);
  if (!latestEdition) return window;

  const latestEnd = new Date(latestEdition.windowEnd).getTime();
  const windowStart = new Date(window.windowStart).getTime();
  const windowEnd = new Date(window.windowEnd).getTime();
  if (!Number.isFinite(latestEnd) || !Number.isFinite(windowStart) || !Number.isFinite(windowEnd)) return window;
  if (latestEnd <= windowStart) return window;
  if (latestEnd >= windowEnd) return null;
  return { windowStart: latestEdition.windowEnd, windowEnd: window.windowEnd };
}

async function manualWindowStart(repo: Repository, briefing: BriefingConfig, now: Date): Promise<string> {
  const [latestEdition] = await repo.listBriefingEditions(briefing.id, false, now, 1);
  const latestEnd = latestEdition ? new Date(latestEdition.windowEnd).getTime() : Number.NaN;
  if (Number.isFinite(latestEnd) && latestEnd < now.getTime()) return latestEdition!.windowEnd;

  const fallback = getDueBriefingWindow({ ...briefing, nextBriefingAt: now.toISOString() }, now);
  return fallback?.windowStart ?? new Date(now.getTime() - 60 * 60 * 1000).toISOString();
}

async function localizeEdition(
  edition: BriefingEdition,
  briefing: BriefingConfig,
  summaryAdapter?: SummaryAdapter | null
): Promise<BriefingEdition> {
  if (edition.status !== "published") return edition;

  const sections: BriefingEdition["sections"] = [];
  for (const section of edition.sections) {
    if(section.claims?.length){
      // These exact sentences have already passed claim-level grounding. Never
      // replace them with an unreferenced translation during edition creation.
      if(sectionSummaryMatchesFeedLanguage(section.summary,briefing.language))sections.push(section);
      continue;
    }
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
        const summary = sanitizeSummary(await summaryAdapter.summarize({ briefing, evidence: section.evidence }));
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
  return {
    ...edition,
    sections: publicSections,
    summary: synthesizeEditionNarrativeSummary(publicSections, edition.cadence, briefing.language),
    status: normalizedStatus
  };
}

function shouldLocalizeSectionSummary(summary: string, language: BriefingConfig["language"]): boolean {
  const hasArabic = /[\u0600-\u06FF]/u.test(summary);
  const hasLatin = /[A-Za-z]/.test(summary);
  if (language === "ar") return !hasArabic && hasLatin;
  if (language === "en") return hasArabic && !hasLatin;
  if (language === "fr") return hasArabic && !hasLatin;
  return false;
}

async function developmentWindow(repo:Repository,briefingId:string,start:string,end:string,now:Date){
 const items=await repo.getExistingItems(briefingId,now);
 if(!items.some(item=>item.development))return undefined;
 return items.filter(item=>item.development&&item.updatedAt>=start&&item.updatedAt<end).sort((a,b)=>(b.development?.ranking.score??0)-(a.development?.ranking.score??0));
}
