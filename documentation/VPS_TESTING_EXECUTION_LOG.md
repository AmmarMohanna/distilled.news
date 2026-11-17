# VPS testing execution log

Recorded: 2026-09-16. This records the user's interactive setup and results shared in this conversation, including subsequent Stage 1 progress. Individual command timestamps were not captured.

**Current position: Stage 1 is in progress. Both extractors passed the checked reference for the first direct-HTTP article (Section 21). The remaining pilot articles and collection candidates are still pending.**

This is a historical log, not a script to rerun from the beginning. In particular, do not recreate the user, clone over the existing checkout, or reuse the completed demo1 run ID.

## Evidence and scope

- **Confirmed output** means the user pasted the command/output or its resulting state.
- **Instructions supplied; output not captured** means the commands were given during setup but their terminal output was not pasted. Later successful checks support that the resulting environment works; they do not prove the exact installation command history.
- Chat formatting introduced escaped underscores, escaped @ characters, HTML space entities, and Markdown links around URLs. Commands below use clean shell syntax rather than those display artifacts.
- Passwords, tokens, and private keys are not included.
- The final preflight, collection, processing, and Markdown report transcript is preserved unchanged in [the pasted evidence file](testing-evidence/VPS_OFFLINE_DEMO_2026-09-16.txt).
- This log was created in the local repository. It has not been copied to the VPS, committed, or pushed by this task.

## 1. Server and account

| Item | Observed value |
|---|---|
| Server IPv4 | 148.230.109.96 |
| Server hostname in prompt | srv1973214 |
| Initial SSH account | root |
| Benchmark account | distilled-bench |
| Operating system | Ubuntu 26.04.1 LTS, Resolute Raccoon |
| Architecture | x86_64 |
| CPU cores | 2 |
| Memory | 7.7 GiB total; 7.3 GiB available during initial inspection |
| Swap | 0 B |
| Root filesystem | 96 GiB total; about 95 GiB available during initial inspection |
| Python | 3.14.4 |
| Node | v24.21.0 |
| npm | 11.19.0 |
| Git | 2.53.0 |
| curl | 8.18.0; Ubuntu package 8.18.0-1ubuntu2.5 |

These resource values are snapshots, not reserved capacity or live performance measurements.

## 2. Connected from Windows using SSH

**Windows PowerShell command supplied:**

~~~powershell
ssh root@148.230.109.96
~~~

**Confirmed output:** SSH presented a first-connection authenticity prompt with this ED25519 fingerprint:

~~~text
SHA256:TsrMqQndMRAQ8wXoN3YiADL5h+KSZ9Zght1JJH27Zjg
~~~

The user was instructed to compare it with the server's fingerprint using the VPS dashboard console:

~~~bash
ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub
~~~

Then, if it matched, enter yes in PowerShell and authenticate with the VPS root password.

**Evidence limit:** successful root login is confirmed by later terminal output. The independent fingerprint check and the yes/password interaction were not pasted, so this log does not claim that verification was completed.

## 3. Inspected the server

Commands supplied and/or shown in the user's terminal:

~~~bash
whoami
cat /etc/os-release
nproc
free -h
df -h
python3 --version
node --version
~~~

The initial instructions used df -h /; the user actually pasted df -h, which listed all mounted filesystems.

**Confirmed results:**

- nproc returned 2.
- Memory and storage matched the table above.
- Python returned Python 3.14.4.
- Node initially returned Command 'node' not found.
- The OS information was pasted later, after switching to the benchmark account.
- No separate initial whoami output was captured; the root shell prompt was visible.

## 4. Created the benchmark account

**Confirmed command and account-creation output:**

~~~bash
adduser distilled-bench
~~~

The user entered and retyped a password. The terminal reported:

~~~text
passwd: password updated successfully
~~~

At the optional Full Name and subsequent information prompts, instructions were to press Enter for blank values, then enter Y at the confirmation prompt.

**Follow-up commands supplied:**

~~~bash
usermod -aG sudo distilled-bench
su - distilled-bench
whoami
sudo -v
cat /etc/os-release
~~~

The account's new password was to be used for sudo authentication.

**Confirmed resulting state:** later prompts show distilled-bench@srv1973214, OS output identifies Ubuntu 26.04.1 LTS, and later sudo commands work. Individual outputs for usermod, su, whoami, and sudo -v were not pasted.

## 5. Updated package lists and installed basic tools

**Confirmed command:**

~~~bash
sudo apt update
~~~

The output showed the resolute, resolute-updates, resolute-security, and resolute-backports repositories. It fetched 2234 kB and reported 11 packages available for upgrade.

**Installation command supplied; installation output not captured:**

~~~bash
sudo apt install -y ca-certificates curl git jq nano less tmux htop sysstat python3-venv build-essential pkg-config xz-utils unzip util-linux
~~~

**Confirmed verification commands:**

~~~bash
git --version
curl --version
~~~

They returned Git 2.53.0 and curl 8.18.0.

No full system upgrade or reboot was recorded.

## 6. Installed Node 24 under the benchmark account

**Confirmed commands:**

~~~bash
mkdir -p "$HOME/downloads/node24"
cd "$HOME/downloads/node24"
curl -fSLO https://nodejs.org/download/release/v24.21.0/node-v24.21.0-linux-x64.tar.xz
curl -fSLO https://nodejs.org/download/release/v24.21.0/SHASUMS256.txt
awk '$2 == "node-v24.21.0-linux-x64.tar.xz"' SHASUMS256.txt | sha256sum -c -
~~~

**Confirmed checksum result:**

~~~text
node-v24.21.0-linux-x64.tar.xz: OK
~~~

**Confirmed installation and PATH commands:**

~~~bash
mkdir -p "$HOME/.local/node24"
tar -xJf node-v24.21.0-linux-x64.tar.xz -C "$HOME/.local/node24" --strip-components=1
export PATH="$HOME/.local/node24/bin:$PATH"
printf '\nexport PATH="$HOME/.local/node24/bin:$PATH"\n' >> "$HOME/.profile"
~~~

The PATH addition was written to the benchmark account's profile. Its persistence across a fresh login has not yet been demonstrated in pasted output.

**Versions confirmed later:**

~~~bash
node --version
npm --version
~~~

~~~text
v24.21.0
11.19.0
~~~

## 7. Cloned the benchmark checkout

**Commands supplied; clone output not captured:**

~~~bash
mkdir -p "$HOME/work"
cd "$HOME/work"
git clone --branch testing-api-scrapers --single-branch https://github.com/AmmarMohanna/distilled.news.git
cd "$HOME/work/distilled.news"
~~~

**Confirmed verification commands:**

~~~bash
git branch --show-current
git log -1 --oneline
node --version
npm --version
~~~

**Confirmed output:**

~~~text
testing-api-scrapers
4e52a9f (HEAD -> testing-api-scrapers, origin/testing-api-scrapers) fix: improve standalone scraper benchmark accuracy and accounting
v24.21.0
11.19.0
~~~

Keep this checkout stable during a measurement run. No production Cloudflare deployment was performed.

## 8. Created the Python environment and installed dependencies

**Commands supplied; installation output not captured:**

~~~bash
cd "$HOME/work/distilled.news/evaluation/acquisition-benchmark"
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -c constraints.txt -e '.[dev,sources,extract,browser]'
npm ci --prefix node --ignore-scripts --no-audit --no-fund
python -m pip check
~~~

The expected pip check output was No broken requirements found, but that output was not pasted.

**Confirmed resulting state:** subsequent prompts show (.venv); all 194 tests pass; offline processing uses the actual extractors and parser bridge. Preflight recorded:

| Dependency | Recorded version |
|---|---|
| httpx | 0.28.1 |
| httpcore | 1.0.9 |
| zstandard | 0.25.0 |
| PyYAML | 6.0.3 |
| trafilatura | 2.0.0 |
| feedparser | 6.0.12 |
| Telethon | 1.45.0 |
| playwright | 1.58.0 |

## 9. Encountered and worked around Playwright's OS mismatch

**Confirmed failed command:**

~~~bash
sudo "$PWD/.venv/bin/python" -m playwright install-deps chromium
~~~

**Confirmed error:**

~~~text
BEWARE: your OS is not officially supported by Playwright; installing dependencies for ubuntu26.04-x64 as a fallback.
Cannot install dependencies for ubuntu26.04-x64 with Playwright 1.58.0!
~~~

**Workaround commands supplied:**

~~~bash
export PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu24.04-x64
sudo env PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu24.04-x64 "$PWD/.venv/bin/python" -m playwright install-deps chromium
~~~

The dependency installation retry output was not pasted.

**Confirmed browser installation command:**

~~~bash
python -m playwright install chromium
~~~

The terminal printed the following warning three times and returned without a reported error:

~~~text
BEWARE: your OS is not officially supported by Playwright; downloading fallback build for ubuntu24.04-x64.
~~~

The warning confirms that the override was active. This selected the Ubuntu 24.04 browser/dependency profile; it did not change the server OS or the pinned Playwright version.

**Persistence:** only an export in the current shell was recorded for this override. Unlike the Node PATH, it was not recorded as added to the profile. Reapply it after reconnecting before using Playwright.

## 10. Verified that Chromium launches

**Confirmed command:**

~~~bash
python - <<'PY'
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    try:
        page = browser.new_page()
        page.set_content("<html><title>Benchmark ready</title></html>")
        assert page.title() == "Benchmark ready"
        print("Chromium launch: OK")
        print("Browser version:", browser.version)
    finally:
        browser.close()
PY
~~~

**Confirmed result:**

~~~text
Chromium launch: OK
Browser version: 145.0.7632.6
~~~

This loaded inline HTML. It did not test a public website, the benchmark's isolated browser network mode, or the standard browser's required host egress firewall. The workaround is recorded as working for this launch check, not as official Ubuntu 26.04 support.

## 11. Passed the offline tests and fault checks

### Full test suite

**Confirmed command:**

~~~bash
python -m pytest
~~~

**Confirmed final summary:**

~~~text
194 passed in 17.47s
~~~

This result was pasted directly and again in the final attached transcript. That does not establish two separate executions.

### Fault smoke checks

**Confirmed command:**

~~~bash
python -m bench faults
~~~

**Confirmed result:** passed was true; all 21 checks passed; network_calls was 0.

The checked cases were:

1. Loopback IPv4 target rejected.
2. Link-local metadata-address target rejected.
3. Multicast IPv4 target rejected.
4. Multicast IPv6 target rejected.
5. Loopback IPv6 target rejected.
6. File URL rejected.
7. Stalled body timed out.
8. Redirect loop stopped.
9. Redirect to a private address rejected.
10. Oversized body rejected.
11. Compressed expansion bounded.
12. HTTP 429 classified as rate_limited.
13. HTTP 403 classified as blocked.
14. HTTP 401 classified as provider_auth.
15. HTTP 404 classified as http_error.
16. HTTP 503 classified as http_error.
17. HTTP 200 challenge page detected.
18. Short-news acceptance required a page date.
19. HTML access-denied content rejected as a feed.
20. Feed entity declaration refused.
21. DOCTYPE feed accepted.

These exercised synthetic/mocked failures, not real provider outages. Both checks were completed before the full demo.

## 12. Completed the end-to-end offline demo

All commands in this section were confirmed in the [pasted transcript](testing-evidence/VPS_OFFLINE_DEMO_2026-09-16.txt).

Working directory:

~~~text
/home/distilled-bench/work/distilled.news/evaluation/acquisition-benchmark
~~~

### Preflight

~~~bash
python -m bench preflight --config configs/offline-demo.json
~~~

Confirmed: ready true, mode offline, 22 enabled routes, and network_calls 0.

Every route was READY for offline use. This does not confirm that live provider credentials, paid access, or browser network controls are configured.

### Collection

~~~bash
python -m bench run --config configs/offline-demo.json --run-id demo1
~~~

Confirmed: 22 complete jobs, no stop, zero provider charges and reservations. processing_versions was null at this point because processing had not yet run.

### Extraction, normalization, and scoring

~~~bash
python -m bench process --data-dir data/demo --run-id demo1
~~~

Confirmed: processing versions recorded, 22 complete jobs, no capacity stops, and a generated report.

### Viewed the report

~~~bash
cat data/demo/reports/demo1/report.md
~~~

The report contains 27 candidate/parser rows: five article routes each evaluated with two extractors, plus 17 source rows.

- 24 rows have PASS labels.
- Three rows have SOURCE_UNVERIFIED: google_apify, google_rss, and generic_apify. Their demo targets have no reference answers.
- Every group has INSUFFICIENT_EVIDENCE. One synthetic input is not a provider-quality sample.
- Every group has SERVER_COST_NOT_CONFIGURED. The demo's server price is null.
- Provider actual charges and unreconciled reservations are both USD 0.
- No real source performance or paid provider access was established.

Recorded identifiers:

~~~text
Run: demo1
Config SHA-256: 21d89ec849e58c98b6f59e7d2e5663c77aba14300821b94940c6721280b23228
Code SHA-256: 45a13ed2a225308ee0e33259e9daffc5cec073cbd367284b2cd244dfb1bb7725
Platform: Linux-7.0.0-30-generic-x86_64-with-glibc2.43
~~~

Recorded processing/report resources:

| Metric | Value |
|---|---|
| Resource samples, all phases | 25 |
| Processing samples | 23 |
| Peak process-tree RSS | 180031488 bytes, about 172 MiB |
| Minimum available host memory | 7609090048 bytes, about 7.09 GiB |
| Maximum sampled host CPU fraction | 0.6909, about 69.1% |
| Capacity stops | 0 |

The report shows zero separately classified Node and Chromium RSS. This does not establish that Node was unused: the parser bridge ran and some process memory was classified as other. Chromium did not perform live website collection in this fixture demo. Sampled resource values are not live-source capacity benchmarks.

## 13. Files and locations now used on the VPS

| Purpose | Path |
|---|---|
| Repository | /home/distilled-bench/work/distilled.news |
| Benchmark package | /home/distilled-bench/work/distilled.news/evaluation/acquisition-benchmark |
| Python environment | Package directory + /.venv |
| Node installation | /home/distilled-bench/.local/node24 |
| Node download and checksum | /home/distilled-bench/downloads/node24 |
| Offline config | Package directory + /configs/offline-demo.json |
| Demo ledger | Package directory + /data/demo/benchmark.sqlite |
| Demo evidence blobs | Package directory + /data/demo/blobs |
| Demo Markdown report | Package directory + /data/demo/reports/demo1/report.md |
| Demo JSON report | Package directory + /data/demo/reports/demo1/report.json |
| Demo CSV report | Package directory + /data/demo/reports/demo1/attempts.csv |

The report.md content was pasted. JSON summary output was pasted, but the complete report.json, CSV, SQLite database, and blobs have not been downloaded or independently inspected from this local workspace.

## 14. Resume the existing setup after reconnecting

**Future instructions; not an additional recorded execution.**

From Windows, the established access route is:

~~~powershell
ssh root@148.230.109.96
~~~

Then switch accounts:

~~~bash
su - distilled-bench
~~~

In the benchmark account:

~~~bash
export PATH="$HOME/.local/node24/bin:$PATH"
cd "$HOME/work/distilled.news/evaluation/acquisition-benchmark"
source .venv/bin/activate
export PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu24.04-x64
~~~

At the original demo checkpoint, direct SSH access for distilled-bench had not been demonstrated. It was subsequently confirmed with password authentication in Section 17; SSH key setup remains unconfirmed.

To review the completed demo again, read its existing report:

~~~bash
cat data/demo/reports/demo1/report.md
~~~

Do not run a new collection with the existing demo1 ID. Use a distinct ID for a genuinely new run.

## 15. Stage 1 handoff

### Completed

- [x] Server access and dedicated benchmark account.
- [x] Working Python environment and Node installation.
- [x] Chromium inline launch check with the recorded compatibility override.
- [x] 194 offline tests passed.
- [x] 21 fault smoke checks passed.
- [x] Offline collection, processing, scoring, and report generation completed.

### Next work, not yet executed

- [ ] Select one public news article URL for the first direct-HTTP pilot.
- [ ] Record the real monthly VPS cost or allocated share in USD; it has not been supplied. Do not substitute an invented zero.
- [ ] Create a separate live configuration with one article, only direct HTTP enabled, both extractors, and zero paid-provider budget.
- [ ] Run live-configuration preflight, the appropriate server readiness checks, and inspect the plan before collection.
- [ ] Fetch the first real article, process it, and inspect the saved body/title/date and extraction outputs.
- [ ] Add an independently checked reference before making a verified quality claim.
- [ ] Expand to the Stage 1 matched roster and candidate comparisons.

No live pilot configuration, article URL, source credentials, managed-provider budget, or live run has been confirmed in this session. Browser startup alone has not established readiness for either live browser route: validate the relevant isolation/egress controls before enabling it.

Previously reviewed reporting limitations at commit 4e52a9f remain unresolved in this record: unresolved X media can still receive a quality PASS, and campaign accounting can appear finalized while a schedule has future rounds. No fixes were applied during this setup walkthrough.

The three-stage progression remains:

| Stage | Goal | Current state |
|---|---|---|
| 1: Small live pilots | Confirm each candidate works on a small matched sample | Ready to configure the first direct-HTTP pilot; no live collection yet |
| 2: Controlled comparison | Compare larger datasets against independent reference answers | Not started |
| 3: Seven-day live testing | Measure reliability, freshness, cost, and recovery over time | Not started |

See [External Testing: A to Z](EXTERNAL_TESTING_A_TO_Z.md) for the full procedure and [the benchmark README](../evaluation/acquisition-benchmark/README.md) for implemented commands.

## 16. Follow-up: unknown VPS cost (prepared locally, subsequently applied in Section 17)

The user chose to defer obtaining the VPS price and continue with the first pilot. A subsequent local change makes a missing server cost a WARNING in preflight and server-check instead of blocking live collection. Server-inclusive cost metrics remain unknown; paid-provider budgets and access requirements remain enforced.

The change and updated tests/docs are packaged in [allow-unknown-vps-cost.patch](testing-evidence/allow-unknown-vps-cost.patch), against commit 4e52a9f. Eight targeted offline readiness, cost, and budget tests passed locally. The patch was checked against the local changes. It has not been committed, pushed, or applied on the VPS by the assistant.

Applying this patch will change the measured code hash. Record the patch and new preflight output with the first live run. The historical demo1 results above remain results of the original commit, not of this modified code.

The first article URL is still pending. No live collection was performed as part of this follow-up. The earlier X-media and unfinished-schedule reporting issues are separate and remain unfixed.

## 17. Confirmed patch transfer, direct SSH login, and VPS regression tests

The user initially entered Linux repository commands at the Windows PowerShell prompt, producing a path-not-found error for C:\Users\Admin\work\distilled.news. The instructions were clarified: scp and ssh start in Windows; repository and Python commands run after login on the VPS.

**Confirmed Windows transfer command:**

~~~powershell
scp "C:\Users\Admin\OneDrive - American University of Beirut\Documents\GitHub\distilled.news\documentation\testing-evidence\allow-unknown-vps-cost.patch" distilled-bench@148.230.109.96:allow-unknown-vps-cost.patch
~~~

The transfer reached 100% (13 KB). The user then connected directly as the benchmark account:

~~~powershell
ssh distilled-bench@148.230.109.96
~~~

Password authentication succeeded. The login banner reported Ubuntu 26.04.1 LTS, kernel 7.0.0-30-generic, 11 available updates, and System restart required. No subsequent upgrade or reboot has been recorded. Plan any restart around other server users/workloads before longer measurements.

**Confirmed commands executed on the VPS:**

~~~bash
cd "$HOME/work/distilled.news"
git apply --check "$HOME/allow-unknown-vps-cost.patch"
git apply "$HOME/allow-unknown-vps-cost.patch"
cd evaluation/acquisition-benchmark
source .venv/bin/activate
export PATH="$HOME/.local/node24/bin:$PATH"
export PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu24.04-x64
python -m pytest
~~~

The patch check and application returned without reported errors. The complete test suite reported:

~~~text
195 passed in 18.26s
~~~

The additional case covers server readiness with an unknown VPS cost. This result is for commit 4e52a9f plus the working-tree patch; it does not replace the earlier 194-test baseline result. No commit or push was recorded.

**Position at this checkpoint:** the missing-cost restriction was removed and validated on the VPS. Leave server_monthly_usd null while its price is unknown. Subsequent configuration and live collection are recorded below.

## 18. First Stage 1 live article run

### Saved configuration and readiness

The first preflight attempt returned FileNotFoundError for configs/first-article.local.json. The user was instructed to save the configuration using nano, including Ctrl+O and Enter before exiting.

**Confirmed file check:**

~~~bash
ls -l configs/first-article.local.json
~~~

The file existed, was owned by distilled-bench, and was 572 bytes. Its contents and the chosen URL have not been pasted, so this log does not invent or reconstruct the article address.

**Confirmed preflight:**

~~~bash
python -m bench preflight --config configs/first-article.local.json
~~~

The result showed mode live, one enabled route (direct), ready true, a server_cost WARNING, and network_calls 0. The patched code hash was:

~~~text
81419596ad10839ce93a61d200c68b04c42f4d27764524b3eb0f8ac8ac02d7c4
~~~

### Reconnected after laptop shutdown

The user reported a laptop shutdown and subsequently pasted a successful SSH login as distilled-bench. The server remained accessible. No live acquisition had been recorded before that interruption.

The following commands were supplied to start or reattach a persistent session and restore the environment:

~~~bash
tmux new -A -s benchmark
cd "$HOME/work/distilled.news/evaluation/acquisition-benchmark"
source .venv/bin/activate
export PATH="$HOME/.local/node24/bin:$PATH"
export PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu24.04-x64
~~~

The user then asked about scrolling in tmux. Instructions were Ctrl+B followed by [ for copy mode, arrow/Page Up/Page Down keys, and q to exit. The optional command tmux set -g mouse on was supplied; execution of that setting was not confirmed. A tmux session protects against client disconnection, not a VPS reboot.

The user was shown how to inspect the configured URL and said they checked it:

~~~bash
cat configs/first-article.local.json
jq -r '.targets[0].input' configs/first-article.local.json
~~~

The URL itself remains absent from the shared evidence.

### Collection and processing

**Commands supplied:**

~~~bash
python -m bench preflight --config configs/first-article.local.json
python -m bench fetch --config configs/first-article.local.json --run-id first-article-001
python -m bench process --data-dir data/live --run-id first-article-001
cat data/live/reports/first-article-001/report.md
~~~

The user supplied a screenshot of the final cat command and report, confirming the resulting live run and processed outputs. Separate fetch/process terminal outputs were not supplied.

**Confirmed report:**

| Field | Observed value |
|---|---|
| Run | first-article-001 |
| Mode | live |
| Job states | complete: 1 |
| Collection method | direct |
| Trafilatura label | AUTO_UNVERIFIED |
| Readability label | AUTO_UNVERIFIED |
| Trafilatura combined acquisition + processing | 1059 ms |
| Readability combined acquisition + processing | 2305 ms |
| Independently verified unseen inputs | 0 |
| Evidence gate | INSUFFICIENT_EVIDENCE |
| Provider actual charges | USD 0 |
| Unreconciled provider reservations | USD 0 |
| Cost status | SERVER_COST_NOT_CONFIGURED |
| Peak sampled process-tree RSS | 404180992 bytes |
| Minimum available host memory | 7379890176 bytes |
| Maximum sampled host CPU fraction | 0.8621 |
| Capacity stops | 0 |

With one attempt, the reported p95 values are single observations, not latency-distribution estimates. AUTO_UNVERIFIED means the extracted article passed the response-only validator without a reference answer. It does not establish complete/correct text or a winning extractor. Zero provider charges exclude the still-unknown VPS cost.

**Next:** inspect the title, publication date, and complete body from both saved extractions against the original article. No recollection is needed to inspect these results. Independent references, verified scoring, additional articles, and alternative collection methods are still pending.

## 19. Inspected the first live extraction outputs

The user subsequently supplied the full fetch/process summaries, Markdown report, and extracted article JSON. These are preserved in [the first live run transcript](testing-evidence/FIRST_ARTICLE_001_2026-09-16.txt). This supplies the previously missing fetch/process terminal evidence from Section 18.

Confirmed extraction-inspection command:

~~~bash
jq '.jobs[].result.steps[].extractions | to_entries[] | {extractor: .key, article: .value.article}' data/live/reports/first-article-001/report.json
~~~

The recorded article URL is https://edition.cnn.com/2026/09/15/politics/iran-war-powers-vote-house and the extracted canonical URL uses www.cnn.com with the same path. The config hash is 6bc0a38534bf891df4ac439c0ce242867c7db40cb790c3ba8faf2d202f215759.

Comparison performed locally on the pasted JSON, without recollecting the article:

- Both bodies contain 590 whitespace-separated words and 16 nonempty text lines/paragraphs, including the final editorial update notice.
- The bodies are identical after whitespace normalization. Readability preserves substantial indentation and empty lines; Trafilatura produces compact paragraphs.
- Readability's title is the headline alone. Trafilatura appends the site suffix, vertical bar CNN Politics.
- Both final published_at values are 2026-09-16T02:38:32.364Z, taken from article:published_time metadata. Both updated_at values are 2026-09-16T14:19:15.122Z.
- Trafilatura's original extractor date was 2026-09-15, while Readability's was the precise timestamp. The shared metadata enrichment produced the matching final timestamps. Neither final date has yet been independently confirmed against the publisher display.
- UTF-8 parsing of the attachment shows valid curly punctuation in both bodies, without replacement characters. The terminal tool's initial display artifacts were not treated as an extraction defect.

Opening either CNN URL with the assistant's web tool failed. No independent source-page comparison was completed, and extractor agreement alone is not a reference answer. Labels remain AUTO_UNVERIFIED. Next obtain an independently checked article body, headline, and publication-date evidence from the publisher page before attaching a reference and rescoring the saved run.

## 20. User-supplied publisher reference and content-boundary review

The user reported that the extraction looked correct and followed instructions to copy the article body from the publisher page into data/live/references/article-001-body.txt. The confirmed command wc -w returned 653 words. The user then pasted that file's full text using cat.

Comparing this reference with the supplied extraction outputs explains the entire word-count difference:

- Both extractions: 590 whitespace-separated words, including an eight-word final editorial update notice.
- Publisher-page copy: 653 words, including a 71-word Related article card (duplicated image description, image credit, another article's headline, and reading-time label), but omitting that update notice.
- Main article text after excluding both ancillary sections: 582 words. Arithmetic: 590 - 8 + 71 = 653.

The pasted main article paragraphs show no apparent omission from either extraction. The related-story card is page content outside this article's main body; its removal by the extractors is desirable for this test. The editorial update notice is a separate small extra in their output, not a missing article paragraph.

Next prepare a cleaned reference excluding the related-story card while preserving the original browser copy. Do not add text from the extractor just to force an exact match. Reference cleanup and attachment/scoring have not yet been confirmed; no PASS label has been assigned from this manual inspection alone.

## 21. Checked reference created and both extractors passed

The user confirmed that the cleaned reference had the expected 582 words and supplied these publisher page-source values:

~~~html
<meta property="article:published_time" content="2026-09-16T02:38:32.364Z" />
<meta property="article:modified_time" content="2026-09-16T14:19:15.122Z" />
~~~

The visible Updated 50 min ago display was not treated as the publication date. The user-provided publication metadata corroborated the final date in both extractions.

The reference creation script read data/live/references/article-001-body.cleaned.txt, asserted 582 words, and wrote data/live/references/article-001.gold.json. It used the checked headline, minute-precision publication timestamp, the edition.cnn.com and www.cnn.com article URLs, three 12-word body anchors (beginning/middle/end), and excluded the Related article and 3 min read UI strings. The reference does not require character-for-character equality or prohibit the short editorial update notice.

An initial attempt pasted the Linux Python heredoc into Windows PowerShell and produced parser errors. The user reconnected to the VPS, restored the environment, and successfully created the reference there. Repeating the script then raised FileExistsError because exclusive creation mode protected the existing file. This was not evidence of a damaged reference.

Commands supplied to attach and score the reference:

~~~bash
jq -r '.accepted_urls[]' data/live/references/article-001.gold.json
python -m bench attach-reference --data-dir data/live --run-id first-article-001 --target-id article-001 --reference data/live/references/article-001.gold.json
python -m bench score --data-dir data/live --run-id first-article-001
cat data/live/reports/first-article-001/report.md
~~~

The first displayed report still showed AUTO_UNVERIFIED, so the user was instructed to attach the reference and rescore. The subsequent pasted report confirms:

| Candidate | Label | Reported unseen inputs | Combined acquisition + extraction |
|---|---|---:|---:|
| direct / article / trafilatura | PASS | 1 | 1059 ms |
| direct / article / readability | PASS | 1 | 2305 ms |

The run remains first-article-001, mode live, with one complete acquisition job. Provider charges and reservations are USD 0. The server price is still unknown, so cost per usable result is not reported. INSUFFICIENT_EVIDENCE remains correct for a single pilot article. Scoring was performed on saved results; no additional fetch was requested during reference attachment/scoring. Separate successful attach/score terminal summaries were not pasted, but the final report confirms the scores changed to PASS.

This completes the first reference-scored article check, not all of Stage 1. It establishes that both extractors met the configured scoring criteria for this checked article; it does not establish overall provider quality, a latency distribution, or a winning extractor. The report's unseen-input count is its mechanical configuration-based count; this pilot article must be kept separate from the later controlled unseen evaluation cohort.

Next expand the direct-HTTP pilot to five distinct articles, including the existing English CNN article, an Arabic article, a French article, and appropriate JavaScript-rendered and redirect/canonical cases. Preserve the existing run and reference, then plan matched repetitions and additional collection methods as their prerequisites are satisfied. No additional URLs, subscriptions, or live runs have yet been confirmed.
