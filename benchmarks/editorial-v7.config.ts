import {defineConfig} from 'vitest/config';export default defineConfig({test:{environment:'node',include:['benchmarks/editorial-v7.prepare.test.ts'],maxWorkers:1}});
