import type { BriefingConfig, BriefingEdition } from "@distilled/core";
import { preferredLanguage } from './LanguageControl';
import type { AccountRecord, AccountWithStats, FeedPayload, HealthStatus, PublicBriefing, SessionStatus, SourceRecord } from "./types";

export interface SourceIngestResult {
  sourceId: string;
  title?: string;
  url: string;
  fetched: number;
  imported: number;
  queued: number;
  skipped: number;
  runStarted?: boolean;
}

export interface SourceRefreshResult {
  sources: SourceRecord[];
  health: HealthStatus;
  results?: SourceIngestResult[];
  result?: SourceIngestResult;
}

export interface RetryProcessingResult {
  retried: number;
  health: HealthStatus;
}

export interface FeedStarResult {
  stars: number;
  viewerHasStarred: boolean;
}

export async function summarizeUnread(username:string,slug:string,readIds:string[]):Promise<{status:'ready';summary:string}|{status:'pending'|'empty'}>{
  return requestJson(`/api/feed/${encodeURIComponent(username)}/${encodeURIComponent(slug)}/unread-summary`,{method:'POST',body:JSON.stringify({readIds})});
}



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
    throw new Error(`Expected JSON from the Worker API but received ${contentType || "an unknown content type"}.`);
  }

  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? `Request failed: ${response.status}`);
  return payload;
}

export async function getSession(): Promise<SessionStatus> {
  return requestJson<SessionStatus>("/api/auth/session");
}

export async function setupAdmin(input: {
  email: string;
  username: string;
  password: string;
  setupToken: string;
}): Promise<AccountRecord> {
  const payload = await requestJson<{ account: AccountRecord }>("/api/auth/setup", {
    method: "POST",
    body: JSON.stringify(input)
  });
  return payload.account;
}

export async function register(input: {
  email: string;
  username: string;
  password: string;
  turnstileToken?: string;
}): Promise<void> {
  await requestJson("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ ...input, language: preferredLanguage() })
  });
}

export async function verifyEmail(token: string): Promise<AccountRecord> {
  const payload = await requestJson<{ account: AccountRecord }>("/api/auth/verify-email", {
    method: "POST",
    body: JSON.stringify({ token })
  });
  return payload.account;
}

export async function login(email: string, password: string, turnstileToken?: string): Promise<AccountRecord> {
  const payload = await requestJson<{ account: AccountRecord }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password, turnstileToken })
  });
  return payload.account;
}

export async function logout(): Promise<void> {
  const {stopNotificationsOnLogout}=await import("./pwa");
  await stopNotificationsOnLogout();
  await requestJson("/api/auth/logout", {
    method: "POST"
  });
}

export async function forgotPassword(email: string, turnstileToken?: string): Promise<void> {
  await requestJson("/api/auth/password/forgot", {
    method: "POST",
    body: JSON.stringify({ email, turnstileToken, language: preferredLanguage() })
  });
}

export async function resetPassword(token: string, password: string): Promise<void> {
  await requestJson("/api/auth/password/reset", {
    method: "POST",
    body: JSON.stringify({ token, password })
  });
}

export async function updateAccount(input: {
  username?: string;
  currentPassword?: string;
  newPassword?: string;
}): Promise<{ account: AccountRecord; briefings: BriefingConfig[] }> {
  return requestJson<{ account: AccountRecord; briefings: BriefingConfig[] }>("/api/me/account", {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export async function getBriefings(): Promise<BriefingConfig[]> {
  const payload = await requestJson<{ briefings: BriefingConfig[] }>("/api/me/briefings");
  return payload.briefings;
}

export type SaveFeedInput = Pick<BriefingConfig, "title" | "interestProfile" | "language" | "briefingTimezone" | "publicFeedEnabled"> & { id: string; sourceInputs: string[]; updateIntervalMinutes: 30 | 60 | 120 | 360 | 720 | 1440; briefingTimeOfDay?: string };
export async function saveFeed(input: SaveFeedInput): Promise<BriefingConfig> {
  const payload = await requestJson<{briefing:BriefingConfig}>("/api/me/feeds", {method:"POST",body:JSON.stringify(input)});
  return payload.briefing;
}

export async function saveBriefing(briefing: BriefingConfig): Promise<BriefingConfig> {
  const payload = await requestJson<{ briefing: BriefingConfig }>("/api/me/briefings", {
    method: "POST",
    body: JSON.stringify(briefing)
  });
  return payload.briefing;
}

export async function deleteBriefing(briefingId: string): Promise<BriefingConfig[]> {
  const payload = await requestJson<{ briefings: BriefingConfig[] }>(
    `/api/me/briefings/${encodeURIComponent(briefingId)}`,
    {
      method: "DELETE"
    }
  );
  return payload.briefings;
}

export async function getSources(briefingId: string): Promise<SourceRecord[]> {
  const payload = await requestJson<{ sources: SourceRecord[] }>(
    `/api/me/sources?briefingId=${encodeURIComponent(briefingId)}`
  );
  return payload.sources;
}

export async function addSource(briefingId: string, input: string): Promise<SourceRefreshResult> {
  return requestJson<SourceRefreshResult>("/api/me/sources", {
    method: "POST",
    body: JSON.stringify({ briefingId, input })
  });
}

export async function setSourceEnabled(
  briefingId: string,
  sourceId: string,
  enabled: boolean
): Promise<SourceRecord[]> {
  const payload = await requestJson<SourceRefreshResult>("/api/me/sources", {
    method: "POST",
    body: JSON.stringify({ briefingId, sourceId, enabled })
  });
  return payload.sources;
}

export async function refreshPublicTelegramSources(briefingId: string): Promise<SourceRefreshResult> {
  return requestJson<SourceRefreshResult>("/api/me/sources/refresh", {
    method: "POST",
    body: JSON.stringify({ briefingId })
  });
}

export async function deleteSource(briefingId: string, sourceId: string): Promise<SourceRefreshResult> {
  return requestJson<SourceRefreshResult>(
    `/api/me/sources/${encodeURIComponent(sourceId)}?briefingId=${encodeURIComponent(briefingId)}`,
    {
      method: "DELETE"
    }
  );
}

export async function getHealth(briefingId: string): Promise<HealthStatus> {
  const payload = await requestJson<{ health: HealthStatus }>(
    `/api/me/health?briefingId=${encodeURIComponent(briefingId)}`
  );
  return payload.health;
}

export async function retryProcessing(briefingId: string): Promise<RetryProcessingResult> {
  return requestJson<RetryProcessingResult>("/api/me/processing/retry", {
    method: "POST",
    body: JSON.stringify({ briefingId })
  });
}

export async function listAccounts(): Promise<AccountWithStats[]> {
  const payload = await requestJson<{ accounts: AccountWithStats[] }>("/api/admin/accounts");
  return payload.accounts;
}

export async function updateAdminAccount(
  accountId: string,
  input: { role?: "admin" | "user"; disabled?: boolean }
): Promise<{ account: AccountRecord; accounts: AccountWithStats[] }> {
  return requestJson<{ account: AccountRecord; accounts: AccountWithStats[] }>(
    `/api/admin/accounts/${encodeURIComponent(accountId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(input)
    }
  );
}

export async function deleteAdminAccount(
  accountId: string
): Promise<{ accounts: AccountWithStats[]; briefings: BriefingConfig[] }> {
  return requestJson<{ accounts: AccountWithStats[]; briefings: BriefingConfig[] }>(
    `/api/admin/accounts/${encodeURIComponent(accountId)}`,
    {
      method: "DELETE"
    }
  );
}

export async function listAdminBriefings(): Promise<BriefingConfig[]> {
  const payload = await requestJson<{ briefings: BriefingConfig[] }>("/api/admin/briefings");
  return payload.briefings;
}

export async function updateAdminBriefing(
  briefingId: string,
  input: { paused?: boolean }
): Promise<{ briefing: BriefingConfig; briefings: BriefingConfig[]; accounts: AccountWithStats[] }> {
  return requestJson<{ briefing: BriefingConfig; briefings: BriefingConfig[]; accounts: AccountWithStats[] }>(
    `/api/admin/briefings/${encodeURIComponent(briefingId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(input)
    }
  );
}

export async function deleteAdminBriefing(
  briefingId: string
): Promise<{ briefings: BriefingConfig[]; accounts: AccountWithStats[] }> {
  return requestJson<{ briefings: BriefingConfig[]; accounts: AccountWithStats[] }>(
    `/api/admin/briefings/${encodeURIComponent(briefingId)}`,
    {
      method: "DELETE"
    }
  );
}

export async function getFeed(username: string, slug: string): Promise<FeedPayload> {
  return requestJson<FeedPayload>(`/api/feed/${encodeURIComponent(username)}/${encodeURIComponent(slug)}`);
}

export async function getFeedEdition(username: string, slug: string, editionId: string): Promise<BriefingEdition> {
  const payload = await requestJson<{ edition: BriefingEdition }>(
    `/api/feed/${encodeURIComponent(username)}/${encodeURIComponent(slug)}/editions/${encodeURIComponent(editionId)}`
  );
  return payload.edition;
}

export async function getExploreFeeds(): Promise<PublicBriefing[]> {
  const feeds: PublicBriefing[] = [];
  let offset: number | null = 0;
  do {
    const payload: { feeds: PublicBriefing[]; nextOffset?: number | null } = await requestJson(`/api/explore/feeds?offset=${offset}`);
    feeds.push(...payload.feeds);
    offset = payload.nextOffset ?? null;
  } while (offset !== null);
  return feeds;
}

export async function searchFeed(username: string, slug: string, query: string): Promise<FeedPayload["editions"]> {
  const payload = await requestJson<{ editions: FeedPayload["editions"] }>(
    `/api/feed/${encodeURIComponent(username)}/${encodeURIComponent(slug)}/search?q=${encodeURIComponent(query)}`
  );
  return payload.editions;
}

export async function setFeedStar(username: string, slug: string, starred: boolean): Promise<FeedStarResult> {
  return requestJson<FeedStarResult>(`/api/feed/${encodeURIComponent(username)}/${encodeURIComponent(slug)}/star`, {
    method: "POST",
    body: JSON.stringify({ starred })
  });
}

export async function recommendSources(title: string, description: string): Promise<string[]> {
  const payload = await recommendSourceCandidates(title, description);
  return payload.sources;
}

export interface SourceAssessment {
  evidenceQuote?: string;
  input: string;
  status: "accepted" | "rejected" | "unverified" | "unavailable";
  reason: string;
  checkedAt: string;
}
export interface SourceRecommendations { sources: string[]; checks?: SourceAssessment[] }
export async function recommendSourceCandidates(title: string, description: string, onProgress?: (result:SourceRecommendations)=>void): Promise<SourceRecommendations> {
  if(!onProgress)return requestJson("/api/me/sources/recommend", { method: "POST", body: JSON.stringify({ title, description }) });
  const response=await fetch('/api/me/sources/recommend',{method:'POST',credentials:'include',headers:{'content-type':'application/json',accept:'application/x-ndjson'},body:JSON.stringify({title,description})});
  if(!response.ok){const result=await response.json().catch(()=>({}));throw new Error(result.error??`Request failed: ${response.status}`);}
  // Older deployments and deployments without assessment still return JSON.
  if(!response.headers.get('content-type')?.includes('application/x-ndjson'))return response.json();
  const reader=response.body?.getReader();if(!reader)throw new Error('Source recommendations unavailable');
  const decoder=new TextDecoder();let pending='',complete:SourceRecommendations|undefined;
  const consume=(line:string)=>{
    if(!line.trim())return;
    const event=JSON.parse(line) as SourceRecommendations&{type:string;error?:string};
    if(event.type==='error')throw new Error(event.error??'Source recommendations unavailable');
    if(!Array.isArray(event.sources))throw new Error('Invalid source recommendation response');
    if(event.type==='complete')complete={sources:event.sources,checks:event.checks};
    if(event.type==='progress'||event.type==='complete')onProgress({sources:event.sources,checks:event.checks});
  };
  try{
    for(;;){const {value,done}=await reader.read();pending+=decoder.decode(value,{stream:!done});if(pending.length>256_000)throw new Error('Source recommendation response too large');let end;while((end=pending.indexOf('\n'))>=0){consume(pending.slice(0,end));pending=pending.slice(end+1);}if(done)break;}
    consume(pending);
    if(!complete)throw new Error('Source recommendations were interrupted. Please try again.');
    return complete;
  }finally{await reader.cancel().catch(()=>undefined);reader.releaseLock();}
}
export async function assessSourceInput(title: string, description: string, source: string): Promise<SourceAssessment> {
  const payload = await requestJson<{ assessment: SourceAssessment }>("/api/me/sources/assess", { method: "POST", body: JSON.stringify({ title, description, source }) });
  return payload.assessment;
}

export async function setExploreFeed(id: string, featured: boolean): Promise<void> {
  await requestJson(`/api/admin/briefings/${encodeURIComponent(id)}/explore`, { method: "POST", body: JSON.stringify({ featured }) });
}
