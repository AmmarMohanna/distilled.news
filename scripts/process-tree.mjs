import { spawn } from "node:child_process";

export function stopWindowsProcessTree(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error("Invalid process ID");
  return new Promise((resolve, reject) => {
    const killer = spawn("taskkill.exe", ["/PID", String(pid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore"
    });
    killer.once("error", reject);
    killer.once("exit", code => code === 0 ? resolve() : reject(new Error(`taskkill exited with code ${code}`)));
  });
}
