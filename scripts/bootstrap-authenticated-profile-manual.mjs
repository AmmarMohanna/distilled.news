import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { pathToFileURL,fileURLToPath } from "node:url";

// Start the runtime with protocol/HTTP debugging disabled before Node initializes.
const environment={...process.env};
for(const name of ["DEBUG","PWDEBUG","NODE_DEBUG","NODE_DEBUG_NATIVE","NODE_OPTIONS","NODE_TLS_REJECT_UNAUTHORIZED"])delete environment[name];
const require=createRequire(new URL("../packages/browser-bridge/package.json",import.meta.url));
try{
  const child=spawn(process.execPath,["--import",pathToFileURL(require.resolve("tsx")).href,fileURLToPath(new URL("../packages/browser-bridge/src/manual-bootstrap.ts",import.meta.url)),...process.argv.slice(2)],{cwd:fileURLToPath(new URL("..",import.meta.url)),env:environment,stdio:"inherit",windowsHide:true});
  child.once("error",()=>{console.error("Unable to start manual bootstrap runtime.");process.exitCode=1});
  child.once("exit",code=>{process.exitCode=code??1});
}catch{console.error("Unable to start manual bootstrap runtime. Install repository dependencies first.");process.exitCode=1}
