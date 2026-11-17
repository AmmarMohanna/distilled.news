import {defineConfig} from 'vitest/config';export default defineConfig({test:{environment:'node',include:['benchmarks/article-first-editorial-failure-replay.test.ts'],maxWorkers:1}});
