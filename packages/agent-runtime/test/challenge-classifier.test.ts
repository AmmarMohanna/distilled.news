import { describe, expect, it } from "vitest";
import { classifyBrowserChallengeEvidence } from "../src/challenge-classifier";

describe("bounded challenge evidence", () => {
  it("reports visible actionable CAPTCHA evidence", () => {
    expect(classifyBrowserChallengeEvidence({
      url: "https://publisher.example/",
      title: "Verification",
      bodyText: "Complete CAPTCHA to continue",
      markup: "<div><iframe class='captcha'></iframe><button>Continue</button></div>"
    })).toMatchObject({ state: "CAPTCHA_REQUIRED", rule: "VISIBLE_CAPTCHA", visibleEvidence: true, actionableEvidence: true, surface: "TOP_LEVEL_DOCUMENT" });
  });

  it("does not treat dormant bundle text as active challenge evidence", () => {
    expect(classifyBrowserChallengeEvidence({
      url: "https://publisher.example/news",
      title: "News",
      bodyText: "Ordinary reporting",
      markup: "<main><article>Ordinary reporting</article></main>"
    })).toMatchObject({ state: "NO_CHALLENGE", rule: "NO_ACTIVE_CHALLENGE", visibleEvidence: false, structuralEvidence: false });
  });
});
