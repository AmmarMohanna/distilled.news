import type { ChallengeState } from "./contracts";

export interface BrowserChallengeSignals {
  url: string;
  title: string;
  bodyText: string;
  markup: string;
  httpStatus?: number;
}

export interface BrowserChallengeDiagnostics {
  state: ChallengeState;
  rule: string;
  visibleEvidence: boolean;
  structuralEvidence: boolean;
  actionableEvidence: boolean;
  surface: "TOP_LEVEL_DOCUMENT";
}

/** Runtime-owned, deterministic classification. Untrusted page text is evidence, never an instruction. */
export function classifyBrowserChallenge(signals: BrowserChallengeSignals): ChallengeState {
  return classifyBrowserChallengeEvidence(signals).state;
}

export function classifyBrowserChallengeEvidence(signals: BrowserChallengeSignals): BrowserChallengeDiagnostics {
  const url = signals.url.toLowerCase();
  const title = signals.title.toLowerCase();
  const text = signals.bodyText.toLowerCase();
  const markup = signals.markup.toLowerCase();
  const visible = `${url}\n${title}\n${text}`;

  const visibleMatch = (patterns: string[]) => matches(visible, patterns);
  const structuralMatch = (patterns: string[]) => matches(markup, patterns);
  const actionableEvidence = /(?:input|button|iframe|role[=:].?(?:button|textbox|dialog))/i.test(markup);
  const result = (state: ChallengeState, rule: string, visibleEvidence: boolean, structuralEvidence: boolean): BrowserChallengeDiagnostics => ({
    state, rule, visibleEvidence, structuralEvidence, actionableEvidence, surface: "TOP_LEVEL_DOCUMENT"
  });
  if (signals.httpStatus === 403 || visibleMatch(["access denied", "request forbidden", "permission denied"])) {
    return result("ACCESS_DENIED", signals.httpStatus === 403 ? "HTTP_403" : "VISIBLE_ACCESS_DENIED", signals.httpStatus !== 403, false);
  }
  if (visibleMatch(["session expired", "session has expired", "authentication expired", "please sign in again"])) {
    return result("SESSION_EXPIRED", "VISIBLE_SESSION_EXPIRED", true, false);
  }
  if (visibleMatch(["multi-factor authentication", "two-factor authentication", "verification code", "one-time code", "mfa required"]) ||
      /autocomplete=["']one-time-code["']/.test(markup)) {
    return result("MFA_REQUIRED", visibleMatch(["multi-factor authentication", "two-factor authentication", "verification code", "one-time code", "mfa required"]) ? "VISIBLE_MFA" : "ACTIVE_ONE_TIME_CODE_CONTROL", visibleMatch(["multi-factor authentication", "two-factor authentication", "verification code", "one-time code", "mfa required"]), true);
  }
  if (visibleMatch(["captcha", "recaptcha", "hcaptcha", "cf-turnstile", "turnstile-response"]) ||
      /(?:id|class|src|data-sitekey)=["'][^"']*(?:captcha|challenge-platform|turnstile)/.test(markup)) {
    return result("CAPTCHA_REQUIRED", visibleMatch(["captcha", "recaptcha", "hcaptcha", "cf-turnstile", "turnstile-response"]) ? "VISIBLE_CAPTCHA" : "ACTIVE_CAPTCHA_MARKER", visibleMatch(["captcha", "recaptcha", "hcaptcha", "cf-turnstile", "turnstile-response"]), true);
  }
  if (visibleMatch(["automated requests", "automation blocked", "bot detected", "unusual traffic", "automated access is prohibited"])) {
    return result("AUTOMATION_BLOCKED", "VISIBLE_AUTOMATION_BLOCKED", true, false);
  }
  if (visibleMatch(["checking your browser", "just a moment", "verify you are human", "browser verification", "security check"]) ||
      structuralMatch(["cf-chl-", "challenge-platform"])) {
    return result("PASSIVE_BROWSER_CHALLENGE", visibleMatch(["checking your browser", "just a moment", "verify you are human", "browser verification", "security check"]) ? "VISIBLE_BROWSER_CHALLENGE" : "ACTIVE_CHALLENGE_MARKER", visibleMatch(["checking your browser", "just a moment", "verify you are human", "browser verification", "security check"]), true);
  }
  if (signals.httpStatus === 401 || /\/(?:login|log-in|signin|sign-in|auth)(?:[/?#]|$)/.test(url) ||
      /<input[^>]+type=["']password["']/.test(markup) || visibleMatch(["sign in", "log in"])) {
    return result("LOGIN_REQUIRED", signals.httpStatus === 401 ? "HTTP_401" : "ACTIVE_LOGIN_SURFACE", visibleMatch(["sign in", "log in"]), structuralMatch(["password"]));
  }
  return result("NO_CHALLENGE", "NO_ACTIVE_CHALLENGE", false, false);
}

function matches(value: string, patterns: string[]): boolean {
  return patterns.some((pattern) => value.includes(pattern));
}
