import { HOSTED_LEGAL_VERSIONS } from "@distilled/core";
import acceptableUseMarkdown from "../../../docs/legal/ACCEPTABLE-USE.md?raw";
import privacyMarkdown from "../../../docs/legal/PRIVACY.md?raw";
import termsMarkdown from "../../../docs/legal/TERMS.md?raw";

export interface LegalSection {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
}

export interface LegalDocument {
  slug: "privacy" | "terms" | "acceptable-use";
  title: string;
  effective: string;
  version: string;
  introduction: string;
  sections: LegalSection[];
}

export function parseLegalMarkdown(
  slug: LegalDocument["slug"],
  version: string,
  markdown: string
): LegalDocument {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const titleLine = lines.shift()?.trim() ?? "";
  if (!titleLine.startsWith("# ")) throw new Error(`Legal document ${slug} is missing its title.`);
  const title = titleLine.slice(2).trim();

  while (lines[0]?.trim() === "") lines.shift();
  const effectiveLine = lines.shift()?.trim() ?? "";
  const effectiveMatch = effectiveLine.match(/^Effective:\s+(.+)$/);
  if (!effectiveMatch) throw new Error(`Legal document ${slug} is missing its effective date.`);
  while (lines[0]?.trim() === "") lines.shift();

  const preamble: string[] = [];
  const sections: LegalSection[] = [];
  let currentHeading: string | null = null;
  let paragraphLines: string[] = [];
  let bullets: string[] = [];
  let bulletLines: string[] = [];

  const flushParagraph = () => {
    if (paragraphLines.length === 0) return;
    const paragraph = legalDisplayText(paragraphLines.join(" "));
    if (currentHeading) {
      const section = ensureSection(sections, currentHeading);
      section.paragraphs = [...(section.paragraphs ?? []), paragraph];
    } else {
      preamble.push(paragraph);
    }
    paragraphLines = [];
  };
  const flushBullet = () => {
    if (bulletLines.length === 0) return;
    bullets.push(legalDisplayText(bulletLines.join(" ")));
    bulletLines = [];
  };
  const flushBullets = () => {
    flushBullet();
    if (bullets.length === 0 || !currentHeading) return;
    const section = ensureSection(sections, currentHeading);
    section.bullets = [...(section.bullets ?? []), ...bullets];
    bullets = [];
  };

  for (const rawLine of [...lines, ""]) {
    const line = rawLine.trim();
    if (line.startsWith("## ")) {
      flushParagraph();
      flushBullets();
      currentHeading = legalDisplayText(line.slice(3));
      ensureSection(sections, currentHeading);
      continue;
    }
    if (line.startsWith("- ")) {
      flushParagraph();
      flushBullet();
      bulletLines = [line.slice(2)];
      continue;
    }
    if (line === "") {
      flushParagraph();
      flushBullets();
      continue;
    }
    if (bulletLines.length > 0) bulletLines.push(line);
    else paragraphLines.push(line);
  }

  if (preamble.length === 0) throw new Error(`Legal document ${slug} is missing its introduction.`);
  return {
    slug,
    title,
    effective: effectiveMatch[1],
    version,
    introduction: preamble.join(" "),
    sections
  };
}

export const legalDocuments: Record<LegalDocument["slug"], LegalDocument> = {
  privacy: parseLegalMarkdown(
    "privacy",
    HOSTED_LEGAL_VERSIONS.privacy,
    privacyMarkdown
  ),
  terms: parseLegalMarkdown(
    "terms",
    HOSTED_LEGAL_VERSIONS.terms,
    termsMarkdown
  ),
  "acceptable-use": parseLegalMarkdown(
    "acceptable-use",
    HOSTED_LEGAL_VERSIONS.acceptableUse,
    acceptableUseMarkdown
  )
};

function ensureSection(sections: LegalSection[], heading: string): LegalSection {
  const existing = sections.at(-1);
  if (existing?.heading === heading) return existing;
  const section = { heading };
  sections.push(section);
  return section;
}

function legalDisplayText(value: string): string {
  return value
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}
