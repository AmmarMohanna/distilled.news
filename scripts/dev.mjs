import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { stopWindowsProcessTree } from "./process-tree.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const webDir = resolve(root, "apps/web");
const workerDir = resolve(root, "apps/worker");
const vite = resolve(webDir, "node_modules/vite/bin/vite.js");
const wrangler = resolve(workerDir, "node_modules/wrangler/bin/wrangler.js");
const children = new Set();
let stopping = false;
const originalRawMode = process.stdin.isRaw ?? false;

function releaseInput() {
  if (process.stdin.isTTY) process.stdin.setRawMode(originalRawMode);
  process.stdin.pause();
}

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  releaseInput();
  console.log("\nStopping local servers…");
  if (children.size === 0) return;
  if (process.platform === "win32") {
    // Wrangler launches another Node process and workerd. Killing only the
    // immediate children leaves those descendants (and their ports) alive.
    // Target our own tree so even partially started setup processes stop.
    stopWindowsProcessTree(process.pid).catch(error => {
      console.error(`Could not stop the server tree: ${error.message}`);
      stopping = false;
    });
    return;
  }
  for (const child of children) child.kill();
}

function run(script, args, cwd) {
  const child = spawn(process.execPath, [script, ...args], {
    cwd,
    // Only this launcher owns keyboard input. Wrangler's interactive terminal
    // otherwise consumes Ctrl+C without notifying the parent launcher.
    stdio: ["ignore", "inherit", "inherit"],
    windowsHide: true,
    env: { ...process.env, WRANGLER_SEND_METRICS: "false" }
  });
  children.add(child);
  child.once("exit", () => children.delete(child));
  child.once("error", error => { console.error(error.message); stop(1); });
  return child;
}

async function prepare(script, args, cwd) {
  const code = await new Promise(resolveExit => {
    const child = run(script, args, cwd);
    child.once("exit", resolveExit);
    child.once("error", () => resolveExit(1));
  });
  if (code !== 0 || stopping) throw new Error("Local development setup did not finish.");
}

async function checkDevelopmentPorts() {
  const occupied = [];
  for (const port of [5173, 8787]) {
    await new Promise((resolvePort, reject) => {
      const probe = createServer();
      probe.once("error", error => {
        if (error.code === "EADDRINUSE") {
          occupied.push(port);
          resolvePort();
        } else reject(error);
      });
      probe.listen({ host: "127.0.0.1", port, exclusive: true }, () => probe.close(resolvePort));
    });
  }
  if (occupied.length) {
    throw new Error(`Development port(s) ${occupied.join(", ")} already in use. Stop the earlier development terminal with Ctrl+C, then run node scripts/dev.mjs again. No assets were rebuilt; the existing servers were left running.`);
  }
}

process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on("data", data => {
    if (data.includes(3)) stop();
  });
}
process.on("exit", releaseInput);

try {
  if (!existsSync(vite) || !existsSync(wrangler)) throw new Error("Install workspace dependencies first: npx.cmd pnpm@10.12.1 install");
  // Rebuilding dist under a running Worker invalidates its asset manifest.
  // Check both ports before touching assets or starting another process tree.
  await checkDevelopmentPorts();
  // Wrangler serves dist directly; rebuild so restarting never serves old UI.
  await prepare(vite, ["build"], webDir);
  await prepare(wrangler, ["d1", "migrations", "apply", "DB", "--local"], workerDir);
  // Default dev mode runs locally but permits explicitly remote bindings (AI).
  // --local disables those bindings, so image generation cannot work with it.
  const worker = run(wrangler, ["dev", "--ip", "127.0.0.1", "--port", "8787"], workerDir);
  const web = run(vite, [], webDir);
  for (const child of [worker, web]) child.once("exit", code => stop(code ?? 0));
  console.log("\nOpen http://127.0.0.1:5173 in your browser once both servers are ready. Keep this terminal open; Ctrl+C stops both.\n");
} catch (error) {
  console.error(error.message);
  stop(1);
}
