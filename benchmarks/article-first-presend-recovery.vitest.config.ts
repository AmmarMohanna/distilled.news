import {defineConfig} from 'vitest/config';export default defineConfig({test:{environment:'node',include:['benchmarks/article-first-presend-recovery.test.ts'],maxWorkers:1}});
