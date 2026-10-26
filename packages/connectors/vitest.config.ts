import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Browser/SQLite integration files own native processes; bound host contention.
    maxWorkers: process.platform === "win32" ? 1 : 3,
    globals: true,
    testTimeout: 15_000,
    hookTimeout: 30_000,
    include: ["test/**/*.test.ts"]
  }
});
