# DevSecOps implementation — Distilled.news

**Audit date:** 2026-11-15. **PR:** [#11](https://github.com/AmmarMohanna/distilled.news/pull/11) targeting `ghada/DevSecOps`; changes remain on `ghada/devsecops-security-automation`. **Status: implemented, security improvements verified, NOT merge-ready.** This is a security-only hardening effort, not permission to deploy, rewrite Git history, modify live accounts, or accept risk on behalf of the repository owners.

## Baseline and architecture

Before this work the repository had six application/evaluation/performance GitHub Actions workflows and no dedicated CodeQL, Semgrep, Trivy, Gitleaks or Snyk workflow or Dependabot version-update config. Its actual targets are pnpm/TypeScript (Cloudflare Worker, React/Vite and shared packages), optional Python scripts and benchmarks, and a genuine Playwright + Browser Use Docker image. GitHub repository-level Advanced Security and Dependabot settings could not be read with the connected account. Existing test failures on the source branch are documented below; newly added checks do not erase those failures.

## Security automation — implementation and verification

| Practice | Exact configuration | Runs and coverage | Verified state |
|---|---|---|---|
| **CodeQL** | `.github/workflows/security-codeql.yml` | PR, selected push, schedule on default branch, manual; JavaScript/TypeScript, Python, GitHub Actions; `security-extended` query suite, Code Scanning | **PASS** all three languages on [run 43697276558](https://github.com/AmmarMohanna/distilled.news/actions/runs/43697276558), before action-SHA-only change; [latest run](https://github.com/AmmarMohanna/distilled.news/actions?query=workflow%3A%22Security+-+CodeQL%22) must also pass |
| **Semgrep CE** | `.github/workflows/security-semgrep.yml` | PR and selected push; `p/default` + `p/security-audit`, `apps`, `packages`, `scripts`, `evaluation`, GitHub workflows. Full SARIF retained; ERROR severity is a blocking gate | **PASS** [run 43697276596](https://github.com/AmmarMohanna/distilled.news/actions/runs/43697276596); INFO/WARNING findings remain for triage, not automatically false positives |
| **Dependabot** | `.github/dependabot.yml` | Weekly npm/pnpm workspace, nested npm, Python, GitHub Actions, Docker; minor/patch grouping and no automatic major npm version-update PRs | File committed; **actual Dependabot PR creation not verified**, requires default-branch merge |
| **Snyk** | `.github/workflows/security-snyk.yml` | Authorized opt-in dependency scanning on push/schedule/dispatch; never on fork PR with token | **SKIPPED, NOT SCANNED**: owner must approve service, configure Actions secret `SNYK_TOKEN` and repository variable `SNYK_ENABLED=true`. Missing token fails when enabled |
| **Trivy** | `.github/workflows/security-trivy.yml`, `.github/workflows/security-container-validation.yml` | PR, selected push and weekly filesystem/dependency/IaC scans, SARIF and HIGH/CRITICAL gate; actual local Docker image build, nonroot identity, direct Node/tsx startup, local health test, image scan and HIGH/CRITICAL gate; optional manual image check | **Filesystem PASS** [run 43697276474](https://github.com/AmmarMohanna/distilled.news/actions/runs/43697276474); **real image builds/starts but security gate FAILS** [run 43696974378](https://github.com/AmmarMohanna/distilled.news/actions/runs/43696974378) |
| **Gitleaks** | `.github/workflows/security-gitleaks.yml` | PR/push: reject newly introduced committed secrets using redacted commit-range SARIF. Scheduled/manual: full fetched Git-ref history, redacted SARIF and fail on any unresolved detection | New-commit gate **PASS** [run 43697276535](https://github.com/AmmarMohanna/distilled.news/actions/runs/43697276535). Earlier [full-history run 43635708917](https://github.com/AmmarMohanna/distilled.news/actions/runs/43635708917) **FAIL: 107 untriaged candidate matches** |

### Supply-chain controls

Every `uses:` dependency in **all twelve repository workflows** (six pre-existing and six new security workflows, excluding the separate Dependabot config) was updated from a mutable version tag to its **verified immutable Git commit SHA**. Versions are retained in comments for maintainability. The changes do not alter existing application jobs, schedules, deployment behavior or scanner severity gates. New pins require verification in GitHub CI after the latest commit. The Semgrep SARIF before this change contained 71 movable-action-tag findings; their dispositions must be checked by a fresh scan, not assumed fixed before CI verifies.

## Changes to application-supporting files

- `packages/connectors/package.json`, `pnpm-lock.yaml`: exact `fast-xml-parser` 5.3.0 → 5.11.2, locked using the real pnpm resolver (one-time write-capable refresh workflow removed).
- `evaluation/acquisition-benchmark/scripts/replay_rss_pilot.py`, `evaluation/acquisition-benchmark/pyproject.toml`, `evaluation/acquisition-benchmark/constraints.txt`: `defusedxml==0.7.1`.
- `evaluation/performance-reliability/real/artifact-crypto.mjs`, `scripts/verify-d1-backup.mjs`: explicit 16-byte GCM authentication tag length.
- `scripts/benchmark-active-evidence-ids.py`, `scripts/benchmark-shortlist-policy.py`, `scripts/check_ai_source_integration_migrations.py`, `scripts/extract-shortlist-profile.py`: static SQL where feasible; validated and quoted fixture-only identifiers with bound values.
- `packages/briefing/test/occurrence-novelty.test.ts`: six test model responses include required token-usage fields; no production model prompts or agent behavior changed.
- `apps/worker/browser-container.Dockerfile`: nonroot `pwuser`, non-pnpm direct Node/tsx entrypoint, removal of unused npm/Corepack/pnpm package-manager code from **runtime**, targeted Ubuntu fixes, Browser Use **0.13.10 → 0.13.14** preserving its v0.13 API. The image is built and tested locally within CI only, never pushed/deployed.

## Findings and disposition

**Critical — 6 open:** The last completed real image scan shows **6 critical Python dependency advisories**. An upgrade to fixed transitive `anyio`, `aiohttp`, `pillow` and `pypdf` versions conflicted with exact `browser-use`/`browser-harness` constraints and **failed `pip check`**; the incompatible override was reverted. Browser Use 1.x changes the agent to a Python-REPL engine and cannot safely replace the restricted v0.13 tool boundary without redesign and end-to-end authorization regression testing. **Disposition: open/blocking, not suppressed**.

**High — 44 open:** Two Ubuntu image advisories and 42 Python dependency advisories remain. The last completed image scan had **50 HIGH/CRITICAL** total versus **107** originally (8 critical + 99 high); **57 fewer findings** after safe runtime minimization and compatible updates. **No HIGH/CRITICAL Node.js runtime package findings remain in that scan.** Confirm with [Trivy image run](https://github.com/AmmarMohanna/distilled.news/actions/runs/43696974378). Unfixed findings remain merge blockers; do not label all as exploitable or all as false positives without owner triage.

**Medium/low and code-security review:** Semgrep generated a reviewable SARIF report with 120 non-blocking findings at an intermediate revision; most frequently a mutable-action-tag rule, now addressed with immutable SHA pinning. Other results include dynamic regex, HTML sinks and SQL fixtures; verify relevance, trust boundaries and reachability per finding. No global ignore/baseline was added, and no zero-risk claim is made for unresolved warnings.

**Potential historical credentials — 107 matches:** This is a **candidate detection count**, not 107 verified active credentials. The full-history scan must stay visible and fail; only a repository/credential owner can confirm validity, revoke or rotate real leaked keys, investigate usage and document private dispositions. Never publish credential values, unredacted artifacts or security incident details in PR comments. Deleting a file does not undo an old leak. No history rewriting or live secret mutation was authorized.

## Application CI and limitations

The original `ghada/DevSecOps` [project checks run 43632264473](https://github.com/AmmarMohanna/distilled.news/actions/runs/43632264473) already failed browser E2E and V3 correctness before the PR. The [latest completed project run 43697276597](https://github.com/AmmarMohanna/distilled.news/actions/runs/43697276597) also **FAILED**: 15/2,968 worker tests failed (14 in `connector-scale.test.ts`, 1 in `v3-window.test.ts`); V3 separate fixture failed 1/108; 30/673 Playwright checks failed. It is **not** justified to change test expectations or disable suites merely to force a green status. Existing TypeScript mock-field errors were fixed, and Python acquisition/briefing CI passed. Final project CI on the newly pinned workflow commit is required before any review-ready declaration.

This repository connection cannot enable GitHub Code Scanning/Dependabot security alert settings, configure rulesets, authorize Snyk or rotate historical credentials. The owner must verify default vs advanced CodeQL setup, dependency graph/Dependabot alerts/security updates, SARIF permissions and required branch rules. Secret scanning push protection should also be enabled where available.

### Local reproduction

Use a clean, full-history checkout at the PR commit and the exact versions shown in workflow files:

```bash
pnpm install --frozen-lockfile
pnpm -r typecheck
docker run --rm -v "$PWD:/src" -w /src semgrep/semgrep:1.185.0 scan --config p/default --config p/security-audit --severity ERROR --error --metrics off apps packages scripts evaluation .github/workflows
trivy fs --scanners vuln,misconfig --severity HIGH,CRITICAL --exit-code 1 .
docker run --rm -v "$PWD:/repo" -w /repo ghcr.io/gitleaks/gitleaks:v8.30.1 git --no-banner --redact=100 --log-opts="--all" /repo
docker build -f apps/worker/browser-container.Dockerfile -t distilled-browser-security:local .
trivy image --scanners vuln,misconfig --severity HIGH,CRITICAL --exit-code 1 distilled-browser-security:local
```

**EECE 503N/798S engineering contribution:** independent SAST analyzers, dependency alerts/PR automation, IaC and actual image scanning, scoped credential protection and stricter immutable third-party CI provenance with real evidence. The implementation supports the DevSecOps bonus, but it is **not production security clearance or an established numerical grade**.

Official references: [GitHub CodeQL](https://docs.github.com/en/code-security), [GitHub Dependabot](https://docs.github.com/en/code-security/dependabot), [Semgrep](https://semgrep.dev/docs/), [Trivy](https://trivy.dev/latest/), [Gitleaks](https://github.com/gitleaks/gitleaks), [Snyk](https://docs.snyk.io/developer-tools/snyk-cli).
