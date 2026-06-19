import type { BriefingCadence, BriefingConfig } from "./types";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export interface BriefingWindow {
  cadence: BriefingCadence;
  windowStart: string;
  windowEnd: string;
  nextBriefingAt: string;
}

export function getDueBriefingWindow(briefing: BriefingConfig, now = new Date()): BriefingWindow | null {
  const next = briefing.nextBriefingAt ? new Date(briefing.nextBriefingAt) : currentBoundary(briefing, now);
  if (Number.isNaN(next.getTime()) || next.getTime() > now.getTime()) return null;
  const windowEnd = next;
  const windowStart = previousBoundary(briefing.briefingCadence, windowEnd);
  return {
    cadence: briefing.briefingCadence,
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    nextBriefingAt: nextBoundary(briefing, windowEnd).toISOString()
  };
}

export function defaultNextBriefingAt(input: {
  cadence?: BriefingCadence;
  timeOfDay?: string;
  timezone?: string;
  now?: Date;
} = {}): string {
  return nextBoundary({
    briefingCadence: input.cadence ?? "hourly",
    briefingTimeOfDay: input.timeOfDay ?? "00:00",
    briefingTimezone: input.timezone ?? "UTC"
  }, input.now ?? new Date()).toISOString();
}

export function cadenceLabel(cadence: BriefingCadence): string {
  if (cadence === "daily") return "daily";
  if (cadence === "weekly") return "weekly";
  if (cadence === "monthly") return "monthly";
  return "hourly";
}

function currentBoundary(
  briefing: Pick<BriefingConfig, "briefingCadence" | "briefingTimeOfDay" | "briefingTimezone">,
  now: Date
): Date {
  const next = nextBoundary(briefing, now);
  return previousBoundary(briefing.briefingCadence, next);
}

function nextBoundary(
  briefing: Pick<BriefingConfig, "briefingCadence" | "briefingTimeOfDay" | "briefingTimezone">,
  from: Date
): Date {
  if (briefing.briefingCadence === "hourly") {
    const next = new Date(from);
    next.setUTCMinutes(0, 0, 0);
    if (next.getTime() <= from.getTime()) next.setUTCHours(next.getUTCHours() + 1);
    return next;
  }

  const parts = zonedParts(from, briefing.briefingTimezone);
  const [hour, minute] = parseTimeOfDay(briefing.briefingTimeOfDay);
  let year = parts.year;
  let month = parts.month;
  let day = parts.day;

  if (briefing.briefingCadence === "weekly") {
    const daysUntilMonday = (8 - parts.weekday) % 7;
    day += daysUntilMonday;
  } else if (briefing.briefingCadence === "monthly") {
    if (parts.day > 1 || parts.hour > hour || (parts.hour === hour && parts.minute >= minute)) month += 1;
    day = 1;
  }

  let candidate = zonedTimeToUtc({ year, month, day, hour, minute, timezone: briefing.briefingTimezone });
  while (candidate.getTime() <= from.getTime()) {
    if (briefing.briefingCadence === "daily") candidate = new Date(candidate.getTime() + DAY_MS);
    else if (briefing.briefingCadence === "weekly") candidate = new Date(candidate.getTime() + 7 * DAY_MS);
    else candidate = addUtcMonth(candidate, 1);
  }
  return candidate;
}

function previousBoundary(cadence: BriefingCadence, boundary: Date): Date {
  if (cadence === "hourly") return new Date(boundary.getTime() - HOUR_MS);
  if (cadence === "daily") return new Date(boundary.getTime() - DAY_MS);
  if (cadence === "weekly") return new Date(boundary.getTime() - 7 * DAY_MS);
  return addUtcMonth(boundary, -1);
}

function parseTimeOfDay(value: string): [number, number] {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return [0, 0];
  const hour = Math.min(23, Math.max(0, Number(match[1])));
  const minute = Math.min(59, Math.max(0, Number(match[2])));
  return [hour, minute];
}

function zonedParts(date: Date, timezone: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
} {
  const safeTimezone = normalizeTimezone(timezone);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: safeTimezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short"
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(parts.weekday ?? "Mon") + 1;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday: weekday > 0 ? weekday : 1
  };
}

function zonedTimeToUtc(input: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  timezone: string;
}): Date {
  const timezone = normalizeTimezone(input.timezone);
  let utc = new Date(Date.UTC(input.year, input.month - 1, input.day, input.hour, input.minute, 0, 0));
  for (let index = 0; index < 3; index += 1) {
    const actual = zonedParts(utc, timezone);
    const desiredMs = Date.UTC(input.year, input.month - 1, input.day, input.hour, input.minute);
    const actualMs = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute);
    const diff = desiredMs - actualMs;
    if (diff === 0) break;
    utc = new Date(utc.getTime() + diff);
  }
  return utc;
}

function normalizeTimezone(timezone: string): string {
  const candidate = timezone || "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(new Date(0));
    return candidate;
  } catch {
    return "UTC";
  }
}

function addUtcMonth(date: Date, delta: number): Date {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + delta);
  return next;
}
