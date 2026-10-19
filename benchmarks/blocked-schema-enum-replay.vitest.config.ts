import{defineConfig}from'vitest/config';export default defineConfig({test:{include:['benchmarks/blocked-schema-enum-replay.test.ts'],environment:'node',maxWorkers:1}});
