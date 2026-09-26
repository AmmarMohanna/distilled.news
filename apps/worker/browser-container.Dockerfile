FROM mcr.microsoft.com/playwright:v1.61.0-noble AS browser_use_python

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
# Cloudflare's registry proxy has repeatedly closed the connection on a single
# 319 MB venv layer. Partition site-packages into smaller, reproducible layers.
# The Google API static discovery documents are unused by ChatOpenAI and add
# roughly 93 MB to the runtime image; keep the library itself available.
RUN rm -rf /opt/distilled-browser-use/lib/python3.12/site-packages/googleapiclient/discovery_cache/documents \
    && /opt/distilled-browser-use/bin/python -c "import browser_use; import googleapiclient.discovery; from importlib.metadata import version; assert version('browser-use') == '0.13.10'"
RUN set -eu; packages=/opt/distilled-browser-use/lib/python3.12/site-packages; \
    mkdir -p /opt/browser-use-packages/ac /opt/browser-use-packages/df /opt/browser-use-packages/g /opt/browser-use-packages/hl /opt/browser-use-packages/im /opt/browser-use-packages/no /opt/browser-use-packages/pa_pi /opt/browser-use-packages/pj_pz /opt/browser-use-packages/qs /opt/browser-use-packages/tz /opt/browser-use-packages/other; \
    for item in "$packages"/* "$packages"/.[!.]*; do \
      [ -e "$item" ] || continue; name="${item##*/}"; \
      case "$name" in [a-cA-C]*) group=ac;; [d-fD-F]*) group=df;; [gG]*) group=g;; [h-lH-L]*) group=hl;; [i-mI-M]*) group=im;; [n-oN-O]*) group=no;; [pP][a-iA-I]*) group=pa_pi;; [pP]*) group=pj_pz;; [q-sQ-S]*) group=qs;; [t-zT-Z]*) group=tz;; *) group=other;; esac; \
      mv "$item" "/opt/browser-use-packages/$group/"; \
    done

# Preserve the deployed Node dependency layer; Python is copied in separately.
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
COPY --from=browser_use_python /opt/distilled-browser-use /opt/distilled-browser-use
COPY --from=browser_use_python /opt/browser-use-packages/ac/ /opt/distilled-browser-use/lib/python3.12/site-packages/
COPY --from=browser_use_python /opt/browser-use-packages/df/ /opt/distilled-browser-use/lib/python3.12/site-packages/
COPY --from=browser_use_python /opt/browser-use-packages/g/ /opt/distilled-browser-use/lib/python3.12/site-packages/
COPY --from=browser_use_python /opt/browser-use-packages/hl/ /opt/distilled-browser-use/lib/python3.12/site-packages/
COPY --from=browser_use_python /opt/browser-use-packages/im/ /opt/distilled-browser-use/lib/python3.12/site-packages/
COPY --from=browser_use_python /opt/browser-use-packages/no/ /opt/distilled-browser-use/lib/python3.12/site-packages/
COPY --from=browser_use_python /opt/browser-use-packages/pa_pi/ /opt/distilled-browser-use/lib/python3.12/site-packages/
COPY --from=browser_use_python /opt/browser-use-packages/pj_pz/ /opt/distilled-browser-use/lib/python3.12/site-packages/
COPY --from=browser_use_python /opt/browser-use-packages/qs/ /opt/distilled-browser-use/lib/python3.12/site-packages/
COPY --from=browser_use_python /opt/browser-use-packages/tz/ /opt/distilled-browser-use/lib/python3.12/site-packages/
COPY --from=browser_use_python /opt/browser-use-packages/other/ /opt/distilled-browser-use/lib/python3.12/site-packages/
RUN chromium_path="$(find /ms-playwright -type f -path '*/chrome-linux64/chrome' -print -quit)" \
    && test -n "$chromium_path" && ln -s "$chromium_path" /usr/local/bin/distilled-chromium \
    && /opt/distilled-browser-use/bin/python -c "import browser_use; from importlib.metadata import version; assert version('browser-use') == '0.13.10'"

ENV DISTILLED_BROWSER_USE_PYTHON=/opt/distilled-browser-use/bin/python
ENV DISTILLED_BROWSER_USE_CHROMIUM=/usr/local/bin/distilled-chromium
ENV ANONYMIZED_TELEMETRY=false
ENV BROWSER_USE_CLOUD_SYNC=false
ENV NODE_ENV=production
EXPOSE 8080
CMD ["pnpm", "--filter", "@distilled/browser-bridge", "exec", "tsx", "src/server.ts"]
