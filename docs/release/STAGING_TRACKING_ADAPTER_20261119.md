# Staging qualification adapter recovery

The combined candidate `0e94cb6f` passed [Project checks](https://github.com/AmmarMohanna/distilled.news/actions/runs/44400299583) and [Briefing evaluation](https://github.com/AmmarMohanna/distilled.news/actions/runs/44400299231). Staging version `0fc1e128-8c54-41e2-896d-293e4177df6c` preserved variables, secret names, resource bindings, cron and observability. Only its private authenticated mission activates the new verifier; ordinary staging and production routing are unchanged.

Fresh collection and extraction/review succeeded. Unlike the earlier empty new-feed attempt, the original private feed predates the article: feed created 18 November **19:22:12.115 UTC**, source published **19:40:36 UTC**, accepted during the new immutable attempt. Frozen input `840387c1aa3d12c7a4285a6a35575982d43533d0090cefdfc15e1085b704ac39` contains one article with **LATE_DISCOVERY** admission and `source-bound-claims-v3`. Collection is explicitly bounded to one article, not comprehensive source coverage.

Automatic approval review exhausted its usage allowance before the publication command could execute on 18 November. On resumption, publication reached financial admission but failed **before any model reservation or provider call**. The production reservation builder supports two existing SQL forms:

- Enforced authorization: ten bound fields, including `authorization_id`.
- Explicit TRACK_ONLY: nine bound fields, with `authorization_id` represented by literal SQL `NULL`.

The staging-only budget adapter assumed ten bound fields. On TRACK_ONLY it read the reserved cost as the feed ID and rejected the scope; the store surfaced this as `TEMPORARY_UNAVAILABLE`. The isolated D1 regression reproduced exactly `MISSION_RESERVATION_SCOPE_MISMATCH`. This is not evidence of a provider failure or a D1 outage.

The adapter now normalizes both layouts before applying the same feed, model, settled/held cost and operation-count checks. Original account authority, reservations and holds are unchanged. The new TRACK_ONLY test also verifies over-budget, wrong-feed, wrong-model and extra-call rejection. All **18 mission/budget tests** and Worker typecheck pass.

An operator-only `publish-resume-unpaid` action can continue the **same frozen request and original window** only when it is PENDING/V3, its snapshot exists, the original marker exists, and there are **zero model reservations for that feed**. It writes a separate immutable resume marker and refuses paid, repeated, missing and closed requests before any mutation. It never resets the first attempt, changes evidence or retries UNKNOWN paid work. This is unpaid adapter recovery, not a new experiment identity.

At 19 November 05:01 UTC, the private pilot still had zero paid calls. Conservatively counting all background staging operations during the guarded interval gives **$0.2196804** additional settled cost, zero new holds, cumulative campaign settled **$4.2281964** and exposure **$4.2406124**, including the unchanged **$0.012416** historical hold. The original remaining-phase ceilings and start time remain unchanged. Publication and assessment are still pending this correction's exact-head CI and live recovery; neither collection nor a frozen input is reported as a published briefing or a public-beta GO.
