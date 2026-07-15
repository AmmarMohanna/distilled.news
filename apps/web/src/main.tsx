import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  CircleCheck,
  Compass,
  Copy,
  ExternalLink,
  Globe,
  Github,
  HelpCircle,
  Languages,
  ListChecks,
  LogIn,
  LogOut,
  Moon,
  Pause,
  Play,
  Plus,
  RadioTower,
  RefreshCw,
  Save,
  Search,
  Send,
  Settings,
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
  deleteAdminAccount,
  deleteAdminBriefing,
  deleteSource,
  forgotPassword,
  getBriefings,
  getAdminEmailStatus,
  getExploreFeeds,
  getFeed,
  getFeedEdition,
  getHealth,
  getSession,
  getSourceSuggestions,
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
  searchFeed,
  sendAdminEmailTest,
  setFeedStar,
  setSourceEnabled,
  setupAdmin,
  updateAccount,
  updateAdminAccount,
  updateAdminBriefing,
  verifyEmail,
  type AdminEmailStatus,
  type SourceIngestResult,
  type SourceRefreshResult
} from "./api";
import { deriveBriefingSlug, formatTime, publicFeedUrl, slugify } from "./helpers";
import type { AccountRecord, AccountWithStats, FeedPayload, HealthStatus, PublicBriefing, SessionStatus, SourceRecord, SourceSuggestion } from "./types";
import "./styles.css";

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
  if (path === "/verify-email") return <VerifyEmailPage token={new URLSearchParams(window.location.search).get("token") ?? ""} />;
  if (path === "/reset-password") return <ResetPasswordPage token={new URLSearchParams(window.location.search).get("token") ?? ""} />;
  const feedMatch = path.match(/^\/([^/.][^/]*)\/([^/]+)\/?$/);
  if (feedMatch && !["api", "admin", "auth", "feed"].includes(feedMatch[1])) {
    return <FeedPage username={decodeURIComponent(feedMatch[1])} slug={decodeURIComponent(feedMatch[2])} />;
  }
  return <AdminPage />;
}

function languageLabel(language: "en" | "ar" | "fr"): string {
  if (language === "ar") return "arabic";
  if (language === "fr") return "french";
  return "english";
}

function AdminPage() {
  const [session, setSession] = useState<SessionStatus | null>(null);
  const [briefings, setBriefings] = useState<BriefingConfig[]>([]);
  const [selectedBriefingId, setSelectedBriefingId] = useState<string | null>(null);
  const [sources, setSources] = useState<SourceRecord[]>([]);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [accounts, setAccounts] = useState<AccountWithStats[]>([]);
  const [status, setStatus] = useState("");
  const [sourceStatus, setSourceStatus] = useState("");
  const [sourceToggleBusyId, setSourceToggleBusyId] = useState<string | null>(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceSuggestions, setSourceSuggestions] = useState<SourceSuggestion[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [error, setError] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [accountDialogOpen, setAccountDialogOpen] = useState(false);
  const [feedSettingsOpen, setFeedSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  const [scopedDataReady, setScopedDataReady] = useState(false);
  const [autosaveState, setAutosaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [homeInterest, setHomeInterest] = useState(() => localStorage.getItem("dn_pending_interest") ?? "");
  const [homeAuthMode, setHomeAuthMode] = useState<"login" | "register" | null>(null);
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

  async function createBriefing() {
    if (!account) return;
    setError("");
    setBusyAction("create-feed");
    try {
      const draft = createBriefingDraft(briefings, account);
      const created = await persistBriefing(draft, "feed created");
      await loadBriefings(created.id);
      setFeedSettingsOpen(true);
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
    sourceInputs: string[];
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
          publicFeedEnabled: true,
          intensity: latestBriefing.intensity ?? "medium",
          retentionDays: 15
        },
        "setup saved",
        "setup-feed"
      );
      if (input.sourceInputs.length > 0) {
        setSourceStatus(`Adding ${input.sourceInputs.length} selected source(s)`);
        for (const sourceInput of input.sourceInputs) {
          try {
            const response = await addSource(saved.id, sourceInput);
            applySourceResponse(response);
          } catch (cause) {
            setError(`Feed created, but one source could not be added: ${cause instanceof Error ? cause.message : String(cause)}`);
          }
        }
      }
      await dismissOnboarding();
      localStorage.removeItem("dn_pending_interest");
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

  if (!session) {
    return (
      <Shell title="briefings">
        <p className="muted">loading</p>
      </Shell>
    );
  }

  if (!session.authenticated) {
    return (
      <Shell title="Distilled.news">
        <section className="home-hero">
          <div className="home-hero-copy">
            <span className="home-kicker">Your news, without the noise</span>
            <h1>Know what matters.<br />Skip everything else.</h1>
            <p>Tell Distilled what you care about. It finds relevant sources, removes repetition, and turns the updates into one clear briefing.</p>
            <form
              className="interest-start"
              onSubmit={(event) => {
                event.preventDefault();
                if (!homeInterest.trim()) return;
                localStorage.setItem("dn_pending_interest", homeInterest.trim());
                setHomeAuthMode("register");
              }}
            >
              <label htmlFor="home-interest">What do you want to follow?</label>
              <div className="interest-start-control">
                <input
                  id="home-interest"
                  dir="auto"
                  value={homeInterest}
                  onChange={(event) => setHomeInterest(event.target.value)}
                  placeholder="AI research, Lebanon, climate policy…"
                  autoComplete="off"
                />
                <button type="submit" className="primary-button" disabled={!homeInterest.trim()}>
                  Create my briefing <ChevronRight size={17} aria-hidden />
                </button>
              </div>
            </form>
            <div className="home-secondary-actions">
              <span>Already have a briefing?</span>
              <button type="button" className="text-button" onClick={() => setHomeAuthMode("login")}>Sign in</button>
            </div>
          </div>
          <HomeBriefingPreview />
        </section>
        <section className="home-how" aria-label="How Distilled works">
          <div><span>1</span><strong>Describe your interests</strong><p>Use plain language. Be as broad or specific as you like.</p></div>
          <div><span>2</span><strong>Choose your sources</strong><p>Pick from suggestions or add any source you already trust.</p></div>
          <div><span>3</span><strong>Read one hourly brief</strong><p>Open the hour, scan the facts, and inspect any source when needed.</p></div>
        </section>
        {homeAuthMode || session.setupRequired ? (
          <section className="home-auth" aria-label="Account access">
            <div className="home-auth-copy">
              <span className="home-kicker">{homeAuthMode === "login" ? "Welcome back" : "Save your briefing"}</span>
              <h2>{homeAuthMode === "login" ? "Continue where you left off." : "One quick step, then choose your sources."}</h2>
              <p>{homeAuthMode === "login" ? "Sign in to manage your feeds and sources." : "Create a free account. Your published briefing will have a simple public link you can share."}</p>
            </div>
            <AuthPanel
              key={homeAuthMode ?? "setup"}
              initialMode={homeAuthMode ?? undefined}
              setupRequired={session.setupRequired}
              turnstileSiteKey={session.turnstileSiteKey}
              onAuthenticated={async () => {
                const next = await refreshSession();
                if (next.authenticated) {
                  await loadBriefings();
                  if (next.account?.role === "admin") setAccounts(await listAccounts());
                }
              }}
            />
          </section>
        ) : null}
        {!session.setupRequired ? (
          <section className="home-explore">
            <div className="home-section-heading"><span className="home-kicker">Public briefings</span><h2>See what people are following.</h2></div>
            <ExploreFeedsPanel />
          </section>
        ) : null}
        {error ? <p className="error">{error}</p> : null}
      </Shell>
    );
  }

  if (!account) {
    return (
      <Shell title="briefings" onLogout={handleLogout}>
        <p className="error">session account unavailable</p>
      </Shell>
    );
  }

  if (!briefing) {
    return (
      <>
        <Shell title="briefings" onAccount={() => setAccountDialogOpen(true)}>
          <section className="section">
            <div className="section-title">
              <Globe size={16} aria-hidden />
              <h2>feeds</h2>
            </div>
            <button type="button" title="new feed" onClick={() => createBriefing()}>
              <Plus size={15} aria-hidden /> new feed
            </button>
          </section>
        </Shell>
        {accountDialog}
      </>
    );
  }

  return (
    <>
      <Shell title="briefings" onAccount={() => setAccountDialogOpen(true)} feed={briefing}>
        <div className="admin-stack">
          <AdminCommandPanel
            briefing={briefing}
            sources={sources}
            health={health}
            status={status}
            sourceStatus={sourceStatus}
            onOpenSettings={() => setFeedSettingsOpen(true)}
            onCopy={() => copyFeedUrl(briefing)}
          />

          <section className="section feed-section">
            <div className="section-title">
              <Globe size={16} aria-hidden />
              <h2>feeds</h2>
            </div>
            <div className="actions">
              <button type="button" className="primary-button" title="new feed" disabled={busyAction === "create-feed"} onClick={() => createBriefing()}>
                <Plus size={15} aria-hidden /> new feed
              </button>
              {status || autosaveState !== "idle" ? (
                <span className={`save-state ${autosaveState === "error" ? "error" : ""}`}>{formatAutosaveStatus(autosaveState, status)}</span>
              ) : null}
            </div>
            <div className="feed-list">
              {orderedBriefings.map((item) => (
                <div key={item.id} className={`feed-row${item.id === briefing.id ? " active" : ""}`}>
                  <button type="button" className="feed-select" title={`select ${item.title}`} onClick={() => setSelectedBriefingId(item.id)}>
                    <span className="feed-title">{item.title}</span>
                  </button>
                  <div className="feed-flags">
                    <span className="star-count"><Star size={13} aria-hidden /> {item.stars}</span>
                    <span className="pill">{languageLabel(item.language)}</span>
                    {item.paused ? <span className="pill">paused</span> : null}
                  </div>
                  <div className="row-actions">
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`feed settings for ${item.title}`}
                      title="feed settings"
                      onClick={() => {
                        setSelectedBriefingId(item.id);
                        setFeedSettingsOpen(true);
                      }}
                    >
                      <Settings size={15} aria-hidden />
                    </button>
                    <a className="button-link icon-button feed-open-icon" href={`/${item.ownerUsername}/${item.slug}/`} aria-label={`open ${item.title}`} title="open feed">
                      <ExternalLink size={18} strokeWidth={2.25} aria-hidden />
                    </a>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`copy URL for ${item.title}`}
                      title="copy feed url"
                      onClick={() => copyFeedUrl(item)}
                    >
                      <Copy size={15} aria-hidden />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="section source-panel">
            <div className="source-header">
              <div className="section-title">
                <RefreshCw size={16} aria-hidden />
                <h2>sources</h2>
              </div>
              <div className="row-actions">
                <button
                  type="button"
                  className="icon-button"
                  aria-label="feed help"
                  title="feed help"
                  onClick={() => setHelpOpen(true)}
                >
                  <HelpCircle size={15} aria-hidden />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="fetch latest"
                  title="refresh"
                  disabled={briefing.paused || busyAction === "refresh-source"}
                  onClick={async () => {
                    setError("");
                    try {
                      setBusyAction("refresh-source");
                      setSourceStatus("checking enabled sources");
                      const response = await refreshPublicTelegramSources(briefing.id);
                      applySourceResponse(response);
                      setStatus("latest fetched");
                      void pollHealthUntilSettled(briefing.id, response.health);
                    } catch (cause) {
                      setStatus("");
                      setError(cause instanceof Error ? cause.message : String(cause));
                      setSourceStatus("");
                    } finally {
                      setBusyAction(null);
                    }
                  }}
                >
                  <RefreshCw size={15} aria-hidden />
                </button>
              </div>
            </div>
            <div className="source-discovery">
              <div>
                <strong>Find the right sources</strong>
                <p className="muted">Suggestions are based on this feed’s interests. You choose what gets added.</p>
              </div>
              <button
                type="button"
                className="suggest-button"
                disabled={busyAction === "suggest-sources" || !briefing.interestProfile.trim()}
                onClick={async () => {
                  setError("");
                  setBusyAction("suggest-sources");
                  try {
                    const result = await getSourceSuggestions({ briefingId: briefing.id, interestProfile: briefing.interestProfile, language: briefing.language });
                    setSourceSuggestions(result.suggestions);
                    setSuggestionsOpen(true);
                    setSourceStatus(result.degraded ? "Showing trusted suggestions; live discovery is temporarily unavailable." : "Suggestions ready");
                  } catch (cause) {
                    setError(cause instanceof Error ? cause.message : String(cause));
                  } finally {
                    setBusyAction(null);
                  }
                }}
              >
                <Sparkles size={15} aria-hidden /> {busyAction === "suggest-sources" ? "Finding…" : "Suggest sources"}
              </button>
            </div>
            {suggestionsOpen ? (
              <div className="suggestion-grid" aria-label="suggested sources">
                {sourceSuggestions.map((suggestion) => (
                  <article key={suggestion.id} className="suggestion-card">
                    <div className="suggestion-card-heading">
                      <div>
                        <strong><bdi>{suggestion.title}</bdi></strong>
                        <span className="pill">{suggestion.origin === "curated" ? "trusted" : suggestion.origin === "gdelt" ? "recent" : "broad"}</span>
                      </div>
                      <a href={suggestion.homepageUrl} target="_blank" rel="noreferrer" aria-label={`Open ${suggestion.title}`}><ExternalLink size={14} /></a>
                    </div>
                    <p>{suggestion.description}</p>
                    <small>{suggestion.reason}</small>
                    <button
                      type="button"
                      className="primary-button"
                      disabled={suggestion.alreadyAdded || busyAction === `suggestion-${suggestion.id}`}
                      onClick={async () => {
                        setBusyAction(`suggestion-${suggestion.id}`);
                        try {
                          const response = await addSource(briefing.id, suggestion.input);
                          applySourceResponse(response);
                          setSourceSuggestions((current) => current.map((item) => item.id === suggestion.id ? { ...item, alreadyAdded: true } : item));
                          setStatus(`${suggestion.title} added`);
                        } catch (cause) {
                          setError(cause instanceof Error ? cause.message : String(cause));
                        } finally { setBusyAction(null); }
                      }}
                    >
                      {suggestion.alreadyAdded ? <><CircleCheck size={14} /> Added</> : <><Plus size={14} /> Add</>}
                    </button>
                  </article>
                ))}
              </div>
            ) : null}
            <div className="source-add">
              <label>
                source
                <input
                  dir="ltr"
                  value={sourceUrl}
                  onChange={(event) => setSourceUrl(event.target.value)}
                  placeholder="https://t.me/LebUpdate, https://x.com/NASA, or Lebanon electricity"
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
              <button
                type="button"
                className="primary-button"
                title="add source"
                disabled={!sourceUrl.trim() || briefing.paused || busyAction === "add-source"}
                onClick={async () => {
                  setError("");
                  try {
                    setBusyAction("add-source");
                    setSourceStatus(`checking ${sourceInputKind(sourceUrl)}`);
                    const response = await addSource(briefing.id, sourceUrl.trim());
                    applySourceResponse(response);
                    setSourceUrl("");
                    setStatus("source added");
                    void pollHealthUntilSettled(briefing.id, response.health);
                  } catch (cause) {
                    setStatus("");
                    setError(cause instanceof Error ? cause.message : String(cause));
                    setSourceStatus("");
                  } finally {
                    setBusyAction(null);
                  }
                }}
              >
                <Plus size={15} aria-hidden /> add
              </button>
            </div>
            <HealthSummary
              briefing={briefing}
              health={health}
              activity={sourceStatus}
              retryBusy={busyAction === "retry-processing"}
              onRetryProcessing={async () => {
                setBusyAction("retry-processing");
                try {
                  const response = await retryProcessing(briefing.id);
                  setHealth(response.health);
                  setStatus(response.retried > 0 ? `retried ${response.retried} job(s)` : "no stale jobs to retry");
                } finally {
                  setBusyAction(null);
                }
              }}
            />
            <div className="source-list">
              {sources.length === 0 ? <p className="muted">paste a full source URL or type a topic</p> : null}
              {sources.map((source) => (
                <div key={source.id} className="source-row">
                  <div className="source-copy">
                    <label className="source-toggle">
                      <input
                        type="checkbox"
                        checked={source.enabled}
                        disabled={sourceToggleBusyId === source.id}
                        onChange={async (event) => {
                          const enabled = event.target.checked;
                          const previousSources = sources;
                          setError("");
                          setSourceToggleBusyId(source.id);
                          setSources((current) => current.map((item) => (item.id === source.id ? { ...item, enabled } : item)));
                          try {
                            const nextSources = await setSourceEnabled(briefing.id, source.id, enabled);
                            const updatedSource = nextSources.find((item) => item.id === source.id);
                            setSources(nextSources);
                            setStatus((updatedSource ? updatedSource.enabled : enabled) ? "source enabled" : "source paused");
                            setSourceStatus("");
                          } catch (cause) {
                            setSources(previousSources);
                            setStatus("");
                            setError(cause instanceof Error ? cause.message : String(cause));
                          } finally {
                            setSourceToggleBusyId((current) => (current === source.id ? null : current));
                          }
                        }}
                      />
                      <span className="source-title" title={source.title}><bdi>{source.title}</bdi></span>
                    </label>
                    <span className="source-link" dir="ltr">{sourceProviderLabel(source)}</span>
                    {source.url || source.sourceUrl ? <a className="source-link" href={source.url ?? source.sourceUrl} target="_blank" rel="noreferrer" dir="ltr">{source.username ?? "open"}</a> : null}
                    <SourceStatusNote source={source} />
                  </div>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`remove ${source.title}`}
                    title="remove source"
                    onClick={async () => {
                      const response = await deleteSource(briefing.id, source.id);
                      setSources(response.sources);
                      setHealth(response.health);
                      setSourceStatus("source removed");
                    }}
                  >
                    <Trash2 size={15} aria-hidden />
                  </button>
                </div>
              ))}
            </div>
          </section>

          {account.role === "admin" ? (
            <AdminAccountsSection
              accounts={accounts}
              currentAccountId={account.id}
              onAccountsChanged={(nextAccounts) => setAccounts(nextAccounts)}
            />
          ) : null}
        </div>
      </Shell>
      {accountDialog}
      {feedSettingsOpen ? (
        <FeedSettingsSheet
          briefing={briefing}
          briefings={briefings}
          autosaveState={autosaveState}
          status={status}
          canDelete={briefings.length > 1}
          onClose={() => setFeedSettingsOpen(false)}
          onPatch={(patch) => patchSelectedBriefing(patch)}
          onCopy={() => copyFeedUrl(briefing)}
          onPauseToggle={async () => {
            try {
              await persistBriefing({ ...briefing, paused: !briefing.paused }, briefing.paused ? "feed resumed" : "feed paused", "pause-feed");
            } catch (cause) {
              setStatus("");
              setError(cause instanceof Error ? cause.message : String(cause));
            }
          }}
          onDelete={async () => {
            if (briefings.length <= 1) return;
            if (!window.confirm(`Delete "${briefing.title}" and all of its sources and published items?`)) return;
            const remaining = await deleteBriefing(briefing.id);
            setBriefings(remaining);
            setSelectedBriefingId(remaining[0]?.id ?? null);
            setFeedSettingsOpen(false);
            setStatus("feed deleted");
          }}
        />
      ) : null}
      {helpOpen ? <FeedHelpSheet onClose={() => setHelpOpen(false)} /> : null}
      {onboardingOpen && account && briefing ? (
        <FirstRunSetupSheet
          account={account}
          briefing={briefing}
          busy={busyAction === "setup-feed"}
          onClose={() => void dismissOnboarding()}
          onComplete={completeOnboarding}
        />
      ) : null}
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
  const staleJobs = props.health?.processing.staleQueued ?? 0;
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
          <a className="button-link primary-button open-feed-button" href={`/${props.briefing.ownerUsername}/${props.briefing.slug}/`} title="open feed">
            <ExternalLink size={19} strokeWidth={2.25} aria-hidden /> open feed
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
          <strong>{queuedJobs} queued{staleJobs > 0 ? ` / ${staleJobs} stale` : ""} / {failedJobs} failed 24h</strong>
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

function HomeBriefingPreview() {
  return (
    <div className="home-preview" aria-label="Example Distilled briefing">
      <div className="home-preview-topline">
        <div><span className="preview-mark" aria-hidden /><strong>Morning briefing</strong></div>
        <span>8:30 AM</span>
      </div>
      <div className="home-preview-summary">
        <span className="home-kicker">In two minutes</span>
        <h2>Three updates worth your attention today.</h2>
      </div>
      <article className="preview-story">
        <span>01</span>
        <div><strong>Policy moved from discussion to a concrete vote.</strong><p>What changed, why it matters, and what happens next—without the repeated headlines.</p></div>
      </article>
      <article className="preview-story">
        <span>02</span>
        <div><strong>A new research result changes the near-term picture.</strong><p>Distilled links every conclusion back to the original reporting.</p></div>
      </article>
      <article className="preview-story preview-story-muted">
        <span>03</span>
        <div><strong>The rest can wait.</strong><p>Low-signal updates and duplicates stay out of your briefing.</p></div>
      </article>
      <div className="home-preview-footer"><ShieldCheck size={16} aria-hidden /> Sources remain visible. You stay in control.</div>
    </div>
  );
}

function AuthPanel(props: { setupRequired: boolean; turnstileSiteKey?: string; initialMode?: "login" | "register"; onAuthenticated: () => Promise<void> }) {
  const [mode, setMode] = useState<"login" | "register" | "forgot">(props.setupRequired ? "register" : props.initialMode ?? "login");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [setupToken, setSetupToken] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileResetSignal, setTurnstileResetSignal] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const copy = getAuthPanelCopy(props.setupRequired, mode);
  const submitLabel = getAuthSubmitLabel(props.setupRequired, mode);
  const requiresTurnstile = Boolean(props.turnstileSiteKey && !props.setupRequired);
  const usernamePreview = username.trim() ? slugify(username) : "";

  function resetTurnstile() {
    if (!requiresTurnstile) return;
    setTurnstileToken("");
    setTurnstileResetSignal((value) => value + 1);
  }

  return (
    <form
      className="login"
      onSubmit={async (event) => {
        event.preventDefault();
        setError("");
        setMessage("");
        try {
          if (requiresTurnstile && !turnstileToken) {
            setError("complete the verification check");
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
            setMessage("verification email sent. Check your inbox and spam folder. The link expires in 24 hours.");
            resetTurnstile();
            return;
          }
          if (mode === "forgot") {
            await forgotPassword(email, turnstileToken);
            setMessage("if the account exists, a reset email was sent");
            resetTurnstile();
            return;
          }
          await login(email, password, turnstileToken);
          await props.onAuthenticated();
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : String(cause));
          resetTurnstile();
        }
      }}
    >
      <div className="auth-copy">
        <strong>{copy.title}</strong>
        <p>{copy.description}</p>
      </div>
      {props.setupRequired ? (
        <label>
          setup token
          <input autoComplete="one-time-code" value={setupToken} onChange={(event) => setSetupToken(event.target.value)} />
        </label>
      ) : null}
      <label>
        email
        <input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
      </label>
      {(mode === "register" || props.setupRequired) ? (
        <label>
          username
          <input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} />
          <span className="field-help">{usernamePreview ? `your feed URLs start with /${usernamePreview}/` : "letters and numbers become your feed URL name"}</span>
        </label>
      ) : null}
      {mode !== "forgot" ? (
        <label>
          password
          <input
            type="password"
            autoComplete={mode === "register" || props.setupRequired ? "new-password" : "current-password"}
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <span className="field-help">at least 8 characters</span>
        </label>
      ) : null}
      {requiresTurnstile && props.turnstileSiteKey ? (
        <TurnstileField siteKey={props.turnstileSiteKey} resetSignal={turnstileResetSignal} onToken={setTurnstileToken} />
      ) : null}
      <button type="submit" className="primary-button" title={submitLabel}><LogIn size={15} aria-hidden /> {submitLabel}</button>
      {!props.setupRequired ? (
        <div className="auth-switch">
          {mode !== "login" ? <button type="button" title="login" onClick={() => setMode("login")}>login</button> : null}
          {mode !== "register" ? <button type="button" title="new account" onClick={() => setMode("register")}>new account</button> : null}
          {mode !== "forgot" ? <button type="button" title="forgot password" onClick={() => setMode("forgot")}>forgot password</button> : null}
        </div>
      ) : null}
      {message ? <p className="muted">{message}</p> : null}
      {error ? <p className="error">{error}</p> : null}
    </form>
  );
}

function getAuthPanelCopy(setupRequired: boolean, mode: "login" | "register" | "forgot"): { title: string; description: string } {
  if (setupRequired) {
    return {
      title: "create the first account",
      description: "This account can create feeds and manage the service."
    };
  }
  if (mode === "register") {
    return {
      title: "create your feed",
      description: "Choose a username, then verify your email before signing in."
    };
  }
  if (mode === "forgot") {
    return {
      title: "reset password",
      description: "Enter your email and we will send a reset link if the account exists."
    };
  }
  return {
    title: "sign in",
    description: "Open your feeds, sources, and account settings."
  };
}

function getAuthSubmitLabel(setupRequired: boolean, mode: "login" | "register" | "forgot"): string {
  if (setupRequired) return "create first account";
  if (mode === "register") return "create account";
  if (mode === "forgot") return "send reset link";
  return "login";
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

function ExploreFeedsSheet(props: { currentFeed?: PublicBriefing; language?: "en" | "ar" | "fr"; onClose: () => void }) {
  const language = props.language ?? "en";
  return (
    <Sheet title={exploreControlLabel(language).toLowerCase()} closeLabel={closeExploreLabel(language)} icon={<Compass size={16} aria-hidden />} onClose={props.onClose}>
      <ExploreFeedList currentFeed={props.currentFeed} language={language} />
    </Sheet>
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
  if (feeds.length === 0) return <p className="muted">{noStarredFeedsLabel(language)}</p>;

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
  return (
    <Shell title="verify email">
      <section className="section notice">
        <p>{message || "confirm this email address"}</p>
        <div className="actions">
          <button
            type="button"
            title="verify email"
            disabled={busy || !props.token}
            onClick={async () => {
              setBusy(true);
              setMessage("");
              try {
                await verifyEmail(props.token);
                setMessage("email verified");
              } catch (cause) {
                setMessage(cause instanceof Error ? cause.message : String(cause));
              } finally {
                setBusy(false);
              }
            }}
          >
            verify email
          </button>
          <a className="button-link" href="/" title="create">create</a>
        </div>
      </section>
    </Shell>
  );
}

function ResetPasswordPage(props: { token: string }) {
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  return (
    <Shell title="reset password">
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
          new password
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
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") props.onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [props.onClose]);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) props.onClose();
      }}
    >
      <section className={`sheet${props.wide ? " sheet-wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby={`${slugify(props.title)}-sheet-title`}>
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
    </div>
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
  const previewSlug = deriveBriefingSlug(props.briefings, props.briefing.title, props.briefing.id);
  const titleRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  return (
    <Sheet title="feed settings" closeLabel="close feed settings" icon={<Settings size={16} aria-hidden />} onClose={props.onClose} wide>
      <div className="sheet-status">
        <span className={props.autosaveState === "error" ? "error" : "muted"}>{formatAutosaveStatus(props.autosaveState, props.status)}</span>
      </div>
      <div className="settings-grid">
        <label>
          title
          <input ref={titleRef} dir="ltr" value={props.briefing.title} onChange={(event) => props.onPatch({ title: event.target.value })} />
        </label>
        <div className="field-group">
          <span>slug</span>
          <code className="generated-slug">/{props.briefing.ownerUsername}/{previewSlug}/</code>
        </div>
        <div className="field-group">
          <span>language</span>
          <div className="segmented" role="group" aria-label="feed language">
            {(["en", "fr", "ar"] as const).map((language) => (
              <button
                key={language}
                type="button"
                className={props.briefing.language === language ? "active" : ""}
                aria-pressed={props.briefing.language === language}
                title={languageLabel(language)}
                onClick={() => props.onPatch({ language })}
              >
                <Languages size={15} aria-hidden /> {languageLabel(language)}
              </button>
            ))}
          </div>
        </div>
        <div className="field-group">
          <span>update rhythm</span>
          <div className="segmented" role="group" aria-label="briefing rhythm">
            {(["hourly", "daily", "weekly"] as const).map((briefingCadence) => (
              <button
                key={briefingCadence}
                type="button"
                className={visibleBriefingCadence(props.briefing.briefingCadence) === briefingCadence ? "active" : ""}
                aria-pressed={visibleBriefingCadence(props.briefing.briefingCadence) === briefingCadence}
                title={`${briefingCadence} briefing`}
                onClick={() => props.onPatch({ briefingCadence })}
              >
                {briefingCadence}
              </button>
            ))}
          </div>
        </div>
        <label>
          timezone
          <input
            dir="ltr"
            value={props.briefing.briefingTimezone}
            onChange={(event) => props.onPatch({ briefingTimezone: event.target.value || "UTC" })}
          />
        </label>
        <div className="field-group">
          <span>next briefing</span>
          <code className="generated-slug">{props.briefing.nextBriefingAt ? formatTime(props.briefing.nextBriefingAt, props.briefing.language) : "after save"}</code>
        </div>
        <label>
          interest profile
          <textarea
            dir="ltr"
            required
            rows={6}
            value={props.briefing.interestProfile}
            onChange={(event) => props.onPatch({ interestProfile: event.target.value })}
          />
        </label>
        <label>
          style instruction
          <textarea
            dir="ltr"
            rows={3}
            value={props.briefing.styleInstruction ?? ""}
            onChange={(event) => props.onPatch({ styleInstruction: event.target.value })}
          />
        </label>
      </div>
      <div className="sheet-actions">
        <button type="button" title={props.briefing.paused ? "resume feed" : "pause feed"} onClick={() => void props.onPauseToggle()}>
          {props.briefing.paused ? <Play size={15} aria-hidden /> : <Pause size={15} aria-hidden />}
          {props.briefing.paused ? "resume feed" : "pause feed"}
        </button>
        <a className="button-link open-feed-button" href={`/${props.briefing.ownerUsername}/${props.briefing.slug}/`} title="open feed">
          <ExternalLink size={18} strokeWidth={2.25} aria-hidden /> open feed
        </a>
        <button type="button" title="copy feed url" onClick={() => void props.onCopy()}>
          <Copy size={15} aria-hidden /> copy url
        </button>
        <button type="button" className="danger-button" title="delete feed" disabled={!props.canDelete} onClick={() => void props.onDelete()}>
          <Trash2 size={15} aria-hidden /> delete feed
        </button>
      </div>
    </Sheet>
  );
}

function FeedHelpSheet(props: { onClose: () => void }) {
  return (
    <Sheet title="feed help" closeLabel="close feed help" icon={<HelpCircle size={16} aria-hidden />} onClose={props.onClose}>
      <ol className="help-steps">
        <li>
          <strong>name</strong>
          <span>Choose a short feed name. The URL updates from that name.</span>
        </li>
        <li>
          <strong>profile</strong>
          <span>Write the exact kind of updates that should make it through.</span>
        </li>
        <li>
          <strong>sources</strong>
          <span>Paste a Telegram or X URL, or type a search topic.</span>
        </li>
        <li>
          <strong>share</strong>
          <span>Copy the feed URL when you want someone to read it.</span>
        </li>
      </ol>
    </Sheet>
  );
}

function FirstRunSetupSheet(props: {
  account: AccountRecord;
  briefing: BriefingConfig;
  busy: boolean;
  onClose: () => void;
  onComplete: (input: { username: string; title: string; interestProfile: string; sourceInputs: string[] }) => Promise<void>;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [username, setUsername] = useState(props.account.username);
  const [title, setTitle] = useState(props.briefing.title);
  const [interestProfile, setInterestProfile] = useState(() => localStorage.getItem("dn_pending_interest") ?? props.briefing.interestProfile);
  const [sourceUrl, setSourceUrl] = useState("");
  const [suggestions, setSuggestions] = useState<SourceSuggestion[]>([]);
  const [selectedInputs, setSelectedInputs] = useState<string[]>([]);
  const [finding, setFinding] = useState(false);
  const [error, setError] = useState("");
  const usernameRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    usernameRef.current?.focus();
  }, []);

  return (
    <Sheet title="create your feed" closeLabel="skip feed setup" icon={<Sparkles size={16} aria-hidden />} onClose={props.onClose} wide>
      <form
        className="settings-grid onboarding-flow"
        onSubmit={async (event) => {
          event.preventDefault();
          setError("");
          try {
            await props.onComplete({ username, title, interestProfile, sourceInputs: [...selectedInputs, ...(sourceUrl.trim() ? [sourceUrl.trim()] : [])] });
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : String(cause));
          }
        }}
      >
        <div className="onboarding-steps" aria-label="setup progress"><span className={step >= 1 ? "active" : ""}>1 Interests</span><span className={step >= 2 ? "active" : ""}>2 Sources</span><span className={step >= 3 ? "active" : ""}>3 Publish</span></div>
        {step === 1 ? <>
          <div className="onboarding-intro"><h3>What do you want to stay informed about?</h3><p className="muted">Be specific. Distilled will use this to find sources and filter out noise.</p></div>
          <label>interests<textarea autoFocus dir="auto" required rows={7} value={interestProfile} onChange={(event) => setInterestProfile(event.target.value)} placeholder="Lebanese economy, energy, public policy, and decisions that affect daily life" /></label>
          <div className="source-examples"><button type="button" onClick={() => setInterestProfile("Lebanese economy, energy, public policy, and infrastructure")}>Lebanon</button><button type="button" onClick={() => setInterestProfile("Artificial intelligence research, model releases, safety, and regulation")}>AI</button><button type="button" onClick={() => setInterestProfile("Climate science, clean energy, and major environmental policy")}>Climate</button></div>
        </> : null}
        {step === 2 ? <>
          <div className="onboarding-intro"><h3>Choose your coverage</h3><p className="muted">We found sources for your interests. Add as many or as few as you like.</p></div>
          {finding ? <p className="muted">Finding trusted and recent sources…</p> : <div className="suggestion-grid">{suggestions.map((suggestion) => {
            const checked = selectedInputs.includes(suggestion.input);
            return <label key={suggestion.id} className={`suggestion-card selectable${checked ? " selected" : ""}`}><input type="checkbox" checked={checked} onChange={() => setSelectedInputs((current) => checked ? current.filter((value) => value !== suggestion.input) : [...current, suggestion.input])} /><strong>{suggestion.title}</strong><p>{suggestion.description}</p><small>{suggestion.reason}</small></label>;
          })}</div>}
          <label>add another source<input dir="ltr" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="RSS, Telegram, X, or a search topic" /></label>
        </> : null}
        {step === 3 ? <>
          <div className="onboarding-intro"><h3>Make it yours</h3><p className="muted">Your feed will be public at /{username}/{slugify(title)}/.</p></div>
          <label>feed name<input dir="auto" required value={title} onChange={(event) => setTitle(event.target.value)} /></label>
          <label>username<input ref={usernameRef} value={username} autoComplete="username" onChange={(event) => setUsername(event.target.value)} /></label>
          <p className="muted">{selectedInputs.length + (sourceUrl.trim() ? 1 : 0)} source(s) selected · summaries in {languageLabel(props.briefing.language)}</p>
        </> : null}
        <div className="sheet-actions">
          {step > 1 ? <button type="button" onClick={() => setStep((step - 1) as 1 | 2)}>Back</button> : null}
          {step === 1 ? <button type="button" className="primary-button" disabled={!interestProfile.trim() || finding} onClick={async () => { setFinding(true); setError(""); try { const result = await getSourceSuggestions({ briefingId: props.briefing.id, interestProfile, language: props.briefing.language }); setSuggestions(result.suggestions); setSelectedInputs(result.suggestions.filter((item) => item.confidence === "high" && item.origin === "curated").slice(0, 4).map((item) => item.input)); setStep(2); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } finally { setFinding(false); } }}>Find sources <ChevronRight size={15} /></button> : null}
          {step === 2 ? <button type="button" className="primary-button" onClick={() => setStep(3)}>Continue <ChevronRight size={15} /></button> : null}
          {step === 3 ? <button type="submit" className="primary-button" title="create feed" disabled={props.busy || !title.trim() || !interestProfile.trim()}><Sparkles size={15} aria-hidden /> {props.busy ? "Creating…" : "Create feed"}</button> : null}
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
        <StatusLine label="processing" value={`queued ${props.health?.processing.queued ?? 0} / stale ${props.health?.processing.staleQueued ?? 0} / failed 24h ${props.health?.processing.failed ?? 0}`} />
        <StatusLine label="source health" value={`enabled ${props.health?.sources?.enabled ?? 0} / degraded ${props.health?.sources?.degraded ?? 0} / backoff ${props.health?.sources?.backoff ?? 0}`} />
        <StatusLine label="today's cost" value={`AI $${(props.health?.spendToday?.llmUsd ?? 0).toFixed(3)} / collection $${(props.health?.spendToday?.collectionUsd ?? 0).toFixed(3)}`} />
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
    usernameFieldRef.current?.focus();
  }, []);

  return (
    <Sheet title="account" closeLabel="close account settings" icon={<User size={16} aria-hidden />} onClose={props.onClose}>
      <div className="account-meta">
        <span>{props.account.email}</span>
        <span>{props.account.role}</span>
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
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : String(cause));
          } finally {
            setBusy(null);
          }
        }}
      >
        <label>
          username
          <input ref={usernameFieldRef} value={username} autoComplete="username" onChange={(event) => setUsername(event.target.value)} />
        </label>
        <button type="submit" title="save username" disabled={busy === "username"}>
          <Save size={15} aria-hidden /> save username
        </button>
      </form>

      <form
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
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : String(cause));
          } finally {
            setBusy(null);
          }
        }}
      >
        <label>
          current password
          <input
            type="password"
            autoComplete="current-password"
            required
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
          />
        </label>
        <label>
          new password
          <input
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />
        </label>
        <button type="submit" title="change password" disabled={busy === "password"}>
          <Save size={15} aria-hidden /> change password
        </button>
      </form>

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
          <LogOut size={15} aria-hidden /> logout
        </button>
        {message ? <p className="muted">{message}</p> : null}
        {error ? <p className="error">{error}</p> : null}
      </div>
    </Sheet>
  );
}

function AdminAccountsSection(props: {
  accounts: AccountWithStats[];
  currentAccountId: string;
  onAccountsChanged: (accounts: AccountWithStats[]) => void;
}) {
  const [managedAccountId, setManagedAccountId] = useState<string | null>(null);
  const [adminBriefings, setAdminBriefings] = useState<BriefingConfig[]>([]);
  const [loadingFeeds, setLoadingFeeds] = useState(false);
  const [error, setError] = useState("");
  const [emailTestBusy, setEmailTestBusy] = useState(false);
  const [emailTestStatus, setEmailTestStatus] = useState("");
  const [emailDelivery, setEmailDelivery] = useState<AdminEmailStatus | null>(null);
  const managedAccount = props.accounts.find((account) => account.id === managedAccountId) ?? null;

  useEffect(() => {
    let cancelled = false;
    async function loadAdminBriefings() {
      setLoadingFeeds(true);
      setError("");
      try {
        const [nextBriefings, nextEmailDelivery] = await Promise.all([listAdminBriefings(), getAdminEmailStatus()]);
        if (!cancelled) {
          setAdminBriefings(nextBriefings);
          setEmailDelivery(nextEmailDelivery);
        }
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

  return (
    <>
      <details className="section accounts-section">
        <summary className="section-title accounts-summary" title="accounts">
          <User size={16} aria-hidden />
          <h2>accounts</h2>
          <span className="pill">{props.accounts.length}</span>
          <span className="pill">{adminBriefings.length} feeds</span>
        </summary>
        {loadingFeeds ? <p className="muted">loading feeds</p> : null}
        {error ? <p className="error">{error}</p> : null}
        <div className="admin-email-test">
          <div>
            <strong>Email delivery</strong>
            <p className="muted">{emailDeliveryStatusLabel(emailDelivery)}</p>
          </div>
          <button
            type="button"
            disabled={emailTestBusy}
            onClick={async () => {
              setEmailTestBusy(true);
              setEmailTestStatus("");
              setError("");
              try {
                const result = await sendAdminEmailTest();
                setEmailTestStatus(`sent to ${result.recipientDomain}`);
                setEmailDelivery((current) => ({
                  configured: true,
                  senderDomain: current?.senderDomain,
                  lastFailureAt: current?.lastFailureAt,
                  lastSuccessAt: result.sentAt
                }));
              } catch (cause) {
                setError(cause instanceof Error ? cause.message : String(cause));
              } finally {
                setEmailTestBusy(false);
              }
            }}
          >
            <Send size={14} aria-hidden /> {emailTestBusy ? "sending…" : "send test"}
          </button>
          {emailTestStatus ? <span className="save-state">{emailTestStatus}</span> : null}
        </div>
        <div className="source-list">
          {props.accounts.map((account) => {
            const feedCount = adminBriefings.filter((briefing) => briefing.ownerAccountId === account.id).length;
            return (
              <div key={account.id} className="source-row">
                <div className="source-copy">
                  <strong>{account.username}</strong>
                  <span className="muted">{account.email} / {account.role} / feeds {feedCount || account.briefingCount}</span>
                  <span className="muted">{account.disabledAt ? "disabled" : account.emailVerifiedAt ? "verified" : "unverified"}</span>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`manage ${account.username}`}
                  title="manage account"
                  onClick={() => setManagedAccountId(account.id)}
                >
                  <Settings size={15} aria-hidden />
                </button>
              </div>
            );
          })}
        </div>
      </details>
      {managedAccount ? (
        <AdminAccountDialog
          account={managedAccount}
          currentAccountId={props.currentAccountId}
          briefings={adminBriefings.filter((briefing) => briefing.ownerAccountId === managedAccount.id)}
          onClose={() => setManagedAccountId(null)}
          onAccountsChanged={props.onAccountsChanged}
          onBriefingsChanged={setAdminBriefings}
          onRefreshBriefings={refreshAdminBriefings}
        />
      ) : null}
    </>
  );
}

function emailDeliveryStatusLabel(status: AdminEmailStatus | null): string {
  if (!status) return "Checking delivery status…";
  if (!status.configured) return "Email sending is not configured.";
  const lastSuccess = status.lastSuccessAt ? new Date(status.lastSuccessAt).getTime() : Number.NaN;
  const lastFailure = status.lastFailureAt ? new Date(status.lastFailureAt).getTime() : Number.NaN;
  if (Number.isFinite(lastFailure) && (!Number.isFinite(lastSuccess) || lastFailure > lastSuccess)) {
    return `Last test failed ${new Date(status.lastFailureAt!).toLocaleString()}.`;
  }
  if (Number.isFinite(lastSuccess)) return `Last test passed ${new Date(status.lastSuccessAt!).toLocaleString()}.`;
  return `Configured for ${status.senderDomain ?? "the production sender"}; not yet tested.`;
}

function AdminAccountDialog(props: {
  account: AccountWithStats;
  currentAccountId: string;
  briefings: BriefingConfig[];
  onClose: () => void;
  onAccountsChanged: (accounts: AccountWithStats[]) => void;
  onBriefingsChanged: (briefings: BriefingConfig[]) => void;
  onRefreshBriefings: () => Promise<void>;
}) {
  const [username, setUsername] = useState(props.account.username);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const usernameFieldRef = useRef<HTMLInputElement | null>(null);
  const isSignedInAdmin = props.account.id === props.currentAccountId;

  useEffect(() => {
    setUsername(props.account.username);
  }, [props.account.username]);

  useEffect(() => {
    usernameFieldRef.current?.focus();
  }, []);

  async function updateAccountAndRefresh(input: { username?: string; role?: "admin" | "user"; disabled?: boolean }, nextMessage: string) {
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
    if (!window.confirm(`Delete "${feed.title}" and all of its sources and published items?`)) return;
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

  async function removeAccount() {
    if (isSignedInAdmin) {
      setError("cannot delete the signed-in admin");
      return;
    }
    if (!window.confirm(`Delete "${props.account.username}" and all of this user's feeds, sources, and published items?`)) return;
    setBusy("delete-account");
    setError("");
    setMessage("");
    try {
      const result = await deleteAdminAccount(props.account.id);
      props.onAccountsChanged(result.accounts);
      props.onBriefingsChanged(result.briefings);
      props.onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Sheet title="manage account" closeLabel="close account management" icon={<User size={16} aria-hidden />} onClose={props.onClose}>
      <div className="account-meta">
        <span>{props.account.email}</span>
        <span>{props.account.disabledAt ? "disabled" : props.account.emailVerifiedAt ? "verified" : "unverified"}</span>
        <span>{props.briefings.length} feed{props.briefings.length === 1 ? "" : "s"}</span>
        {isSignedInAdmin ? <span>current admin</span> : null}
      </div>

      <form
        className="account-form"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy("username");
          try {
            await updateAccountAndRefresh({ username }, "username saved");
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : String(cause));
          } finally {
            setBusy(null);
          }
        }}
      >
        <label>
          username
          <input ref={usernameFieldRef} value={username} onChange={(event) => setUsername(event.target.value)} />
        </label>
        <button type="submit" title="save username" disabled={busy === "username"}>
          <Save size={15} aria-hidden /> save username
        </button>
      </form>

      <div className="account-form">
        <div className="field-group">
          <span>role</span>
          <div className="segmented" role="group" aria-label={`role for ${props.account.username}`}>
            {(["user", "admin"] as const).map((role) => (
              <button
                key={role}
                type="button"
                className={props.account.role === role ? "active" : ""}
                disabled={busy === "role"}
                aria-pressed={props.account.role === role}
                title={`set role ${role}`}
                onClick={async () => {
                  if (props.account.role === role) return;
                  setBusy("role");
                  try {
                    await updateAccountAndRefresh({ role }, `role changed to ${role}`);
                  } catch (cause) {
                    setError(cause instanceof Error ? cause.message : String(cause));
                  } finally {
                    setBusy(null);
                  }
                }}
              >
                {role}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          className={props.account.disabledAt ? "" : "danger-button"}
          title={props.account.disabledAt ? "enable account" : "disable account"}
          disabled={busy === "disabled"}
          onClick={async () => {
            setBusy("disabled");
            try {
              await updateAccountAndRefresh(
                { disabled: !props.account.disabledAt },
                props.account.disabledAt ? "account enabled" : "account disabled"
              );
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : String(cause));
            } finally {
              setBusy(null);
            }
          }}
        >
          {props.account.disabledAt ? "enable account" : "disable account"}
        </button>
      </div>

      <div className="account-form admin-feed-control">
        <div className="field-group">
          <span>feeds</span>
          {props.briefings.length > 0 ? (
            <div className="admin-feed-list">
              {props.briefings.map((feed) => (
                <div key={feed.id} className="admin-feed-row">
                  <div className="admin-feed-copy">
                    <strong><bdi>{feed.title}</bdi></strong>
                    <span className="muted">/{feed.ownerUsername}/{feed.slug}/</span>
                    <span className="muted">{feed.paused ? "paused" : "live"} / {feed.briefingCadence} / {feed.stars} stars</span>
                  </div>
                  <div className="row-actions">
                    <button
                      type="button"
                      title={feed.paused ? "resume feed" : "pause feed"}
                      disabled={busy === `feed:${feed.id}:pause`}
                      onClick={() => void toggleAdminBriefing(feed)}
                    >
                      {feed.paused ? <Play size={15} aria-hidden /> : <Pause size={15} aria-hidden />}
                      {feed.paused ? "resume" : "pause"}
                    </button>
                    <a className="button-link icon-button feed-open-icon" href={`/${feed.ownerUsername}/${feed.slug}/`} aria-label={`open ${feed.title}`} title="open feed">
                      <ExternalLink size={18} strokeWidth={2.25} aria-hidden />
                    </a>
                    <button
                      type="button"
                      className="danger-button"
                      title="delete feed"
                      disabled={busy === `feed:${feed.id}:delete`}
                      onClick={() => void removeAdminBriefing(feed)}
                    >
                      <Trash2 size={15} aria-hidden /> delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">no feeds</p>
          )}
        </div>
      </div>

      <div className="account-form account-danger-zone">
        <div className="field-group">
          <span>danger zone</span>
          <p className="muted">Deleting an account removes its feeds, sources, tokens, and published history.</p>
        </div>
        <button
          type="button"
          className="danger-button"
          title={isSignedInAdmin ? "cannot delete the signed-in admin" : "delete account"}
          disabled={isSignedInAdmin || busy === "delete-account"}
          onClick={() => void removeAccount()}
        >
          <Trash2 size={15} aria-hidden /> delete account
        </button>
      </div>

      {message ? <p className="muted">{message}</p> : null}
      {error ? <p className="error">{error}</p> : null}
    </Sheet>
  );
}

function FeedPage(props: { username: string; slug: string }) {
  const [payload, setPayload] = useState<FeedPayload | null>(null);
  const [editions, setEditions] = useState<BriefingEdition[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [starBusy, setStarBusy] = useState(false);
  const [exploreOpen, setExploreOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editionBusyIds, setEditionBusyIds] = useState<Set<string>>(new Set());
  const [visibleEditionCount, setVisibleEditionCount] = useState(FEED_BATCH_SIZE);
  const [selectedReport, setSelectedReport] = useState<ReportSelection | null>(null);
  const [editionDetails, setEditionDetails] = useState<Map<string, BriefingEdition>>(() => new Map());

  async function refresh() {
    setError("");
    const next = await getFeed(props.username, props.slug);
    setPayload(next);
    setEditions(next.editions);
    setExpanded(new Set());
    setEditionBusyIds(new Set());
    setEditionDetails(new Map());
    setVisibleEditionCount(FEED_BATCH_SIZE);
    setSelectedReport(null);
  }

  useEffect(() => {
    refresh().catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)));
  }, [props.username, props.slug]);

  useEffect(() => {
    const refreshOnFocus = () => {
      if (document.visibilityState === "visible") {
        refresh().catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)));
      }
    };
    document.addEventListener("visibilitychange", refreshOnFocus);
    window.addEventListener("focus", refreshOnFocus);

    const boundary = payload?.briefing.nextBriefingAt ? new Date(payload.briefing.nextBriefingAt).getTime() : Number.NaN;
    const delay = Number.isFinite(boundary)
      ? Math.max(1_000, Math.min(2_147_000_000, boundary + 5_000 - Date.now()))
      : 60_000;
    const timeout = window.setTimeout(() => {
      refresh().catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)));
    }, delay);

    return () => {
      document.removeEventListener("visibilitychange", refreshOnFocus);
      window.removeEventListener("focus", refreshOnFocus);
      window.clearTimeout(timeout);
    };
  }, [payload?.briefing.nextBriefingAt, props.username, props.slug]);

  useEffect(() => {
    if (!payload) return;
    let active = true;
    const timeout = window.setTimeout(async () => {
      try {
        setError("");
        const nextEditions = query.trim() ? await searchFeed(props.username, props.slug, query) : payload.editions;
        if (active) {
          setEditions(nextEditions);
          setVisibleEditionCount(FEED_BATCH_SIZE);
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : String(cause));
      }
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [payload, props.username, props.slug, query]);

  const visibleEditions = editions.slice(0, visibleEditionCount);
  const hiddenEditionCount = Math.max(0, editions.length - visibleEditions.length);
  const language = payload?.briefing.language ?? "en";
  const pageDir = textDirection(language);
  const canStar = Boolean(payload);
  const reportEdition = selectedReport
    ? editionDetails.get(selectedReport.editionId) ?? editions.find((edition) => edition.id === selectedReport.editionId)
    : undefined;
  const reportSection = reportEdition && selectedReport ? reportEdition.sections[selectedReport.sectionIndex] : undefined;
  const feedTitle = payload ? (
    <span className="feed-page-title">
      <span className={`status-dot ${payload.briefing.paused ? "paused" : "live"}`} aria-hidden />
      <span>{payload.briefing.title}</span>
    </span>
  ) : "briefing";

  async function loadEditionDetail(edition: BriefingEdition): Promise<BriefingEdition | null> {
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
      setEditionDetails((current) => new Map(current).set(edition.id, detailed));
      return detailed;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return null;
    } finally {
      setEditionBusyIds((current) => {
        const next = new Set(current);
        next.delete(edition.id);
        return next;
      });
    }
  }

  async function toggleEditionExpanded(edition: BriefingEdition) {
    if (expanded.has(edition.id)) {
      toggleSetValue(expanded, setExpanded, edition.id);
      return;
    }

    toggleSetValue(expanded, setExpanded, edition.id);
    await loadEditionDetail(edition);
  }

  async function openEditionReport(edition: BriefingEdition, sectionIndex: number) {
    const detailed = await loadEditionDetail(edition);
    if (!detailed || !detailed.sections[sectionIndex]) return;
    setSelectedReport({ editionId: edition.id, sectionIndex });
  }

  return (
    <Shell
      title={feedTitle}
      titleText={payload?.briefing.title ?? "briefing"}
      meta={payload ? <>{bylineLabel(language)} <bdi>{payload.briefing.ownerUsername}</bdi></> : loadingFeedLabel(language)}
      feed={payload?.briefing}
      pageLanguage={language}
    >
      {payload ? (
        <FeedSignalPanel
          briefing={payload.briefing}
          language={language}
        />
      ) : null}
      <div className="feed-menu-row" dir={pageDir}>
        <details className="feed-menu">
          <summary role="button" title={moreOptionsLabel(language)} aria-label={moreOptionsLabel(language)}>
            <Settings size={16} aria-hidden />
            <span>{moreOptionsLabel(language)}</span>
          </summary>
          <div className="feed-menu-popover">
            <form
              className="search"
              onSubmit={async (event) => {
                event.preventDefault();
                setEditions(query.trim() ? await searchFeed(props.username, props.slug, query) : payload?.editions ?? []);
                setVisibleEditionCount(FEED_BATCH_SIZE);
              }}
            >
              <Search size={15} aria-hidden />
              <input
                aria-label={searchPublishedLabel(language)}
                dir={pageDir}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={searchPublishedLabel(language)}
              />
            </form>
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
                setPayload({
                  ...payload,
                  briefing: { ...payload.briefing, stars: result.stars },
                  viewerHasStarred: result.viewerHasStarred
                });
              } finally {
                setStarBusy(false);
              }
            }}
          >
            <Star size={15} aria-hidden />
            {starControlLabel(payload?.viewerHasStarred ?? false, language)} {payload?.briefing.stars ?? 0}
          </button>
          <button type="button" title={exploreFeedsLabel(language)} onClick={() => setExploreOpen(true)}><Compass size={15} aria-hidden /> {exploreControlLabel(language)}</button>
          </div>
        </details>
      </div>
      {exploreOpen ? <ExploreFeedsSheet currentFeed={payload?.briefing} language={language} onClose={() => setExploreOpen(false)} /> : null}
      {reportEdition && reportSection ? (
        <ReportSheet
          edition={reportEdition}
          section={reportSection}
          language={language}
          onClose={() => setSelectedReport(null)}
        />
      ) : null}
      {error ? <FeedNotice message={error} language={language} /> : null}
      <div className="news-line hourly-briefs">
        {visibleEditions.map((edition) => (
          <FeedEditionRow
            key={edition.id}
            edition={edition}
            detailEdition={editionDetails.get(edition.id) ?? (edition.sections.length > 0 ? edition : undefined)}
            language={language}
            timezone={payload?.briefing.briefingTimezone ?? "UTC"}
            isExpanded={expanded.has(edition.id)}
            isLoading={editionBusyIds.has(edition.id)}
            onToggleExpanded={() => void toggleEditionExpanded(edition)}
            onOpenReport={(sectionIndex) => void openEditionReport(edition, sectionIndex)}
          />
        ))}
        {hiddenEditionCount > 0 ? (
          <div className="load-more-row">
            <button type="button" title={loadMoreLabel(language)} onClick={() => setVisibleEditionCount((count) => count + FEED_BATCH_SIZE)}>
              {loadMoreLabel(language)}
            </button>
            <span className="muted">{moreCountLabel(hiddenEditionCount, language)}</span>
          </div>
        ) : null}
        {editions.length === 0 && !error ? (
          <div className="empty-state">
            <strong>{emptyFeedTitle(0, language)}</strong>
            <p className="muted">{emptyFeedMessage(0, language)}</p>
          </div>
        ) : null}
      </div>
    </Shell>
  );
}

function FeedSignalPanel(props: {
  briefing: PublicBriefing;
  language: "en" | "ar" | "fr";
}) {
  const nextValue = props.briefing.paused
    ? pausedScheduleLabel(props.language)
    : props.briefing.nextBriefingAt
      ? formatTime(props.briefing.nextBriefingAt, props.language, props.briefing.briefingTimezone)
      : summaryPublishedLabel(props.language);
  return (
    <section className="feed-schedule-line" aria-label="feed schedule" dir={textDirection(props.language)}>
      <Clock3 size={15} aria-hidden />
      <span>{hourlyScheduleLabel(nextValue, props.briefing.paused, props.language)}</span>
    </section>
  );
}

function FeedEditionRow(props: {
  edition: BriefingEdition;
  detailEdition?: BriefingEdition;
  language: "en" | "ar" | "fr";
  timezone: string;
  isExpanded: boolean;
  isLoading: boolean;
  onToggleExpanded: () => void;
  onOpenReport: (sectionIndex: number) => void;
}) {
  const textDir = textDirection(props.language);
  const detailEdition = props.detailEdition ?? props.edition;
  const surfaceSummary = surfaceBriefSummary(props.edition.summary);
  const referenceCount = Math.max(detailEdition.sections.length, highestReferenceNumber(props.edition.summary));
  const closedIcon = textDir === "rtl" ? <ChevronLeft size={15} aria-hidden /> : <ChevronRight size={15} aria-hidden />;
  return (
    <article
      className="news-item"
      onClick={(event) => {
        const target = event.target as Element;
        if (!target.closest("button, a, input, summary")) props.onToggleExpanded();
      }}
    >
      <div className="news-copy" lang={props.language} dir={textDir}>
        <div className="news-topline">
          <div className="news-meta" dir={textDir}>
            <Timestamp value={props.edition.publishedAt} language={props.language} timezone={props.timezone} />
          </div>
          <div className="news-row-actions" dir="ltr">
            <button
              type="button"
              className="expand icon-button quiet-icon"
              title={briefingToggleTitle(props.isExpanded, props.language)}
              aria-expanded={props.isExpanded}
              aria-label={briefingToggleAria(props.edition.title, props.isExpanded, props.language)}
              onClick={props.onToggleExpanded}
            >
              {props.isExpanded ? <ChevronDown size={15} aria-hidden /> : closedIcon}
            </button>
          </div>
        </div>
        <ReferenceParagraph
          className="news-summary"
          text={surfaceSummary}
          language={props.language}
          referenceCount={referenceCount}
          onOpenReference={props.onOpenReport}
        />
        {props.isExpanded ? (
          <EditionSections
            edition={detailEdition}
            language={props.language}
            loading={props.isLoading}
            onOpenReport={props.onOpenReport}
          />
        ) : null}
      </div>
    </article>
  );
}

function EditionSections(props: {
  edition: BriefingEdition;
  language: "en" | "ar" | "fr";
  loading: boolean;
  onOpenReport: (sectionIndex: number) => void;
}) {
  const textDir = textDirection(props.language);
  if (props.loading) return <p className="muted evidence-loading">{loadingBriefingLabel(props.language)}</p>;
  if (props.edition.sections.length === 0) return <p className="muted evidence-loading">{noBriefingDetailLabel(props.language)}</p>;
  const tiered = props.edition.sections.some((section) => section.tier === "top" || section.tier === "additional");
  const indexedSections = props.edition.sections.map((section, sectionIndex) => ({ section, sectionIndex }));
  const topSections = tiered ? indexedSections.filter(({ section }) => section.tier === "top") : indexedSections;
  const additionalSections = tiered ? indexedSections.filter(({ section }) => section.tier !== "top") : [];
  return (
    <div className="brief-synthesis">
      <div className="brief-list-head">
        <span>{tiered ? topStoriesLabel(props.language) : referencesLabel(props.language)}</span>
        <span className="muted">{referenceLabel(props.edition.sections.length, props.language)}</span>
      </div>
      <EditionSectionList
        entries={topSections}
        language={props.language}
        textDir={textDir}
        onOpenReport={props.onOpenReport}
      />
      {additionalSections.length > 0 ? (
        <details className="additional-updates">
          <summary>{additionalUpdatesLabel(additionalSections.length, props.language)}</summary>
          <EditionSectionList
            entries={additionalSections}
            language={props.language}
            textDir={textDir}
            onOpenReport={props.onOpenReport}
          />
        </details>
      ) : null}
    </div>
  );
}

function EditionSectionList(props: {
  entries: Array<{ section: BriefingEditionSection; sectionIndex: number }>;
  language: "en" | "ar" | "fr";
  textDir: "ltr" | "rtl";
  onOpenReport: (sectionIndex: number) => void;
}) {
  return (
    <div className="reference-digest-list" aria-label={referencesLabel(props.language)} dir={props.textDir}>
        {props.entries.map(({ section, sectionIndex }) => {
          const timeRange = referenceTimeRange(section.evidence, props.language);
          return (
            <article
              key={`${section.title}:${sectionIndex}`}
              className="reference-digest-row"
            >
              <button
                type="button"
                className="reference-digest-index"
                title={referenceButtonLabel(sectionIndex + 1, props.language)}
                aria-label={referenceButtonLabel(sectionIndex + 1, props.language)}
                onClick={() => props.onOpenReport(sectionIndex)}
              >
                <span dir="ltr">[{sectionIndex + 1}]</span>
              </button>
              <div className="reference-digest-copy">
                <div className="reference-digest-meta" dir="ltr">
                  <bdi>{referencePreview(section)}</bdi>
                  {timeRange ? <span>{timeRange}</span> : null}
                  {section.evidence.length > 0 ? <span>{referenceLabel(section.evidence.length, props.language)}</span> : null}
                </div>
                <p className="reference-digest-summary" dir={props.textDir}>
                  <bdi dir={props.textDir}>{referenceDigestSummary(section.summary)}</bdi>
                </p>
              </div>
              <button
                type="button"
                className="reference-digest-action"
                title={openReportLabel(sectionIndex + 1, props.language)}
                onClick={() => props.onOpenReport(sectionIndex)}
              >
                <ExternalLink size={14} aria-hidden />
                {reportLabel(props.language)}
              </button>
            </article>
          );
        })}
      </div>
  );
}

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
        if (part.kind === "text") return <bdi key={`${part.value}:${index}`} dir={textDir}>{part.value}</bdi>;
        const canOpen = part.value >= 1 && part.value <= props.referenceCount;
        return (
          <button
            key={`reference-${part.value}-${index}`}
            type="button"
            className="inline-reference"
            disabled={!canOpen}
            title={referenceButtonLabel(part.value, props.language)}
            aria-label={referenceButtonLabel(part.value, props.language)}
            onClick={() => props.onOpenReference(part.value - 1)}
          >
            [{part.value}]
          </button>
        );
      })}
    </p>
  );
}

function ReportSheet(props: {
  edition: BriefingEdition;
  section: BriefingEditionSection;
  language: "en" | "ar" | "fr";
  onClose: () => void;
}) {
  const textDir = textDirection(props.language);
  return (
    <Sheet
      title={reportLabel(props.language)}
      closeLabel={closeReportLabel(props.language)}
      icon={<ExternalLink size={17} aria-hidden />}
      onClose={props.onClose}
      wide
    >
      <div className="report-module" lang={props.language} dir={textDir}>
        <div className="report-meta" dir="ltr">
          <Timestamp value={props.edition.publishedAt} language={props.language} />
          <span>{referenceLabel(props.section.evidence.length, props.language)}</span>
        </div>
        <div className="report-summary-block">
          <strong><bdi>{props.section.title}</bdi></strong>
          <p className="report-summary" dir={textDir}><bdi dir={textDir}>{props.section.summary}</bdi></p>
        </div>
        <div className="report-reference-list">
          {props.section.evidence.map((entry, index) => (
            <ReportEvidenceRow key={`${entry.messageId}:${entry.postedAt}:${index}`} entry={entry} language={props.language} />
          ))}
          {props.section.evidence.length === 0 ? <p className="muted">{noReferencesLabel(props.language)}</p> : null}
        </div>
      </div>
    </Sheet>
  );
}

function ReportEvidenceRow(props: { entry: BriefingEvidence; language: "en" | "ar" | "fr" }) {
  const textDir = textDirection(props.language);
  return (
    <article className="report-reference">
      <div className="evidence-head" dir="ltr">
        <strong className="evidence-title"><bdi>{props.entry.sourceTitle}</bdi></strong>
        <Timestamp value={props.entry.postedAt} language={props.language} />
      </div>
      <div className="evidence-links">
        {props.entry.sourceUrl ? <a href={props.entry.sourceUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} aria-hidden /> {originalPostLabel(props.language)}</a> : null}
        {props.entry.links.map((link) => <a key={link} href={link} target="_blank" rel="noreferrer"><ExternalLink size={14} aria-hidden /> {linkLabel(props.language)}</a>)}
        {props.entry.media.map((media, index) =>
          media.url ? (
            <a key={`${media.url}-${index}`} href={media.url} target="_blank" rel="noreferrer">
              <ExternalLink size={14} aria-hidden /> {mediaDisplayLabel(media, props.language)}
            </a>
          ) : (
            <span key={`${media.fileId}-${index}`} className="muted">{mediaDisplayLabel(media, props.language)}</span>
          )
        )}
      </div>
      <details className="report-excerpt">
        <summary>{sourceTextLabel(props.language)}</summary>
        <p className="evidence-text" dir={textDir}><bdi dir={textDir}>{props.entry.text}</bdi></p>
      </details>
    </article>
  );
}

function Timestamp(props: { value: string; language: "en" | "ar" | "fr"; timezone?: string }) {
  const label = formatTime(props.value, props.language, props.timezone);
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

function FeedNotice(props: { message: string; language: "en" | "ar" | "fr" }) {
  return (
    <section className="section notice">
      <h2>{feedUnavailableLabel(props.language)}</h2>
      <p>{props.message}</p>
    </section>
  );
}

function Shell(props: {
  title: React.ReactNode;
  titleText?: string;
  children: React.ReactNode;
  meta?: React.ReactNode;
  feed?: Pick<BriefingConfig, "ownerUsername" | "slug" | "title">;
  onAccount?: () => void;
  onLogout?: () => Promise<void>;
  pageLanguage?: "en" | "ar" | "fr";
}) {
  const [theme, setTheme] = useState(() => {
    const storedTheme = localStorage.getItem("dn_theme");
    if (storedTheme === "dark" || storedTheme === "light") return storedTheme;
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });
  const titleText = props.titleText ?? (typeof props.title === "string" ? props.title : "briefing");
  const shellLanguage = props.pageLanguage ?? "en";
  const shellMode = props.feed
    ? "feed-shell"
    : props.onAccount
      ? "admin-shell"
      : titleText === "Distilled.news"
        ? "auth-shell home-shell"
        : "auth-shell";
  const showCreateNav = !shellMode.includes("auth-shell");
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("dn_theme", theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = props.pageLanguage ?? "en";
    document.documentElement.dir = textDirection(props.pageLanguage ?? "en");
    document.title = titleText === "Distilled.news" ? "Distilled.news" : `${titleText} · Distilled.news`;
    const manifest = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (manifest) {
      manifest.href = props.feed
        ? `/manifest.webmanifest?user=${encodeURIComponent(props.feed.ownerUsername)}&feed=${encodeURIComponent(props.feed.slug)}`
        : "/manifest.webmanifest";
    }
  }, [props.feed, props.pageLanguage, titleText]);

  return (
    <main className={`shell ${shellMode}`}>
      <header>
        <div className="header-primary">
          <div className="brand-lockup">
            <a href="/" className="brand" aria-label="Distilled.news" title="Distilled.news">
              <img className="brand-logo" src="/logo.svg" alt="" />
            </a>
            <a href="https://github.com/AmmarMohanna/distilled.news" target="_blank" rel="noreferrer" className="brand-icon" aria-label="Open GitHub repository" title="open GitHub repository">
              <Github size={16} aria-hidden />
            </a>
          </div>
        </div>
        <div className="header-actions">
          <nav>
            {showCreateNav ? <a href="/" title={createNavLabel(shellLanguage)}>{createNavLabel(shellLanguage)}</a> : null}
            {props.feed ? <span className="nav-separator" aria-hidden="true">|</span> : null}
            {props.feed ? <a href={`/${props.feed.ownerUsername}/${props.feed.slug}/`}>{feedNavLabel(shellLanguage)}</a> : null}
          </nav>
          <div className="header-controls">
            {props.onAccount ? (
              <button type="button" className="icon-button" aria-label="account settings" title="account settings" onClick={props.onAccount}>
                <User size={16} aria-hidden />
              </button>
            ) : null}
            <button type="button" className="icon-button" aria-label={`switch to ${theme === "dark" ? "light" : "dark"} mode`} title="switch theme" onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}>
              {theme === "dark" ? <Sun size={16} aria-hidden /> : <Moon size={16} aria-hidden />}
            </button>
            {props.onLogout ? <button type="button" title="logout" onClick={() => void props.onLogout?.()}><LogOut size={15} aria-hidden /> logout</button> : null}
          </div>
        </div>
      </header>
      <div className="page-heading">
        <h1>{props.title}</h1>
        <p>{props.meta ?? getPageMeta(titleText)}</p>
      </div>
      {props.children}
    </main>
  );
}

function getPageMeta(title: string): string {
  if (title === "briefings") return "Manage your feeds and sources.";
  if (title === "briefing") return "Published briefing items only.";
  if (title.includes("Briefing")) return "Published briefing items only.";
  if (title === "verify email") return "Account verification.";
  if (title === "reset password") return "Account recovery.";
  return "Less clutter. Personalized news, to the point.";
}

function createNavLabel(language: "en" | "ar" | "fr"): string {
  if (language === "ar") return "موجزاتي";
  if (language === "fr") return "mes briefs";
  return "briefings";
}

function feedNavLabel(language: "en" | "ar" | "fr"): string {
  if (language === "ar") return "الموجز";
  if (language === "fr") return "fil";
  return "feed";
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

function toggleSetValue(
  current: Set<string>,
  setValue: React.Dispatch<React.SetStateAction<Set<string>>>,
  id: string
) {
  const next = new Set(current);
  if (next.has(id)) next.delete(id);
  else next.add(id);
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
    const retry = source.nextRetryAt ? ` Automatic retry ${formatTime(source.nextRetryAt, "en")}.` : " Automatic retry pending.";
    return {
      text: `Google News is temporarily unavailable.${retry}`,
      className: "source-warning"
    };
  }
  if (source.healthState === "backoff" || source.healthState === "degraded") {
    const retry = source.nextRetryAt ? ` Retrying automatically ${formatTime(source.nextRetryAt, "en")}.` : " Retrying automatically.";
    return {
      text: `Source is temporarily unavailable.${retry}`,
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

function summaryPublishedLabel(language: "en" | "ar" | "fr"): string {
  if (language === "ar") return "تم نشر موجز جديد.";
  if (language === "fr") return "nouveau brief publié.";
  return "new brief published.";
}

function moreOptionsLabel(language: "en" | "ar" | "fr"): string {
  if (language === "ar") return "خيارات";
  if (language === "fr") return "options";
  return "options";
}

function hourlyScheduleLabel(nextValue: string, paused: boolean, language: "en" | "ar" | "fr"): string {
  if (paused) return nextValue;
  if (language === "ar") return `كل ساعة · الموجز التالي ${nextValue}`;
  if (language === "fr") return `Toutes les heures · prochain brief ${nextValue}`;
  return `Hourly · next brief ${nextValue}`;
}

function starControlLabel(starred: boolean, language: "en" | "ar" | "fr"): string {
  if (language === "ar") return starred ? "مميّز" : "تمييز";
  if (language === "fr") return starred ? "favori" : "favoriser";
  return starred ? "starred" : "star";
}

function starTitleLabel(starred: boolean, language: "en" | "ar" | "fr"): string {
  if (language === "ar") return starred ? "إزالة التمييز" : "تمييز الموجز";
  if (language === "fr") return starred ? "retirer le favori" : "favoriser le fil";
  return starred ? "remove star" : "star feed";
}

function exploreControlLabel(language: "en" | "ar" | "fr"): string {
  if (language === "ar") return "استكشاف";
  if (language === "fr") return "Explorer";
  return "Explore";
}

function exploreFeedsLabel(language: "en" | "ar" | "fr"): string {
  if (language === "ar") return "استكشاف الموجزات";
  if (language === "fr") return "explorer les fils";
  return "explore feeds";
}

function closeExploreLabel(language: "en" | "ar" | "fr"): string {
  if (language === "ar") return "إغلاق الاستكشاف";
  if (language === "fr") return "fermer l'exploration";
  return "close explore";
}

function loadingFeedsLabel(language: "en" | "ar" | "fr"): string {
  if (language === "ar") return "جار تحميل الموجزات";
  if (language === "fr") return "chargement des fils";
  return "loading feeds";
}

function noStarredFeedsLabel(language: "en" | "ar" | "fr"): string {
  if (language === "ar") return "لا توجد موجزات مميّزة بعد";
  if (language === "fr") return "aucun fil favori pour l'instant";
  return "no starred feeds yet";
}

function searchPublishedLabel(language: "en" | "ar" | "fr"): string {
  if (language === "ar") return "ابحث في الموجز المنشور";
  if (language === "fr") return "chercher dans le brief publié";
  return "search published briefing";
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

function briefingToggleTitle(isExpanded: boolean, language: "en" | "ar" | "fr"): string {
  if (language === "ar") return isExpanded ? "إخفاء الموجز" : "عرض الموجز";
  if (language === "fr") return isExpanded ? "masquer le brief" : "afficher le brief";
  return isExpanded ? "hide briefing" : "show briefing";
}

function briefingToggleAria(title: string, isExpanded: boolean, language: "en" | "ar" | "fr"): string {
  if (language === "ar") return isExpanded ? `إخفاء ${title}` : `عرض ${title}`;
  if (language === "fr") return isExpanded ? `masquer ${title}` : `afficher ${title}`;
  return isExpanded ? `hide ${title}` : `show ${title}`;
}

function loadingBriefingLabel(language: "en" | "ar" | "fr"): string {
  if (language === "ar") return "جار تحميل الموجز";
  if (language === "fr") return "chargement du brief";
  return "loading briefing";
}

function noBriefingDetailLabel(language: "en" | "ar" | "fr"): string {
  if (language === "ar") return "لا توجد تفاصيل لهذا الموجز";
  if (language === "fr") return "aucun détail disponible";
  return "no briefing detail available";
}

function feedUnavailableLabel(language: "en" | "ar" | "fr"): string {
  if (language === "ar") return "الموجز غير متاح";
  if (language === "fr") return "fil indisponible";
  return "feed unavailable";
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

function uniqueSourceTitles(evidence: BriefingEvidence[]): string[] {
  const titles: string[] = [];
  const seen = new Set<string>();
  for (const entry of evidence) {
    const title = entry.sourceTitle.trim();
    const key = title.toLowerCase();
    if (!title || seen.has(key)) continue;
    seen.add(key);
    titles.push(title);
  }
  return titles;
}

function referencePreview(section: BriefingEditionSection): string {
  const sources = uniqueSourceTitles(section.evidence);
  if (sources.length === 0) return section.title;
  const visible = sources.slice(0, 2).join(", ");
  const hidden = sources.length - 2;
  return hidden > 0 ? `${visible} +${hidden}` : visible;
}

function referenceTimeRange(evidence: BriefingEvidence[], language: "en" | "ar" | "fr"): string {
  const times = evidence
    .map((entry) => entry.postedAt)
    .filter(Boolean)
    .sort();
  if (times.length === 0) return "";
  const first = formatTime(times[0], language);
  const last = formatTime(times[times.length - 1], language);
  return first === last ? first : `${first} - ${last}`;
}

function referenceDigestSummary(summary: string): string {
  return normalizeSummary(summary);
}

function surfaceBriefSummary(summary: string): string {
  return normalizeSummary(summary);
}

function normalizeSummary(summary: string): string {
  return summary.trim().replace(/\s+/gu, " ");
}

function highestReferenceNumber(text: string): number {
  let highest = 0;
  for (const match of text.matchAll(/\[(\d{1,3})\]/g)) {
    highest = Math.max(highest, Number(match[1]));
  }
  return highest;
}

function referenceTextParts(text: string): Array<{ kind: "text"; value: string } | { kind: "reference"; value: number }> {
  const parts: Array<{ kind: "text"; value: string } | { kind: "reference"; value: number }> = [];
  const pattern = /\[(\d{1,3})\]/g;
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index === undefined) continue;
    if (match.index > cursor) parts.push({ kind: "text", value: text.slice(cursor, match.index) });
    parts.push({ kind: "reference", value: Number(match[1]) });
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) parts.push({ kind: "text", value: text.slice(cursor) });
  return parts;
}

function referencesLabel(language: "en" | "ar" | "fr"): string {
  if (language === "ar") return "المراجع";
  if (language === "fr") return "références";
  return "references";
}

function topStoriesLabel(language: "en" | "ar" | "fr"): string {
  if (language === "ar") return "أبرز الأخبار";
  if (language === "fr") return "à la une";
  return "top stories";
}

function additionalUpdatesLabel(count: number, language: "en" | "ar" | "fr"): string {
  if (language === "ar") return `${count} تحديثات إضافية`;
  if (language === "fr") return `${count} autre${count === 1 ? "" : "s"} mise${count === 1 ? "" : "s"} à jour`;
  return `${count} additional update${count === 1 ? "" : "s"}`;
}

function referenceButtonLabel(referenceNumber: number, language: "en" | "ar" | "fr"): string {
  if (language === "ar") return `فتح المرجع ${referenceNumber}`;
  if (language === "fr") return `ouvrir la référence ${referenceNumber}`;
  return `open reference ${referenceNumber}`;
}

function openReportLabel(referenceNumber: number, language: "en" | "ar" | "fr"): string {
  if (language === "ar") return `فتح تقرير المرجع ${referenceNumber}`;
  if (language === "fr") return `ouvrir le rapport de la référence ${referenceNumber}`;
  return `open reference ${referenceNumber} report`;
}

function reportLabel(language: "en" | "ar" | "fr"): string {
  if (language === "ar") return "تقرير";
  if (language === "fr") return "rapport";
  return "report";
}

function closeReportLabel(language: "en" | "ar" | "fr"): string {
  if (language === "ar") return "إغلاق التقرير";
  if (language === "fr") return "fermer le rapport";
  return "close report";
}

function referenceLabel(count: number, language: "en" | "ar" | "fr"): string {
  if (language === "ar") return count === 1 ? "مرجع واحد" : `${count} مراجع`;
  if (language === "fr") return `${count} référence${count === 1 ? "" : "s"}`;
  return `${count} reference${count === 1 ? "" : "s"}`;
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

function noReferencesLabel(language: "en" | "ar" | "fr"): string {
  if (language === "ar") return "لا توجد مراجع لهذا التحديث.";
  if (language === "fr") return "Aucune référence pour cette mise à jour.";
  return "No references for this update.";
}

function originalPostLabel(language: "en" | "ar" | "fr"): string {
  if (language === "ar") return "المنشور الأصلي";
  if (language === "fr") return "publication originale";
  return "original post";
}

function linkLabel(language: "en" | "ar" | "fr"): string {
  if (language === "ar") return "رابط";
  if (language === "fr") return "lien";
  return "link";
}

function sourceTextLabel(language: "en" | "ar" | "fr"): string {
  if (language === "ar") return "نص المصدر";
  if (language === "fr") return "texte source";
  return "source text";
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
    publicFeedEnabled: true,
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

createRoot(document.getElementById("root")!).render(<App />);
