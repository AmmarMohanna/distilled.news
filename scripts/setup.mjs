#!/usr/bin/env node

console.log(`
LowNoise.news setup

1. Copy .env.example to .env and fill in Cloudflare, Telegram, and OpenAI values.
2. Run: pnpm install
3. Run: pnpm db:migrate
4. Run: pnpm deploy

Cloudflare resource creation is intentionally explicit in V1 so self-hosters can
inspect names, billing impact, and generated IDs before deployment.
`);
