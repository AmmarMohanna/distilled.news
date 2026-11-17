import {defineConfig} from 'vitest/config';export default defineConfig({test:{environment:'node',include:['benchmarks/article-first-verifier-challenge.test.ts'],maxWorkers:1,testTimeout:600000}});
