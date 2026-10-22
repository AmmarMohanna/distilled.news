import {defineConfig} from 'vitest/config';
export default defineConfig({test:{include:['benchmarks/article-first.test.ts'],environment:'node',pool:'forks',maxWorkers:1}});
