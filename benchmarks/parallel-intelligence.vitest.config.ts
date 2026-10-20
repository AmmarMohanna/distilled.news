import {defineConfig} from 'vitest/config';
export default defineConfig({test:{environment:'node',include:['benchmarks/parallel-intelligence.test.ts','benchmarks/parallel-saved-evidence.test.ts'],maxWorkers:1,hookTimeout:60000,testTimeout:180000}});
