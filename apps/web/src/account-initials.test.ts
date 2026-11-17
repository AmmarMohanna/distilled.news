import { expect, it, vi } from "vitest";
vi.mock("./pwa", () => ({}));
import { accountInitials } from "./AppExperience";

it("keeps Arabic initials unjoined and limits avatars to two letters", () => {
  expect(accountInitials("جود سنان أحمد")).toBe("ج\u200cس");
  expect(accountInitials("جود")).toBe("ج");
  expect(accountInitials("Joud-Senan-Other")).toBe("JS");
  expect(accountInitials("Élodie François")).toBe("ÉF");
});
