import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  "packages/agent-runtime/vitest.config.ts",
  "packages/core/vitest.config.ts",
  "packages/connectors/vitest.config.ts",
  "apps/worker/vitest.config.ts",
  "apps/web/vitest.config.ts"
]);
