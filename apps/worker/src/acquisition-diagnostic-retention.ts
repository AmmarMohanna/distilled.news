import type { Env } from "./types";

/** Remove terminal operator diagnostics after their bounded review window. */
export async function expireAcquisitionDiagnostics(db:Env["DB"],now=new Date()):Promise<void>{
  const requestsBefore=new Date(now.getTime()-30*24*60*60_000).toISOString();
  const telemetryBefore=new Date(now.getTime()-90*24*60*60_000).toISOString();
  await db.prepare("DELETE FROM public_acquisition_requests WHERE state IN ('completed','failed') AND completed_at<?").bind(requestsBefore).run();
  await db.prepare("DELETE FROM authenticated_x_acquisition_requests WHERE state IN ('completed','failed') AND completed_at<?").bind(requestsBefore).run();
  await db.prepare("DELETE FROM browser_use_discovery_runs WHERE completed_at<?").bind(telemetryBefore).run();
  await db.prepare("DELETE FROM bounded_decision_events WHERE created_at<?").bind(telemetryBefore).run();
}
