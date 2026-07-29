# Contributing

Distilled.news accepts focused issues and pull requests that preserve the
Cloudflare-first, public-feed product direction.

## Development

Use Node 24 and pnpm 10.12.1:

```sh
pnpm install --frozen-lockfile
pnpm setup
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

`pnpm setup` writes local files only. `pnpm doctor` is read-only. Never point a
development command at the production D1, R2 bucket, queues, routes, or domain.

Before opening a pull request, run:

```sh
pnpm wrangler:types:check
pnpm ci:migrations
pnpm release:dry-run
pnpm ci:readiness
```

## Change rules

- Add D1 changes as forward-only numbered migrations. Test a clean database and
  an upgrade from the migration-24 fixture.
- Update `wrangler.jsonc` and regenerate `worker-configuration.d.ts` together.
- Keep production registration closed until canary evidence approves opening it.
- Do not add private-feed claims, Vectorize, a chatbot, or public Q&A without a
  separately reviewed product decision.
- Keep secrets out of source, examples, fixtures, logs, screenshots, and PR text.
- Add tests for behavior changes and document new operational failure modes.
- Preserve public-source attribution and do not bypass publisher restrictions.

Pull requests should explain user impact, migration and rollback behavior,
security/cost effects, and the verification performed. Contributions are
licensed under Apache-2.0.
