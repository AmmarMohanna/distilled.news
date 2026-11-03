import {defineConfig} from 'vitest/config';export default defineConfig({test:{environment:'node',include:['benchmarks/v7-evidence.prepare.test.ts'],maxWorkers:1}});
