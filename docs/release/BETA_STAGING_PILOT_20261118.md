# Approved bounded staging pilot — in progress

Scope: staging only, with explicit user deployment/pilot approval. Production is unchanged. Candidate `ad5519f50555fe2af323f1c63ce6bf7ac46aafb1` passed Project checks ([44374217325](https://github.com/AmmarMohanna/distilled.news/actions/runs/44374217325)) and Briefing evaluation ([44374217087](https://github.com/AmmarMohanna/distilled.news/actions/runs/44374217087)). Local evidence and previous failures are in the immutable beta evaluation reports.

## First live attempt

- Deployed staging version `ddc77232-e8e8-4015-83f3-14567b7c8895`, source-binding candidate enabled, original 15 secret bindings and existing D1/R2/queues/VPC preserved. One-minute cron retained. Original rollback version `b6bcae18-e946-4ab2-a4e4-84e64919749b` recorded privately.
- Created a fresh private pilot feed `staging-fresh-beta-ad5519f5` through the existing operator-only mission. No production feed/account was created or changed.
- The mission's hard-coded TechCrunch RSS URL returned **HTTP 403**, classified `auth_required/http_403`. One request, zero observations, **zero provider cost and zero model operations**. This is a real publisher-access failure, not evidence that generation succeeded or failed.
- Preserved its immutable collection-failure receipt and private source scope; did not reset it or resend an unknown paid operation.
- Disabled staging candidate flag after this failure. Cleanup deployment `27952848-f158-4b80-aa2b-84d40620af2e` retains the candidate code with activation off. Production was not deployed.

## Minimal staging-tool correction

The operator mission accepted only one publisher because its preparation URL was hard-coded. `STAGING_MISSION_RSS_URL` now allows an authenticated **fresh** staging mission to choose a public HTTPS feed. Default behavior remains TechCrunch. Its chosen URL is frozen in `prepare-start`, and subsequent collection uses that frozen value; it does not reinterpret old missions from changed environment settings. Credential-bearing URLs, non-HTTPS URLs and URL fragments are rejected. The existing bounded public HTTP transport retains its public-network checks. No arbitrary public source-fetch endpoint, paid retry or production collection change is introduced.

Fresh-source availability checks from the local environment: BBC Technology RSS and The Verge AI RSS returned HTTP 200 with feed XML. This does **not** establish access from Workers; the next fresh staging attempt must verify that separately. The Anthropic RSS guess returned 404 and is not used. All checks were free HTTP reads, not inference.

The new source-choice regression first failed because the helper did not exist, then passed with the implementation. All 8 staging-mission/authentication/budget tests passed; Worker typecheck passed. CI for the operator-only follow-up is a separate gate before its deployment. The production entrypoint does not import `staging-mission.ts`.

## Budget and privacy

The previously approved $5 implementation campaign has $3.0674276 settled and $0.012416 historical unresolved exposure. User separately approved using at most the remaining **$1.92** for this staging pilot. A temporary staging-only reservation trigger enforces settled plus unresolved exposure for all new model operations during the pilot, atomically before reservation dispatch. It supplements existing account admission and never clears old holds. It is not a permanent user quota or a production financial-policy change. The existing per-mission guard remains as a separate backstop. Offline guard checks verified unresolved exposure inclusion, over-cap rejection and release of unused reservation only after a real settlement.

The mission operator token was freshly generated privately and configured in staging; it is not a user login credential and no value is committed. Private requests/responses and settings snapshots remain in `.local-reports/integration/beta-staging-pilot/`. The source-choice follow-up will use a **new mission ID**, preserving this failed run. The temporary budget guard and campaign totals must not be reset between attempts.

## Current decision

**Pilot incomplete. No public-beta GO has been established.** Editorial regressions support controlled qualification; the live source collection failed before any assessment. Continue with the minimal source-choice correction, require its CI, then run collection → extraction/review → V4 generation/verification → publication/reader privacy checks. Record all real results, costs and holds. At pilot completion/failure, disable activation, pause only the pilot feeds and remove the temporary budget guard only after reconciliation; retain evidence and unresolved operations. Production deployment/merge remains separately approved.
