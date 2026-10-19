import { normalizeSummary, highestReferenceNumber, referenceTextParts } from "./summary-format";
import React, { useEffect, useId, useRef, useState } from "react";
import { FeedNotice, FeedPublicationNotice, FeedProcessingProgress } from "./FeedNotice";
import { createRoot } from "react-dom/client";
import { useVisibleFeedMenu } from "./useVisibleFeedMenu";
import {
  Activity,
  Ban,
  Eye,
  EyeOff,
  Mail,
  LockKeyhole,
  ArrowRight,
  ArrowUpRight,
  Ellipsis,
  Check,
  Layers,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Circle,
  CircleCheck,
  Compass,
  Copy,
  ExternalLink,
  Gauge,
  Globe,
  Github,
  HelpCircle,
  LayoutDashboard,
  ListChecks,
  LogIn,
  LogOut,
  Moon,
  MoreHorizontal,
  Newspaper,
  Pause,
  Pencil,
  Play,
  Plus,
  RadioTower,
  RefreshCw,
  Save,
  Search,
  Settings,
  Share,
  ShieldCheck,
  Sparkles,
  Star,
  Sun,
  Trash2,
  User,
  X
} from "lucide-react";
import type { BriefingConfig, BriefingEdition, BriefingEditionSection, BriefingEvidence } from "@distilled/core";
import { personalNewsBriefing } from "@distilled/core";
import {
  addSource,
  deleteBriefing,
  deleteAdminBriefing,
  deleteSource,
  forgotPassword,
  getBriefings,
  getExploreFeeds,
  getFeed,
  getFeedEdition,
  getHealth,
  getSession,
  getSources,
  listAdminBriefings,
  listAccounts,
  login,
  logout,
  refreshPublicTelegramSources,
  register,
  resetPassword,
  retryProcessing,
  saveBriefing,
  saveFeed,
  searchFeed,
  setFeedStar,
  setSourceEnabled,
  setupAdmin,
  updateAccount,
  updateAdminAccount,
  updateAdminBriefing,
  verifyEmail,
  type SourceIngestResult,
  type SourceRefreshResult
} from "./api";
import { deriveBriefingSlug, formatClock, formatDayHeading, formatTime, publicFeedUrl, slugify } from "./helpers";
import { useTheme } from "./ThemeToggle";
import type { AccountRecord, AccountWithStats, FeedPayload, HealthStatus, PublicBriefing, SessionStatus, SourceRecord } from "./types";
import "./styles.css";
import { accountInitials, AppExperience, AppHeader, BrandMark, PublicNavigation } from "./AppExperience";
import { LanguageControl, preferredLanguage, useLanguage, languageNames, setWebsiteLanguage } from "./LanguageControl";
import { FeedEditor, type FeedInput } from "./FeedEditor";
import { Dialog } from "./Dialog";
import { useConfirmation } from "./useConfirmation";
import { ThemeToggle } from "./ThemeToggle";
import { ScreenPages } from "./ScreenPages";
import "./experience.css";
import "./product.css";
import "./apple.css";

document.documentElement.classList.add("apple-ui");

const FEED_BATCH_SIZE = 20;

const sourceInputExamples = [
  { label: "Telegram URL", value: "https://t.me/LebUpdate" },
  { label: "X URL", value: "https://x.com/NASA" },
  { label: "Search topic", value: "Lebanon electricity" }
];

type ReportSelection = {
  editionId: string;
  sectionIndex: number;
};

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback": () => void;
          "error-callback": () => void;
        }
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

function App() {
  const path = window.location.pathname;
  if (path === "/explore" || path === "/explore/") return <AdminPage initialTab="explore"/>;
  if (path === "/verify-email") return <VerifyEmailPage token={new URLSearchParams(window.location.search).get("token") ?? ""} />;
  if (path === "/reset-password") return <ResetPasswordPage token={new URLSearchParams(window.location.search).get("token") ?? ""} />;
  const feedMatch = path.match(/^\/([^/.][^/]*)\/([^/]+)\/?$/);
  if (feedMatch && !["api", "auth", "feed"].includes(feedMatch[1])) {
    return <FeedPage username={decodeURIComponent(feedMatch[1])} slug={decodeURIComponent(feedMatch[2])} />;
  }
  return <AdminPage />;
}

function languageLabel(language: "en" | "ar" | "fr"): string {
  if (language === "ar") return "arabic";
  if (language === "fr") return "french";
  return "english";
}

function AdminPage(props: { initialTab?: "home" | "explore" }) {
  const { language: interfaceLanguage } = useLanguage();
  useEffect(() => { document.documentElement.lang = interfaceLanguage; document.documentElement.dir = interfaceLanguage === "ar" ? "rtl" : "ltr"; }, [interfaceLanguage]);
  const [session, setSession] = useState<SessionStatus | null>(null);
  const [authOpen, setAuthOpen] = useState(window.location.pathname === "/login" || new URLSearchParams(window.location.search).has("signup"));
  const [creationOpen, setCreationOpen] = useState(false);
  const [createAfterLogin, setCreateAfterLogin] = useState(false);
  const [briefings, setBriefings] = useState<BriefingConfig[]>([]);
  const [selectedBriefingId, setSelectedBriefingId] = useState<string | null>(null);
  const [sources, setSources] = useState<SourceRecord[]>([]);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [accounts, setAccounts] = useState<AccountWithStats[]>([]);
  const [status, setStatus] = useState("");
  const [sourceStatus, setSourceStatus] = useState("");
  const [sourceToggleBusyId, setSourceToggleBusyId] = useState<string | null>(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [error, setError] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [accountDialogOpen, setAccountDialogOpen] = useState(false);
  const [feedSettingsOpen, setFeedSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  const [scopedDataReady, setScopedDataReady] = useState(false);
  const [autosaveState, setAutosaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const selectedBriefingIdRef = useRef<string | null>(null);
  const briefingsRef = useRef<BriefingConfig[]>([]);
  const autosaveTimerRef = useRef<number | null>(null);
  const autosaveRunRef = useRef(0);

  const account = session?.account ?? null;
  const briefing = briefings.find((item) => item.id === selectedBriefingId) ?? null;
  const orderedBriefings = sortBriefings(briefings);

  useEffect(() => {
    selectedBriefingIdRef.current = selectedBriefingId;
  }, [selectedBriefingId]);

  useEffect(() => {
    briefingsRef.current = briefings;
  }, [briefings]);

  useEffect(() => {
    if (!account) return;
    setOnboardingDismissed(localStorage.getItem(onboardingStorageKey(account.id)) === "1");
  }, [account?.id]);

  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current);
    };
  }, []);

  useEffect(() => {
    getSession()
      .then(async (nextSession) => {
        setSession(nextSession);
        if (nextSession.authenticated) {
          await loadBriefings();
          if (nextSession.account?.role === "admin") setAccounts(await listAccounts());
        }
      })
      .catch((cause) => setError(String(cause)));
  }, []);

  useEffect(() => {
    if (!selectedBriefingId || !session?.authenticated) return;
    setScopedDataReady(false);
    loadScopedData(selectedBriefingId).catch((cause) =>
      setError(cause instanceof Error ? cause.message : String(cause))
    ).finally(() => setScopedDataReady(true));
  }, [selectedBriefingId, session?.authenticated]);

  async function refreshSession() {
    const next = await getSession();
    setSession(next);
    return next;
  }

  async function loadBriefings(preferredId?: string) {
    const nextBriefings = await getBriefings();
    setBriefings(nextBriefings);
    const activeId =
      preferredId && nextBriefings.some((item) => item.id === preferredId)
        ? preferredId
        : nextBriefings[0]?.id ?? null;
    setSelectedBriefingId(activeId);
  }

  async function loadScopedData(briefingId: string) {
    const [nextSources, nextHealth] = await Promise.all([getSources(briefingId), getHealth(briefingId)]);
    setSources(nextSources);
    setHealth(nextHealth);
  }

  async function persistBriefing(nextBriefing: BriefingConfig, nextStatus = "saved", busyKey: string | null = "save-feed"): Promise<BriefingConfig> {
    setError("");
    setStatus("saving");
    if (busyKey) setBusyAction(busyKey);
    try {
      const saved = await saveBriefing(prepareBriefingForSave(nextBriefing, briefingsRef.current));
      setBriefings((current) => updateBriefingList(current, saved));
      if (busyKey !== null || selectedBriefingIdRef.current === saved.id) setSelectedBriefingId(saved.id);
      setStatus(nextStatus);
      return saved;
    } finally {
      if (busyKey) setBusyAction((current) => (current === busyKey ? null : current));
    }
  }

  function scheduleBriefingAutosave(nextBriefing: BriefingConfig) {
    if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current);
    const runId = autosaveRunRef.current + 1;
    autosaveRunRef.current = runId;
    setAutosaveState("saving");
    setStatus("saving");
    autosaveTimerRef.current = window.setTimeout(async () => {
      try {
        await persistBriefing(nextBriefing, "saved", null);
        if (autosaveRunRef.current === runId) setAutosaveState("saved");
      } catch (cause) {
        if (autosaveRunRef.current === runId) {
          setAutosaveState("error");
          setStatus("");
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      }
    }, 650);
  }

  async function createBriefing(input?: FeedInput) {
    if (!account) return;
    setError("");
    setBusyAction("create-feed");
    try {
      const draft = { ...createBriefingDraft(briefings, account), language: preferredLanguage(), ...input };
      const created = input ? await saveFeed(input) : await persistBriefing(draft, "feed created");
      await loadBriefings(created.id);
      if (input) {
        window.location.href = `/${created.ownerUsername}/${created.slug}/`;
      }
    } finally {
      setBusyAction(null);
    }
  }

  async function copyFeedUrl(nextBriefing: BriefingConfig) {
    try {
      await navigator.clipboard.writeText(publicFeedUrl(nextBriefing.ownerUsername, nextBriefing.slug));
      setStatus("feed url copied");
      setError("");
    } catch {
      setStatus("");
      setError("could not copy feed url");
    }
  }

  async function handleLogout() {
    setAccountDialogOpen(false);
    setFeedSettingsOpen(false);
    await logout();
    setSession({ authenticated: false, setupRequired: false });
    setBriefings([]);
    setSelectedBriefingId(null);
    setSources([]);
    setHealth(null);
    setAccounts([]);
  }

  const accountDialog = account && accountDialogOpen ? (
    <AccountDialog
      account={account}
      onClose={() => setAccountDialogOpen(false)}
      onLogout={handleLogout}
      onSaved={async (nextAccount, nextBriefings, message) => {
        setSession((current) => (current ? { ...current, account: nextAccount } : current));
        setBriefings(nextBriefings);
        setStatus(message);
        if (selectedBriefingIdRef.current) await loadScopedData(selectedBriefingIdRef.current);
        if (nextAccount.role === "admin") setAccounts(await listAccounts());
        else setAccounts([]);
      }}
    />
  ) : null;

  const onboardingOpen = Boolean(
    account &&
      briefing &&
      scopedDataReady &&
      sources.length === 0 &&
      !onboardingDismissed &&
      isFirstRunBriefing(briefing)
  );

  async function dismissOnboarding() {
    if (account) localStorage.setItem(onboardingStorageKey(account.id), "1");
    setOnboardingDismissed(true);
  }

  async function completeOnboarding(input: {
    username: string;
    title: string;
    interestProfile: string;
    sourceUrl: string;
  }) {
    if (!account || !briefing) return;
    setError("");
    setBusyAction("setup-feed");
    try {
      let nextAccount = account;
      let nextBriefings = briefingsRef.current;
      if (slugify(input.username) !== account.username) {
        const result = await updateAccount({ username: input.username });
        nextAccount = result.account;
        nextBriefings = result.briefings;
        setSession((current) => (current ? { ...current, account: result.account } : current));
        setBriefings(result.briefings);
      }
      const latestBriefing =
        nextBriefings.find((item) => item.id === briefing.id) ??
        { ...briefing, ownerUsername: nextAccount.username };
      const saved = await persistBriefing(
        {
          ...latestBriefing,
          ownerUsername: nextAccount.username,
          title: input.title,
          interestProfile: input.interestProfile,
          publicFeedEnabled: latestBriefing.publicFeedEnabled,
          intensity: latestBriefing.intensity ?? "medium",
          retentionDays: 15
        },
        "setup saved",
        "setup-feed"
      );
      if (input.sourceUrl.trim()) {
        setSourceStatus("checking the source and saving matching posts");
        const response = await addSource(saved.id, input.sourceUrl);
        applySourceResponse(response);
        void pollHealthUntilSettled(saved.id, response.health);
      }
      await dismissOnboarding();
      if (nextAccount.role === "admin") setAccounts(await listAccounts());
    } finally {
      setBusyAction(null);
    }
  }

  function patchSelectedBriefing(patch: Partial<BriefingConfig>, autosave = true) {
    if (!briefing) return;
    const next = prepareBriefingForSave({ ...briefing, ...patch }, briefingsRef.current);
    setBriefings((current) =>
      current.map((item) => (item.id === briefing.id ? next : item))
    );
    if (autosave) scheduleBriefingAutosave(next);
  }

  if (!session && !error) {
    return <ScreenPages><main className="experience product-refresh"><AppHeader account={null} onAccount={() => {}}/><p className="page-loading" role="status">Loading…</p></main></ScreenPages>;
  }

  if (!session?.authenticated) {
    return (
      <>
        <AppExperience account={null} briefings={[]} initialTab="explore"
          onAccount={() => setAuthOpen(true)} onHelp={() => {}}
          onCreate={() => { setCreateAfterLogin(true); setAuthOpen(true); }}
          error={error ? "We couldn’t load your session. Please refresh and try again." : undefined}/>
        {authOpen && <Dialog label="Login or sign up" className="auth-dialog" onClose={() => { setAuthOpen(false); setCreateAfterLogin(false); }}>
          <div className="auth-experience auth-modal-content">
            <button type="button" className="dialog-close quiet-icon" aria-label="Close dialog" onClick={() => { setAuthOpen(false); setCreateAfterLogin(false); }}><X size={20}/></button>
            {session ? <AuthPanel
              setupRequired={session.setupRequired}
              turnstileSiteKey={session.turnstileSiteKey}
              onAuthenticated={async () => {
                const next = await getSession();
                if (next.authenticated) {
                  await loadBriefings();
                  if (next.account?.role === "admin") setAccounts(await listAccounts());
                  setCreationOpen(createAfterLogin);
                  setAuthOpen(false);
                  setCreateAfterLogin(false);
                  setSession(next);
                }
              }}
            /> : <p className="auth-pending" role={error ? "alert" : "status"}>{error ? "Sign-in is unavailable right now. Please refresh and try again." : "Loading account access…"}</p>}
          </div>
        </Dialog>}
      </>
    );
  }

  if (!account) {
    return (
      <Shell title="create" onLogout={handleLogout}>
        <p className="error">session account unavailable</p>
      </Shell>
    );
  }

  return (
    <>
      <AppExperience key="account" account={account} briefings={orderedBriefings} briefing={briefing ?? undefined} health={health} initialTab={props.initialTab}
        onAccount={() => setAccountDialogOpen(true)}
        onCreate={() => setCreationOpen(true)} onHelp={() => setHelpOpen(true)} error={error}>
{account.role === "admin" ? <AdminAccountsSection accounts={accounts} currentAccountId={account.id} onAccountsChanged={setAccounts}/> : null}
      </AppExperience>
      {accountDialog}
      {creationOpen && <FeedEditor onClose={() => setCreationOpen(false)} onSave={async input => { await createBriefing(input); setCreationOpen(false); }}/>}
      {helpOpen ? <FeedHelpSheet onClose={() => setHelpOpen(false)} /> : null}

    </>
  );

  function applySourceResponse(response: SourceRefreshResult) {
    setSources(response.sources);
    setHealth(response.health);
    if (response.result) setSourceStatus(formatSourceIngestResult(response.result));
    else if (response.results) setSourceStatus(formatSourceRefreshResults(response.results));
  }

  async function pollHealthUntilSettled(briefingId: string, initialHealth: HealthStatus) {
    let nextHealth = initialHealth;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      if (selectedBriefingIdRef.current !== briefingId) return;
      if (nextHealth.processing.queued <= 0) {
        setSourceStatus("queue clear");
        return;
      }
      setSourceStatus(`processing ${nextHealth.processing.queued} queued post(s)`);
      await wait(1200);
      nextHealth = await getHealth(briefingId);
      if (selectedBriefingIdRef.current !== briefingId) return;
      setHealth(nextHealth);
    }
  }
}

function AdminCommandPanel(props: {
  briefing: BriefingConfig;
  sources: SourceRecord[];
  health: HealthStatus | null;
  status: string;
  sourceStatus: string;
  onOpenSettings: () => void;
  onCopy: () => Promise<void>;
}) {
  const enabledSources = props.sources.filter((source) => source.enabled).length;
  const queuedJobs = props.health?.processing.queued ?? 0;
  const failedJobs = props.health?.processing.failed ?? 0;
  const latestPublishedAt = props.health?.latestPublishedAt;
  const nextBriefingAt = props.health?.nextBriefingAt ?? props.briefing.nextBriefingAt;
  const activity = props.sourceStatus || props.status || getHealthSummaryParts(props.briefing, props.health).queueState;
  const sourceCopy = `${enabledSources}/${props.sources.length} enabled`;

  return (
    <section className="command-panel" aria-label="feed command center">
      <div className="command-panel-main">
        <span className="eyebrow">public console</span>
        <div className="command-title-row">
          <span className={`status-dot ${props.briefing.paused ? "paused" : "live"}`} aria-hidden />
          <h2><bdi>{props.briefing.title}</bdi></h2>
        </div>
        <code className="command-url">/{props.briefing.ownerUsername}/{props.briefing.slug}/</code>
        <div className="command-actions">
          <a className="button-link primary-button" href={`/${props.briefing.ownerUsername}/${props.briefing.slug}/`} title="open feed">
            <ExternalLink size={15} aria-hidden /> open feed
          </a>
          <button type="button" title="feed settings" onClick={props.onOpenSettings}>
            <Settings size={15} aria-hidden /> settings
          </button>
          <button type="button" title="copy feed url" onClick={() => void props.onCopy()}>
            <Copy size={15} aria-hidden /> copy url
          </button>
        </div>
      </div>
      <div className="command-metrics" aria-label="feed signals">
        <div className="metric-tile">
          <RadioTower size={18} aria-hidden />
          <span>state</span>
          <strong>{props.briefing.paused ? "paused" : "live"}</strong>
        </div>
        <div className="metric-tile">
          <ListChecks size={18} aria-hidden />
          <span>sources</span>
          <strong>{sourceCopy}</strong>
        </div>
        <div className="metric-tile">
          <Activity size={18} aria-hidden />
          <span>queue</span>
          <strong>{queuedJobs} queued / {failedJobs} failed</strong>
        </div>
        <div className="metric-tile">
          <Clock3 size={18} aria-hidden />
          <span>next</span>
          <strong>{props.briefing.paused ? pausedScheduleLabel(props.briefing.language) : nextBriefingAt ? <Timestamp value={nextBriefingAt} language={props.briefing.language} /> : "after save"}</strong>
        </div>
      </div>
      <div className="command-footer">
        <span><ShieldCheck size={15} aria-hidden /> {activity}</span>
        <span>{latestPublishedAt ? <>latest <Timestamp value={latestPublishedAt} language={props.briefing.language} /></> : "no published brief yet"}</span>
      </div>
    </section>
  );
}

function AuthPanel(props: { setupRequired: boolean; turnstileSiteKey?: string; onAuthenticated: () => Promise<void> }) {
  const { t } = useLanguage();
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState<"login" | "register" | "forgot">(props.setupRequired || new URLSearchParams(window.location.search).has("signup") ? "register" : "login");
  const [authStep, setAuthStep] = useState<"email" | "details">(props.setupRequired || new URLSearchParams(window.location.search).has("signup") ? "details" : "email");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [setupToken, setSetupToken] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileResetSignal, setTurnstileResetSignal] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const copy = authStep === "email" ? { title: "Continue with Email", description: "Enter your email to sign in or create an account." } : getAuthPanelCopy(props.setupRequired, mode);
  const submitLabel = authStep === "email" ? "Continue" : getAuthSubmitLabel(props.setupRequired, mode);
  const requiresTurnstile = Boolean(props.turnstileSiteKey && !props.setupRequired);
  const usernamePreview = username.trim() ? slugify(username) : "";

  function resetTurnstile() {
    if (!requiresTurnstile) return;
    setTurnstileToken("");
    setTurnstileResetSignal((value) => value + 1);
  }

  return (
    <form
      className={`login auth-${authStep}-step ${props.setupRequired ? "admin-setup" : ""}`}
      onSubmit={async (event) => {
        event.preventDefault();
        setError("");
        setMessage("");
        if (authStep === "email") {
          setAuthStep("details");
          return;
        }
        setSubmitting(true);
        try {
          if (requiresTurnstile && !turnstileToken) {
            setError("Complete the verification check.");
            return;
          }
          if (props.setupRequired) {
            await setupAdmin({ email, username, password, setupToken });
            await props.onAuthenticated();
            return;
          }
          if (mode === "register") {
            await register({ email, username, password, turnstileToken });
            setPassword("");
            setMessage("Verification email sent. Check your inbox and spam folder. The link expires in 24 hours.");
            resetTurnstile();
            return;
          }
          if (mode === "forgot") {
            await forgotPassword(email, turnstileToken);
            setMessage("If the account exists, a reset email was sent.");
            resetTurnstile();
            return;
          }
          await login(email, password, turnstileToken);
          await props.onAuthenticated();
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : String(cause));
          resetTurnstile();
        } finally {
          setSubmitting(false);
        }
      }}
    >
      {authStep === "email" ? <div className="auth-brand-mark" aria-hidden="true"><img src="/icon-192.png?v=brand-4" alt="" /></div> : null}
      <div className="auth-copy">
        <h2>{t(copy.title)}</h2>
        <p>{t(copy.description)}</p>
      </div>
      {props.setupRequired ? (
        <label>
          Admin Setup Token
          <input type="password" autoComplete="off" aria-describedby="admin-setup-token-help" value={setupToken} onChange={(event) => setSetupToken(event.target.value)} />
          <span className="field-help" id="admin-setup-token-help">Required only for the site owner to create the first admin account. Regular sign-up and login do not require a setup token.</span>
        </label>
      ) : null}
      <label className="auth-input">
        <span className="sr-only">email</span><Mail size={21} aria-hidden/>
        <input type="email" required placeholder={t("Email address")} autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
      </label>
      {authStep === "details" && (mode === "register" || props.setupRequired) ? (
        <label>
          <span className="auth-input"><span className="sr-only">username</span><User size={21} aria-hidden/>
          <input required aria-label="username" aria-describedby={usernamePreview ? "auth-username-help" : undefined} placeholder={t("Username")} autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} /></span>
          {usernamePreview ? <span className="field-help" id="auth-username-help">{t("Your feed URLs start with")} <bdi>/{usernamePreview}/</bdi></span> : null}
        </label>
      ) : null}
      {authStep === "details" && mode !== "forgot" ? (
        <div className="auth-password-field"><div className="auth-input">
          <LockKeyhole size={21} aria-hidden/>
          <input
            aria-label="password"
            placeholder={t("Password")}
            required
            type={showPassword ? "text" : "password"}
            autoComplete={mode === "register" || props.setupRequired ? "new-password" : "current-password"}
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <button type="button" className="quiet-icon" aria-label={t(showPassword ? "Hide password" : "Show password")} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={20}/> : <Eye size={20}/>}</button>
        </div>{(mode === "register" || props.setupRequired) && <span className="field-help">{t("At least 8 characters")}</span>}</div>
      ) : null}
      {authStep === "details" && requiresTurnstile && props.turnstileSiteKey ? (
        <TurnstileField siteKey={props.turnstileSiteKey} resetSignal={turnstileResetSignal} onToken={setTurnstileToken} />
      ) : null}
      {authStep === "details" && !props.setupRequired && mode === "login" && <button className="auth-forgot" type="button" onClick={() => { setMode("forgot"); setError(""); setMessage(""); }}>{t("Forgot password?")}</button>}
      <button type="submit" disabled={submitting} className="primary-button auth-submit" title={t(submitLabel)}>{t(submitting ? "Please wait…" : submitLabel)}<ArrowRight size={22} aria-hidden/></button>
      <div className="auth-feedback" aria-live="polite">
        {error ? <p className="auth-error" role="alert">{error.charAt(0).toUpperCase() + error.slice(1)}</p> : message ? <p className="auth-message">{message}</p> : null}
      </div>
      {!props.setupRequired && (authStep === "email" || mode === "login") ? <p className="auth-choice">{t("New here?")} <button type="button" onClick={() => { setMode("register"); setAuthStep("details"); setError(""); setMessage(""); }}>{t("Create an account")}</button></p> : null}
      {!props.setupRequired && authStep === "details" && mode !== "login" ? <p className="auth-choice">{t("Already have an account?")} <button type="button" onClick={() => { setMode("login"); setError(""); setMessage(""); }}>{t("Sign in")}</button></p> : null}

    </form>
  );
}

function getAuthPanelCopy(setupRequired: boolean, mode: "login" | "register" | "forgot"): { title: string; description: string } {
  if (setupRequired) {
    return {
      title: "One-Time Administrator Setup",
      description: "The site owner must complete setup before users can join. After setup, users can create an account and sign in with email and password."
    };
  }
  if (mode === "register") {
    return {
      title: "Create your Account",
      description: "Choose a username, then verify your email before signing in."
    };
  }
  if (mode === "forgot") {
    return {
      title: "Reset Password",
      description: "Enter your email and we will send a reset link if the account exists."
    };
  }
  return {
    title: "Welcome back",
    description: "Log in to your Distilled News account."
  };
}

function getAuthSubmitLabel(setupRequired: boolean, mode: "login" | "register" | "forgot"): string {
  if (setupRequired) return "Create Admin Account";
  if (mode === "register") return "Create Account";
  if (mode === "forgot") return "Send Reset Link";
  return "Login";
}

function TurnstileField(props: { siteKey: string; resetSignal: number; onToken: (token: string) => void }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    function renderWidget() {
      if (cancelled || !containerRef.current || !window.turnstile || widgetIdRef.current) return;
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: props.siteKey,
        callback: props.onToken,
        "expired-callback": () => props.onToken(""),
        "error-callback": () => props.onToken("")
      });
    }

    if (window.turnstile) {
      renderWidget();
    } else {
      const scriptId = "cf-turnstile-script";
      let script = document.getElementById(scriptId) as HTMLScriptElement | null;
      if (!script) {
        script = document.createElement("script");
        script.id = scriptId;
        script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);
      }
      script.addEventListener("load", renderWidget);
    }

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) window.turnstile.remove(widgetIdRef.current);
      widgetIdRef.current = null;
    };
  }, [props.onToken, props.siteKey]);

  useEffect(() => {
    props.onToken("");
    if (widgetIdRef.current && window.turnstile) window.turnstile.reset(widgetIdRef.current);
  }, [props.resetSignal]);

  return (
    <div className="turnstile-slot">
      <div ref={containerRef} />
    </div>
  );
}

function ExploreFeedsPanel() {
  return (
    <section className="section explore-section" aria-labelledby="explore-feeds-title">
      <div className="section-title">
        <Compass size={16} aria-hidden />
        <h2 id="explore-feeds-title">explore</h2>
      </div>
      <ExploreFeedList />
    </section>
  );
}

function ExploreFeedList(props: { currentFeed?: PublicBriefing; language?: "en" | "ar" | "fr" }) {
  const [feeds, setFeeds] = useState<PublicBriefing[] | null>(null);
  const [error, setError] = useState("");
  const language = props.language ?? "en";

  useEffect(() => {
    let active = true;
    getExploreFeeds()
      .then((nextFeeds) => {
        if (active) setFeeds(nextFeeds);
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      active = false;
    };
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (!feeds) return <p className="muted">{loadingFeedsLabel(language)}</p>;
  if (feeds.length === 0) return <p className="muted">{noFeaturedFeedsLabel(language)}</p>;

  return (
    <div className="explore-list">
      {feeds.map((feed) => {
        const href = `/${encodeURIComponent(feed.ownerUsername)}/${encodeURIComponent(feed.slug)}/`;
        const isCurrent = props.currentFeed?.id === feed.id;
        return (
          <a key={feed.id} className={`explore-row${isCurrent ? " active" : ""}`} href={href} aria-current={isCurrent ? "page" : undefined}>
            <span className="explore-copy">
              <strong className="explore-title"><bdi>{feed.title}</bdi></strong>
              <span className="explore-meta">@{feed.ownerUsername}</span>
            </span>
            <span className="explore-stars" aria-label={`${feed.stars} stars`}>
              <Star size={13} aria-hidden /> {feed.stars}
            </span>
          </a>
        );
      })}
    </div>
  );
}

function VerifyEmailPage(props: { token: string }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <main className="email-verification-page">
      <section className="email-verification-panel" aria-labelledby="email-verification-title">
        <div className="email-verification-brand" aria-hidden="true"><img src="/icon-192.png?v=brand-4" alt="" /></div>
        <h1 id="email-verification-title">Verify Email</h1>
        <p className="email-verification-description">Confirm this email address</p>
        <div className="email-verification-actions">
          <button
            type="button"
            className="email-verification-submit"
            title="Verify Email"
            disabled={busy || !props.token}
            onClick={async () => {
              setBusy(true);
              setMessage("");
              setError("");
              try {
                await verifyEmail(props.token);
                setMessage("Email verified");
              } catch (cause) {
                setError(cause instanceof Error ? cause.message : String(cause));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Verifying…" : "Verify Email"}
          </button>
          <div className="auth-feedback" aria-live="polite">{error ? <p className="auth-error" role="alert">{error.charAt(0).toUpperCase() + error.slice(1)}</p> : message ? <p className="auth-message">{message}</p> : null}</div>
          <a className="email-verification-create" href="/" title="Create">Create</a>
        </div>
      </section>
    </main>
  );
}

function ResetPasswordPage(props: { token: string }) {
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  return (
    <Shell title="Reset Password">
      <form className="login" onSubmit={async (event) => {
        event.preventDefault();
        try {
          await resetPassword(props.token, password);
          setMessage("password reset");
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      }}>
        <label>
          New Password
          <input type="password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        <button type="submit" title="save password"><Save size={15} aria-hidden /> save password</button>
        {message ? <p className="muted">{message}</p> : null}
        {error ? <p className="error">{error}</p> : null}
      </form>
    </Shell>
  );
}

function Sheet(props: {
  title: string;
  closeLabel: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <Dialog label={props.title} className={`sheet-dialog${props.wide ? " sheet-dialog-wide" : ""}`} onClose={props.onClose}>
      <section className="sheet">
        <div className="sheet-head">
          <div className="section-title">
            {props.icon}
            <h2 id={`${slugify(props.title)}-sheet-title`}>{props.title}</h2>
          </div>
          <button type="button" className="icon-button" aria-label={props.closeLabel} title={props.closeLabel} onClick={props.onClose}>
            <X size={16} aria-hidden />
          </button>
        </div>
        {props.children}
      </section>
    </Dialog>
  );
}

function FeedSettingsSheet(props: {
  briefing: BriefingConfig;
  briefings: BriefingConfig[];
  autosaveState: "idle" | "saving" | "saved" | "error";
  status: string;
  canDelete: boolean;
  onClose: () => void;
  onPatch: (patch: Partial<BriefingConfig>) => void;
  onCopy: () => Promise<void>;
  onPauseToggle: () => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  return <FeedEditor feed={props.briefing} onClose={props.onClose} onSave={async input => { props.onPatch(input); props.onClose(); }} onCopy={props.onCopy} onPause={props.onPauseToggle} onDelete={props.canDelete ? props.onDelete : undefined}/>;
}

function FeedHelpSheet(props: { onClose: () => void }) {
  const { t } = useLanguage();
  return (
    <Dialog label={t("Help & Support")} className="support-dialog" onClose={props.onClose}><section className="dialog-inner"><button type="button" className="dialog-close" aria-label={t("Close dialog")} onClick={props.onClose}><X size={22}/></button><h2>{t("Help & Support")}</h2>
      <p>{t("Email us for help and support.")}</p>
      <p><a href="mailto:distillednews.platform@gmail.com">distillednews.platform@gmail.com</a></p>
      <p><a href="mailto:distilled.news@outlook.com">distilled.news@outlook.com</a></p>
    </section></Dialog>
  );
}

function FirstRunSetupSheet(props: {
  account: AccountRecord;
  briefing: BriefingConfig;
  busy: boolean;
  onClose: () => void;
  onComplete: (input: { username: string; title: string; interestProfile: string; sourceUrl: string }) => Promise<void>;
}) {
  const [username, setUsername] = useState(props.account.username);
  const [title, setTitle] = useState(props.briefing.title);
  const [interestProfile, setInterestProfile] = useState(props.briefing.interestProfile);
  const [sourceUrl, setSourceUrl] = useState("");
  const [error, setError] = useState("");
  const usernameRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    usernameRef.current?.focus();
  }, []);

  return (
    <Sheet title="Set up feed" closeLabel="Skip feed setup" icon={<Globe size={16} aria-hidden />} onClose={props.onClose} wide>
      <form
        className="settings-grid"
        onSubmit={async (event) => {
          event.preventDefault();
          setError("");
          try {
            await props.onComplete({ username, title, interestProfile, sourceUrl });
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : String(cause));
          }
        }}
      >
        <label>
          username
          <input ref={usernameRef} value={username} autoComplete="username" onChange={(event) => setUsername(event.target.value)} />
        </label>
        <label>
          feed name
          <input dir="ltr" required value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label>
          interest profile
          <textarea
            dir="ltr"
            required
            rows={6}
            value={interestProfile}
            onChange={(event) => setInterestProfile(event.target.value)}
          />
        </label>
        <label>
          first source
          <input
            dir="ltr"
            value={sourceUrl}
            onChange={(event) => setSourceUrl(event.target.value)}
            placeholder="https://t.me/LebUpdate, https://x.com/NASA, or Beirut power"
          />
        </label>
        <div className="source-examples" aria-label="source examples">
          {sourceInputExamples.map((example) => (
            <button
              key={example.label}
              type="button"
              title={example.value}
              onClick={() => setSourceUrl(example.value)}
            >
              {example.label}
            </button>
          ))}
        </div>
        <div className="sheet-actions">
          <button type="submit" className="primary-button" title="finish setup" disabled={props.busy || !title.trim() || !interestProfile.trim()}>
            <Save size={15} aria-hidden /> finish setup
          </button>
          <button type="button" title="skip setup" onClick={props.onClose}>skip</button>
        </div>
        {error ? <p className="error">{error}</p> : null}
      </form>
    </Sheet>
  );
}

function HealthSummary(props: {
  briefing: BriefingConfig;
  health: HealthStatus | null;
  activity: string;
  retryBusy: boolean;
  onRetryProcessing: () => Promise<void>;
}) {
  const summary = getHealthSummaryParts(props.briefing, props.health);
  const failedJobs = props.health?.processing.failed ?? 0;
  const isPaused = props.briefing.paused;
  const activity = isHealthActivity(props.activity) ? props.activity : `${summary.latest} · ${summary.queueState}`;
  const nextBriefingAt = props.health?.nextBriefingAt ?? props.briefing.nextBriefingAt;
  const lastImportedAt = props.health?.lastImportedMessageAt ?? props.health?.lastSourceEventAt;
  const nextBriefingValue = isPaused
    ? pausedScheduleLabel(props.briefing.language)
    : nextBriefingAt
      ? <Timestamp value={nextBriefingAt} language={props.briefing.language} />
      : "after save";
  return (
    <details className="health-summary">
      <summary className="health-summary-line" title="source status">
        <span className={`status-dot ${isPaused ? "paused" : "live"}`} aria-hidden />
        <span className="health-summary-copy">
          <strong>{summary.feedState}</strong>
          <span>{activity}</span>
        </span>
      </summary>
      <div className="health">
        <StatusLine label="processing" value={`queued ${props.health?.processing.queued ?? 0} / failed ${props.health?.processing.failed ?? 0}`} />
        <StatusLine
          label="last source check"
          value={props.health?.lastSourceFetchAt ? <Timestamp value={props.health.lastSourceFetchAt} language={props.briefing.language} /> : "none"}
          valueDir="ltr"
        />
        <StatusLine
          label="last imported post"
          value={lastImportedAt ? <Timestamp value={lastImportedAt} language={props.briefing.language} /> : "none"}
          valueDir="ltr"
        />
        <StatusLine
          label="latest published"
          value={props.health?.latestPublishedAt ? <Timestamp value={props.health.latestPublishedAt} language={props.briefing.language} /> : "none"}
          valueDir="ltr"
        />
        <StatusLine
          label="next briefing"
          value={nextBriefingValue}
          valueDir={isPaused ? textDirection(props.briefing.language) : "ltr"}
        />
        <StatusLine label="status" value={props.briefing.paused ? "paused" : "live"} />
        {failedJobs > 0 ? (
          <div className="health-actions">
            <button type="button" title="retry processing" disabled={props.retryBusy} onClick={() => void props.onRetryProcessing()}>
              <RefreshCw size={15} aria-hidden /> retry processing
            </button>
          </div>
        ) : null}
      </div>
    </details>
  );
}

function AccountDialog(props: {
  account: AccountRecord;
  onClose: () => void;
  onLogout: () => Promise<void>;
  onSaved: (account: AccountRecord, briefings: BriefingConfig[], message: string) => Promise<void>;
}) {
  const { t } = useLanguage();
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [editingUsername, setEditingUsername] = useState(false);
  const [username, setUsername] = useState(props.account.username);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"username" | "password" | "logout" | null>(null);
  const usernameFieldRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setUsername(props.account.username);
  }, [props.account.username]);

  useEffect(() => {
    if (editingUsername) usernameFieldRef.current?.focus();
  }, [editingUsername]);

  return (
    <Dialog label={t("account")} className="profile-dialog" onClose={props.onClose}>
      <section className="profile-dialog-content">
      <button type="button" className="dialog-close" aria-label={t("close account settings")} onClick={props.onClose}><X size={22}/></button>
      <div className="profile-identity">
        <span className="profile-avatar" aria-hidden="true">{accountInitials(props.account.username)}</span>
        <span className="profile-email">{props.account.email}</span>
        <span className="profile-role">{t(props.account.role === "admin" ? "Admin" : "User")}</span>
      </div>

      <form
        className="account-form"
        onSubmit={async (event) => {
          event.preventDefault();
          setError("");
          setMessage("");
          setBusy("username");
          try {
            const result = await updateAccount({ username });
            await props.onSaved(result.account, result.briefings, "username saved");
            setMessage("username saved");
            setEditingUsername(false);
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : String(cause));
          } finally {
            setBusy(null);
          }
        }}
      >
        <div className="profile-card-heading"><span className="profile-card-icon" aria-hidden="true"><User size={28}/></span><div><label htmlFor="profile-username">{t("Username")}</label><p>{t("Your account username")}</p></div></div>
        <span className="profile-username-field"><input id="profile-username" aria-label={t("username")} ref={usernameFieldRef} readOnly={!editingUsername} value={username} autoComplete="username" onChange={(event) => setUsername(event.target.value)} /><button type="button" className="profile-edit-button" aria-label={t("Edit username")} aria-pressed={editingUsername} disabled={busy !== null} onClick={() => { if (editingUsername) setUsername(props.account.username); setEditingUsername(value => !value); }}><Pencil size={19}/></button></span>
        <button hidden={!editingUsername} type="submit" className="profile-save-button" title="Save" disabled={busy === "username"}>
          {t("Save")}
        </button>
      </form>

      <div className="profile-password-section"><button type="button" className="password-disclosure" aria-expanded={passwordOpen} aria-controls="change-password-form" onClick={() => setPasswordOpen(value => !value)}><span className="profile-card-icon" aria-hidden="true"><LockKeyhole size={28}/></span><span className="profile-security-copy"><strong>{t("Security")}</strong><small>{t("Update your account password")}</small></span><ChevronRight size={24}/></button>
      <form id="change-password-form" hidden={!passwordOpen}
        className="account-form"
        onSubmit={async (event) => {
          event.preventDefault();
          setError("");
          setMessage("");
          setBusy("password");
          try {
            const result = await updateAccount({ currentPassword, newPassword });
            await props.onSaved(result.account, result.briefings, "password changed");
            setCurrentPassword("");
            setNewPassword("");
            setMessage("password changed");
            setPasswordOpen(false);
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : String(cause));
          } finally {
            setBusy(null);
          }
        }}
      >
        <label>
          {t("Current Password")}
          <input
            type="password"
            autoComplete="current-password"
            required
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
          />
        </label>
        <label>
          {t("New Password")}
          <input
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />
        </label>
        <button type="submit" className="profile-save-button" title="Save" disabled={busy === "password"}>
          {t("Save")}
        </button>
      </form>
      </div>
      <div className="account-actions">
        <button
          type="button"
          title="logout"
          disabled={busy === "logout"}
          onClick={async () => {
            setBusy("logout");
            await props.onLogout();
          }}
        >
          <LogOut size={22} aria-hidden /> {t("Log out")}
        </button>
        {message ? <p className="muted">{t(message)}</p> : null}
        {error ? <p className="error">{error}</p> : null}
      </div>
      </section>
    </Dialog>
  );
}

function AdminAccountsSection(props: {
  accounts: AccountWithStats[];
  currentAccountId: string;
  onAccountsChanged: (accounts: AccountWithStats[]) => void;
}) {
  const { t } = useLanguage();
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("all");
  const [sortAscending, setSortAscending] = useState(true);
  const [managedAccountId, setManagedAccountId] = useState<string | null>(null);
  const [adminBriefings, setAdminBriefings] = useState<BriefingConfig[]>([]);
  const [loadingFeeds, setLoadingFeeds] = useState(false);
  const [error, setError] = useState("");
  const managedAccount = props.accounts.find((account) => account.id === managedAccountId) ?? null;

  useEffect(() => {
    let cancelled = false;
    async function loadAdminBriefings() {
      setLoadingFeeds(true);
      setError("");
      try {
        const nextBriefings = await listAdminBriefings();
        if (!cancelled) setAdminBriefings(nextBriefings);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        if (!cancelled) setLoadingFeeds(false);
      }
    }
    void loadAdminBriefings();
    return () => {
      cancelled = true;
    };
  }, [props.accounts]);

  useEffect(() => {
    if (managedAccountId && !props.accounts.some((account) => account.id === managedAccountId)) {
      setManagedAccountId(null);
    }
  }, [managedAccountId, props.accounts]);

  async function refreshAdminBriefings() {
    const nextBriefings = await listAdminBriefings();
    setAdminBriefings(nextBriefings);
  }

  const visibleAccounts = props.accounts.filter(account => (role === "all" || account.role === role) && `${account.username} ${account.email}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => (sortAscending ? 1 : -1) * a.username.localeCompare(b.username));
  const feedCountFor = (account: AccountWithStats) => loadingFeeds || error ? account.briefingCount : adminBriefings.filter(feed => feed.ownerAccountId === account.id).length;

  return (
    <>
      <details className="accounts-section">
        <summary className="accounts-summary" title="accounts">
          <User size={16} aria-hidden />
          <span className="accounts-back-label">{t("Settings")}</span><ChevronRight size={18}/><span className="accounts-label">{t("User Management")}</span>
        </summary>
        <div className={`user-management ${managedAccount ? "has-selection" : ""}`}>
        <div className="user-management-main">
        <div className="user-management-heading"><h1>{t("User Management")}</h1><p>{t("Manage registered users and their feeds.")}</p></div>
        <div className="users-toolbar"><label className="users-search"><Search size={20}/><input aria-label={t("Search users")} placeholder={t("Search users...")} value={query} onChange={event => setQuery(event.target.value)}/></label><span className="users-role-filter"><select aria-label={t("Filter users by role")} value={role} onChange={event => setRole(event.target.value)}><option value="all">{t("All Roles")}</option><option value="admin">{t("Admin")}</option><option value="user">{t("User")}</option></select><ChevronDown size={18} aria-hidden="true"/></span><div className="users-counts"><span>{props.accounts.length} {t("users")}</span><span>{props.accounts.reduce((total, account) => total + feedCountFor(account), 0)} {t("feeds")}</span></div></div>
        {loadingFeeds ? <p className="muted">loading feeds</p> : null}
        {error ? <p className="error">{error}</p> : null}
        <div className="users-table-scroll"><table className="users-table"><thead><tr><th><button type="button" onClick={() => setSortAscending(value => !value)}>{t("Name")} <ChevronDown size={14} style={{ transform: sortAscending ? "none" : "rotate(180deg)" }}/></button></th><th>{t("Email")}</th><th>{t("Role")}</th><th>{t("Feeds")}</th><th>{t("Status")}</th><th><span className="sr-only">{t("Actions")}</span></th></tr></thead><tbody>{visibleAccounts.map(account => <tr key={account.id} className={account.id === managedAccountId ? "selected" : ""}>
          <td><button className="user-name-button" type="button" style={{ background: "transparent" }} aria-label={`View ${account.username}`} onClick={() => setManagedAccountId(account.id)}><span className={`user-row-avatar ${account.role === "admin" ? "admin" : ""}`}>{accountInitials(account.username)}</span><span>{account.username}</span></button></td><td title={account.email}>{account.email}</td><td><span className={`user-role-badge ${account.role}`}>{t(account.role === "admin" ? "Admin" : "User")}</span></td><td>{feedCountFor(account)}</td><td><span className={`user-status ${account.disabledAt ? "suspended" : ""}`}>{t(account.disabledAt ? "Suspended" : account.emailVerifiedAt ? "Verified" : "Pending")}</span></td><td>{!managedAccount && <button type="button" className="user-manage-button" aria-label={`manage ${account.username}`} onClick={() => setManagedAccountId(account.id)}><MoreHorizontal size={20} aria-hidden /></button>}</td>
        </tr>)}</tbody></table>{visibleAccounts.length === 0 && <p className="users-empty">{t("No users found.")}</p>}</div>
        </div>
      {managedAccount ? (
        <AdminAccountDialog
          key={managedAccount.id}
          inline
          feedCount={feedCountFor(managedAccount)}
          account={managedAccount}
          currentAccountId={props.currentAccountId}
          briefings={adminBriefings.filter((briefing) => briefing.ownerAccountId === managedAccount.id)}
          onClose={() => setManagedAccountId(null)}
          onAccountsChanged={props.onAccountsChanged}
          onBriefingsChanged={setAdminBriefings}
          onRefreshBriefings={refreshAdminBriefings}
        />
      ) : null}
        </div>
      </details>
    </>
  );
}

function AdminAccountDialog(props: {
  inline?: boolean;
  feedCount?: number;
  account: AccountWithStats;
  currentAccountId: string;
  briefings: BriefingConfig[];
  onClose: () => void;
  onAccountsChanged: (accounts: AccountWithStats[]) => void;
  onBriefingsChanged: (briefings: BriefingConfig[]) => void;
  onRefreshBriefings: () => Promise<void>;
}) {
  const { language, t } = useLanguage();
  const { confirm, confirmation } = useConfirmation();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const isSignedInAdmin = props.account.id === props.currentAccountId;
  const Panel = props.inline ? InlineAccountPanel : Sheet;
  const joinedAt = props.account.createdAt && Number.isFinite(Date.parse(props.account.createdAt))
    ? new Intl.DateTimeFormat(language, { year: "numeric", month: "short", day: "numeric" }).format(new Date(props.account.createdAt)) : t("Unavailable");

  async function updateAccountAndRefresh(input: { role?: "admin" | "user"; disabled?: boolean }, nextMessage: string) {
    setError("");
    setMessage("");
    const result = await updateAdminAccount(props.account.id, input);
    props.onAccountsChanged(result.accounts);
    await props.onRefreshBriefings();
    setMessage(nextMessage);
  }

  async function toggleAdminBriefing(feed: BriefingConfig) {
    setBusy(`feed:${feed.id}:pause`);
    setError("");
    setMessage("");
    try {
      const result = await updateAdminBriefing(feed.id, { paused: !feed.paused });
      props.onAccountsChanged(result.accounts);
      props.onBriefingsChanged(result.briefings);
      setMessage(feed.paused ? "feed resumed" : "feed paused");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  }

  async function removeAdminBriefing(feed: BriefingConfig) {
    if (!await confirm(`Delete "${feed.title}" and all of its sources and published items?`)) return;
    setBusy(`feed:${feed.id}:delete`);
    setError("");
    setMessage("");
    try {
      const result = await deleteAdminBriefing(feed.id);
      props.onAccountsChanged(result.accounts);
      props.onBriefingsChanged(result.briefings);
      setMessage("feed deleted");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Panel title="manage account" closeLabel="close account management" icon={<User size={16} aria-hidden />} onClose={props.onClose}>
      {confirmation}
      <div className="managed-user-identity"><span className="profile-avatar">{accountInitials(props.account.username)}</span><h2>{props.account.username}</h2><p>{props.account.email}</p><span className={`user-role-badge ${props.account.role}`}>{props.account.role === "admin" ? "Admin" : "User"}</span></div>
      <div className="managed-user-stats"><span>{t("Feeds")}<strong>{props.feedCount ?? props.briefings.length}</strong></span><span>{t("Joined")}<strong>{joinedAt}</strong></span></div>
      <details className="managed-user-settings"><summary><Pencil size={20}/>Account Settings<ChevronRight size={18}/></summary>
        <fieldset className="account-role-options"><legend>{t("Role")}</legend>{(["user", "admin"] as const).map(role => <label key={role}><input type="radio" name={`role-${props.account.id}`} checked={props.account.role === role} disabled={busy !== null} onChange={async () => { setBusy("role"); try { await updateAccountAndRefresh({ role }, `role changed to ${role}`); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } finally { setBusy(null); } }}/>{t(role === "admin" ? "Admin" : "User")}</label>)}</fieldset>
      </details>
      <details className="managed-user-feeds"><summary><Newspaper size={22}/>View Feeds<ChevronRight size={18}/></summary>
        <div className="admin-feed-list">{props.briefings.map(feed => <div key={feed.id} className="admin-feed-row"><strong><bdi>{feed.title}</bdi></strong><div className="row-actions"><a className="icon-button" href={`/${encodeURIComponent(feed.ownerUsername)}/${encodeURIComponent(feed.slug)}/`} target="_blank" rel="noopener noreferrer" aria-label={`Open ${feed.title} in new tab`}><ExternalLink size={18}/></a><details className="feed-options"><summary aria-label={`Options for ${feed.title}`}><MoreHorizontal size={20} aria-hidden /></summary><div className="feed-options-popover admin-feed-actions"><button type="button" aria-label={t(feed.paused ? "Resume feed" : "Pause feed")} title={t(feed.paused ? "Resume feed" : "Pause feed")} disabled={busy !== null} onClick={() => void toggleAdminBriefing(feed)}>{feed.paused ? <Play size={16}/> : <Pause size={16}/>}</button><button type="button" className="danger-button" aria-label={t("Delete feed")} title={t("Delete feed")} disabled={busy !== null} onClick={() => void removeAdminBriefing(feed)}><Trash2 size={18}/></button></div></details></div></div>)}</div>
      </details>
      <button type="button" className="managed-user-suspend" disabled={busy !== null || isSignedInAdmin} onClick={async () => {
        setBusy("disabled");
        try { await updateAccountAndRefresh({ disabled: !props.account.disabledAt }, props.account.disabledAt ? "account enabled" : "account disabled"); }
        catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
        finally { setBusy(null); }
      }}><Ban size={24}/><span>{props.account.disabledAt ? "Enable Account" : "Suspend Account"}</span><ChevronRight size={18}/></button>
      {message ? <p className="muted">{message}</p> : null}
      {error ? <p className="error">{error}</p> : null}
    </Panel>
  );
}

function InlineAccountPanel(props: { title: string; closeLabel: string; icon: React.ReactNode; children: React.ReactNode; onClose: () => void }) {
  return <aside className="managed-user-panel" aria-label={props.title}><button type="button" className="managed-user-close" aria-label={props.closeLabel} onClick={props.onClose}><X size={22}/></button>{props.children}</aside>;
}

function FeedPage(props: { username: string; slug: string }) {
  const { language: uiLanguage, t } = useLanguage();
  const [account, setAccount] = useState<AccountRecord | null>(null);
  const [accountDialogOpen, setAccountDialogOpen] = useState(false);
  const [ownedFeed, setOwnedFeed] = useState<BriefingConfig | null>(null);
  const [editorOpen, setEditorOpen] = useState(new URLSearchParams(window.location.search).has("edit"));
  useEffect(() => {
    let active = true;
    getSession().then(async session => {
      if (!active) return;
      setAccount(session.authenticated ? session.account ?? null : null);
      if (!session.authenticated || session.account?.username !== props.username) return;
      const owned = await getBriefings();
      if (active) setOwnedFeed(owned.find(feed => feed.slug === props.slug) ?? null);
    }).catch(() => {});
    return () => { active = false; };
  }, [props.username, props.slug]);
  const feedKey = `${props.username}/${props.slug}`;
  const feedIdentity = useRef(feedKey);
  const feedRequest = useRef(0);
  const searchRequest = useRef(0);
  const latestQuery = useRef("");
  const searchFailed = useRef(false);
  const loadedFeed = useRef<string | null>(null);
  const visibleEditionIds = useRef(new Set<string>());
  if (feedIdentity.current !== feedKey) {
    feedIdentity.current = feedKey; feedRequest.current++; searchRequest.current++;
  }
  const [feedResult, setFeedResult] = useState<{ key: string; value: FeedPayload } | null>(null);
  const payload = feedResult?.key === feedKey ? feedResult.value : null;
  const [readState, setReadState] = useState<{ key: string; state: "loading" | "loaded" | "failed" }>({ key: feedKey, state: "loading" });
  const initialLoading = !payload && (readState.key !== feedKey || readState.state === "loading");
  const [editions, setEditions] = useState<BriefingEdition[]>([]);
  const [query, setQuery] = useState("");
  const [settledSearch, setSettledSearch] = useState<{ key: string; text: string } | null>(null);
  const [error, setError] = useState("");
  const [starBusy, setStarBusy] = useState(false);
  const [summaryMessage, setSummaryMessage] = useState("");
  const [editionBusyIds, setEditionBusyIds] = useState<Set<string>>(new Set());
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [visibleUnreadCount, setVisibleUnreadCount] = useState(FEED_BATCH_SIZE);
  const [filter, setFilter] = useState<"all" | "unread">("unread");
  const [clock, setClock] = useState(Date.now());
  const [selectedReport, setSelectedReport] = useState<ReportSelection | null>(null);
  const [editionDetails, setEditionDetails] = useState<Map<string, BriefingEdition>>(() => new Map());

  async function refresh(silent = false) {
    const key = feedKey, request = ++feedRequest.current;
    if (!silent || loadedFeed.current !== key) { searchFailed.current = false; setError(""); setSummaryMessage(""); }
    if (loadedFeed.current !== key) setReadState({ key, state: "loading" });
    try {
      const next = await getFeed(props.username, props.slug);
      if (feedIdentity.current !== key || request !== feedRequest.current) return;
      loadedFeed.current = key;
      visibleEditionIds.current = new Set(next.editions.map(edition => edition.id));
      setFeedResult({ key, value: next }); setReadState({ key, state: "loaded" });
      const sourceNotice = sessionStorage.getItem(`feed-notice:${next.briefing.id}`);
      searchFailed.current = false; setError(sourceNotice ?? "");
      if (sourceNotice) sessionStorage.removeItem(`feed-notice:${next.briefing.id}`);
      // Invalidate pending searches before they can restore newly withdrawn prose.
      searchRequest.current++;
      const ids = visibleEditionIds.current;
      // Refresh visibility without discarding pagination, search or loaded detail.
      setEditions(current => latestQuery.current.trim() ? current.filter(edition => ids.has(edition.id)) : next.editions);
      setEditionDetails(current => new Map([...current].filter(([id]) => ids.has(id))));
      setSelectedReport(current => current && ids.has(current.editionId) ? current : null);
    } catch (cause) {
      if (feedIdentity.current !== key || request !== feedRequest.current) return;
      if (!silent || loadedFeed.current !== key) {
        searchFailed.current = false; setReadState({ key, state: "failed" }); setError(cause instanceof Error ? cause.message : String(cause));
      }
    }
  }

  useEffect(() => {
    setError(""); setSummaryMessage(""); latestQuery.current = "";
    setQuery(""); setEditions([]); setEditionBusyIds(new Set());
    setEditionDetails(new Map()); setSelectedReport(null); setVisibleUnreadCount(FEED_BATCH_SIZE);
    visibleEditionIds.current = new Set(); setReadState({ key: feedKey, state: "loading" });
    void refresh();
    return () => { feedRequest.current++; searchRequest.current++; };
  }, [props.username, props.slug]);

  useEffect(() => {
    let pending = false;
    const update = async () => {
      if (document.visibilityState !== "visible" || pending) return;
      pending = true;
      try { await refresh(true); } finally { pending = false; }
    };
    const interval = window.setInterval(() => void update(), 60_000);
    document.addEventListener("visibilitychange", update); window.addEventListener("focus", update);
    return () => { window.clearInterval(interval); document.removeEventListener("visibilitychange", update); window.removeEventListener("focus", update); };
  }, [props.username, props.slug]);

  useEffect(() => {
    const raw = localStorage.getItem(`ln_read:${props.username}:${props.slug}`);
    setReadIds(new Set(raw ? (JSON.parse(raw) as string[]) : []));
  }, [props.username, props.slug]);

  useEffect(() => {
    localStorage.setItem(`ln_read:${props.username}:${props.slug}`, JSON.stringify(Array.from(readIds)));
  }, [props.username, props.slug, readIds]);

  useEffect(() => {
    const interval = window.setInterval(() => setClock(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  // A status refresh must not undo pages explicitly loaded by the reader.
  // Reset pagination only when the search or feed navigation changes.
  useEffect(() => {
    setVisibleUnreadCount(FEED_BATCH_SIZE);
  }, [props.username, props.slug, query]);

  async function applySearch(text: string, request: number) {
    if (!payload) return;
    const key = feedKey;
    try {
      const next = text.trim() ? await searchFeed(props.username, props.slug, text) : payload?.editions ?? [];
      if (feedIdentity.current === key && request === searchRequest.current && text === latestQuery.current) {
        visibleEditionIds.current = new Set([...visibleEditionIds.current, ...next.map(edition => edition.id)]);
        searchFailed.current = false; setError(""); setEditions(next); setSettledSearch({ key, text });
      }
    } catch (cause) {
      if (feedIdentity.current === key && request === searchRequest.current && text === latestQuery.current) { searchFailed.current = true; setError(cause instanceof Error ? cause.message : String(cause)); }
    }
  }

  useEffect(() => {
    const request = ++searchRequest.current;
    if (!payload) return;
    if (!query.trim()) { if (searchFailed.current) { searchFailed.current = false; setError(""); } setEditions(payload.editions); return; }
    const timeout = window.setTimeout(() => {
      if (request === searchRequest.current && feedIdentity.current === feedKey && query === latestQuery.current) void applySearch(query, request);
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [payload, props.username, props.slug, query]);

  const currentEditions = payload ? editions : [];
  const searchLoading = Boolean(payload && query.trim() && (settledSearch?.key !== feedKey || settledSearch.text !== query));
  const unreadEditions = currentEditions.filter((edition) => !readIds.has(edition.id));
  const archivedReadEditions = currentEditions.filter((edition) => readIds.has(edition.id));
  const filteredEditions = filter === "unread" ? unreadEditions : currentEditions;
  const visibleUnreadEditions = filteredEditions.slice(0, visibleUnreadCount);
  const hiddenUnreadCount = Math.max(0, filteredEditions.length - visibleUnreadEditions.length);
  const language = uiLanguage;
  const pageDir = textDirection(language);
  const canStar = Boolean(payload);
  const feedStatusMessage = payload ? feedStatusText(payload.briefing, clock, language) : "";
  const reportEdition = selectedReport
    ? editionDetails.get(selectedReport.editionId) ?? editions.find((edition) => edition.id === selectedReport.editionId)
    : undefined;
  const feedTitle = payload ? (
    <span className="feed-page-title">
      <span>{payload.briefing.title}</span>
    </span>
  ) : initialLoading ? loadingFeedLabel(language) : "briefing";

  async function shareFeed() {
    const url = window.location.origin + window.location.pathname;
    if (navigator.share) {
      try { await navigator.share({ title: payload?.briefing.title, url }); }
      catch (cause) { if (!(cause instanceof DOMException && cause.name === "AbortError")) setError(t("Could not copy URL")); }
      return;
    }
    try { await navigator.clipboard.writeText(url); setSummaryMessage(t("URL copied")); }
    catch { setError(t("Could not copy URL")); }
  }

  async function loadEditionDetail(edition: BriefingEdition): Promise<BriefingEdition | null> {
    const key = feedKey;
    if (!visibleEditionIds.current.has(edition.id)) return null;
    const cached = editionDetails.get(edition.id);
    if (cached) return cached;
    if (edition.sections.length > 0) {
      setEditionDetails((current) => new Map(current).set(edition.id, edition));
      return edition;
    }
    if (!payload) return null;
    setEditionBusyIds((current) => new Set(current).add(edition.id));
    try {
      const detailed = await getFeedEdition(props.username, props.slug, edition.id);
      if (feedIdentity.current !== key || !visibleEditionIds.current.has(edition.id)) return null;
      setEditionDetails((current) => new Map(current).set(edition.id, detailed));
      return detailed;
    } catch (cause) {
      if (feedIdentity.current === key) setError(cause instanceof Error ? cause.message : String(cause));
      return null;
    } finally {
      if (feedIdentity.current === key) setEditionBusyIds((current) => {
        const next = new Set(current);
        next.delete(edition.id);
        return next;
      });
    }
  }

  async function openEditionReport(edition: BriefingEdition, sectionIndex: number) {
    const detailed = await loadEditionDetail(edition);
    if (!detailed || !detailed.sections[sectionIndex]) return;
    setSelectedReport({ editionId: edition.id, sectionIndex });
  }

  const { theme, setTheme } = useTheme();
  const nextLanguage = ({ en: "fr", fr: "ar", ar: "en" } as const)[language];
  const feedActions = (
    <div className="feed-header-actions">
      <button
        type="button"
        className={`star-vote${payload?.viewerHasStarred ? " is-starred" : ""}`}
        title={starTitleLabel(payload?.viewerHasStarred ?? false, language)}
        disabled={!canStar || starBusy || !payload}
        aria-pressed={payload?.viewerHasStarred ?? false}
        onClick={async () => {
          if (!payload) return;
          setStarBusy(true);
          try {
            const result = await setFeedStar(props.username, props.slug, !payload.viewerHasStarred);
            setFeedResult(current => current?.key === feedKey && feedIdentity.current === feedKey ? {
              key: feedKey, value: { ...current.value, briefing: { ...current.value.briefing, stars: result.stars }, viewerHasStarred: result.viewerHasStarred }
            } : current);
          } finally {
            setStarBusy(false);
          }
        }}
      >
        <Star size={20} aria-hidden fill={payload?.viewerHasStarred ? "currentColor" : "none"} />
        <span className="action-label">{starControlLabel(payload?.viewerHasStarred ?? false, language)}</span>{" "}
        <span className="action-count">{payload?.briefing.stars ?? 0}</span>
      </button>
      {payload?.briefing.publicFeedEnabled ? <button type="button" title={t("Share")} aria-label={t("Share")} onClick={() => void shareFeed()}><Share size={20} aria-hidden /></button> : null}
      <FeedMoreMenu label={t("More options")}>
        {close => <>
          <button type="button" onClick={() => { close(); void refresh().catch((cause) => setError(cause instanceof Error ? cause.message : String(cause))); }}><RefreshCw size={16} aria-hidden />{refreshControlLabel(language)}</button>
          {ownedFeed ? <button type="button" onClick={() => { close(); setEditorOpen(true); }}><Settings size={16} aria-hidden />{t("Edit feed settings")}</button> : null}

        </>}
      </FeedMoreMenu>
    </div>
  );

  return (
    <Shell
      header={<AppHeader account={account} onAccount={() => setAccountDialogOpen(true)} leading={<FeedBackLink language={language}/>} actions={feedActions} contextual/>}
      title={feedTitle}
      titleText={payload?.briefing.title ?? "briefing"}
      meta={payload ? <>{bylineLabel(language)} <bdi>{payload.briefing.ownerUsername}</bdi></> : initialLoading ? <span className="feed-loading-message" role="status">{loadingFeedLabel(language)}</span> : undefined}
      feed={payload?.briefing ?? { ownerUsername: props.username, slug: props.slug, title: "" }}
      pageLanguage={language}
    >
      {initialLoading ? <div className="feed-loading-skeleton" aria-hidden="true"><div/><div/></div> : <>
      {account && accountDialogOpen && <AccountDialog account={account} onClose={() => setAccountDialogOpen(false)}
        onLogout={async () => { await logout(); setAccount(null); setOwnedFeed(null); setAccountDialogOpen(false); }}
        onSaved={async (nextAccount, nextBriefings) => {
          setAccount(nextAccount);
          setOwnedFeed(nextBriefings.find(feed => feed.ownerUsername === props.username && feed.slug === props.slug) ?? null);
        }}/>}
      {editorOpen && ownedFeed && <FeedEditor feed={ownedFeed} onClose={() => setEditorOpen(false)} onSave={async input => {
        const saved = await saveFeed(input);
        setOwnedFeed(saved); setEditorOpen(false);
        if (saved.slug !== props.slug) window.location.href = `/${saved.ownerUsername}/${saved.slug}/`;
        else await refresh();
      }} onPause={async () => { const saved = await saveBriefing({ ...ownedFeed, paused: !ownedFeed.paused }); setOwnedFeed(saved); await refresh(); }} onCopy={() => navigator.clipboard.writeText(publicFeedUrl(ownedFeed.ownerUsername, ownedFeed.slug))} onDelete={async () => { await deleteBriefing(ownedFeed.id); window.location.href = "/"; }}/ >}
      <div className={`feed-tools${payload?.editions.length ? "" : " is-empty-feed"}`} dir={pageDir}>
        <div className="feed-filter" role="group" aria-label={filterLabel(language)}>
          {(["all", "unread"] as const).map(option => (
            <button key={option} type="button" aria-pressed={filter === option} onClick={() => { setFilter(option); setVisibleUnreadCount(FEED_BATCH_SIZE); }}>
              {option === "all" ? allFilterLabel(language) : `${unreadFilterLabel(language)}${unreadEditions.length ? ` ${unreadEditions.length}` : ""}`}
            </button>
          ))}
        </div>
        <div className="feed-side-actions">
          <form
            className="search"
            onSubmit={(event) => {
              event.preventDefault(); void applySearch(latestQuery.current, ++searchRequest.current);
            }}
          >
            <Search size={15} aria-hidden />
            <input
              aria-label={searchPublishedLabel(language)}
              dir={pageDir}
              value={query}
              onChange={(event) => { latestQuery.current = event.target.value; searchRequest.current++; setQuery(event.target.value); }}
              placeholder={searchPublishedLabel(language)}
            />
          </form>
        </div>
      </div>
      {reportEdition && selectedReport ? (
        <SourcesSheet
          edition={reportEdition}
          selectedIndex={selectedReport.sectionIndex}
          language={language}
          onClose={() => setSelectedReport(null)}
        />
      ) : null}
      {error ? <FeedNotice message={error} language={language} /> : null}
      <FeedPublicationNotice publicationState={payload?.publicationState} hasPublishedEditions={Boolean(payload?.editions.length)} language={language}/>
      {payload?.sourceAvailability?.some(source=>source.state==='UNAVAILABLE'||source.warning||source.collectionError) ? <FeedNotice severity="warning" language={language} heading={t('Some sources need attention')} message={payload.sourceAvailability.filter(source=>source.state==='UNAVAILABLE'||source.warning||source.collectionError).map(source=>{
        const messages:string[]=[];
        if(source.state==='UNAVAILABLE')messages.push(t(source.reason==='PAID_PROVIDER_NOT_AUTHORIZED_OR_CONFIGURED'?'Paid collection is not authorized or configured.':source.reason==='PAID_OPERATION_UNCERTAIN'?'A previous paid request needs reconciliation before collection can continue.':source.reason==='BUDGET_EXHAUSTED'?'The authorized collection budget is exhausted.':'Source collection is unavailable.'));
        if(source.warning)messages.push(`${source.acquisition?.failed??0} ${t(source.warning==='ARTICLE_AUTH_REQUIRED'?'article acquisition jobs failed with an authentication requirement.':source.warning==='ARTICLE_CHALLENGE_REQUIRED'?'article acquisition jobs were blocked by the publisher.':'article acquisition jobs failed.')}`);
        if(source.collectionError&&!['UNCERTAIN_PAID_SUBMISSION'].includes(source.collectionError))messages.push(t(source.collectionError==='RATE_LIMIT'?'Collection is waiting for the provider rate limit.':source.collectionError==='TRANSIENT'?'Collection encountered a temporary failure and is retrying.':'The latest collection attempt failed.'));
        return `${source.title}: ${messages.join(' ')}`;
      }).join(' ')} /> : null}
      {payload?.publicationState === 'quiet' ? <p className="muted feed-status-message">{t('No new developments in the latest scheduled briefing.')}</p> : null}
      {payload?.publicationState === 'setup_required' ? <p className="muted feed-status-message" role="status">{t('Briefing generation is awaiting an AI connection.')}</p> : null}
      {payload?.publicationState === 'checking' ? <FeedProcessingProgress progress={payload.publicationProgress} language={language}/> : null}
      {summaryMessage ? (
        <p className="muted feed-status-message" lang={language} dir={pageDir}>
          <bdi dir={pageDir}>{summaryMessage}</bdi>
        </p>
      ) : null}
      {feedStatusMessage ? (
        <p className="muted feed-status-message" lang={language} dir={pageDir}>
          <bdi dir={pageDir}>{feedStatusMessage}</bdi>
        </p>
      ) : null}
      {searchLoading && !error && currentEditions.length === 0 ? <p className="muted feed-loading-message" role="status">{loadingFeedLabel(language)}</p> : null}
      <div className="news-line">
        {groupEditionsByDay(visibleUnreadEditions, language, clock).map(group => (
          <section className="news-day-group" key={group.key}>
            <h2 className="news-day">{group.day}</h2>
            <div className="news-day-cards">
              {group.editions.map(edition => (
                <FeedEditionRow
                  key={edition.id}
                  edition={edition}
                  detailEdition={editionDetails.get(edition.id)}
                  language={language}
                  isLoading={editionBusyIds.has(edition.id)}
                  isRead={readIds.has(edition.id)}
                  onToggleRead={() => toggleRead(readIds, setReadIds, edition.id, !readIds.has(edition.id))}
                  onOpenReport={(sectionIndex) => void openEditionReport(edition, sectionIndex)}
                />
              ))}
            </div>
          </section>
        ))}
        {hiddenUnreadCount > 0 ? (
          <div className="load-more-row">
            <button type="button" title={loadMoreLabel(language)} onClick={() => setVisibleUnreadCount((count) => count + FEED_BATCH_SIZE)}>
              {loadMoreLabel(language)}
            </button>
            <span className="muted">{moreCountLabel(hiddenUnreadCount, language)}</span>
          </div>
        ) : null}
        {payload && !initialLoading && !searchLoading && filteredEditions.length === 0 && !error ? (
          <div className="empty-state feed-empty-state">
            {archivedReadEditions.length === 0 && <Newspaper className="feed-empty-icon" size={42} strokeWidth={1.5} aria-hidden/>}
            <strong>{emptyFeedTitle(archivedReadEditions.length, language)}</strong>
            <p className="muted">
              {emptyFeedMessage(archivedReadEditions.length, language)}
            </p>
          </div>
        ) : null}
      </div>
      </>}
    </Shell>
  );
}

function FeedSignalPanel(props: {
  briefing: PublicBriefing;
  editionCount: number;
  unreadCount: number;
  language: "en" | "ar" | "fr";
  nowMs: number;
}) {
  const nextValue = props.briefing.paused
    ? pausedScheduleLabel(props.language)
    : props.briefing.nextBriefingAt
      ? formatCountdown(props.briefing.nextBriefingAt, props.nowMs, props.language)
      : summaryPublishedLabel(props.language);
  return (
    <section className="feed-signal-panel" aria-label="feed signal">
      <div className="feed-signal-primary">
        <span className="eyebrow">{cadenceMetaLabel(props.briefing.briefingCadence, props.language)}</span>
        <strong><bdi>{props.briefing.title}</bdi></strong>
        <span className="muted">@{props.briefing.ownerUsername}</span>
      </div>
      <div className="feed-signal-grid">
        <div className="signal-stat">
          <Sparkles size={17} aria-hidden />
          <span>{props.unreadCount}</span>
          <small>{signalMetricLabel("unread", props.language)}</small>
        </div>
        <div className="signal-stat">
          <LayoutDashboard size={17} aria-hidden />
          <span>{props.editionCount}</span>
          <small>{signalMetricLabel("published", props.language)}</small>
        </div>
        <div className="signal-stat">
          <Star size={17} aria-hidden />
          <span>{props.briefing.stars}</span>
          <small>{signalMetricLabel("stars", props.language)}</small>
        </div>
        <div className="signal-stat wide">
          <Gauge size={17} aria-hidden />
          <span><bdi>{nextValue}</bdi></span>
          <small>{signalMetricLabel("next", props.language)}</small>
        </div>
      </div>
    </section>
  );
}

function groupEditionsByDay(editions: BriefingEdition[], language: "en" | "ar" | "fr", now: number) {
  const groups: { key: string; day: string; editions: BriefingEdition[] }[] = [];
  for (const edition of editions) {
    const day = formatDayHeading(edition.publishedAt, language, now);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.editions.push(edition);
    else groups.push({ key: `${day}:${edition.id}`, day, editions: [edition] });
  }
  return groups;
}

function FeedEditionRow(props: {
  edition: BriefingEdition;
  detailEdition?: BriefingEdition;
  language: "en" | "ar" | "fr";
  isLoading: boolean;
  isRead: boolean;
  onToggleRead: () => void;
  onOpenReport: (sectionIndex: number) => void;
}) {
  const { edition, language } = props;
  const textDir = textDirection(language);
  const summary = normalizeSummary(edition.summary);
  const referenceCount = Math.max(props.detailEdition?.sections.length ?? 0, edition.sections.length, highestReferenceNumber(edition.summary));
  const stamp = `${formatDayHeading(edition.publishedAt, language)}, ${formatClock(edition.publishedAt, language)}`;
  return (
    <article className={`news-item${props.isRead ? " is-read" : ""}`} aria-label={stamp} lang={language} dir={textDir}>
      <div className="news-head">
        {props.isRead ? null : <span className="news-unread" aria-hidden />}
        <time dateTime={edition.publishedAt}>{formatClock(edition.publishedAt, language)}</time>
      </div>
      <ReferenceParagraph
        className="news-summary"
        text={summary}
        language={language}
        referenceCount={referenceCount}
        onOpenReference={props.onOpenReport}
      />
      <div className="news-foot">
        {referenceCount > 0 ? (
          <button type="button" className="news-sources" aria-busy={props.isLoading} onClick={() => props.onOpenReport(0)}>
            <span>{sourcesLabel(language)}</span>
            <span className="news-sources-count">{referenceCount}</span>
            {textDir === "rtl" ? <ChevronLeft size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />}
          </button>
        ) : <span />}
        <button
          type="button"
          className="read-button"
          aria-pressed={props.isRead}
          onClick={props.onToggleRead}
        >
          <Check size={16} aria-hidden />
          {markReadLabel(props.isRead, language)}
        </button>
      </div>
    </article>
  );
}

const trailingPunctuation = /^[.,;:!?)\]…،؛؟]+/u;

function ReferenceParagraph(props: {
  text: string;
  language: "en" | "ar" | "fr";
  referenceCount: number;
  className: string;
  onOpenReference: (sectionIndex: number) => void;
}) {
  const textDir = textDirection(props.language);
  const parts = referenceTextParts(props.text);
  if (parts.length === 0) {
    return <p className={props.className} dir={textDir}><bdi dir={textDir}>{props.text}</bdi></p>;
  }

  return (
    <p className={props.className} dir={textDir}>
      {parts.map((part, index) => {
        if (part.kind === "text") {
          // A marker hugs the word before it, like a footnote.
          const next = parts[index + 1];
          const previous = parts[index - 1];
          let value = next?.kind === "reference" ? part.value.replace(/\s+$/u, "") : part.value;
          // Punctuation right after a marker stays on the marker's line.
          if (previous?.kind === "reference") value = value.replace(trailingPunctuation, "");
          return value ? <bdi key={`${part.value}:${index}`} dir={textDir}>{value}</bdi> : null;
        }
        const canOpen = part.value >= 1 && part.value <= props.referenceCount;
        const following = parts[index + 1];
        const punctuation = following?.kind === "text" ? following.value.match(trailingPunctuation)?.[0] ?? "" : "";
        const marker = (
          <button
            key={`reference-${part.value}-${index}`}
            type="button"
            className="inline-reference"
            disabled={!canOpen}
            title={referenceButtonLabel(part.value, props.language)}
            aria-label={referenceButtonLabel(part.value, props.language)}
            onClick={() => props.onOpenReference(part.value - 1)}
          >
            {part.value}
          </button>
        );
        return punctuation ? <span key={`cluster-${part.value}-${index}`} className="reference-cluster">{marker}<bdi dir={textDir}>{punctuation}</bdi></span> : marker;
      })}
    </p>
  );
}

function SourcesSheet(props: {
  edition: BriefingEdition;
  selectedIndex: number;
  language: "en" | "ar" | "fr";
  onClose: () => void;
}) {
  const { edition, language } = props;
  const textDir = textDirection(language);
  const selected = useRef<HTMLLIElement | null>(null);
  useEffect(() => {
    // Land on the story that was tapped; content above it stays one scroll away.
    if (props.selectedIndex > 0) selected.current?.scrollIntoView({ block: "start" });
  }, [props.selectedIndex]);
  return (
    <Sheet
      title={sourcesLabel(language)}
      closeLabel={closeSourcesLabel(language)}
      icon={<Layers size={17} aria-hidden />}
      onClose={props.onClose}
      wide
    >
      <div className="sources-module" lang={language} dir={textDir}>
        <p className="sources-edition">
          <strong>{formatDayHeading(edition.publishedAt, language)}</strong>
          <span>{formatClock(edition.publishedAt, language)}</span>
        </p>
        <ol className="sources-stories">
          {edition.sections.map((section, index) => (
            <li
              key={`${section.title}:${index}`}
              id={`${edition.id}-source-${index + 1}`}
              ref={index === props.selectedIndex ? selected : undefined}
              className={`sources-story${index === props.selectedIndex ? " is-selected" : ""}`}
            >
              <div className="sources-story-head">
                <span className="sources-story-number" aria-hidden>{index + 1}</span>
                <h3><bdi>{section.title}</bdi></h3>
              </div>
              <p className="sources-story-summary"><bdi dir={textDir}>{section.summary}</bdi></p>
              {section.evidence.length === 0
                ? <p className="muted">{noReferencesLabel(language)}</p>
                : <ul className="sources-posts">
                    {section.evidence.map((entry, postIndex) => (
                      <SourcePost key={`${entry.messageId}:${entry.postedAt}:${postIndex}`} entry={entry} language={language} />
                    ))}
                  </ul>}
            </li>
          ))}
        </ol>
      </div>
    </Sheet>
  );
}

function SourcePost(props: { entry: BriefingEvidence; language: "en" | "ar" | "fr" }) {
  const { entry, language } = props;
  const textDir = textDirection(language);
  const [open, setOpen] = useState(false);
  const textId = useId();
  const hasText = entry.text.trim().length > 0;
  return (
    <li className="sources-post">
      <div className="sources-post-head" dir="ltr">
        <strong className="sources-post-source"><bdi>{entry.sourceTitle}</bdi></strong>
        <time dateTime={entry.postedAt}>{formatTime(entry.postedAt, language)}</time>
      </div>
      {hasText ? (
        <p id={textId} className={`sources-post-text${open ? " is-open" : ""}`} dir={textDir}><bdi dir={textDir}>{entry.text}</bdi></p>
      ) : null}
      <div className="sources-post-actions">
        {hasText && entry.text.trim().length > 160 ? (
          <button type="button" className="sources-more" aria-expanded={open} aria-controls={textId} onClick={() => setOpen(value => !value)}>
            {open ? showLessLabel(language) : showMoreLabel(language)}
          </button>
        ) : null}
        {entry.sourceUrl ? <a href={entry.sourceUrl} target="_blank" rel="noreferrer"><ArrowUpRight size={16} aria-hidden />{openPostLabel(language)}</a> : null}
        {entry.links.map((link) => <a key={link} href={link} target="_blank" rel="noreferrer"><ArrowUpRight size={16} aria-hidden />{linkHostLabel(link, language)}</a>)}
        {entry.media.map((media, index) =>
          media.url ? (
            <a key={`${media.url}-${index}`} href={media.url} target="_blank" rel="noreferrer">
              <ArrowUpRight size={16} aria-hidden />{mediaDisplayLabel(media, language)}
            </a>
          ) : (
            <span key={`${media.fileId}-${index}`} className="muted">{mediaDisplayLabel(media, language)}</span>
          )
        )}
      </div>
    </li>
  );
}

function Timestamp(props: { value: string; language: "en" | "ar" | "fr" }) {
  const label = formatTime(props.value, props.language);
  return <time dateTime={props.value} dir={textDirection(props.language)}>{label}</time>;
}

function StatusLine(props: { label: string; value: React.ReactNode; valueDir?: "ltr" | "rtl" }) {
  const valueDir = props.valueDir ?? "ltr";
  return (
    <p className="status-line">
      <span className="status-label">{props.label}</span>
      <span className="status-value" dir={valueDir}>
        {typeof props.value === "string" ? <bdi dir={valueDir}>{props.value}</bdi> : props.value}
      </span>
    </p>
  );
}

function FeedBackLink({ language }: { language: "en" | "ar" | "fr" }) {
  const label = language === "ar" ? "رجوع" : language === "fr" ? "Retour" : "Back";
  return <a className="feed-nav-back" href="/" onClick={event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (document.referrer && new URL(document.referrer).origin === window.location.origin && window.history.length > 1) { event.preventDefault(); window.history.back(); }
  }}>{language === "ar" ? <ChevronRight size={24} aria-hidden /> : <ChevronLeft size={24} aria-hidden />}<span>{label}</span></a>;
}

function FeedMoreMenu(props: { label: string; children: (close: () => void) => React.ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useVisibleFeedMenu(ref);
  const close = () => { if (ref.current) ref.current.open = false; };
  useEffect(() => {
    const down = (event: PointerEvent) => { if (ref.current && !ref.current.contains(event.target as Node)) close(); };
    document.addEventListener("pointerdown", down);
    return () => document.removeEventListener("pointerdown", down);
  }, []);
  return (
    <details
      ref={ref}
      className="feed-options feed-more"
      onKeyDown={event => { if (event.key === "Escape") { close(); ref.current?.querySelector("summary")?.focus(); } }}
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) close(); }}
    >
      <summary aria-label={props.label} title={props.label}><Ellipsis size={22} aria-hidden /></summary>
      <div className="feed-options-popover">{props.children(close)}</div>
    </details>
  );
}

function Shell(props: {
  header?: React.ReactNode;
  title: React.ReactNode;
  titleText?: string;
  children: React.ReactNode;
  meta?: React.ReactNode;
  description?: React.ReactNode;
  feed?: Pick<BriefingConfig, "ownerUsername" | "slug" | "title">;
  onAccount?: () => void;
  onLogout?: () => Promise<void>;
  pageLanguage?: "en" | "ar" | "fr";
  headingAction?: React.ReactNode;
}) {
  const { language: selectedLanguage } = useLanguage();
  const titleText = props.titleText ?? (typeof props.title === "string" ? props.title : "briefing");
  const shellLanguage = selectedLanguage;
  const shellMode = props.feed ? "feed-shell" : props.onAccount ? "admin-shell" : "auth-shell";

  useEffect(() => {
    document.documentElement.lang = selectedLanguage;
    document.documentElement.dir = selectedLanguage === "ar" ? "rtl" : "ltr";
    document.title = titleText === "Distilled.news" ? "Distilled.news" : `${titleText} · Distilled.news`;
    const manifest = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (manifest) {
      manifest.href = props.feed
        ? `/manifest.webmanifest?user=${encodeURIComponent(props.feed.ownerUsername)}&feed=${encodeURIComponent(props.feed.slug)}`
        : "/manifest.webmanifest";
    }
  }, [props.feed, selectedLanguage, titleText]);

  return (
    <main className={`shell ${shellMode}`}><PublicNavigation/>
      {props.header ?? <header>
        <div className="header-primary">
          <div className="brand-lockup">
            <div className="brand" aria-label="Distilled.news" title="Distilled.news">
              <span className="experience-brand"><BrandMark/></span>
            </div>
            <a href="https://github.com/AmmarMohanna/distilled.news" target="_blank" rel="noreferrer" className="brand-icon" aria-label="Open GitHub repository" title="open GitHub repository">
              <Github size={16} aria-hidden />
            </a>
          </div>
        </div>
        <div className="header-actions">
          <div className="header-controls">
            <LanguageControl/>
            {props.onAccount ? (
              <button type="button" className="icon-button" aria-label="account settings" title="account settings" onClick={props.onAccount}>
                <User size={16} aria-hidden />
              </button>
            ) : null}
            <ThemeToggle/>
            {props.onLogout ? <button type="button" title="logout" onClick={() => void props.onLogout?.()}><LogOut size={15} aria-hidden /> logout</button> : null}
          </div>
        </div>
      </header>}
      <div className="page-heading">
        <div className="page-title-row"><h1>{props.title}</h1>{props.headingAction}</div>
        <p>{props.meta ?? getPageMeta(titleText)}</p>
        {props.description && <div className="feed-page-description">{props.description}</div>}
      </div>
      {props.children}
    </main>
  );
}

function getPageMeta(title: string): string {
  if (title === "create") return "define the feed and add sources.";
  if (title === "briefing") return "Published briefing items only.";
  if (title.includes("Briefing")) return "Published briefing items only.";
  if (title === "verify email") return "Account verification.";
  if (title === "Reset Password") return "Account recovery.";
  return "Less clutter. Personalized news, to the point.";
}

function createNavLabel(language: "en" | "ar" | "fr"): string {
  if (language === "ar") return "إنشاء";
  if (language === "fr") return "créer";
  return "create";
}

function feedNavLabel(language: "en" | "ar" | "fr"): string {
  if (language === "ar") return "الموجز";
  if (language === "fr") return "fil";
  return "feed";
}

function signalMetricLabel(metric: "unread" | "published" | "stars" | "next", language: "en" | "ar" | "fr"): string {
  if (language === "ar") {
    if (metric === "unread") return "غير مقروء";
    if (metric === "published") return "منشور";
    if (metric === "stars") return "نجوم";
    return "التالي";
  }
  if (language === "fr") {
    if (metric === "unread") return "non lu";
    if (metric === "published") return "publié";
    if (metric === "stars") return "étoiles";
    return "prochain";
  }
  if (metric === "unread") return "unread";
  if (metric === "published") return "published";
  if (metric === "stars") return "stars";
  return "next";
}

function updateBriefingList(current: BriefingConfig[], next: BriefingConfig): BriefingConfig[] {
  const exists = current.some((item) => item.id === next.id);
  if (!exists) return [...current, next];
  return current.map((item) => (item.id === next.id ? next : item));
}

function createBriefingDraft(existing: BriefingConfig[], account: AccountRecord): BriefingConfig {
  const nextIndex = existing.length + 1;
  const title = nextIndex === 1 ? "Personal Briefing" : `Briefing ${nextIndex}`;
  return {
    ...personalNewsBriefing,
    id: `briefing_${crypto.randomUUID()}`,
    ownerAccountId: account.id,
    ownerUsername: account.username,
    title,
    slug: deriveBriefingSlug(existing, title),
    publicFeedEnabled: true,
    paused: false,
    language: "en",
    intensity: "medium",
    briefingCadence: "hourly",
    briefingTimeOfDay: "00:00",
    briefingTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    retentionDays: 15,
    stars: 0
  };
}

function visibleBriefingCadence(cadence: BriefingConfig["briefingCadence"]): Exclude<BriefingConfig["briefingCadence"], "monthly"> {
  return cadence === "monthly" ? "weekly" : cadence;
}

function toggleRead(
  current: Set<string>,
  setValue: React.Dispatch<React.SetStateAction<Set<string>>>,
  id: string,
  read: boolean
) {
  const next = new Set(current);
  if (read) next.add(id);
  else next.delete(id);
  setValue(next);
}

function formatSourceIngestResult(result: SourceIngestResult): string {
  if (result.runStarted) return "source run started";
  if (result.imported === 0 && result.skipped > 0) return `checked ${result.fetched}, no new posts`;
  return `fetched ${result.fetched}, saved ${result.imported}`;
}

function formatSourceRefreshResults(results: SourceIngestResult[]): string {
  const totals = results.reduce(
    (sum, result) => ({
      fetched: sum.fetched + result.fetched,
      imported: sum.imported + result.imported,
      queued: sum.queued + result.queued,
      skipped: sum.skipped + result.skipped
    }),
    { fetched: 0, imported: 0, queued: 0, skipped: 0 }
  );
  if (results.some((result) => result.runStarted)) return "source run started";
  if (totals.fetched === 0) return "no enabled sources to refresh";
  if (totals.imported === 0 && totals.skipped > 0) return `checked ${totals.fetched}, no new posts`;
  return `fetched ${totals.fetched}, saved ${totals.imported}`;
}

function sourceInputKind(input: string): string {
  const trimmed = input.trim();
  if (/^https?:\/\/(?:www\.)?t\.me\//i.test(trimmed) || /^@[A-Za-z0-9_]{3,}$/i.test(trimmed)) return "Telegram source";
  if (/^https?:\/\/(?:www\.)?(?:x|twitter)\.com\//i.test(trimmed)) return "X source";
  if (/^https?:\/\//i.test(trimmed)) return "source URL";
  return "search topic";
}

function sourceProviderLabel(source: SourceRecord): string {
  if (source.kind === "google_news") return "google news";
  if (source.kind === "x_profile" || source.kind === "x_search") return "x";
  if (source.kind === "rss_feed") return "rss";
  if (source.kind === "linkedin_company" || source.kind === "linkedin_profile") return "linkedin";
  return source.provider;
}

function SourceStatusNote(props: { source: SourceRecord }) {
  if (!props.source.lastError) return null;
  const note = sourceStatusNote(props.source);
  return <span className={note.className} title={props.source.lastError}>{note.text}</span>;
}

function sourceStatusNote(source: SourceRecord): { text: string; className: string } {
  if (source.kind === "google_news" && /Google News RSS source: (?:429|5\d\d)/i.test(source.lastError ?? "")) {
    if (/Apify fallback daily .* cap reached/i.test(source.lastError ?? "")) {
      return {
        text: "Google News RSS is unavailable and the Apify fallback hit today's cap.",
        className: "source-warning"
      };
    }
    if (/Apify fallback failed/i.test(source.lastError ?? "")) {
      return {
        text: "Google News RSS is unavailable and the Apify fallback could not start.",
        className: "source-warning"
      };
    }
    return {
      text: source.enabled
        ? "Google News RSS is temporarily unavailable from the Worker; retrying through the guarded schedule."
        : "Paused after repeated Google News RSS failures. Re-enable to retry.",
      className: "source-warning"
    };
  }
  if (/^(Quarantined after repeated queue failures|Paused after repeated source failures):/i.test(source.lastError ?? "")) {
    return {
      text: source.enabled ? "Repeated source failures; monitoring before the next retry." : "Paused after repeated source failures. Re-enable to retry.",
      className: "source-warning"
    };
  }
  return { text: source.lastError ?? "", className: "source-error" };
}

function isHealthActivity(activity: string): boolean {
  return /^(checking|processing|source run started)/.test(activity);
}

function getHealthSummaryParts(briefing: BriefingConfig, health: HealthStatus | null): {
  feedState: string;
  latest: string;
  queueState: string;
} {
  const feedState = briefing.paused ? "paused" : "live";
  const latest = health?.latestPublishedAt ? formatTime(health.latestPublishedAt, briefing.language) : "no published items";
  const queued = health?.processing.queued ?? 0;
  const failed = health?.processing.failed ?? 0;
  const queueState = failed > 0 ? `failed ${failed}` : queued > 0 ? `queued ${queued}` : "queue clear";
  return { feedState, latest, queueState };
}

function textDirection(language: "en" | "ar" | "fr"): "ltr" | "rtl" {
  return language === "ar" ? "rtl" : "ltr";
}

function bylineLabel(language: "en" | "ar" | "fr"): string {
  if (language === "ar") return "بواسطة";
  if (language === "fr") return "par";
  return "by";
}

function loadingFeedLabel(language: "en" | "ar" | "fr"): string {
  if (language === "ar") return "جار تحميل الموجز";
  if (language === "fr") return "chargement du fil";
  return "loading feed";
}

function refreshControlLabel(language: "en" | "ar" | "fr"): string {
  if (language === "ar") return "تحديث";
  if (language === "fr") return "Actualiser";
  return "Refresh";
}

function summaryPublishedLabel(language: "en" | "ar" | "fr"): string {
  if (language === "ar") return "تم نشر موجز جديد.";
  if (language === "fr") return "nouveau brief publié.";
  return "new brief published.";
}

function starControlLabel(starred: boolean, language: "en" | "ar" | "fr"): string {
  if (language === "ar") return starred ? "مميّز" : "تمييز";
  if (language === "fr") return starred ? "Favori" : "Favoriser";
  return starred ? "Starred" : "Star";
}

function starTitleLabel(starred: boolean, language: "en" | "ar" | "fr"): string {
  if (language === "ar") return starred ? "إزالة التمييز" : "تمييز الموجز";
  if (language === "fr") return starred ? "retirer le favori" : "favoriser le fil";
  return starred ? "remove star" : "star feed";
}

function loadingFeedsLabel(language: "en" | "ar" | "fr"): string {
  if (language === "ar") return "جار تحميل الموجزات";
  if (language === "fr") return "chargement des fils";
  return "loading feeds";
}

function noFeaturedFeedsLabel(language: "en" | "ar" | "fr"): string {
  if (language === "ar") return "لم يتم نشر أي خلاصات في الاستكشاف بعد.";
  if (language === "fr") return "Aucun fil n’a encore été publié dans Explorer.";
  return "No feeds have been published to Explore yet.";
}

function filterLabel(language: "en" | "ar" | "fr"): string {
  if (language === "ar") return "تصفية الموجزات";
  if (language === "fr") return "Filtrer les briefs";
  return "Filter briefings";
}

function allFilterLabel(language: "en" | "ar" | "fr"): string {
  if (language === "ar") return "الكل";
  if (language === "fr") return "Tous";
  return "All";
}

function unreadFilterLabel(language: "en" | "ar" | "fr"): string {
  if (language === "ar") return "غير مقروء";
  if (language === "fr") return "Non lus";
  return "Unread";
}

function searchPublishedLabel(language: "en" | "ar" | "fr"): string {
  if (language === "ar") return "ابحث في الموجز المنشور";
  if (language === "fr") return "Chercher dans les briefs";
  return "Search briefings";
}

function loadMoreLabel(language: "en" | "ar" | "fr"): string {
  if (language === "ar") return "عرض المزيد";
  if (language === "fr") return "afficher plus";
  return "load more";
}

function moreCountLabel(count: number, language: "en" | "ar" | "fr"): string {
  if (language === "ar") return `${count} إضافية`;
  if (language === "fr") return `${count} de plus`;
  return `${count} more`;
}

function emptyFeedTitle(readCount: number, language: "en" | "ar" | "fr"): string {
  if (language === "ar") return readCount > 0 ? "كل الموجزات الظاهرة مقروءة" : "لا توجد موجزات منشورة";
  if (language === "fr") return readCount > 0 ? "tous les briefs visibles sont lus" : "aucun brief publié";
  return readCount > 0 ? "all visible briefings are read" : "no published briefings";
}

function emptyFeedMessage(readCount: number, language: "en" | "ar" | "fr"): string {
  if (language === "ar") return readCount > 0 ? "افتح قسم المقروء للعودة إلى الموجزات السابقة." : "سيظهر الموجز المجدول التالي هنا.";
  if (language === "fr") return readCount > 0 ? "Ouvrez la section lue pour revoir les anciens briefs." : "Le prochain brief programmé apparaîtra ici.";
  return readCount > 0 ? "Open the read section below to revisit archived briefings." : "The next scheduled briefing will appear here.";
}

function readSectionLabel(count: number, language: "en" | "ar" | "fr"): string {
  if (language === "ar") return `مقروء · ${count}`;
  if (language === "fr") return `Lus · ${count}`;
  return `Read · ${count}`;
}

function markReadLabel(isRead: boolean, language: "en" | "ar" | "fr"): string {
  if (language === "ar") return isRead ? "وضع كغير مقروء" : "وضع كمقروء";
  if (language === "fr") return isRead ? "Marquer comme non lu" : "Marquer comme lu";
  return isRead ? "Mark as unread" : "Mark as read";
}

function readToggleText(isRead: boolean, language: "en" | "ar" | "fr"): string {
  if (language === "ar") return isRead ? "غير مقروء" : "مقروء";
  if (language === "fr") return isRead ? "non lu" : "lu";
  return isRead ? "unread" : "read";
}

function readToggleTitle(isRead: boolean, language: "en" | "ar" | "fr"): string {
  if (language === "ar") return isRead ? "وضع كغير مقروء" : "وضع كمقروء";
  if (language === "fr") return isRead ? "marquer non lu" : "marquer lu";
  return isRead ? "mark unread" : "mark read";
}

function readToggleAria(title: string, isRead: boolean, language: "en" | "ar" | "fr"): string {
  if (language === "ar") return isRead ? `وضع ${title} كغير مقروء` : `وضع ${title} كمقروء`;
  if (language === "fr") return isRead ? `marquer ${title} non lu` : `marquer ${title} lu`;
  return isRead ? `mark ${title} unread` : `mark ${title} read`;
}

function pausedScheduleLabel(language: "en" | "ar" | "fr"): string {
  if (language === "ar") return "متوقف مؤقتاً";
  if (language === "fr") return "en pause";
  return "paused";
}

function formatAutosaveStatus(state: "idle" | "saving" | "saved" | "error", status: string): string {
  if (state === "saving") return "saving";
  if (state === "saved") return "saved";
  if (state === "error") return "could not save";
  return status || "ready";
}

function formatCountdown(isoDate: string, nowMs: number, language: "en" | "ar" | "fr" = "en"): string {
  const diffMs = new Date(isoDate).getTime() - nowMs;
  if (!Number.isFinite(diffMs)) return "";
  if (diffMs <= 0) {
    if (language === "ar") return "مستحق الآن";
    if (language === "fr") return "maintenant";
    return "is due";
  }
  const minutes = Math.ceil(diffMs / 60_000);
  if (minutes < 60) {
    if (language === "ar") return `بعد ${minutes} د`;
    if (language === "fr") return `dans ${minutes} min`;
    return `in ${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours < 24) {
    if (language === "ar") return remainder === 0 ? `بعد ${hours} س` : `بعد ${hours} س ${remainder} د`;
    if (language === "fr") return remainder === 0 ? `dans ${hours}h` : `dans ${hours}h ${remainder}m`;
    return remainder === 0 ? `in ${hours}h` : `in ${hours}h ${remainder}m`;
  }
  const days = Math.floor(hours / 24);
  if (language === "ar") return `بعد ${days} يوم`;
  if (language === "fr") return `dans ${days}j`;
  return `in ${days}d`;
}

function feedStatusText(briefing: PublicBriefing, nowMs: number, language: "en" | "ar" | "fr"): string {
  if (briefing.paused) return pausedFeedMessage(language);
  if (!briefing.nextBriefingAt) return "";
  const nextAt = new Date(briefing.nextBriefingAt).getTime();
  if (!Number.isFinite(nextAt)) return "";
  if (nextAt <= nowMs) return awaitingAcceptedBriefMessage(briefing.briefingCadence, language);
  const countdown = formatCountdown(briefing.nextBriefingAt, nowMs, language);
  return countdown ? nextBriefingText(briefing.briefingCadence, countdown, language) : "";
}

function pausedFeedMessage(language: "en" | "ar" | "fr"): string {
  if (language === "ar") return "الموجز متوقف مؤقتاً؛ لن تُنشر موجزات جديدة حتى يُستأنف.";
  if (language === "fr") return "fil en pause; aucun nouveau brief ne sera publié avant reprise.";
  return "feed paused; no new briefings will publish until it resumes.";
}

function awaitingAcceptedBriefMessage(
  cadence: BriefingConfig["briefingCadence"],
  language: "en" | "ar" | "fr"
): string {
  if (language === "ar") return cadence === "hourly" ? "بانتظار التحديث المقبول التالي." : `بانتظار الموجز المقبول التالي (${cadenceMetaLabel(cadence, language)}).`;
  if (language === "fr") return cadence === "hourly" ? "en attente de la prochaine mise à jour acceptée." : `en attente du prochain brief ${cadenceMetaLabel(cadence, language)} accepté.`;
  return cadence === "hourly" ? "waiting for the next accepted update." : `waiting for the next accepted ${cadence} brief.`;
}

function referenceButtonLabel(referenceNumber: number, language: "en" | "ar" | "fr"): string {
  if (language === "ar") return `المصدر ${referenceNumber}`;
  if (language === "fr") return `Source ${referenceNumber}`;
  return `Source ${referenceNumber}`;
}

function linkHostLabel(link: string, language: "en" | "ar" | "fr"): string {
  try { return new URL(link).hostname.replace(/^www\./u, "") || linkLabel(language); }
  catch { return linkLabel(language); }
}

function sourcesLabel(language: "en" | "ar" | "fr"): string {
  if (language === "ar") return "المصادر";
  return "Sources";
}

function closeSourcesLabel(language: "en" | "ar" | "fr"): string {
  if (language === "ar") return "إغلاق";
  if (language === "fr") return "Fermer";
  return "Close";
}

function openPostLabel(language: "en" | "ar" | "fr"): string {
  if (language === "ar") return "فتح المنشور";
  if (language === "fr") return "Ouvrir la publication";
  return "Open post";
}

function showMoreLabel(language: "en" | "ar" | "fr"): string {
  if (language === "ar") return "عرض المزيد";
  if (language === "fr") return "Voir plus";
  return "Show more";
}

function showLessLabel(language: "en" | "ar" | "fr"): string {
  if (language === "ar") return "عرض أقل";
  if (language === "fr") return "Voir moins";
  return "Show less";
}

function cadenceMetaLabel(cadence: BriefingConfig["briefingCadence"], language: "en" | "ar" | "fr"): string {
  if (language === "ar") {
    if (cadence === "daily") return "يومي";
    if (cadence === "weekly") return "أسبوعي";
    if (cadence === "monthly") return "شهري";
    return "تحديثات";
  }
  if (language === "fr") {
    if (cadence === "daily") return "quotidien";
    if (cadence === "weekly") return "hebdomadaire";
    if (cadence === "monthly") return "mensuel";
    return "mises à jour";
  }
  if (cadence === "hourly") return "updates";
  return cadence;
}

function nextBriefingText(
  cadence: BriefingConfig["briefingCadence"],
  countdown: string,
  language: "en" | "ar" | "fr"
): string {
  if (language === "ar") return cadence === "hourly" ? `الفحص التالي ${countdown}` : `الموجز التالي ${countdown}`;
  if (language === "fr") return `prochain brief ${cadenceMetaLabel(cadence, language)} ${countdown}`;
  return cadence === "hourly" ? `next check ${countdown}` : `next ${cadence} brief ${countdown}`;
}

function noReferencesLabel(language: "en" | "ar" | "fr"): string {
  if (language === "ar") return "لا توجد مصادر لهذا الخبر.";
  if (language === "fr") return "Aucune source pour cet article.";
  return "No sources for this story.";
}

function originalPostLabel(language: "en" | "ar" | "fr"): string {
  if (language === "ar") return "المنشور الأصلي";
  if (language === "fr") return "publication originale";
  return "original post";
}

function linkLabel(language: "en" | "ar" | "fr"): string {
  if (language === "ar") return "رابط";
  if (language === "fr") return "Lien";
  return "Link";
}

function mediaDisplayLabel(media: BriefingEvidence["media"][number], language: "en" | "ar" | "fr"): string {
  const generatedTelegramLabel = /^telegram\s+/i.test(media.label ?? "");
  if (media.label && !generatedTelegramLabel) return media.label;
  if (language === "ar") {
    if (media.type === "photo") return "صورة";
    if (media.type === "video") return "فيديو";
    if (media.type === "document") return "مستند";
    if (media.type === "animation") return "رسوم متحركة";
    if (media.type === "audio") return "صوت";
    if (media.type === "voice") return "رسالة صوتية";
    return "وسائط";
  }
  if (language === "fr") {
    if (media.type === "photo") return "photo";
    if (media.type === "video") return "vidéo";
    if (media.type === "document") return "document";
    if (media.type === "animation") return "animation";
    if (media.type === "audio") return "audio";
    if (media.type === "voice") return "message vocal";
    return "média";
  }
  return media.label ?? media.type;
}

function onboardingStorageKey(accountId: string): string {
  return `ln_onboarding:${accountId}`;
}

function isFirstRunBriefing(briefing: BriefingConfig): boolean {
  return (
    briefing.slug === personalNewsBriefing.slug &&
    briefing.title === personalNewsBriefing.title &&
    briefing.interestProfile === personalNewsBriefing.interestProfile
  );
}

async function wait(milliseconds: number): Promise<void> {
  await new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function prepareBriefingForSave(briefing: BriefingConfig, existing: BriefingConfig[]): BriefingConfig {
  const nextSlug = deriveBriefingSlug(existing, briefing.title, briefing.id);
  return {
    ...briefing,
    slug: slugify(nextSlug),
    publicFeedEnabled: briefing.publicFeedEnabled,
    intensity: briefing.intensity ?? "medium",
    briefingCadence: visibleBriefingCadence(briefing.briefingCadence ?? "hourly"),
    briefingTimeOfDay: "00:00",
    briefingTimezone: briefing.briefingTimezone ?? "UTC",
    retentionDays: 15
  };
}

function sortBriefings(briefings: BriefingConfig[]): BriefingConfig[] {
  return [...briefings].sort((left, right) => {
    if (left.stars !== right.stars) return right.stars - left.stars;
    return left.title.localeCompare(right.title);
  });
}

createRoot(document.getElementById("root")!).render(<ScreenPages><App /></ScreenPages>);
