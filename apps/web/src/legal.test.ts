import { HOSTED_LEGAL_VERSIONS } from "@distilled/core";
import { describe, expect, it } from "vitest";
import { legalDocuments, parseLegalMarkdown } from "./legal";

describe("legal policy rendering", () => {
  it("renders every hosted policy from the versioned Markdown source", () => {
    expect(legalDocuments.terms).toMatchObject({
      title: "Terms of service",
      effective: "29 July 2026",
      version: HOSTED_LEGAL_VERSIONS.terms
    });
    expect(legalDocuments.privacy).toMatchObject({
      title: "Privacy notice",
      effective: "29 July 2026",
      version: HOSTED_LEGAL_VERSIONS.privacy
    });
    expect(legalDocuments["acceptable-use"]).toMatchObject({
      title: "Acceptable Use Policy",
      effective: "29 July 2026",
      version: HOSTED_LEGAL_VERSIONS.acceptableUse
    });

    expect(legalDocuments.terms.sections.map((section) => section.heading)).toContain(
      "Ending use and changes"
    );
    expect(legalDocuments.privacy.sections.find((section) => section.heading === "Retention")?.paragraphs)
      .toEqual(expect.arrayContaining([
        expect.stringContaining("Detailed provider/model spend events are kept for up to 90 days")
      ]));
    expect(legalDocuments["acceptable-use"].sections.find(
      (section) => section.heading === "Prohibited uses"
    )?.bullets).toEqual(
      expect.arrayContaining([
        expect.stringContaining("evade authentication, rate, budget, provider, retention, or suspension controls")
      ])
    );
  });

  it("converts policy Markdown structure and display formatting deterministically", () => {
    const document = parseLegalMarkdown(
      "terms",
      "2099-01-02",
      `# Example terms

Effective: 2 January 2099

Read the [canonical source](https://example.com) and keep \`policy-code\`.

## First section

One paragraph
continued on the next line.

- first item
- second [linked item](https://example.com/item)
`
    );

    expect(document).toEqual({
      slug: "terms",
      title: "Example terms",
      effective: "2 January 2099",
      version: "2099-01-02",
      introduction: "Read the canonical source and keep policy-code.",
      sections: [{
        heading: "First section",
        paragraphs: ["One paragraph continued on the next line."],
        bullets: ["first item", "second linked item"]
      }]
    });
  });
});
