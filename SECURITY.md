# Security policy

## Supported versions

Security fixes are made on the `main` branch. Hosted releases are required to
come from a reviewed commit on protected `main`; a release is blocked while
that control is unavailable. Self-hosters should track current releases; older
commits may not receive patches.

## Report a vulnerability

Do not open a public issue for a suspected vulnerability. Use GitHub's private
security-advisory form for this repository. Include affected commit or URL,
reproduction steps, impact, and whether any account or data was accessed.

Do not access other users' data, persist after proving impact, degrade the
service, run broad automated scans, or disclose a report before a fix and
coordinated publication.

We aim to acknowledge a complete report within 3 business days, provide an
initial severity assessment within 7 business days, and coordinate remediation
and disclosure based on risk. These are response targets, not guarantees.

## In scope

- Authentication, session, account-recovery, and authorization bypasses.
- Public-feed isolation, cross-account access, and admin privilege escalation.
- Queue, D1, R2, email, source-ingestion, and webhook security boundaries.
- Secret exposure, injection, request forgery, stored cross-site scripting, and
  material denial-of-service paths.
- Budget-control bypasses that can cause unauthorized paid-provider or model use.

Third-party provider outages and content accuracy without a security impact are
operational or editorial issues, not vulnerabilities.

## Operator requirements

Keep `.env`, `.dev.vars`, backups, API tokens, and database exports out of Git.
Use separate least-privilege Cloudflare credentials for CI and operators.
Rotate a secret immediately if it may have been exposed, invalidate affected
sessions, preserve evidence, and document containment, recovery, and follow-up.
