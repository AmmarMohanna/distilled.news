import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts"],
    // Each recovery worker may own both a Miniflare workerd process and a
    // Playwright browser. Bound file concurrency so process scheduling cannot
    // starve an in-flight crash-recovery assertion past its invariant timeout.
    maxWorkers: 4
  }
});
