import {defineConfig} from 'vitest/config';
export default defineConfig({test:{include:['benchmarks/validation-contract-evaluation.test.ts','benchmarks/validation-contract-real-model-replay.test.ts'],environment:'node',pool:'forks',maxWorkers:1}});
