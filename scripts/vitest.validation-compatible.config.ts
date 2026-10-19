import {defineConfig} from 'vitest/config';
export default defineConfig({test:{include:['benchmarks/validation-compatible-evaluation.test.ts','benchmarks/validation-compatible-replay.test.ts'],environment:'node',pool:'forks',maxWorkers:1}});
