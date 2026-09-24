FROM mcr.microsoft.com/playwright:v1.61.0-noble

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json ./apps/web/package.json
COPY apps/worker/package.json ./apps/worker/package.json
COPY packages/agent-runtime/package.json ./packages/agent-runtime/package.json
COPY packages/browser-bridge/package.json ./packages/browser-bridge/package.json
COPY packages/connectors/package.json ./packages/connectors/package.json
COPY packages/core/package.json ./packages/core/package.json

# The bridge runs directly from the reviewed TypeScript source using the
# workspace's pinned tsx/Playwright versions. No browser state is copied into
# or written by the image.
RUN pnpm install --frozen-lockfile

# Source edits must invalidate the runtime layer, not the workspace install.
COPY apps ./apps
COPY packages ./packages

ENV NODE_ENV=production
EXPOSE 8080
CMD ["pnpm", "--filter", "@distilled/browser-bridge", "exec", "tsx", "src/server.ts"]
