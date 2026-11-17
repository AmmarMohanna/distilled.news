import {defineConfig} from 'vitest/config';
export default defineConfig({test:{include:['benchmarks/group-ownership-preflight.test.ts'],environment:'node',pool:'forks',maxWorkers:1}});
