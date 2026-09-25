FROM mcr.microsoft.com/playwright:v1.61.0-noble

WORKDIR /app
RUN corepack enable

# Browser Use runs only in the Container. The Playwright base supplies Chromium
# and its OS dependencies; Noble supplies Python 3.12.
RUN apt-get update && apt-get install -y --no-install-recommends python3.12 python3.12-venv ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN python3.12 -m venv /opt/distilled-browser-use \
    && /opt/distilled-browser-use/bin/pip install --no-cache-dir --upgrade pip==25.2 \
    && /opt/distilled-browser-use/bin/pip install --no-cache-dir browser-use==0.13.10 \
    && /opt/distilled-browser-use/bin/python -c "import browser_use; from importlib.metadata import version; assert version('browser-use') == '0.13.10'; print('browser-use', version('browser-use'))"
RUN chromium_path="$(find /ms-playwright -type f -path '*/chrome-linux64/chrome' -print -quit)" \
    && test -n "$chromium_path" && ln -s "$chromium_path" /usr/local/bin/distilled-chromium
ENV DISTILLED_BROWSER_USE_PYTHON=/opt/distilled-browser-use/bin/python
ENV DISTILLED_BROWSER_USE_CHROMIUM=/usr/local/bin/distilled-chromium
ENV ANONYMIZED_TELEMETRY=false
ENV BROWSER_USE_CLOUD_SYNC=false

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
