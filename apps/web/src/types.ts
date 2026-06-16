import type { BriefingConfig, BriefingItem } from "@lownoise/core";

export interface TelegramSourceRecord {
  id: string;
  briefingId: string;
  title: string;
  type: "channel" | "group";
  username?: string;
  enabled: boolean;
  lastSeenAt: string;
}

export interface HealthStatus {
  tokenConfigured: boolean;
  webhookRegistered: boolean;
  lastTelegramEventAt?: string;
  processing: {
    queued: number;
    completed: number;
    failed: number;
  };
}

export interface SessionStatus {
  authenticated: boolean;
  setupRequired: boolean;
}

export interface FeedPayload {
  briefing: Omit<BriefingConfig, "interestProfile" | "styleInstruction">;
  items: BriefingItem[];
}
