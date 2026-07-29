#!/usr/bin/env node

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const requiredStatusContexts = [
  "Typecheck, test, build, migrations, dry-run",
  "Browser tests",
  "Production dependency audit",
  "gitleaks",
  "Analyze JavaScript and TypeScript"
];

export function assertBranchProtection(branch, protection) {
  const failures = [];
  if (branch?.protected !== true) failures.push("main is not protected");

  const statusChecks = protection?.required_status_checks;
  const contexts = new Set([
    ...(Array.isArray(statusChecks?.contexts) ? statusChecks.contexts : []),
    ...(Array.isArray(statusChecks?.checks)
      ? statusChecks.checks.map((check) => check?.context).filter(Boolean)
      : [])
  ]);
  if (statusChecks?.strict !== true) failures.push("required status checks are not strict/up-to-date");
  for (const context of requiredStatusContexts) {
    if (!contexts.has(context)) failures.push(`required status check is missing: ${context}`);
  }

  const reviews = protection?.required_pull_request_reviews;
  if (Number(reviews?.required_approving_review_count ?? 0) < 1) {
    failures.push("at least one approving pull-request review is not required");
  }
  if (reviews?.dismiss_stale_reviews !== true) failures.push("stale approvals are not dismissed");
  if (reviews?.require_code_owner_reviews !== true) failures.push("CODEOWNERS review is not required");
  if (reviews?.require_last_push_approval !== true) {
    failures.push("approval by someone other than the last pusher is not required");
  }
  for (const [kind, entries] of Object.entries(reviews?.bypass_pull_request_allowances ?? {})) {
    if (Array.isArray(entries) && entries.length > 0) {
      failures.push(`pull-request bypass allowance is nonempty: ${kind}`);
    }
  }

  if (protection?.enforce_admins?.enabled !== true) failures.push("branch rules do not apply to administrators");
  if (protection?.required_conversation_resolution?.enabled !== true) {
    failures.push("review conversation resolution is not required");
  }
  if (protection?.required_linear_history?.enabled !== true) {
    failures.push("linear history is not required");
  }
  if (protection?.allow_force_pushes?.enabled !== false) failures.push("force-push prevention is not explicit");
  if (protection?.allow_deletions?.enabled !== false) failures.push("branch-deletion prevention is not explicit");

  if (failures.length > 0) {
    throw new Error(`GitHub main protection is weaker than launch policy:\n- ${failures.join("\n- ")}`);
  }
  return true;
}

export function assertEnvironmentProtection(environmentName, selected) {
  const failures = [];
  const reviewerRule = (selected?.protection_rules ?? []).find(
    (rule) => rule.type === "required_reviewers"
  );
  if (environmentName === "staging-canary") {
    if (reviewerRule && Array.isArray(reviewerRule.reviewers) && reviewerRule.reviewers.length > 0) {
      failures.push("automated staging-canary has required reviewers");
    }
  } else {
    if (!Array.isArray(reviewerRule?.reviewers) || reviewerRule.reviewers.length === 0) {
      failures.push("no required reviewers");
    }
    if (reviewerRule?.prevent_self_review !== true) failures.push("self-review is allowed");
  }
  if (selected?.can_admins_bypass !== false) failures.push("administrator bypass is allowed");
  if (
    selected?.deployment_branch_policy?.protected_branches !== true ||
    selected?.deployment_branch_policy?.custom_branch_policies !== false
  ) {
    failures.push("deployments are not restricted to protected branches");
  }
  if (failures.length > 0) {
    throw new Error(
      `GitHub environment ${environmentName} is weaker than launch policy:\n- ${failures.join("\n- ")}`
    );
  }
  return true;
}

async function main() {
  const token = process.env.GITHUB_TOKEN?.trim() ?? "";
  const repository = process.env.GITHUB_REPOSITORY?.trim() ?? "";
  const environment = process.env.EXPECTED_GITHUB_ENVIRONMENT?.trim() ?? "";
  const ref = process.env.GITHUB_REF?.trim() ?? "";
  if (!token || !/^[^/]+\/[^/]+$/.test(repository) || !environment) {
    throw new Error("GitHub protection verification requires token, repository, and environment context.");
  }
  if (ref !== "refs/heads/main") {
    throw new Error(`Protected Cloudflare workflows must run from refs/heads/main, not ${ref || "unknown"}.`);
  }

  const [branch, protection, selected] = await Promise.all([
    github(`/repos/${repository}/branches/main`, token),
    github(`/repos/${repository}/branches/main/protection`, token),
    github(`/repos/${repository}/environments/${encodeURIComponent(environment)}`, token)
  ]);
  assertBranchProtection(branch, protection);
  assertEnvironmentProtection(environment, selected);
  console.log(
    `Verified reviewed-PR main policy and non-bypassable ${environment} environment before protected access.`
  );
}

async function github(path, token) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "user-agent": "distilled-release-protection/2",
      "x-github-api-version": "2022-11-28"
    },
    signal: AbortSignal.timeout(20_000)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`GitHub protection read failed with HTTP ${response.status}.`);
  }
  return payload;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await main();
}
