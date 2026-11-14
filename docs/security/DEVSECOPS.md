# Distilled.news DevSecOps security automation

Status: **configured on isolated branch; real security CI started and initial Trivy findings verified** (2026-11-14). No production deployment or app behavior change was made. Source branch: `ghada/DevSecOps`.

## Baseline (reviewed source branch)
The six existing workflows (`project-checks.yml`, `acquisition-benchmark.yml`, `briefing-evaluation.yml`, and three `performance-*.yml` workflows) implement project tests, benchmarks and manually approved performance campaigns, not the six requested DevSecOps scans. No CodeQL/Semgrep/Trivy/Snyk/Gitleaks workflow or Dependabot file was present in `.github`. Existing repository-level CodeQL default setup, Dependabot alerts/security updates, secret push protection, branch rules and Snyk account state cannot be read using this integration; check GitHub Settings before enabling enforcement.

## Scanners and execution

| Practice | File | Scope / trigger | Gate | Verification at initial commit |
|---|---|---|---|---|
| CodeQL | `.github/workflows/security-codeql.yml` | JavaScript/TypeScript, Python and Actions; PRs, selected pushes, weekly (on default), manual | CodeQL query suite `security-extended` publishes to code scanning; branch protections required for PR blocking | Workflow configured; actual analysis/upload unverified |
| Semgrep CE | `.github/workflows/security-semgrep.yml` | `apps/`, `packages/`, `scripts/`, `evaluation/`, `.github/workflows/`; PRs and selected pushes | `p/default` and `p/security-audit` full SARIF; `ERROR`-severity gate; nonzero on scanner errors | Configured; actual execution unverified |
| Dependabot | `.github/dependabot.yml` | pnpm workspace, separate benchmark npm lockfile, GitHub Actions, browser Dockerfile, benchmark and optional script Python deps; weekly | Review/test PRs; major npm upgrades excluded from *version updates* | Configured; inactive until on default branch |
| Snyk | `.github/workflows/security-snyk.yml` | Dependency manifest auto-discovery; push/schedule/manual only if `SNYK_ENABLED=true` | Requires `SNYK_TOKEN`; fails on missing token when enabled or high/critical finding | Explicitly skipped unless enabled; no token/account verification |
| Trivy | `.github/workflows/security-trivy.yml` | Filesystem, lockfiles and recognized misconfig/IaC; PRs, selected pushes, weekly (default), manual. Actual browser image only on manual opt-in build | Full SARIF + fail HIGH/CRITICAL; no ignore list | Configured; actual scans unverified. Image scanning NOT performed yet |
| Gitleaks | `.github/workflows/security-gitleaks.yml` | Fetched Git history via `--all`; PRs, selected pushes, weekly (default), manual | Any secret detection fails, SARIF redacted 100%; no baselines | Configured; actual history scan unverified |

Triggers for selected pushes: `main`, `ghada/DevSecOps`, `ghada/devsecops-security-automation`; PRs are scanned across base branches. Schedules execute only from the **default branch** after merge. Security scanning is separate from `project-checks.yml`. PRs from forks have read-only credentials and do not receive Snyk secrets; SARIF uploads are skipped on forks where privilege may be unavailable.

The repository contains a real `apps/worker/browser-container.Dockerfile`, built with a large Playwright/Python runtime. The *opt-in* Trivy image job builds it with `docker build` locally on a GitHub-hosted runner and never pushes or deploys. A successful filesystem scan is **not** an image scan. Dockerfile misconfiguration recognition depends on Trivy supporting the nonstandard `*.Dockerfile` name; verify scan coverage in logs.

## Local reproduction
Use a clean checkout with full history. Match tool versions used in workflow files, and protect local secrets in files and output.

```bash
# CodeQL: use official CodeQL CLI or inspect the GitHub code-scanning job; v4.39.3 action.
docker run --rm -v "$PWD:/src" -w /src semgrep/semgrep:1.185.0 scan --config p/default --config p/security-audit --metrics off apps packages scripts evaluation .github/workflows
# Requires current Trivy 0.76.2 and its vulnerability DB:
trivy fs --scanners vuln,misconfig --severity HIGH,CRITICAL --exit-code 1 .
# Requires Docker and full local git history; output is redacted:
docker run --rm -v "$PWD:/repo" -w /repo ghcr.io/gitleaks/gitleaks:v8.30.1 git --no-banner --redact=100 --log-opts="--all" /repo
# Optional Snyk (after installing pinned CLI and configuring SNYK_TOKEN):
snyk test --all-projects --fail-fast --severity-threshold=high
# Optional: build and scan the real image (no push):
docker build -f apps/worker/browser-container.Dockerfile -t distilled-browser-security:local .
trivy image --scanners vuln,misconfig --severity HIGH,CRITICAL --exit-code 1 distilled-browser-security:local
```

## Findings and dispositions
**First verified results (Trivy filesystem, run 43635684801):** 4 package CVEs in `pnpm-lock.yaml` (`fast-xml-parser` 5.3.0): CRITICAL CVE-2026-25896 and HIGH CVE-2026-25128, CVE-2026-26278, CVE-2026-33036. Trivy additionally reported HIGH DS-0002 for no explicit non-root `USER` in `apps/worker/browser-container.Dockerfile`. **5 findings total: 1 CRITICAL, 4 HIGH; no MEDIUM or LOW found in this scan.** Gate correctly failed, retaining evidence. Trivy recognized the nonstandard Dockerfile and detected npm/pnpm lockfiles. Python dependency coverage was **not confirmed** in this run: Trivy identified two language-specific lockfiles (npm + pnpm). Do not claim Python package coverage from this report. Exact transitive dependency chain/reachability and Docker runtime implications require triage; no automatic dependency or Dockerfile edits were made. This is not a clean bill of health. When runs complete, triage SARIF and job logs by rule/CVE, affected package/path, direct vs transitive reachability, evidence, exploitability, suggested fix, and status (open/mitigated/false positive/accepted with owner and expiration). Do not mark a category as zero until evidence supports it. A failing check is meaningful; do not add blanket `continue-on-error`, baselines, or ignores to obtain green.

If Gitleaks finds a credible credential: **revoke or rotate it immediately with the credential owner**, inspect usage, invalidate related tokens/sessions and replace via secure secret storage. Treat historical exposure as exposure even after file deletion. Never paste leaked values into issues/comments, upload unredacted artifacts, or rewrite history without owner approval. For placeholders, review exact evidence and narrowly scope any documented allowlist.

## Required settings and blockers
1. The repository owner (admin permissions required; connected account currently has push but not admin) must inspect **Settings → Advanced Security**: whether CodeQL *default setup* is running, and if so switch to **advanced setup** to avoid duplication; verify code scanning/SARIF and secret scanning/push protection are available. This public repository is eligible for code scanning, but the exact account settings were not visible.
2. Enable **Dependabot alerts**, **Dependabot security updates**, and the dependency graph in repository security settings if desired. Version-update configuration only becomes active after merging `dependabot.yml` into `main`; it does not itself enable alerts. Review grouped PRs through existing tests; no automatic major npm version upgrades are proposed. Manual advisories involving major releases need explicit review.
3. Optional Snyk: create/configure an account on an approved tier **only with owner approval**; add repository Actions secret `SNYK_TOKEN` and repository variable `SNYK_ENABLED=true`. Without the variable, the job is visibly skipped; with variable but no token it fails. There is no subscription change or paid service provisioned here. Pin/upgrade CLI deliberately.
4. Require successful `Security - ...` checks through branch protection/rulesets after the actual workflows are validated. Adding a workflow alone does not make checks required. Ensure GitHub Actions and `security-events: write` are permitted on this repository.
5. Scheduled scans and Dependabot cannot be proven on a feature branch; CodeQL upload, full history scanning, Semgrep ruleset fetching, external vulnerability DB access and container builds must be verified through actual GitHub Actions runs.

## Run evidence
- Initial scan evidence:
- Trivy [43635684801](https://github.com/AmmarMohanna/distilled.news/actions/runs/43635684801) **failed as designed** on 1 CRITICAL + 4 HIGH findings; opt-in image scan skipped.
- CodeQL [43635684813](https://github.com/AmmarMohanna/distilled.news/actions/runs/43635684813): Python and GitHub Actions language jobs completed successfully; JS/TS still running at evidence review.
- Semgrep [43635684823](https://github.com/AmmarMohanna/distilled.news/actions/runs/43635684823): executing at evidence review.
- Gitleaks [43635708917](https://github.com/AmmarMohanna/distilled.news/actions/runs/43635708917): full fetched Git history scan completed and **failed with 107 candidate secret matches**; 100% redacted SARIF successfully uploaded to GitHub Code Scanning. These are untriaged candidate detections, **not 107 verified active secrets**. Do not disclose or export raw values. Urgently review the results in restricted GitHub security views; rotate/revoke any real exposed credential, investigate prior usage, and document per-finding dispositions privately. Scanner remains enforced (no allowlists or suppression introduced).
- Snyk [43635684832](https://github.com/AmmarMohanna/distilled.news/actions/runs/43635684832): **skipped** because not enabled (expected).
- Existing app-check [43635684688](https://github.com/AmmarMohanna/distilled.news/actions/runs/43635684688): `verify` job failed on six pre-existing TypeScript test mock errors in `packages/briefing/test/occurrence-novelty.test.ts` (missing `inputTokens`/`outputTokens` in `ModelResponse`); no app source or test files modified in this security-only commit.

Previous app-check run on source branch (was in progress when audited): https://github.com/AmmarMohanna/distilled.news/actions/runs/43632264473
- New security CI: https://github.com/AmmarMohanna/distilled.news/actions (look for `Security - ...` workflows and filter by `ghada/devsecops-security-automation`).
- Record exact future run IDs, outcomes, scanner versions, covered manifests and finding counts here after checking logs; **do not** infer passing runs from committed YAML.

## Bonus engineering contribution
This adds independent static analysis, complementary rules, lockfile/supply-chain updates, credential detection, optional credential-backed Snyk and actual image-scanning capability. It supports the EECE 503N/798S DevSecOps engineering bonus with auditable implementation and reproducibility. **No score or full-credit claim can be justified until scanners have demonstrably run and the course rubric is applied.**

Official documentation:
- https://docs.github.com/en/code-security/how-tos/find-and-fix-code-vulnerabilities/configure-code-scanning/configuring-advanced-setup-for-code-scanning
- https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/secure-your-dependencies/configure-version-updates
- https://semgrep.dev/docs/semgrep-ci/sample-ci-configs
- https://github.com/aquasecurity/trivy-action
- https://github.com/gitleaks/gitleaks
- https://docs.snyk.io/developer-tools/snyk-cli/commands/test
