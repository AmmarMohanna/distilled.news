import type { ChallengeState } from "./contracts";

export interface BrowserChallengeSignals {
  url: string;
  title: string;
  bodyText: string;
  markup: string;
  httpStatus?: number;
}

/** Runtime-owned, deterministic classification. Untrusted page text is evidence, never an instruction. */
export function classifyBrowserChallenge(signals: BrowserChallengeSignals): ChallengeState {
  const url = signals.url.toLowerCase();
  const title = signals.title.toLowerCase();
  const text = signals.bodyText.toLowerCase();
  const markup = signals.markup.toLowerCase();
  const combined = `${url}\n${title}\n${text}\n${markup}`;

  if (signals.httpStatus === 403 || matches(combined, ["access denied", "request forbidden", "permission denied"])) {
    return "ACCESS_DENIED";
  }
  if (matches(combined, ["session expired", "session has expired", "authentication expired", "please sign in again"])) {
    return "SESSION_EXPIRED";
  }
  if (matches(combined, ["multi-factor authentication", "two-factor authentication", "verification code", "one-time code", "mfa required"]) ||
      /autocomplete=["']one-time-code["']/.test(markup)) {
    return "MFA_REQUIRED";
  }
  if (matches(combined, ["captcha", "recaptcha", "hcaptcha", "cf-turnstile", "turnstile-response"]) ||
      /(?:id|class|src|data-sitekey)=["'][^"']*(?:captcha|challenge-platform|turnstile)/.test(markup)) {
    return "CAPTCHA_REQUIRED";
  }
  if (matches(combined, ["automated requests", "automation blocked", "bot detected", "unusual traffic", "automated access is prohibited"])) {
    return "AUTOMATION_BLOCKED";
  }
  if (matches(combined, ["checking your browser", "just a moment", "verify you are human", "browser verification", "security check"]) ||
      matches(markup, ["cf-chl-", "challenge-platform"])) {
    return "PASSIVE_BROWSER_CHALLENGE";
  }
  if (signals.httpStatus === 401 || /\/(?:login|log-in|signin|sign-in|auth)(?:[/?#]|$)/.test(url) ||
      /<input[^>]+type=["']password["']/.test(markup) || matches(`${title}\n${text}`, ["sign in", "log in"])) {
    return "LOGIN_REQUIRED";
  }
  return "NO_CHALLENGE";
}

function matches(value: string, patterns: string[]): boolean {
  return patterns.some((pattern) => value.includes(pattern));
}
