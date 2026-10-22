import {defineConfig} from 'vitest/config';
export default defineConfig({test:{environment:'node',include:['benchmarks/article-first-evidence.test.ts'],maxWorkers:1,testTimeout:30000}});
