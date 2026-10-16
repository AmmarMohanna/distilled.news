import { expect, it } from "vitest";
import { violetStrokeAlpha } from "./sketchImage";

it("keeps white transparent and preserves subtle pencil pressure", () => {
  expect(violetStrokeAlpha(255, 255)).toBe(0);
  expect(violetStrokeAlpha(253, 254)).toBe(0);
  expect(violetStrokeAlpha(94, 92)).toBe(255);
  const faint = violetStrokeAlpha(245, 244);
  const medium = violetStrokeAlpha(185, 180);
  expect(faint).toBeGreaterThan(0);
  expect(medium).toBeGreaterThan(faint);
  expect(medium).toBeLessThan(255);
});
