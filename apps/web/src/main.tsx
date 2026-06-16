import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  LogIn,
  RefreshCw,
  Save,
  Search,
  Settings,
  SlidersHorizontal
} from "lucide-react";
import type { BriefingConfig, BriefingItem } from "@lownoise/core";
import { demoMessages, personalNewsBriefing } from "@lownoise/core";
import {
  getBriefings,
  getFeed,
  getHealth,
  getSession,
  getSources,
  login,
  registerWebhook,
  saveBriefing,
  searchFeed,
  setSourceEnabled
} from "./api";
import { buildDemoOutput } from "./demoModel";
import type { FeedPayload, HealthStatus, SessionStatus, TelegramSourceRecord } from "./types";
import "./styles.css";

function App() {
  const path = window.location.pathname;
  if (path === "/demo") return <DemoPage />;
  if (path.startsWith("/feed/")) return <FeedPage slug={decodeURIComponent(path.replace("/feed/", ""))} />;
  return <AdminPage />;
}

function AdminPage() {
  const [session, setSession] = useState<SessionStatus | null>(null);
  const [briefing, setBriefing] = useState<BriefingConfig | null>(null);
  const [sources, setSources] = useState<TelegramSourceRecord[]>([]);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  async function loadAdmin() {
    setError("");
    const [briefings, nextSources, nextHealth] = await Promise.all([getBriefings(), getSources(), getHealth()]);
    setBriefing(briefings[0] ?? personalNewsBriefing);
    setSources(nextSources);
    setHealth(nextHealth);
  }

  useEffect(() => {
    getSession()
      .then(async (nextSession) => {
        setSession(nextSession);
        if (nextSession.authenticated) await loadAdmin();
      })
      .catch((cause) => setError(String(cause)));
  }, []);

  if (!session) return <Shell title="LowNoise.news"><p>loading</p></Shell>;
  if (!session.authenticated) {
    return (
      <Shell title="LowNoise.news">
        <LoginForm
          setupRequired={session.setupRequired}
          onLogin={async () => {
            const nextSession = await getSession();
            setSession(nextSession);
            await loadAdmin();
          }}
        />
        {error ? <p className="error">{error}</p> : null}
      </Shell>
    );
  }

  if (!briefing) return <Shell title="LowNoise.news"><p>loading setup</p></Shell>;

  return (
    <Shell title="admin">
      <form
        className="admin-grid"
        onSubmit={async (event) => {
          event.preventDefault();
          setStatus("saving");
          setBriefing(await saveBriefing(briefing));
          setStatus("saved");
        }}
      >
        <section className="section">
          <div className="section-title">
            <Settings size={16} aria-hidden />
            <h2>setup</h2>
          </div>
          <label>
            title
            <input
              value={briefing.title}
              onChange={(event) => setBriefing({ ...briefing, title: event.target.value })}
            />
          </label>
          <label>
            interest profile
            <textarea
              required
              rows={6}
              value={briefing.interestProfile}
              onChange={(event) => setBriefing({ ...briefing, interestProfile: event.target.value })}
            />
          </label>
          <label>
            style instruction
            <textarea
              rows={3}
              value={briefing.styleInstruction ?? ""}
              onChange={(event) => setBriefing({ ...briefing, styleInstruction: event.target.value })}
            />
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={briefing.publicFeedEnabled}
              onChange={(event) => setBriefing({ ...briefing, publicFeedEnabled: event.target.checked })}
            />
            public feed
          </label>
          <details>
            <summary><SlidersHorizontal size={14} aria-hidden /> advanced</summary>
            <label>
              retention days
              <input
                type="number"
                min={1}
                max={90}
                value={briefing.retentionDays}
                onChange={(event) => setBriefing({ ...briefing, retentionDays: Number(event.target.value) })}
              />
            </label>
          </details>
          <div className="actions">
            <button type="submit"><Save size={15} aria-hidden /> save</button>
            <a className="button-link" href={`/feed/${briefing.slug}`}>open feed</a>
            {status ? <span className="muted">{status}</span> : null}
          </div>
        </section>

        <section className="section">
          <div className="section-title">
            <RefreshCw size={16} aria-hidden />
            <h2>telegram</h2>
          </div>
          <button
            type="button"
            onClick={async () => {
              setStatus(`registered ${await registerWebhook()}`);
              setHealth(await getHealth());
            }}
          >
            <RefreshCw size={15} aria-hidden /> register webhook
          </button>
          <div className="health">
            <StatusLine label="bot token" value={health?.tokenConfigured ? "configured" : "missing"} />
            <StatusLine label="webhook" value={health?.webhookRegistered ? "registered" : "not registered"} />
            <StatusLine label="last event" value={health?.lastTelegramEventAt ?? "none"} />
            <StatusLine
              label="processing"
              value={`queued ${health?.processing.queued ?? 0} / failed ${health?.processing.failed ?? 0}`}
            />
          </div>
          <div className="source-list">
            {sources.length === 0 ? <p className="muted">sources appear here after the bot receives posts</p> : null}
            {sources.map((source) => (
              <label key={source.id} className="source-row">
                <input
                  type="checkbox"
                  checked={source.enabled}
                  onChange={async (event) => {
                    setSources(await setSourceEnabled(source.id, event.target.checked));
                  }}
                />
                <span>{source.title}</span>
                <span className="muted">{source.type}</span>
              </label>
            ))}
          </div>
        </section>
      </form>
    </Shell>
  );
}

function LoginForm(props: { setupRequired: boolean; onLogin: () => Promise<void> }) {
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
          await login(password, props.setupRequired ? setupToken : undefined);
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

  async function refresh() {
    setError("");
    const next = await getFeed(props.slug);
    setPayload(next);
    setItems(next.items);
  }

  useEffect(() => {
    refresh().catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)));
  }, [props.slug]);

  return (
    <Shell title={payload?.briefing.title ?? "briefing"}>
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
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="search published briefing" />
        </form>
      </div>
      {error ? <p className="error">{error}</p> : null}
      <div className="news-line">
        {items.map((item) => {
          const isExpanded = expanded.has(item.id);
          return (
            <article key={item.id} className="news-item">
              <button
                className="expand"
                aria-expanded={isExpanded}
                aria-label={`show evidence for ${item.summary}`}
                onClick={() => {
                  const next = new Set(expanded);
                  if (next.has(item.id)) next.delete(item.id);
                  else next.add(item.id);
                  setExpanded(next);
                }}
              >
                {isExpanded ? <ChevronDown size={15} aria-hidden /> : <ChevronRight size={15} aria-hidden />}
              </button>
              <time dateTime={item.itemAt}>{formatTime(item.itemAt)}</time>
              <p>{item.summary}</p>
              {isExpanded ? <EvidenceList item={item} /> : null}
            </article>
          );
        })}
        {items.length === 0 && !error ? <p className="muted">no retained briefing items</p> : null}
      </div>
    </Shell>
  );
}

function EvidenceList(props: { item: BriefingItem }) {
  return (
    <div className="evidence">
      {props.item.evidence.map((entry) => (
        <div key={entry.messageId} className="evidence-row">
          <div>
            <strong>{entry.sourceTitle}</strong>
            <time dateTime={entry.postedAt}>{formatTime(entry.postedAt)}</time>
          </div>
          <p>{entry.text}</p>
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

function DemoPage() {
  const [interestProfile, setInterestProfile] = useState(personalNewsBriefing.interestProfile);
  const [enabledSourceIds, setEnabledSourceIds] = useState(() =>
    Array.from(new Set(demoMessages.map((message) => message.source.id)))
  );
  const output = useMemo(() => buildDemoOutput(interestProfile, enabledSourceIds), [interestProfile, enabledSourceIds]);
  const sourceIds = Array.from(new Set(demoMessages.map((message) => message.source.id)));

  return (
    <Shell title="demo">
      <section className="section">
        <label>
          interest profile
          <textarea rows={5} value={interestProfile} onChange={(event) => setInterestProfile(event.target.value)} />
        </label>
        <div className="source-list">
          {sourceIds.map((sourceId) => {
            const source = demoMessages.find((message) => message.source.id === sourceId)!.source;
            return (
              <label key={sourceId} className="source-row">
                <input
                  type="checkbox"
                  checked={enabledSourceIds.includes(sourceId)}
                  onChange={(event) => {
                    setEnabledSourceIds((current) =>
                      event.target.checked ? [...current, sourceId] : current.filter((id) => id !== sourceId)
                    );
                  }}
                />
                <span>{source.title}</span>
              </label>
            );
          })}
        </div>
      </section>
      <div className="demo-grid">
        <section className="section">
          <h2>input stream</h2>
          {output.inputMessages.map((message) => (
            <p key={message.id} className="raw-message">{message.text}</p>
          ))}
        </section>
        <section className="section">
          <h2>briefing</h2>
          {output.items.map((item) => (
            <article key={item.id} className="demo-item">
              <time dateTime={item.itemAt}>{formatTime(item.itemAt)}</time>
              <p>{item.summary}</p>
            </article>
          ))}
          <p className="muted">suppressed {output.suppressedCount}</p>
        </section>
      </div>
    </Shell>
  );
}

function StatusLine(props: { label: string; value: string }) {
  return (
    <p>
      <span className="muted">{props.label}</span>
      <span>{props.value}</span>
    </p>
  );
}

function Shell(props: { title: string; children: React.ReactNode }) {
  return (
    <main className="shell">
      <header>
        <a href="/" className="brand">LowNoise.news</a>
        <nav>
          <a href="/demo">demo</a>
          <a href="/feed/personal">feed</a>
        </nav>
      </header>
      <h1>{props.title}</h1>
      {props.children}
    </main>
  );
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

createRoot(document.getElementById("root")!).render(<App />);
