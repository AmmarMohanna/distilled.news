import {defineConfig} from 'vitest/config';
export default defineConfig({test:{include:['benchmarks/minimal-construction.test.ts'],environment:'node',pool:'forks',maxWorkers:1}});
