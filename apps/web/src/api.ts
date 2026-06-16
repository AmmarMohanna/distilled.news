import type { BriefingConfig } from "@lownoise/core";
import type { FeedPayload, HealthStatus, SessionStatus, TelegramSourceRecord } from "./types";

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {})
    },
    ...init
  });

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error("Worker API is not available from this web preview.");
  }

  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? `Request failed: ${response.status}`);
  return payload;
}

export async function getSession(): Promise<SessionStatus> {
  return requestJson<SessionStatus>("/api/admin/session");
}

export async function login(username: string, password: string, setupToken?: string): Promise<void> {
  await requestJson("/api/admin/session", {
    method: "POST",
    body: JSON.stringify({ username, password, setupToken })
  });
}

export async function logout(): Promise<void> {
  await requestJson("/api/admin/session", {
    method: "DELETE"
  });
}

export async function getBriefings(): Promise<BriefingConfig[]> {
  const payload = await requestJson<{ briefings: BriefingConfig[] }>("/api/admin/briefings");
  return payload.briefings;
}

export async function saveBriefing(briefing: BriefingConfig): Promise<BriefingConfig> {
  const payload = await requestJson<{ briefing: BriefingConfig }>("/api/admin/briefings", {
    method: "POST",
    body: JSON.stringify(briefing)
  });
  return payload.briefing;
}

export async function getSources(briefingId: string): Promise<TelegramSourceRecord[]> {
  const payload = await requestJson<{ sources: TelegramSourceRecord[] }>(
    `/api/admin/sources?briefingId=${encodeURIComponent(briefingId)}`
  );
  return payload.sources;
}

export async function addPublicTelegramSource(briefingId: string, url: string): Promise<TelegramSourceRecord[]> {
  const payload = await requestJson<{ sources: TelegramSourceRecord[] }>("/api/admin/sources", {
    method: "POST",
    body: JSON.stringify({ briefingId, url })
  });
  return payload.sources;
}

export async function setSourceEnabled(
  briefingId: string,
  sourceId: string,
  enabled: boolean
): Promise<TelegramSourceRecord[]> {
  const payload = await requestJson<{ sources: TelegramSourceRecord[] }>("/api/admin/sources", {
    method: "POST",
    body: JSON.stringify({ briefingId, sourceId, enabled })
  });
  return payload.sources;
}

export async function refreshPublicTelegramSources(briefingId: string): Promise<TelegramSourceRecord[]> {
  const payload = await requestJson<{ sources: TelegramSourceRecord[] }>("/api/admin/sources/refresh", {
    method: "POST",
    body: JSON.stringify({ briefingId })
  });
  return payload.sources;
}

export async function deleteSource(briefingId: string, sourceId: string): Promise<TelegramSourceRecord[]> {
  const payload = await requestJson<{ sources: TelegramSourceRecord[] }>(
    `/api/admin/sources/${encodeURIComponent(sourceId)}?briefingId=${encodeURIComponent(briefingId)}`,
    {
      method: "DELETE"
    }
  );
  return payload.sources;
}

export async function getHealth(briefingId: string): Promise<HealthStatus> {
  const payload = await requestJson<{ health: HealthStatus }>(
    `/api/admin/health?briefingId=${encodeURIComponent(briefingId)}`
  );
  return payload.health;
}

export async function getFeed(slug: string): Promise<FeedPayload> {
  return requestJson<FeedPayload>(`/api/feed/${encodeURIComponent(slug)}`);
}

export async function searchFeed(slug: string, query: string): Promise<FeedPayload["items"]> {
  const payload = await requestJson<{ items: FeedPayload["items"] }>(
    `/api/feed/${encodeURIComponent(slug)}/search?q=${encodeURIComponent(query)}`
  );
  return payload.items;
}
