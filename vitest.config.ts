import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      "packages/contracts/vitest.config.ts",
      "packages/agent-runtime/vitest.config.ts",
      "packages/core/vitest.config.ts",
      "packages/briefing/vitest.config.ts",
      "packages/connectors/vitest.config.ts",
      "apps/worker/vitest.config.ts",
      "apps/web/vitest.config.ts"
    ]
  }
});
