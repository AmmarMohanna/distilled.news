import {defineConfig} from 'vitest/config';export default defineConfig({test:{environment:'node',include:['benchmarks/v2-comparison-draft-verification.test.ts'],maxWorkers:1,testTimeout:14400000}});
