import {defineConfig} from 'vitest/config';export default defineConfig({test:{environment:'node',include:['benchmarks/editorial-targeted.prepare.test.ts'],maxWorkers:1}});
