import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  Globe,
  Languages,
  LogIn,
  LogOut,
  Moon,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings,
  Sun,
  Trash2
} from "lucide-react";
import type { BriefingConfig, BriefingItem } from "@lownoise/core";
import { personalNewsBriefing } from "@lownoise/core";
import {
  addPublicTelegramSource,
  deleteSource,
  getBriefings,
  getFeed,
  getHealth,
  getSession,
  getSources,
  login,
  logout,
  refreshPublicTelegramSources,
  saveBriefing,
  searchFeed,
  setSourceEnabled
} from "./api";
import { formatTime, publicFeedUrl, slugify, uniqueSlug } from "./helpers";
import type { FeedPayload, HealthStatus, SessionStatus, TelegramSourceRecord } from "./types";
import "./styles.css";

function App() {
  const path = window.location.pathname;
  if (path.startsWith("/feed/")) return <FeedPage slug={decodeURIComponent(path.replace("/feed/", ""))} />;
  return <AdminPage />;
}

function getPageMeta(title: string): string {
  if (title === "admin") return "Choose a feed, define what matters, and share the public line when ready.";
  if (title === "briefing") return "A retained news line from published items only.";
  if (title.includes("Briefing")) return "A retained news line from published items only.";
  return "Self-hosted filtering for calmer news intake.";
}

function AdminPage() {
  const [session, setSession] = useState<SessionStatus | null>(null);
  const [briefings, setBriefings] = useState<BriefingConfig[]>([]);
  const [selectedBriefingId, setSelectedBriefingId] = useState<string | null>(null);
  const [sources, setSources] = useState<TelegramSourceRecord[]>([]);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [status, setStatus] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [error, setError] = useState("");

  const briefing = briefings.find((item) => item.id === selectedBriefingId) ?? null;

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

  useEffect(() => {
    getSession()
      .then(async (nextSession) => {
        setSession(nextSession);
        if (nextSession.authenticated) await loadBriefings();
      })
      .catch((cause) => setError(String(cause)));
  }, []);

  useEffect(() => {
    if (!selectedBriefingId || !session?.authenticated) return;
    loadScopedData(selectedBriefingId).catch((cause) =>
      setError(cause instanceof Error ? cause.message : String(cause))
    );
  }, [selectedBriefingId, session?.authenticated]);

  async function persistBriefing(nextBriefing: BriefingConfig, nextStatus = "saved"): Promise<BriefingConfig> {
    setError("");
    setStatus("saving");
    const saved = await saveBriefing({ ...nextBriefing, slug: slugify(nextBriefing.slug) });
    setBriefings((current) => updateBriefingList(current, saved));
    setSelectedBriefingId(saved.id);
    setStatus(nextStatus);
    return saved;
  }

  async function createBriefing() {
    const draft = createBriefingDraft(briefings);
    const created = await persistBriefing(draft, "feed created");
    await loadBriefings(created.id);
  }

  async function copyPublicFeedUrl(nextBriefing: BriefingConfig) {
    if (!nextBriefing.publicFeedEnabled) {
      setStatus("enable public feed first");
      return;
    }
    if (!navigator.clipboard?.writeText) {
      setError("Clipboard access is not available in this browser.");
      return;
    }
    await navigator.clipboard.writeText(publicFeedUrl(nextBriefing.slug));
    setStatus("public feed url copied");
  }

  async function handleLogout() {
    await logout();
    setSession({ authenticated: false, setupRequired: false });
    setBriefings([]);
    setSelectedBriefingId(null);
    setSources([]);
    setHealth(null);
    setStatus("");
    setSourceUrl("");
  }

  function patchSelectedBriefing(patch: Partial<BriefingConfig>) {
    if (!briefing) return;
    setBriefings((current) =>
      current.map((item) => (item.id === briefing.id ? { ...item, ...patch } : item))
    );
  }

  if (!session) {
    return (
      <Shell title="admin">
        <p className="muted">loading</p>
      </Shell>
    );
  }

  if (!session.authenticated) {
    return (
      <Shell title="LowNoise.news">
        <LoginForm
          setupRequired={session.setupRequired}
          onLogin={async () => {
            const nextSession = await getSession();
            setSession(nextSession);
            await loadBriefings();
          }}
        />
        {error ? <p className="error">{error}</p> : null}
      </Shell>
    );
  }

  if (!briefing) {
    return (
      <Shell title="admin" onLogout={handleLogout}>
        <section className="section">
          <div className="section-title">
            <Globe size={16} aria-hidden />
            <h2>feeds</h2>
          </div>
          <button type="button" onClick={() => createBriefing()}>
            <Plus size={15} aria-hidden /> new feed
          </button>
        </section>
      </Shell>
    );
  }

  return (
    <Shell title="admin" onLogout={handleLogout} feedSlug={briefing.slug}>
      <div className="admin-stack">
        <section className="section">
          <div className="section-title">
            <Globe size={16} aria-hidden />
            <h2>feeds</h2>
          </div>
          <div className="actions">
            <button type="button" onClick={() => createBriefing()}>
              <Plus size={15} aria-hidden /> new feed
            </button>
            {status ? <span className="muted">{status}</span> : null}
          </div>
          <div className="feed-list">
            {briefings.map((item) => (
              <div
                key={item.id}
                className={`feed-row${item.id === briefing.id ? " active" : ""}`}
              >
                <button
                  type="button"
                  className="feed-select"
                  onClick={() => setSelectedBriefingId(item.id)}
                >
                  <span className="feed-title">{item.title}</span>
                  <span className="muted">/{item.slug}</span>
                </button>
                <div className="feed-flags">
                  <span className="pill">{item.language === "ar" ? "arabic" : "english"}</span>
                  <span className="pill">{item.publicFeedEnabled ? "public" : "private"}</span>
                  {item.paused ? <span className="pill">paused</span> : null}
                </div>
                <a className="button-link" href={`/feed/${item.slug}`}>open</a>
                <button
                  type="button"
                  disabled={!item.publicFeedEnabled}
                  onClick={() => copyPublicFeedUrl(item)}
                >
                  <Copy size={15} aria-hidden /> copy url
                </button>
              </div>
            ))}
          </div>
        </section>

        <div className="admin-grid">
          <form
            className="section"
            onSubmit={async (event) => {
              event.preventDefault();
              try {
                await persistBriefing(briefing);
              } catch (cause) {
                setStatus("");
                setError(cause instanceof Error ? cause.message : String(cause));
              }
            }}
          >
            <div className="section-title">
              <Settings size={16} aria-hidden />
              <h2>setup</h2>
            </div>
            <label>
              title
              <input
                dir={briefing.language === "ar" ? "rtl" : "ltr"}
                value={briefing.title}
                onChange={(event) => patchSelectedBriefing({ title: event.target.value })}
              />
            </label>
            <label>
              slug
              <input
                dir="ltr"
                value={briefing.slug}
                onChange={(event) => patchSelectedBriefing({ slug: event.target.value })}
              />
            </label>
            <div className="field-group">
              <span>language</span>
              <div className="segmented" role="group" aria-label="feed language">
                <button
                  type="button"
                  className={briefing.language === "en" ? "active" : ""}
                  onClick={() => patchSelectedBriefing({ language: "en" })}
                >
                  <Languages size={15} aria-hidden /> english
                </button>
                <button
                  type="button"
                  className={briefing.language === "ar" ? "active" : ""}
                  onClick={() => patchSelectedBriefing({ language: "ar" })}
                >
                  <Languages size={15} aria-hidden /> arabic
                </button>
              </div>
            </div>
            <label>
              interest profile
              <textarea
                dir={briefing.language === "ar" ? "rtl" : "ltr"}
                required
                rows={6}
                value={briefing.interestProfile}
                onChange={(event) => patchSelectedBriefing({ interestProfile: event.target.value })}
              />
            </label>
            <label>
              style instruction
              <textarea
                dir={briefing.language === "ar" ? "rtl" : "ltr"}
                rows={3}
                value={briefing.styleInstruction ?? ""}
                onChange={(event) => patchSelectedBriefing({ styleInstruction: event.target.value })}
              />
            </label>
            <label className="toggle">
              <input
                type="checkbox"
                checked={briefing.publicFeedEnabled}
                onChange={(event) => patchSelectedBriefing({ publicFeedEnabled: event.target.checked })}
              />
              public feed
            </label>
            <details>
              <summary>advanced</summary>
              <label>
                retention days
                <input
                  type="number"
                  min={1}
                  max={90}
                  value={briefing.retentionDays}
                  onChange={(event) => patchSelectedBriefing({ retentionDays: Number(event.target.value) })}
                />
              </label>
            </details>
            <div className="actions">
              <button type="submit"><Save size={15} aria-hidden /> save</button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await persistBriefing({ ...briefing, paused: !briefing.paused }, briefing.paused ? "feed resumed" : "feed paused");
                  } catch (cause) {
                    setStatus("");
                    setError(cause instanceof Error ? cause.message : String(cause));
                  }
                }}
              >
                {briefing.paused ? <Play size={15} aria-hidden /> : <Pause size={15} aria-hidden />}
                {briefing.paused ? "resume feed" : "pause feed"}
              </button>
              <a className="button-link" href={`/feed/${briefing.slug}`}>open feed</a>
              <button
                type="button"
                disabled={!briefing.publicFeedEnabled}
                onClick={() => copyPublicFeedUrl(briefing)}
              >
                <Copy size={15} aria-hidden /> copy public url
              </button>
            </div>
            {error ? <p className="error">{error}</p> : null}
          </form>

          <section className="section">
            <div className="section-title">
              <RefreshCw size={16} aria-hidden />
              <h2>sources</h2>
            </div>
            <div className="source-add">
              <label>
                telegram channel url
                <input
                  dir="ltr"
                  value={sourceUrl}
                  onChange={(event) => setSourceUrl(event.target.value)}
                  placeholder="https://t.me/LebUpdate"
                />
              </label>
              <button
                type="button"
                disabled={!sourceUrl.trim() || briefing.paused}
                onClick={async () => {
                  setError("");
                  try {
                    setStatus("adding source");
                    setSources(await addPublicTelegramSource(briefing.id, sourceUrl));
                    setSourceUrl("");
                    setHealth(await getHealth(briefing.id));
                    setStatus("source added");
                  } catch (cause) {
                    setStatus("");
                    setError(cause instanceof Error ? cause.message : String(cause));
                  }
                }}
              >
                <Plus size={15} aria-hidden /> add
              </button>
            </div>
            <div className="actions">
              <button
                type="button"
                disabled={briefing.paused}
                onClick={async () => {
                  setError("");
                  try {
                    setStatus("fetching latest");
                    setSources(await refreshPublicTelegramSources(briefing.id));
                    setHealth(await getHealth(briefing.id));
                    setStatus("latest fetched");
                  } catch (cause) {
                    setStatus("");
                    setError(cause instanceof Error ? cause.message : String(cause));
                  }
                }}
              >
                <RefreshCw size={15} aria-hidden /> fetch latest
              </button>
            </div>
            <div className="health">
              <StatusLine label="processing" value={`queued ${health?.processing.queued ?? 0} / failed ${health?.processing.failed ?? 0}`} />
              <StatusLine label="last source event" value={health?.lastTelegramEventAt ?? "none"} />
              <StatusLine label="status" value={briefing.paused ? "paused" : "live"} />
            </div>
            <div className="source-list">
              {sources.length === 0 ? <p className="muted">add public Telegram channel URLs to feed this briefing</p> : null}
              {sources.map((source) => (
                <div key={source.id} className="source-row">
                  <label>
                    <input
                      type="checkbox"
                      checked={source.enabled}
                      onChange={async (event) => {
                        setSources(await setSourceEnabled(briefing.id, source.id, event.target.checked));
                      }}
                    />
                    <span dir="auto">{source.title}</span>
                  </label>
                  {source.url ? (
                    <a href={source.url} target="_blank" rel="noreferrer">
                      {source.username ?? "open"}
                    </a>
                  ) : null}
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`remove ${source.title}`}
                    onClick={async () => {
                      setError("");
                      try {
                        setSources(await deleteSource(briefing.id, source.id));
                        setStatus("source removed");
                      } catch (cause) {
                        setStatus("");
                        setError(cause instanceof Error ? cause.message : String(cause));
                      }
                    }}
                  >
                    <Trash2 size={15} aria-hidden />
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </Shell>
  );
}

function LoginForm(props: { setupRequired: boolean; onLogin: () => Promise<void> }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [setupToken, setSetupToken] = useState("");
  const [error, setError] = useState("");

  return (
    <form
      className="login"
      onSubmit={async (event) => {
        event.preventDefault();
        setError("");
        try {
          await login(username, password, props.setupRequired ? setupToken : undefined);
          await props.onLogin();
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      }}
    >
      {props.setupRequired ? (
        <label>
          setup token
          <input value={setupToken} onChange={(event) => setSetupToken(event.target.value)} />
        </label>
      ) : null}
      <label>
        admin username
        <input value={username} onChange={(event) => setUsername(event.target.value)} />
      </label>
      <label>
        admin password
        <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
      </label>
      <button type="submit"><LogIn size={15} aria-hidden /> enter</button>
      {error ? <p className="error">{error}</p> : null}
    </form>
  );
}

function FeedPage(props: { slug: string }) {
  const [payload, setPayload] = useState<FeedPayload | null>(null);
  const [items, setItems] = useState<BriefingItem[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [readIds, setReadIds] = useState<Set<string>>(new Set());

  async function refresh() {
    setError("");
    const next = await getFeed(props.slug);
    setPayload(next);
    setItems(next.items);
  }

  useEffect(() => {
    refresh().catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)));
  }, [props.slug]);

  useEffect(() => {
    const raw = localStorage.getItem(`ln_read:${props.slug}`);
    setReadIds(new Set(raw ? (JSON.parse(raw) as string[]) : []));
  }, [props.slug]);

  useEffect(() => {
    localStorage.setItem(`ln_read:${props.slug}`, JSON.stringify(Array.from(readIds)));
  }, [props.slug, readIds]);

  useEffect(() => {
    if (!payload) return;

    let active = true;
    const timeout = window.setTimeout(async () => {
      try {
        setError("");
        const nextItems = query.trim() ? await searchFeed(props.slug, query) : payload.items;
        if (active) setItems(nextItems);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : String(cause));
      }
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [payload, props.slug, query]);

  const unreadItems = items.filter((item) => !readIds.has(item.id));
  const archivedReadItems = items.filter((item) => readIds.has(item.id));
  const language = payload?.briefing.language ?? "en";

  return (
    <Shell title={payload?.briefing.title ?? "briefing"} feedSlug={props.slug}>
      <div className="feed-tools">
        <button onClick={() => refresh()}><RefreshCw size={15} aria-hidden /> refresh</button>
        <form
          className="search"
          onSubmit={async (event) => {
            event.preventDefault();
            setItems(query.trim() ? await searchFeed(props.slug, query) : payload?.items ?? []);
          }}
        >
          <Search size={15} aria-hidden />
          <input
            aria-label="search published briefing"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="search published briefing"
          />
        </form>
      </div>
      {error ? <FeedNotice message={error} /> : null}
      <div className="news-line">
        {unreadItems.map((item) => (
          <FeedItemRow
            key={item.id}
            item={item}
            language={language}
            isExpanded={expanded.has(item.id)}
            isRead={false}
            onToggleExpanded={() => toggleSetValue(expanded, setExpanded, item.id)}
            onToggleRead={() => toggleRead(readIds, setReadIds, item.id, true)}
          />
        ))}
        {unreadItems.length === 0 && !error ? (
          <div className="empty-state">
            <strong>{archivedReadItems.length > 0 ? "all visible items are read" : "no published items"}</strong>
            <p className="muted">
              {archivedReadItems.length > 0
                ? "Open the read section below to revisit archived lines."
                : "The briefing line fills after enabled Telegram sources publish matching items."}
            </p>
          </div>
        ) : null}
      </div>
      {archivedReadItems.length > 0 ? (
        <details className="section read-section">
          <summary>read {archivedReadItems.length}</summary>
          <div className="news-line news-line-read">
            {archivedReadItems.map((item) => (
              <FeedItemRow
                key={item.id}
                item={item}
                language={language}
                isExpanded={expanded.has(item.id)}
                isRead={true}
                onToggleExpanded={() => toggleSetValue(expanded, setExpanded, item.id)}
                onToggleRead={() => toggleRead(readIds, setReadIds, item.id, false)}
              />
            ))}
          </div>
        </details>
      ) : null}
    </Shell>
  );
}

function FeedItemRow(props: {
  item: BriefingItem;
  language: "en" | "ar";
  isExpanded: boolean;
  isRead: boolean;
  onToggleExpanded: () => void;
  onToggleRead: () => void;
}) {
  return (
    <article className="news-item">
      <button
        type="button"
        className="read-button"
        aria-label={props.isRead ? `mark ${props.item.summary} unread` : `mark ${props.item.summary} read`}
        onClick={props.onToggleRead}
      >
        {props.isRead ? "unread" : "read"}
      </button>
      <button
        type="button"
        className="expand"
        aria-expanded={props.isExpanded}
        aria-label={`show evidence for ${props.item.summary}`}
        onClick={props.onToggleExpanded}
      >
        {props.isExpanded ? <ChevronDown size={15} aria-hidden /> : <ChevronRight size={15} aria-hidden />}
      </button>
      <div className="news-copy" dir={props.language === "ar" ? "rtl" : "ltr"} lang={props.language}>
        <div className="news-meta">
          <time dateTime={props.item.itemAt} dir="ltr">{formatTime(props.item.itemAt, props.language)}</time>
          {props.item.mergedUpdateCount > 0 ? (
            <span className="muted">updates {props.item.mergedUpdateCount + 1}</span>
          ) : null}
        </div>
        <p className="news-summary">{props.item.summary}</p>
        {props.isExpanded ? <EvidenceList item={props.item} language={props.language} /> : null}
      </div>
    </article>
  );
}

function EvidenceList(props: { item: BriefingItem; language: "en" | "ar" }) {
  return (
    <div className="evidence">
      {props.item.evidence.map((entry) => (
        <div key={entry.messageId} className="evidence-row">
          <div className="evidence-head">
            <strong dir="auto">{entry.sourceTitle}</strong>
            <time dateTime={entry.postedAt} dir="ltr">{formatTime(entry.postedAt, props.language)}</time>
          </div>
          <p dir="auto">{entry.text}</p>
          <div className="evidence-links">
            {entry.sourceUrl ? (
              <a href={entry.sourceUrl} target="_blank" rel="noreferrer">
                <ExternalLink size={14} aria-hidden /> original
              </a>
            ) : null}
            {entry.links.map((link) => (
              <a key={link} href={link} target="_blank" rel="noreferrer">
                <ExternalLink size={14} aria-hidden /> link
              </a>
            ))}
            {entry.media.map((media, index) =>
              media.url ? (
                <a key={`${media.url}-${index}`} href={media.url} target="_blank" rel="noreferrer">
                  <ExternalLink size={14} aria-hidden /> {media.label ?? media.type}
                </a>
              ) : (
                <span key={`${media.fileId}-${index}`} className="muted">{media.label ?? media.type}</span>
              )
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function StatusLine(props: { label: string; value: string }) {
  return (
    <p className="status-line">
      <span className="status-label">{props.label}</span>
      <span className="status-value">{props.value}</span>
    </p>
  );
}

function FeedNotice(props: { message: string }) {
  return (
    <section className="section notice">
      <h2>feed unavailable</h2>
      <p>{props.message}</p>
    </section>
  );
}

function Shell(props: {
  title: string;
  children: React.ReactNode;
  feedSlug?: string;
  onLogout?: () => Promise<void>;
}) {
  const [theme, setTheme] = useState(() => localStorage.getItem("ln_theme") ?? "dark");

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("ln_theme", theme);
  }, [theme]);

  return (
    <main className="shell">
      <header>
        <div className="header-primary">
          {props.onLogout ? (
            <button type="button" onClick={() => void props.onLogout?.()}>
              <LogOut size={15} aria-hidden /> logout
            </button>
          ) : null}
          <a href="/" className="brand">LowNoise.news</a>
        </div>
        <div className="header-actions">
          <nav>
            <a href="/">admin</a>
            {props.feedSlug ? <a href={`/feed/${props.feedSlug}`}>feed</a> : null}
          </nav>
          <button
            type="button"
            className="icon-button"
            aria-label={`switch to ${theme === "dark" ? "light" : "dark"} mode`}
            onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
          >
            {theme === "dark" ? <Sun size={16} aria-hidden /> : <Moon size={16} aria-hidden />}
          </button>
        </div>
      </header>
      <div className="page-heading">
        <h1>{props.title}</h1>
        <p>{getPageMeta(props.title)}</p>
      </div>
      {props.children}
    </main>
  );
}

function updateBriefingList(current: BriefingConfig[], next: BriefingConfig): BriefingConfig[] {
  const exists = current.some((item) => item.id === next.id);
  if (!exists) return [...current, next];
  return current.map((item) => (item.id === next.id ? next : item));
}

function createBriefingDraft(existing: BriefingConfig[]): BriefingConfig {
  const nextIndex = existing.length + 1;
  const slugBase = nextIndex === 1 ? "personal" : `feed-${nextIndex}`;
  return {
    ...personalNewsBriefing,
    id: `briefing_${crypto.randomUUID()}`,
    slug: uniqueSlug(existing, slugBase),
    title: nextIndex === 1 ? "Personal Briefing" : `Briefing ${nextIndex}`,
    publicFeedEnabled: false,
    paused: false,
    language: "en"
  };
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

createRoot(document.getElementById("root")!).render(<App />);
