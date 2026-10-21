import {defineConfig} from 'vitest/config';export default defineConfig({test:{environment:'node',include:['benchmarks/v2-comparison-draft-response-replay.test.ts'],maxWorkers:1}});
