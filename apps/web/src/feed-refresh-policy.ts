/** When an open feed tab may re-read the feed.
 *
 * Every open tab used to re-read the whole feed every minute and on every
 * focus, visibility change or reconnect, even while the server answered 503.
 * Under load that multiplied the very traffic that caused the 503. */
export const FEED_REFRESH_INTERVAL_MS = 60_000;
export const FOCUS_REFRESH_THROTTLE_MS = 15_000;
const BACKOFF_MS = [30_000, 60_000, 120_000];
const TRANSIENT = new Set([429, 502, 503, 504]);

export interface FeedRefreshState { lastAttemptAt: number; failures: number; blockedUntil: number }
export const initialFeedRefreshState = (): FeedRefreshState => ({ lastAttemptAt: 0, failures: 0, blockedUntil: 0 });

export function mayRefreshFeed(state: FeedRefreshState, now: number, trigger: 'interval' | 'focus'): boolean {
  if (now < state.blockedUntil) return false;
  return trigger === 'interval' || now - state.lastAttemptAt >= FOCUS_REFRESH_THROTTLE_MS;
}

/** `failure` is undefined after a successful read. A missing status is a network failure. */
export function afterFeedRefresh(state: FeedRefreshState, now: number, failure?: { status?: number; retryAfterSeconds?: number }): FeedRefreshState {
  if (!failure) return { lastAttemptAt: now, failures: 0, blockedUntil: 0 };
  if (failure.status !== undefined && !TRANSIENT.has(failure.status)) return { ...state, lastAttemptAt: now };
  const failures = state.failures + 1;
  const backoff = BACKOFF_MS[Math.min(failures, BACKOFF_MS.length) - 1];
  const wait = Math.max(backoff, (failure.retryAfterSeconds ?? 0) * 1000);
  // Up to 20% jitter so tabs that failed together do not return together.
  return { lastAttemptAt: now, failures, blockedUntil: now + wait + Math.floor(Math.random() * wait * 0.2) };
}
