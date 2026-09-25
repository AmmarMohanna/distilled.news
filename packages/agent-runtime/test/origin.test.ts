import { describe, expect, it } from "vitest";
import { normalizeHttpsOrigin, originMatches } from "../src/origin";

describe("public-browser origin normalization", () => {
  it("admits exact, www, non-www, and default HTTPS-port spellings", () => {
    expect(normalizeHttpsOrigin("https://www.aljazeera.com/")).toBe("https://www.aljazeera.com");
    expect(originMatches("https://www.aljazeera.com:443/", ["https://www.aljazeera.com"])).toBe(true);
    expect(originMatches("https://aljazeera.com/", ["https://aljazeera.com:443"])).toBe(true);
  });
  it("does not widen admission to unrelated, private, or metadata targets", () => {
    expect(originMatches("https://evil.example/", ["https://www.aljazeera.com"])).toBe(false);
    expect(originMatches("https://aljazeera.com/", ["https://www.aljazeera.com"])).toBe(false);
    expect(originMatches("http://169.254.169.254/", ["https://169.254.169.254"])).toBe(false);
    expect(originMatches("http://metadata.google.internal/", ["https://www.aljazeera.com"])).toBe(false);
  });
  it("normalizes source paths but rejects credentials", () => {
    expect(normalizeHttpsOrigin("https://www.aljazeera.com/news")).toBe("https://www.aljazeera.com");
    expect(() => normalizeHttpsOrigin("https://user:pass@www.aljazeera.com/")).toThrow();
  });
});
