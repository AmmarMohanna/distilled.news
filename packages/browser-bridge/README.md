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

The self-hosted provider's CAPTCHA capability is `DETECT_ONLY`. A challenge is detected, recorded by `ChallengeCoordinator` as `UNSUPPORTED`, the bootstrap reports `CHALLENGE_REQUIRED`, and the browser is closed. There is no solving.

## Running locally

```bash
SELF_HOSTED_BROWSER_BRIDGE_AUTH=<generated secret> corepack pnpm browser-bridge:dev
```

Binds `127.0.0.1:8789` by default. Startup prints only: provider, listen mode, transport, whether auth is configured, max sessions, whether Chromium is available. It refuses to start without a credential, on a non-loopback address without `BROWSER_BRIDGE_EXPOSE_NETWORK=true`, or (non-loopback / `NODE_ENV=production`) without native TLS (`BROWSER_BRIDGE_TLS_CERT_FILE`/`_KEY_FILE`) or an explicitly declared TLS-terminating boundary (`BROWSER_BRIDGE_TLS_TERMINATED=true`). Test mode is refused in production.

## Tests

`corepack pnpm --filter @distilled/browser-bridge test` runs, against real Chromium and a local synthetic site with no external credentials: the full lifecycle, session restore/capture, CAPTCHA `DETECT_ONLY`, handle fencing, redirect/private-network denial, cleanup on abandonment/shutdown/cancellation, the adversarial protocol matrix, and synthetic-marker secret-leak checks (logs, responses, errors, observations, service state, browser temp files).
