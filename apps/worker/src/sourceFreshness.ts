import type { BriefingConfig } from "@distilled/core";

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const SOURCE_POST_AGE_GRACE_MS = 2 * HOUR_MS;
const FUTURE_CLOCK_SKEW_MS = 15 * MINUTE_MS;

const CADENCE_WINDOW_MS: Record<BriefingConfig["briefingCadence"], number> = {
  hourly: HOUR_MS,
  daily: DAY_MS,
  weekly: 7 * DAY_MS,
  monthly: 31 * DAY_MS
};

/**
 * A source item only needs to enter D1 when it can still belong to a future
 * edition. This keeps old first-sync history out of processing queues and LLM
 * calls while retaining the full cadence window plus the edition age grace.
 */
export function isMessageWithinIngestHorizon(
  briefing: Pick<BriefingConfig, "briefingCadence">,
  postedAt: string,
  now: Date
): boolean {
  const postedAtMs = new Date(postedAt).getTime();
  if (!Number.isFinite(postedAtMs)) return false;
  const ageMs = now.getTime() - postedAtMs;
  if (ageMs < -FUTURE_CLOCK_SKEW_MS) return false;
  return ageMs <= CADENCE_WINDOW_MS[briefing.briefingCadence] + SOURCE_POST_AGE_GRACE_MS;
}
