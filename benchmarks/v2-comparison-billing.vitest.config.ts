import {defineConfig} from 'vitest/config';export default defineConfig({test:{environment:'node',include:['benchmarks/v2-comparison-billing-recovery.test.ts'],maxWorkers:1,testTimeout:60000}});
