import type { ConnectorBatch, ConnectorKind } from "./contracts";
export function httpOutcome(connector: ConnectorKind, status: number, headers: Record<string,string>, start: number, now: number): ConnectorBatch {
  const retry = headers["retry-after"];
  const seconds = retry && /^\d+$/.test(retry) ? Number(retry)*1000 : retry ? Date.parse(retry)-now : undefined;
  return { connector, observations:[], coverage:{completeness:"unknown",reason:`http_${status}`},
    retry:{kind: status===429 ? "rate_limit" : status===401 || status===403 ? "auth_required" : status>=500 || status===0 ? "transient" : "permanent",
      afterMs:seconds!==undefined && Number.isFinite(seconds)?Math.min(86400000,Math.max(1000,seconds)):undefined,reason:`http_${status}`},
    telemetry:{requests:1,latencyMs:Math.max(0,now-start),providerCostUsd:0} };
}
