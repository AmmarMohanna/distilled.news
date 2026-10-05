import type { CollectionBounds, ContentCompleteness, RepresentationKind, SourceRevision } from '@distilled/contracts';
import type { SourceScope, FetchRun } from './ports';

export type SourceFamily='rss'|'google_news'|'telegram'|'x_profile'|'x_search'|'linkedin_company'|'linkedin_profile'|'website'|'apify';
export interface SourceDefinition {
  family: SourceFamily;
  locator: string;
  /** Stable numeric Telegram peer ID, verified at registration; usernames are locators. */
  channelId?: string;
  language?: string;
  region?: string;
  public?: boolean;
  actorId?: string;
  actorInput?: Record<string,unknown>;
}
export interface SourceFetchRequest {
  /** Persisted downstream configuration fence, required by the Worker runtime. */
  configurationRevision?: number;
  scope: SourceScope;
  runId: string;
  source: SourceDefinition;
  requestedBounds: CollectionBounds;
  limit: number;
  continuation?: { providerId:string; token:string };
  recheckItemKeys?: string[];
}
export interface ProviderItem {
  sourceItemKey:string;
  upstreamId?:string;
  operation?:'UPSERT'|'DELETE';
  title?:string;
  body?:string;
  url?:string;
  publisherId?:string;
  publishedAt?:string;
  language?:string;
  representation:RepresentationKind;
  contentCompleteness:ContentCompleteness;
  sourceRevision?:SourceRevision;
  authoritativeCurrentState?:boolean;
  identityValid:boolean;
}
export interface ProviderPage {
  items:ProviderItem[];
  raw:Uint8Array;
  continuationToken?:string;
  /** Only provider-specific, independently justified prefix proof may populate this. */
  provenSafeCursor?:string;
  observedBounds?:CollectionBounds;
  complete?:boolean;
  requests:number;
  latencyMs:number;
  providerCostUsd:number|null;
}
export interface SourceProvider {
  id:string;
  families:SourceFamily[];
  fetch(request:SourceFetchRequest,run:FetchRun):Promise<ProviderPage>;
}
export type ProviderFailure='TRANSIENT'|'RATE_LIMIT'|'AUTH_REQUIRED'|'UNAVAILABLE'|'MALFORMED'|'CHALLENGE'|'POLICY_REFUSAL'|'UNCERTAIN_PAID_SUBMISSION'|'BUDGET_EXCEEDED';
export class SourceProviderError extends Error {
  constructor(readonly code:ProviderFailure,readonly retryNotBefore?:string) {super(code);}
}
export const DEFAULT_SOURCE_ORDER:Record<SourceFamily,readonly string[]>={
  rss:['rss_native','rss_feedparser'],google_news:['google_rss','google_apify'],
  telegram:['telegram_telethon','telegram_public'],x_profile:['x_twitterapi_io','x_apify'],x_search:['x_twitterapi_io','x_apify'],
  linkedin_company:['linkedin_apify'],linkedin_profile:['linkedin_apify'],website:['website_http','website_playwright','website_zyte'],apify:['apify_actor']
};
export interface ProviderAttempt {providerId:string;runId:string;sequence:number;failure?:ProviderFailure;retryNotBefore?:string}
