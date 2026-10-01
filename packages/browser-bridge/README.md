# @distilled/browser-bridge

An **optional**, self-hosted execution substrate for authenticated browser bootstrap.

Cloudflare stays the authority: it owns D1, R2, `CredentialVault`, the session store, the encryption keyring, profile authorization, bootstrap admission, challenge state and attempt/retry policy. This service only runs an ephemeral, isolated Chromium (`SelfHostedChromiumProvider`) on behalf of one fenced, short-lived execution and then throws everything away.

```
Cloudflare Worker ──(HTTPS, HMAC-signed, nonce'd, bounded protocol v1)──▶ browser-bridge ──▶ SelfHostedChromiumProvider
```

Nothing here is reachable unless the Worker is configured with `DISTILLED_BROWSER_PROVIDER=self_hosted`, a bridge URL and a dedicated credential. The default Cloudflare Browser path is untouched.

## What the bridge is not given

D1 or R2 credentials, the encryption keyring, `WEB_OPERATOR_RUNTIME_TOKEN`, or any persistent plaintext credential. It keeps no database and writes no browser state to disk.

## Protocol (`v1`, `POST /v1/authenticated-browser`)

Exactly eight operations. There is no generic navigate, click, evaluate, screenshot, raw-selector, coordinate or cookie endpoint, and unknown operations or protocol versions are rejected.

| Operation | Effect | Repeat after unknown outcome |
| --- | --- | --- |
| `OPEN_AUTH_BROWSER` | allocate isolated Chromium for the capability | safe |
| `RESTORE_AUTH_STATE` | load transient session state | **never** (`BRIDGE_EFFECT_UNKNOWN`) |
| `NAVIGATE_AUTH_ENTRYPOINT` | go to the capability's entrypoint or session-probe URL (`destination`) — the caller never supplies a URL | **never** |
| `OBSERVE_AUTH_SURFACE` | bounded semantic observation with opaque control handles | safe |
| `INJECT_AUTH_FIELD` | fill one `IDENTIFIER`/`PASSWORD` field by handle | **never** |
| `ACTIVATE_AUTH_CONTROL` | activate one `CONTINUE`/`NEXT`/`USE_PASSWORD`/`LOGIN`/`SIGN_IN` control by handle | **never** |
| `CAPTURE_AUTH_STATE` | return transient storage state to the Worker (never stored here) | safe |
| `CLOSE_AUTH_BROWSER` | tear down | safe |

Every request carries an `operationId` and the full execution capability (`bridgeExecutionId`, `bootstrapRequestId`, `runId`, `tenantId`, `ownerId`, `profileId`, `expectedProfileVersion`, `browserGeneration`, `authFlowId`, `siteKind`, `authEntryPoint`, `sessionProbeUrl`, `allowedOrigins`, `writeOrigins`, `issuedAt`, `expiresAt`, `operationBudget`). After `OPEN` the capability is immutable: any deviation is `BRIDGE_FENCE_MISMATCH`. Mutation outcomes (including failures) are recorded per `operationId`, so a retried mutation returns the recorded outcome and is never executed twice; concurrent duplicates collapse into one execution.

Failures are typed: `BRIDGE_UNAVAILABLE`, `BRIDGE_UNAUTHORIZED`, `BRIDGE_REPLAY_REJECTED`, `BRIDGE_EXECUTION_EXPIRED`, `BRIDGE_FENCE_MISMATCH`, `BRIDGE_OBSERVATION_STALE`, `BRIDGE_NETWORK_POLICY_DENIED`, `BRIDGE_EFFECT_UNKNOWN`, `BRIDGE_BROWSER_FAILURE`, `BRIDGE_PROTOCOL_UNSUPPORTED`, `BRIDGE_PAYLOAD_TOO_LARGE`, `BRIDGE_OPERATION_UNKNOWN`. Provider error text is never returned. A network-policy denial terminates the execution. Redirect hops are validated *before* Chromium follows them (a CDP `Fetch` response-stage guard in the shared browser adapter), so a redirect to a non-admitted origin is never dispatched and a 307/308 can never re-send a POST body there.

Limits: request 256 KB, response 512 KB, session state 192 KB, observation 96 KB, secret 4096 chars, operation budget ≤ 64, capability lifetime ≤ 15 min, 30 s idle / 120 s absolute execution lease, 2 concurrent executions.

## Authentication

`x-distilled-bridge-{timestamp,nonce,signature}`: HMAC-SHA-256 over method+path, timestamp, nonce and the body hash, verified in constant time, ±30 s window, nonces rejected on replay. The credential is `SELF_HOSTED_BROWSER_BRIDGE_AUTH` — deliberately **not** `WEB_OPERATOR_RUNTIME_TOKEN`. HTTPS is required by the client outside explicit loopback development (`ENVIRONMENT=development`; an unset `ENVIRONMENT` is treated as production-safe).

## Challenges

The self-hosted provider's current CAPTCHA capability is `DETECT_ONLY`. A detected challenge is recorded by `ChallengeCoordinator`; this bridge does not currently ship a solver. A supported resolver or compatible executor can be added for authorized read-only acquisition, with bounded retries and re-observation. Source and account authorization remain separate from anti-bot compatibility.

For an explicitly operated compatible local executor, `BROWSER_BRIDGE_BROWSER_CHANNEL=chrome` selects installed Chrome and `BROWSER_BRIDGE_HEADFUL=true` opens its window. Both settings are local operator configuration; they do not widen the bridge's URL, operation, or credential authority. A remote bridge still requires an approved HTTPS transport and its dedicated HMAC credential.

## Optional managed X browser

The Cloudflare Container bridge can connect X executions to a Browserless CDP browser. Configure `BROWSERLESS_CDP_ENDPOINT` with a `wss://*.browserless.io` endpoint (for example a supported `/stealth` endpoint) and store `BROWSERLESS_API_TOKEN` as a Cloudflare Worker secret. The Worker passes that provider token only to the fenced Container; the X account credentials remain in the existing encrypted `AuthCapability`/`BrowserProfile` path. Public-source executions continue using the Container's local Chromium. The CDP browser uses the provider's default context so its proxy and browser settings remain active; Distilled still captures session state into encrypted R2 storage and closes each browser after the run.

This route needs a Browserless account and API token. Supplying a token authorizes Browserless to process the transient X login browser session. No provider token is configured by default, and the route is not active without both settings. A configured route still requires a fresh-context restore and real-post verification before its X profile becomes active.

## Running locally

```bash
SELF_HOSTED_BROWSER_BRIDGE_AUTH=<generated secret> corepack pnpm browser-bridge:dev
```

Binds `127.0.0.1:8789` by default. Startup prints only: provider, listen mode, transport, whether auth is configured, max sessions, whether Chromium is available. It refuses to start without a credential, on a non-loopback address without `BROWSER_BRIDGE_EXPOSE_NETWORK=true`, or (non-loopback / `NODE_ENV=production`) without native TLS (`BROWSER_BRIDGE_TLS_CERT_FILE`/`_KEY_FILE`) or an explicitly declared TLS-terminating boundary (`BROWSER_BRIDGE_TLS_TERMINATED=true`). Test mode is refused in production.

## Tests

`corepack pnpm --filter @distilled/browser-bridge test` runs, against real Chromium and a local synthetic site with no external credentials: the full lifecycle, session restore/capture, CAPTCHA `DETECT_ONLY`, handle fencing, redirect/private-network denial, cleanup on abandonment/shutdown/cancellation, the adversarial protocol matrix, and synthetic-marker secret-leak checks (logs, responses, errors, observations, service state, browser temp files).

## Manual X login from Windows CMD

The existing `corepack pnpm bootstrap:x --profile ...` queues an automated,
headless bootstrap using stored credentials. For operator-driven login, deploy
this revision of the Worker (it adds the protected
`POST /v1/authenticated-profiles/manual-bootstrap` route), then run from the
repository root:

```cmd
corepack pnpm bootstrap:x:manual
```

This automatically selects the sole eligible existing X profile. If multiple X
profiles exist, select one explicitly (the ID is safe metadata):

```cmd
corepack pnpm bootstrap:x:manual --profile authenticated_profile_id
```

The command reads only the operator endpoint and service-token configuration from
`apps/worker/.dev.vars` and the process environment. `WEB_OPERATOR_RUNTIME_URL`
defaults to `https://distilled.news`; HTTPS is mandatory. It uses
`AUTH_PROFILE_BOOTSTRAP_TOKEN` when configured, otherwise
`WEB_OPERATOR_RUNTIME_TOKEN`. These are operator service credentials, never X
login information. Do not put X credentials, cookies, MFA codes, or session tokens
in arguments or environment variables. The command accepts only `--profile`.
No encryption keys or stored X passwords are downloaded. Chromium receives only
OS and display environment settings; operator secrets are never inherited by it.
Chromium must already be installed for Playwright; if needed:

```cmd
corepack pnpm exec playwright install chromium
```

The manual path intentionally uses the existing `SelfHostedChromiumProvider` on
this computer: remote Cloudflare browsers cannot display a local window. It
retains the provider's origin, request-method, redirect and transport guards.
Sign into X and complete verification in the visible isolated Chromium window
within ten minutes. Challenge observations go through the existing
`ChallengeCoordinator` with a detect-only provider; the operator resolves them
in the browser. The CLI polls the existing X adapter, requiring the signed-in
account navigation as well as an authenticated URL before capture.

The Worker fences the admission to the active owner, profile version and expiry.
`AuthenticatedBrowserLifecycle.captureManualSession` uses the existing
`AuthenticatedProfileService` / `ProfileEnvelopeCrypto` session store to encrypt
with AES-256-GCM and persist in R2. Credential retrieval is skipped entirely.
Session state travels transiently over HTTPS; no plaintext session file is
created. Protocol debug logging is disabled and errors never include provider
text, session material or response bodies.

The original browser is closed. The Worker decrypts the persisted R2 session and returns it transiently through
the protected route. The CLI imports it into a fresh isolated
browser context, visits X home and checks signed-in account navigation and the
restored authentication cookie. Only successful verification enables acquisition.
Until then, the profile stays `REAUTH_REQUIRED`, including after cancellation,
restore failure or an abandoned command. An admission is single-attempt and
expires after ten minutes; restore material is no longer accessible through that
admission after verification. Both browser contexts are cleaned up.

Success prints only:

```text
Encrypted X session persisted. Fresh browser context restored successfully. Profile is ready for acquisition.
```

The encrypted blob and fresh-context restore are tested against Miniflare D1/R2
and real Chromium using synthetic X state. A live X session is verified only
when the operator finishes this command; synthetic tests do not establish a
live login.
