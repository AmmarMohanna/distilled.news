export declare const SOURCE_NO_SUCCESS_AFTER_MS: number;
export declare const SOURCE_UNPROVEN_AFTER_CHECKS: number;
export declare function collectionAlertCodes(history: {firstCheckedAt: string | null; lastCheckedAt: string | null; lastAcceptedAt: string | null; checks: number; observations: number}, now?: number): ('SOURCE_NO_RECENT_SUCCESS' | 'SOURCE_NEVER_COLLECTED')[];
