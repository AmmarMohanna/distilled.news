import {defineConfig} from 'vitest/config';
export default defineConfig({test:{include:['benchmarks/publication-day-preflight.test.ts','benchmarks/publication-day-live.test.ts','benchmarks/publication-day-raw-replay.test.ts','benchmarks/publication-day-v5-replay.test.ts'],environment:'node',pool:'forks',maxWorkers:1}});
