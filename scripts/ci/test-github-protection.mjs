#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  assertBranchProtection,
  assertEnvironmentProtection,
  requiredStatusContexts
} from "../release/verify-github-protection.mjs";

const strongBranch = { protected: true };
const strongProtection = {
  required_status_checks: {
    strict: true,
    contexts: requiredStatusContexts
  },
  required_pull_request_reviews: {
    required_approving_review_count: 1,
    dismiss_stale_reviews: true,
    require_code_owner_reviews: true,
    require_last_push_approval: true,
    bypass_pull_request_allowances: { users: [], teams: [], apps: [] }
  },
  enforce_admins: { enabled: true },
  required_conversation_resolution: { enabled: true },
  required_linear_history: { enabled: true },
  allow_force_pushes: { enabled: false },
  allow_deletions: { enabled: false }
};
assert.equal(assertBranchProtection(strongBranch, strongProtection), true);

const weakCases = [
  [{ protected: false }, strongProtection, /not protected/],
  [strongBranch, {
    ...strongProtection,
    required_status_checks: { strict: false, contexts: requiredStatusContexts.slice(1) }
  }, /not strict/],
  [strongBranch, {
    ...strongProtection,
    required_pull_request_reviews: {
      ...strongProtection.required_pull_request_reviews,
      required_approving_review_count: 0
    }
  }, /approving pull-request review/],
  [strongBranch, {
    ...strongProtection,
    required_pull_request_reviews: {
      ...strongProtection.required_pull_request_reviews,
      bypass_pull_request_allowances: { users: [{ login: "owner" }] }
    }
  }, /bypass allowance/],
  [strongBranch, { ...strongProtection, enforce_admins: { enabled: false } }, /administrators/],
  [strongBranch, { ...strongProtection, allow_force_pushes: { enabled: true } }, /force-push/],
  [strongBranch, { ...strongProtection, allow_deletions: { enabled: true } }, /branch-deletion/]
];
for (const [branch, protection, message] of weakCases) {
  assert.throws(() => assertBranchProtection(branch, protection), message);
}

const strongEnvironment = {
  can_admins_bypass: false,
  protection_rules: [{
    type: "required_reviewers",
    prevent_self_review: true,
    reviewers: [{ type: "User", reviewer: { login: "reviewer" } }]
  }],
  deployment_branch_policy: {
    protected_branches: true,
    custom_branch_policies: false
  }
};
assert.equal(assertEnvironmentProtection("production", strongEnvironment), true);
const automatedCanaryEnvironment = {
  can_admins_bypass: false,
  protection_rules: [],
  deployment_branch_policy: {
    protected_branches: true,
    custom_branch_policies: false
  }
};
assert.equal(
  assertEnvironmentProtection("staging-canary", automatedCanaryEnvironment),
  true
);
assert.throws(
  () => assertEnvironmentProtection("staging", automatedCanaryEnvironment),
  /no required reviewers/
);
assert.throws(
  () => assertEnvironmentProtection("production", automatedCanaryEnvironment),
  /no required reviewers/
);
assert.throws(
  () => assertEnvironmentProtection("staging-canary", strongEnvironment),
  /has required reviewers/
);
assert.throws(
  () => assertEnvironmentProtection("production", { ...strongEnvironment, can_admins_bypass: true }),
  /administrator bypass/
);
assert.throws(
  () => assertEnvironmentProtection("production", {
    ...strongEnvironment,
    protection_rules: [{
      ...strongEnvironment.protection_rules[0],
      prevent_self_review: false
    }]
  }),
  /self-review/
);
assert.throws(
  () => assertEnvironmentProtection("production", {
    ...strongEnvironment,
    deployment_branch_policy: { protected_branches: false, custom_branch_policies: true }
  }),
  /protected branches/
);

console.log("Strong and weak GitHub branch/environment protection fixtures passed.");
