import {defineConfig} from 'vitest/config';

/** Opt-in read-path profiling. Not part of `pnpm test`: run with
 * `pnpm --filter @distilled/worker exec vitest run --config vitest.perf.config.ts`. */
export default defineConfig({test:{environment:'node',globals:true,include:['src/perf/**/*.perf.ts'],hookTimeout:300_000,testTimeout:300_000,maxWorkers:1}});
