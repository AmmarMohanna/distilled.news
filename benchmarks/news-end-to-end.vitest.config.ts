import {defineConfig} from 'vitest/config';
export default defineConfig({test:{environment:'node',include:['benchmarks/news-end-to-end*.test.ts'],maxWorkers:1,testTimeout:180000,hookTimeout:60000}});
