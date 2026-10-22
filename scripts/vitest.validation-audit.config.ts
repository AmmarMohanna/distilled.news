import {defineConfig} from 'vitest/config';
export default defineConfig({test:{include:['benchmarks/validation-precheck-audit.test.ts'],environment:'node',pool:'forks',maxWorkers:1}});
