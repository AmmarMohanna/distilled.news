import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { repositoryRoot } from "../lib/release-config.mjs";

export const observationDirectory = resolve(repositoryRoot, ".canary-observations");
export const windowPath = resolve(observationDirectory, "window.json");

export function readObservationWindow() {
  if (!existsSync(windowPath)) return null;
  return JSON.parse(readFileSync(windowPath, "utf8"));
}

export function resetObservationWindow(reason, release = {}, resetFrom = null) {
  mkdirSync(observationDirectory, { recursive: true, mode: 0o700 });
  const window = {
    startedAt: new Date().toISOString(),
    reason,
    releaseSha: release.releaseSha ?? null,
    versionId: release.versionId ?? null
  };
  if (resetFrom !== null) window.resetFrom = resetFrom;
  writeFileSync(windowPath, `${JSON.stringify(window, null, 2)}\n`, { mode: 0o600 });
  return window;
}
