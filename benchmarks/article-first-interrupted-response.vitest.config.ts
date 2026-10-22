import {defineConfig} from 'vitest/config';export default defineConfig({test:{environment:'node',include:['benchmarks/article-first-interrupted-response.test.ts'],maxWorkers:1,testTimeout:60000}});
