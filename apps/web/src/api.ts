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

  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? `Request failed: ${response.status}`);
  return payload;
}

export async function getSession(): Promise<SessionStatus> {
  return requestJson<SessionStatus>("/api/admin/session");
}

export async function login(password: string, setupToken?: string): Promise<void> {
  await requestJson("/api/admin/session", {
    method: "POST",
    body: JSON.stringify({ password, setupToken })
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

export async function getSources(): Promise<TelegramSourceRecord[]> {
  const payload = await requestJson<{ sources: TelegramSourceRecord[] }>("/api/admin/sources");
  return payload.sources;
}

export async function setSourceEnabled(sourceId: string, enabled: boolean): Promise<TelegramSourceRecord[]> {
  const payload = await requestJson<{ sources: TelegramSourceRecord[] }>("/api/admin/sources", {
    method: "POST",
    body: JSON.stringify({ sourceId, enabled })
  });
  return payload.sources;
}

export async function registerWebhook(): Promise<string> {
  const payload = await requestJson<{ webhookUrl: string }>("/api/admin/telegram/register-webhook", {
    method: "POST"
  });
  return payload.webhookUrl;
}

export async function getHealth(): Promise<HealthStatus> {
  const payload = await requestJson<{ health: HealthStatus }>("/api/admin/health");
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
