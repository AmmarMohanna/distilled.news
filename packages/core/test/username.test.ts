import { expect, it } from "vitest";
import { normalizeUsername } from "../src/username";

it("preserves Arabic, French accents and existing English identifiers", () => {
  expect(normalizeUsername(" جود سنان ")).toBe("جود-سنان");
  expect(normalizeUsername("Élodie François")).toBe("élodie-françois");
  expect(normalizeUsername("E\u0301lodie")).toBe(normalizeUsername("Élodie"));
  expect(normalizeUsername("جُود")).toBe("جُود");
  expect(normalizeUsername(" Joud Senan ")).toBe("joud-senan");
  expect(normalizeUsername("a/b?#c")).toBe("a-b-c");
});
