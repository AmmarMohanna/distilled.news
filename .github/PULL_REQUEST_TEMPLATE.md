## What changes

<!-- Describe the user/operator outcome and keep the scope focused. -->

## Risk and rollback

- Migration or data-retention impact:
- Security, privacy, and abuse impact:
- Provider/model cost impact:
- Rollback or forward-recovery path:

## Verification

- [ ] `pnpm release:check -- --e2e --audit`
- [ ] New or changed behavior has focused tests
- [ ] Documentation and generated Wrangler types are current
- [ ] No secret, production export, real user identifier, or canary credential is included

## Release impact

- [ ] No deployment required
- [ ] Staging canary must restart
- [ ] Production migration or protected workflow required
