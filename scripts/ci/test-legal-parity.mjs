#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { repositoryRoot } from "../lib/release-config.mjs";

const versionsPath = resolve(repositoryRoot, "packages/core/src/legal-versions.json");
const versions = JSON.parse(readFileSync(versionsPath, "utf8"));
const webLegalSource = readFileSync(resolve(repositoryRoot, "apps/web/src/legal.ts"), "utf8");
const failures = [];

const policies = [
  { key: "terms", file: "TERMS.md", importName: "termsMarkdown" },
  { key: "privacy", file: "PRIVACY.md", importName: "privacyMarkdown" },
  { key: "acceptableUse", file: "ACCEPTABLE-USE.md", importName: "acceptableUseMarkdown" }
];

for (const policy of policies) {
  const version = versions[policy.key];
  if (typeof version !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(version)) {
    failures.push(`${policy.key} version must use YYYY-MM-DD`);
    continue;
  }

  const markdown = readFileSync(resolve(repositoryRoot, "docs/legal", policy.file), "utf8");
  const effective = markdown.match(/^Effective:\s+(.+)$/m)?.[1];
  const expectedEffective = displayDate(version);
  if (effective !== expectedEffective) {
    failures.push(
      `${policy.file} effective date "${effective ?? "missing"}" does not match version ${version}`
    );
  }

  const rawImport = [
    "im" + "port",
    policy.importName,
    "from",
    `"../../../docs/legal/${policy.file}?raw";`
  ].join(" ");
  if (!webLegalSource.includes(rawImport)) {
    failures.push(`web legal renderer must import ${policy.file} as its raw canonical source`);
  }
  if (!webLegalSource.includes(policy.importName)) {
    failures.push(`web legal renderer does not consume ${policy.importName}`);
  }
}

if (!webLegalSource.includes('import { HOSTED_LEGAL_VERSIONS } from "@distilled/core";')) {
  failures.push("web legal renderer must use the shared hosted policy versions");
}
if (!webLegalSource.includes("parseLegalMarkdown(")) {
  failures.push("web legal renderer must parse the canonical policy Markdown");
}

if (failures.length > 0) {
  throw new Error(`Legal parity checks failed:\n- ${failures.join("\n- ")}`);
}

console.log("Legal parity checks passed for hosted policy versions, effective dates, and web sources.");

function displayDate(version) {
  const match = version.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  const [, year, month, day] = match;
  const monthName = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December"
  ][Number(month) - 1];
  return `${Number(day)} ${monthName} ${year}`;
}
