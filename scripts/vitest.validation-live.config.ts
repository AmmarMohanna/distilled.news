import {defineConfig} from 'vitest/config';
export default defineConfig({test:{include:['benchmarks/validation-contract-live-evaluation.test.ts'],environment:'node',pool:'forks',maxWorkers:1}});
