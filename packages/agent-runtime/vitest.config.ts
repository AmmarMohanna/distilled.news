import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Browser/SQLite integration files own native processes; bound host contention.
    maxWorkers: process.platform === "win32" ? 1 : 3,
    globals: true,
    include: ["test/**/*.test.ts"],
    testTimeout: 30_000
  }
});
