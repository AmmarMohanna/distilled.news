import {defineConfig} from 'vitest/config';
export default defineConfig({test:{environment:'node',include:['benchmarks/article-first-relationship-replay.test.ts'],maxWorkers:1}});
