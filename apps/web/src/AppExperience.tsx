import React, { useEffect, useRef, useState } from "react";
import { ArrowRight, Bell, Bookmark, Check, ChevronRight, Globe, HelpCircle, Home, Link, Plus, Rss, Search, Send, Settings, ShieldCheck, SlidersHorizontal, Smartphone, User, X } from "lucide-react";
import type { BriefingConfig } from "@distilled/core";
import type { AccountRecord, HealthStatus, PublicBriefing } from "./types";
import { getExploreFeeds } from "./api";
import { ThemeToggle } from "./ThemeToggle";

const topics = [
  { name: "Lebanon", category: "Lebanon", art: "coast" },
  { name: "Global Affairs", category: "World", art: "world" },
  { name: "AI & Technology", category: "Tech", art: "tech" },
  { name: "Business & Markets", category: "Business", art: "city" },
  { name: "Health & Science", category: "Science", art: "science" },
  { name: "Culture & Media", category: "Culture", art: "culture" }
];
const feedUrl = (feed: Pick<PublicBriefing, "ownerUsername" | "slug">) => `/${encodeURIComponent(feed.ownerUsername)}/${encodeURIComponent(feed.slug)}/`;
const topicPatterns: Record<string, RegExp> = {
  Lebanon: /lebanon|lebanese|beirut/i, World: /world|global|international/i,
  Tech: /\bai\b|tech|artificial intelligence/i, Business: /business|market|finance|econom/i,
  Science: /health|science|medical/i, Culture: /culture|media|arts|film/i
};
function feedArt(
  feed: Pick<BriefingConfig, "title" | "interestProfile">
) {
  const themeText = `${feed.title} ${feed.interestProfile}`;

  return (
    topics.find(topic =>
      topicPatterns[topic.category].test(themeText)
    )?.art ?? "world"
  );
}

export function BrandMark() {
  return <span className="original-gold-logo" aria-hidden="true" />;
}

function OrbitArt() {
  return <img className="orbit-art" src="/home-globe.png" alt="" aria-hidden="true" width={1448} height={1086} />;
}

function TopicArt({ kind, showArrow = true }: { kind: string; showArrow?: boolean }) {
  return <span className={`topic-art art-${kind}`} aria-hidden="true">{showArrow && <ArrowRight className="art-arrow" size={15}/>}</span>;
}

export function AppExperience(props: {
  account: AccountRecord; briefings: BriefingConfig[]; briefing: BriefingConfig; health: HealthStatus | null;
  onAccount: () => void; onFeedSettings: () => void; onCreate: () => Promise<void>; onHelp: () => void; error?: string; children: React.ReactNode;
}) {
  const [tab, setTab] = useState<"home" | "explore" | "settings">("home");
  const [manage, setManage] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("For you");
  const [feeds, setFeeds] = useState<PublicBriefing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    document.documentElement.lang = "en";
    document.documentElement.dir = "ltr";
    document.title = `${tab[0].toUpperCase() + tab.slice(1)} · Distilled.news`;
  }, [tab]);
  useEffect(() => {
    let active = true;
    getExploreFeeds().then(result => { if (active) setFeeds(result); }).catch(cause => { if (active) setError(String(cause.message ?? cause)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const visibleTopics = topics.filter(topic => (category === "For you" || topic.category === category) && topic.name.toLowerCase().includes(query.toLowerCase()));
  const visibleFeeds = feeds.filter(feed => `${feed.title} ${feed.ownerUsername}`.toLowerCase().includes(query.toLowerCase()) && (category === "For you" || topicPatterns[category]?.test(feed.title)));
  const openManage = () => { setTab("settings"); setManage(true); };
  const setting = (icon: React.ReactNode, label: string, action: () => void, value?: string) => <button type="button" className="setting-row" onClick={action}>{icon}<span>{label}</span>{value && <small>{value}</small>}<ChevronRight size={17}/></button>;
  return <main className="experience">
    <header className="experience-header"><a href="/" className="experience-brand" aria-label="Distilled.news home"><BrandMark/></a><div className="experience-header-actions">
      <ThemeToggle/>
      {tab === "explore" ? <button className="quiet-icon" aria-label="Search topics and sources" onClick={() => searchRef.current?.focus()}><Search/></button> : <button className="quiet-icon" aria-label="Notifications" onClick={() => setNotice("Notifications are planned for a future update. You can read your published briefings in your feeds.")}><Bell size={21}/></button>}
      <button className="avatar-button" aria-label="Account profile" onClick={props.onAccount}><User size={23} aria-hidden="true"/></button>
    </div></header>
    {props.error && <p className="error" role="alert">{props.error}</p>}
    {tab === "home" && <div className="home-view">
      <section className="welcome-hero"><OrbitArt/><div className="welcome-copy"><h1>
  <span>Welcome back,</span>
  <br/>
  <strong className="user-name">{props.account.username}</strong>
</h1><p>A calmer perspective on a complex world.</p></div></section>
<a className="today-card" href={feedUrl(props.briefing)}>
  <span className="briefing-symbol">
    <Bell size={23}/>
  </span>

  <span className="today-card-copy">
    <strong className="today-label">Today's briefing</strong>

    <strong className="today-update">
      {props.health?.latestPublishedAt
        ? "Your latest update is ready"
        : "Your perspective starts here"}
    </strong>

    <span className="today-meta">
      Lebanon · Global · AI & Tech
    </span>
  </span>

  <span className="circle-arrow">
    <ArrowRight size={21}/>
  </span>
</a>      <section className="your-feeds"><div className="experience-section-heading"><h2>Your feeds</h2><button className="text-button" onClick={openManage}>Manage</button></div><div className="personal-feed-grid">{props.briefings.map((feed) => <a className="topic-card" href={feedUrl(feed)} key={feed.id}><TopicArt kind={feedArt(feed)}/><span className="topic-name">{feed.title}</span><small className="feed-card-status">{feed.paused ? "Paused" : "View briefing"}</small></a>)}<button className="add-feed-tile" onClick={() => setAdding(true)}><span><Plus/></span>Add</button></div></section>
      
    </div>}
    {tab === "explore" && <section className="explore-view"><div className="experience-title"><h1>Explore</h1><p>Find topics and sources to follow.</p></div><label className="explore-search"><Search size={19}/><input ref={searchRef} value={query} onChange={event => setQuery(event.target.value)} placeholder="Search topics, sources, or keywords..." aria-label="Search topics, sources, or keywords"/>{query && <button className="quiet-icon" aria-label="Clear search" onClick={() => setQuery("")}><X size={16}/></button>}</label>
      <div className="category-chips" aria-label="Topic categories">{["For you", "Lebanon", "World", "Tech", "Business", "Science", "Culture"].map(item => <button key={item} aria-pressed={category === item} className={category === item ? "selected" : ""} onClick={() => setCategory(item)}>{item}</button>)}</div>
      <div className="experience-section-heading"><h2>Popular topics</h2><button className="text-button" onClick={() => { setQuery(""); setCategory("For you"); }}>See all</button></div>
      <div className="topic-grid">{visibleTopics.map(topic => <button className="topic-card" key={topic.name} onClick={() => { setQuery(""); setCategory(topic.category); }}><TopicArt kind={topic.art} showArrow={false}/><span className="topic-name">{topic.name}<ArrowRight size={14}/></span></button>)}</div>
      {visibleTopics.length === 0 && <p className="empty-copy">No topics match your search.</p>}
      <div className="experience-section-heading public-feeds-heading"><h2>Community feeds</h2><span className="muted">Discover a perspective</span></div><div className="community-feeds">{loading ? <p className="empty-copy" role="status">Loading feeds…</p> : error ? <p className="error" role="alert">{error}</p> : visibleFeeds.length ? visibleFeeds.map(feed => <a key={feed.id} href={feedUrl(feed)}><Globe size={20}/><span><strong>{feed.title}</strong><small>@{feed.ownerUsername}</small></span><ArrowRight size={17}/></a>) : <p className="empty-copy">No published feeds match yet. Add a feed to follow your own sources.</p>}</div>
      <button className="floating-add" aria-label="Add feed" onClick={() => setAdding(true)}><Plus size={28}/></button>
    </section>}
    {tab === "settings" && <section className="settings-view"><div className="experience-title"><h1>Settings</h1><p>Customize your experience.</p></div><p className="settings-group-label">Account</p><div className="settings-group">
      {setting(<User/>, "Profile", props.onAccount)}{setting(<Bell/>, "Notifications", () => setNotice("Push notifications are planned for a future update. No notification permissions are requested yet."))}{setting(<Globe/>, "Language", props.onFeedSettings, ({ en: "English", ar: "Arabic", fr: "French" })[props.briefing.language])}
      </div><p className="settings-group-label">Preferences</p><div className="settings-group">{setting(<SlidersHorizontal/>, "Briefing frequency", props.onFeedSettings, props.briefing.briefingCadence)}{setting(<SlidersHorizontal/>, "Topics & sources", () => setManage(!manage))}{setting(<Bookmark/>, "Your feeds", () => { setTab("home"); setManage(false); })}</div>
      <p className="settings-group-label">App</p><div className="settings-group">{setting(<Smartphone/>, "Install app (PWA)", () => setNotice("To add Distilled to your Home Screen, open your browser menu and choose Add to Home Screen or Install app if available. Full offline and push support are planned for a future update."))}{setting(<ShieldCheck/>, "Privacy", () => setNotice("Published feeds are public and use your username in their URL. Only add sources you intend to publish. Account and feed settings are available from your profile."))}{setting(<HelpCircle/>, "Help & support", props.onHelp)}</div>
      {manage && <section className="manage-panel"><div className="experience-section-heading"><h2>Manage feeds & sources</h2><button className="text-button" onClick={() => setManage(false)}>Close</button></div>{props.children}</section>}
    </section>}
    <nav className="bottom-navigation" aria-label="Main navigation">
  <a
    href="/"
    className="sidebar-logo experience-brand"
    aria-label="Distilled News home"
  >
    <BrandMark />
  </a>

  {([
    { id: "home", label: "Home", icon: Home },
    { id: "explore", label: "Explore", icon: Search },
    { id: "settings", label: "Settings", icon: Settings }
  ] as const).map(({ id, label, icon: Icon }) => (
    <button
      key={id}
      aria-current={tab === id ? "page" : undefined}
      className={tab === id ? "active" : ""}
      onClick={() => {
        setTab(id);
        setManage(false);
        window.scrollTo({ top: 0 });
      }}
    >
      <Icon size={23} />
      <span>{label}</span>
    </button>
  ))}

  <div className="sidebar-footer">
    <strong>Distilled News</strong>
    <p>The news that matters, without the noise.</p>
  </div>
</nav>
    {adding && <ExperienceDialog title="Add feed" onClose={() => { if (!creating) setAdding(false); }}><h2>Add feed</h2><p className="add-feed-subtitle">
  Follow your favorite sources. Stay informed on what matters to you.
</p><div className="add-source-hint"><Link size={21}/><span>Create a feed, then add your sources</span></div><small>Supported sources</small><div className="source-type-chips"><span><Rss size={16}/>RSS</span><span><Send size={16}/>Telegram</span><span>𝕏 X</span><span><Link size={16}/>Website</span><span>Google News</span></div><p className="add-explanation">Give your new feed a name and choose its topics in the next step.</p>{createError && <p className="error" role="alert">{createError}</p>}<div className="experience-dialog-actions"><button disabled={creating} onClick={() => setAdding(false)}>Cancel</button><button className="primary-button" disabled={creating} onClick={async () => { setCreating(true); setCreateError(""); try { await props.onCreate(); setAdding(false); } catch (cause) { setCreateError(cause instanceof Error ? cause.message : String(cause)); } finally { setCreating(false); } }}>{creating ? "Creating…" : "Create feed"}<ArrowRight size={17}/></button></div></ExperienceDialog>}
    {notice && <ExperienceDialog title="Good to know" onClose={() => setNotice(null)}><h2>Good to know</h2><p>{notice}</p><button className="primary-button" onClick={() => setNotice(null)}><Check size={17}/>Got it</button></ExperienceDialog>}
  </main>;
}

function ExperienceDialog(props: { title: string; onClose: () => void; children: React.ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; previousFocus?.focus(); };
  }, []);
  return <dialog ref={dialog} className="experience-dialog" aria-label={props.title} onCancel={event => { event.preventDefault(); props.onClose(); }} onClick={event => { if (event.target === event.currentTarget) props.onClose(); }}><div className="dialog-inner"><div className="sheet-handle"/><button className="dialog-close quiet-icon" aria-label="Close dialog" onClick={props.onClose}><X size={20}/></button>{props.children}</div></dialog>;
}
