import { describe, expect, it } from "vitest";
import { isMessageWithinIngestHorizon } from "./sourceFreshness";

const now = new Date("2026-07-14T12:00:00.000Z");

describe("source ingest freshness", () => {
  it.each([
    ["hourly", "2026-07-14T09:00:00.000Z", true],
    ["hourly", "2026-07-14T08:59:59.999Z", false],
    ["daily", "2026-07-13T10:00:00.000Z", true],
    ["daily", "2026-07-13T09:59:59.999Z", false],
    ["weekly", "2026-07-07T10:00:00.000Z", true],
    ["monthly", "2026-06-13T10:00:00.000Z", true]
  ] as const)("uses the %s cadence horizon", (briefingCadence, postedAt, expected) => {
    expect(isMessageWithinIngestHorizon({ briefingCadence }, postedAt, now)).toBe(expected);
  });

  it("rejects invalid dates and implausibly future timestamps", () => {
    expect(isMessageWithinIngestHorizon({ briefingCadence: "hourly" }, "not-a-date", now)).toBe(false);
    expect(isMessageWithinIngestHorizon({ briefingCadence: "hourly" }, "2026-07-14T12:16:00.000Z", now)).toBe(false);
    expect(isMessageWithinIngestHorizon({ briefingCadence: "hourly" }, "2026-07-14T12:15:00.000Z", now)).toBe(true);
  });
});
