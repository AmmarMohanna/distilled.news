# Isolated pilot execution follow-up

The campaign Worker was updated to integrated revision `cdb9fa5`, preserving its separate D1, R2, queues, secrets and frontend assets. Production and existing staging were not changed. The native private helper binding was reused with the supplied token; its authenticated capacity endpoint returned AVAILABLE (two of two slots occupied at the observation). No helper scraping was used as a readiness test.

The existing guarded Microsoft device-consent helper installed only Mail.Send, User.Read and offline-access credentials on the isolated Worker. Gmail retains read-only authorization. Two distinct plus-address users completed normal registration, actual delivered verification links, verification API consumption and login. The first verification email was found in spam; the bounded Gmail reader now includes spam/trash while retaining exact alias/time/origin checks and the ten-message maximum. No token was read from application SQL, no session was fabricated and no email-verification bypass was used.

Prepaid model execution remains gated by a fresh four-hour $50/40-call approval. Its allocation is $40 model work, $5 setup/tools, $1 infrastructure and $4 stopping reserve. It is a ceiling, not expected spending. The isolated ledger had eight historical settled quality-evaluation operations totaling $0.107676 and no outstanding holds at preflight; those records are preserved and excluded from fresh pilot totals.

Integration corrections required before live feed creation:

- Observer financial reads now resolve exact observed operation identities with feed ownership fences, rather than equating the application user with the provider billing account. Setup and external charges remain explicitly outside this window-only view.
- Optional native account-authority fields bound total new operation count and an explicit feed allowlist. Admission checks the count atomically in the same reservation batch; settlements do not restore call allowance. Existing authorizations without those fields retain their behavior.
- Source assessment previously called the provider directly. Only in the explicitly isolated campaign environment, its existing request now reserves through the native ledger and retains the provider response privately in R2 before settlement. Replays reuse that response; a reservation with no saved response is uncertain and cannot be resent. No extra model stage or normal-deployment routing change is introduced.

Validation so far: seven campaign observer tests, twelve native accounting tests and three assessment-accounting tests pass. Focused Gmail/authentication/framework tests pass, and Worker TypeScript checks pass. These are integration checks, not a successful four-feed publication campaign. Exact live evidence and append-only operations are retained in the ignored protected pilot folder. Final campaign outcomes must be appended from actual observation rather than inferred from setup success.
