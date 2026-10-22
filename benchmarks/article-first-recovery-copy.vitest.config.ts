import {defineConfig} from 'vitest/config';export default defineConfig({test:{environment:'node',include:['benchmarks/article-first-recovery-copy.test.ts'],maxWorkers:1}});
