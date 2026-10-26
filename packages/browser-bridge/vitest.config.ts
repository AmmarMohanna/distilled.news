import {defineConfig} from "vitest/config";
export default defineConfig({test:{environment:"node",maxWorkers:process.platform==="win32"?1:3,globals:true,include:["test/**/*.test.ts"],testTimeout:30_000}});
