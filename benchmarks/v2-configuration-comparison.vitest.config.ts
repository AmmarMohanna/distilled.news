import {defineConfig} from 'vitest/config';export default defineConfig({test:{environment:'node',include:['benchmarks/v2-configuration-comparison.test.ts'],maxWorkers:1}});
