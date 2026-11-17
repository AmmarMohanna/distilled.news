import {defineConfig} from 'vitest/config';
export default defineConfig({test:{environment:'node',include:['evaluation/briefing-quality/*.test.ts'],maxWorkers:1}});
