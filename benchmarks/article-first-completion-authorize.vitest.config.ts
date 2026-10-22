import {defineConfig} from 'vitest/config';
export default defineConfig({test:{environment:'node',include:['benchmarks/article-first-completion-authorize.test.ts'],maxWorkers:1}});
