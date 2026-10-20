import {defineConfig} from 'vitest/config';
export default defineConfig({test:{environment:'node',include:['benchmarks/cloudflare-real-evaluation.test.ts'],maxWorkers:1,testTimeout:900000}});
