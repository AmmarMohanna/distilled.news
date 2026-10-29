# Aya / Ghada preserved integration

Created `aya-ghada-preserved-integration` from Aya's current branch, then merged
Ghada's final fetched branch state. Neither input branch was reset or rewritten.

| Input | Commit |
| --- | --- |
| Aya: `aya-joud-frontend-integration` | `4c0376c5ff0f99ed2283a399b8c2d3cfbdccbbdd` |
| Ghada: `ghada/joud-aya-preserved-integration` | `feb20d9d74aba538cd0666863bf2e75f7b289480` |
| Shared base | `bbc631a60e8cf0be4077890985f940e36b9bc428` |

## Preservation and resolutions

The eleven shared edited paths conflicted and were resolved by feature. All 197
paths changed exclusively by Ghada remain identical to her tip. Of Aya's 34
exclusive paths, 33 remain identical; the window-coverage test was adapted to the
combined coverage categories without dropping its index-plan assertion.

- Frontend source, styles, assets, PWA, translations, Unicode usernames,
  authentication mail, artwork and dedicated deployment configuration match
  Ghada's final tree. This is an exact Git comparison, not a new visual/device
  acceptance run.
- Ghada's selective V3 database reads, carry/history indexes, verified-result
  reuse, clock-aligned opt-in scheduling and compatibility for persisted older
  schedules remain intact. Editor, verifier, targeted repair, retained evidence,
  reader memory, publication references and intended-delivery labels remain.
- Aya's 60-second source-call bounds, helper-capacity diagnostics/backoff,
  explicit unknown-payment acknowledgements, retained reservations, safe Apify
  read recovery, RSS parsing and public HTTP/extraction protections remain.
- Source availability combines Ghada's safe failure categories with Aya's
  distinction between acknowledged historical holds and active payment fences.
- Recovery accepts either branch's seventh-argument form: fresh HTTP evidence or
  unpaid/reviewed recovery options. Verified redirect-chain evidence remains the
  eighth argument. Both authorization histories and cumulative attempt limits
  survive; unpaid mode never enables paid or model-based stages. Reviewed
  recovery may use the existing anonymous deterministic browser.
- Article acquisition retains independently verified redirects, reviewed
  same-publisher relocations, primary WordPress bodies, National liveblogs and
  short primary descriptions. Short readable text remains partial evidence.
  Redirected short excerpts retain destination identity and do not borrow an
  unrelated original discovery date. A new combined regression covers this.
- Confirmed acquisition-budget waits remain pending/recoverable, but count as
  failed coverage rather than delaying healthy-source publication. Explicit
  reconciliation dependencies retain their separate blocked count. The bounded
  state predicate and composite-index query-plan regression remain.

## Migrations and deployment boundary

Incoming migrations `0072` through `0081` retain their exact contents. None
collides with an existing Aya migration number. Older duplicate prefixes already
exist in both histories and were not renamed during this merge.

Package manifests and the lockfile were not upgraded. Staging and Joud resource
configurations remain identical to Ghada's input. No deployment, remote migration,
secret/account change, paid source/model call or reader notification was performed.
Local Worker build validation uses staging configuration with `--dry-run` only.

The existing Google collection flag is retained. Source assessment's separate
private Google transport gap is not silently represented as fixed by this merge.
Existing QA acquisition failures, database overload and VPS access limitations
require separate live validation; a successful merge does not resolve them.

## Validation

- Entire frontend unit suite: 111 passed. Frontend and Worker TypeScript checks
  passed. Frontend production build and minified Worker dry-run build passed.
- Connector regression suites: 202 passed, one explicitly skipped, covering
  paid-operation fences/recovery, HTTP helper diagnostics, RSS, primary article
  selection and website discovery.
- Helper server tests: six passed with local mocked execution.
- Initial seven-file Worker run: 170 passed, two failed. The new combined
  reviewed-short-excerpt case and WordPress completeness regression required
  corrections. A focused rerun passed all six selected acquisition cases,
  including both failures; the remaining 93 acquisition cases were intentionally
  filtered on that follow-up, not represented as rerun successes.
- Scheduling/V3 follow-up: 87 passed across V3 windows, persisted scheduling
  policies, preparation/carry scaling and budget-coverage tests. Two
  budget-coverage tests overlap the initial Worker run.
- Final fallback/redirect/source-availability/indexed-coverage rerun: 59 passed.
  These overlap the initial run and are not additional unique tests.
- No browser screenshot/device matrix, complete repository CI or live provider
  acceptance was run. Frontend files remain byte-identical to Ghada's input.
- The staged whitespace check reports one pre-existing extra EOF blank line in
  Ghada's `docs/joud-operational-source-fixes.md`; its original bytes are retained.
