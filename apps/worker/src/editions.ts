import { buildBriefingEdition, getDueBriefingWindow, type BriefingConfig } from "@distilled/core";
import type { Repository } from "./types";

const MAX_WINDOW_MESSAGES = 500;

export async function publishDueBriefingEditions(input: {
  repo: Repository;
  briefings: BriefingConfig[];
  now?: Date;
}): Promise<number> {
  const now = input.now ?? new Date();
  let published = 0;

  for (const briefing of input.briefings) {
    if (briefing.paused) continue;
    const window = getDueBriefingWindow(briefing, now);
    if (!window) continue;

    const messages = await input.repo.listRawMessagesForWindow(
      briefing.id,
      window.windowStart,
      window.windowEnd,
      MAX_WINDOW_MESSAGES
    );
    const edition = buildBriefingEdition({
      briefing,
      messages,
      windowStart: window.windowStart,
      windowEnd: window.windowEnd,
      now
    });
    await input.repo.saveBriefingEdition(edition, now);
    await input.repo.upsertBriefing({ ...briefing, nextBriefingAt: window.nextBriefingAt }, now);
    published += 1;
  }

  return published;
}
