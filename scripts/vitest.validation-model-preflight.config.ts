import {defineConfig} from 'vitest/config';
export default defineConfig({test:{include:['benchmarks/validation-contract-model-preflight.test.ts'],environment:'node',pool:'forks',maxWorkers:1}});
