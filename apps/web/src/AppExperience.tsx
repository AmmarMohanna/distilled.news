import React, { useEffect, useRef, useState } from "react";
import { Ellipsis, Share, X, Pencil, ArrowRight, Bell, ChevronRight, HelpCircle, Home, Plus, Search, Settings, ShieldCheck, Smartphone, Star, User } from "lucide-react";
import type { BriefingConfig } from "@distilled/core";
import type { AccountRecord, HealthStatus, PublicBriefing } from "./types";
import { getPopularFeeds, getExploreFeeds, getFeed, setFeedStar } from "./api";
import { ThemeToggle } from "./ThemeToggle";
import { LanguageControl, useLanguage } from "./LanguageControl";
import { installApp, toggleNotifications } from "./pwa";
import { FeedArt } from "./FeedArt";
import { formatFeedUpdated } from "./helpers";

const topics = [
  { name: "Lebanon", category: "Lebanon", art: "coast", pattern: /lebanon|lebanese|beirut/i },
  { name: "Global Affairs", category: "World", art: "world", pattern: /world|global|international/i },
  { name: "AI & Technology", category: "Tech", art: "tech", pattern: /\bai\b|tech|artificial intelligence/i },
  { name: "Business & Markets", category: "Business", art: "city", pattern: /business|market|finance|econom/i },
  { name: "Health & Science", category: "Science", art: "science", pattern: /health|science|medical/i },
  { name: "Culture & Media", category: "Culture", art: "culture", pattern: /culture|media|arts|film/i }
];
const feedUrl = (feed: Pick<PublicBriefing, "ownerUsername" | "slug">) => `/${encodeURIComponent(feed.ownerUsername)}/${encodeURIComponent(feed.slug)}/`;
export function BrandMark() { return <span className="distilled-logo" aria-hidden="true"><span className="distilled-logo-symbol"/><span className="distilled-logo-wordmark">Distilled.news</span></span>; }
export function AppHeader({ account, onAccount }: { account: AccountRecord | null; onAccount: () => void }) {
  const { t } = useLanguage();
  return <header className="experience-header"><div className="experience-brand" aria-label="Distilled.news"><BrandMark/></div><div className="experience-header-actions"><LanguageControl/><ThemeToggle/>{account ? <button type="button" className="avatar-button" aria-label={t("Account profile")} onClick={onAccount}><span aria-hidden="true">{accountInitials(account.username)}</span></button> : <a className="button-link" href="/login">{t("Log in")}</a>}</div></header>;
}
function TopicArt({ kind }: { kind: string }) { return <FeedArt kind={kind}/>; }

export function AppExperience(props: {
  account: AccountRecord | null; briefings: BriefingConfig[]; briefing?: BriefingConfig; health?: HealthStatus | null;
  onAccount: () => void; onFeedSettings?: () => void; onCreate?: () => void;
  onHelp: () => void; error?: string; children?: React.ReactNode; initialTab?: "home" | "explore" | "settings";
}) {
  const [tab, setTab] = useState(props.initialTab ?? "home");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("For you");
  const [feeds, setFeeds] = useState<Array<PublicBriefing & { viewerHasStarred?: boolean; latestUpdatedAt?: string }>>([]);
  const [popular, setPopular] = useState<PublicBriefing[]>([]);
  useEffect(() => { getPopularFeeds().then(setPopular).catch(cause => setError(String(cause))); }, []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [starBusy, setStarBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const { language, t } = useLanguage();
  useEffect(() => { document.documentElement.lang = language; document.documentElement.dir = language === "ar" ? "rtl" : "ltr"; document.title = props.account ? `${t(tab === "home" ? "Home" : tab === "explore" ? "Explore" : "Settings")} · Distilled.news` : "distilled.news — A calmer perspective on a complex world."; }, [tab, language, props.account]);
  useEffect(() => {
    let active = true;
    getExploreFeeds().then(async result => {
      if (active) { setFeeds(result); setLoading(false); }
      const states = await Promise.allSettled(result.map(feed => getFeed(feed.ownerUsername, feed.slug)));
      if (active) setFeeds(result.map((feed, index) => {
        const state = states[index];
        const payload = state.status === "fulfilled" ? state.value : undefined;
        return { ...feed, viewerHasStarred: payload?.viewerHasStarred, latestUpdatedAt: latestFeedUpdate(payload?.editions ?? []) };
      }));
    }).catch(cause => { if (active) { setError(String(cause.message ?? cause)); setLoading(false); } });
    return () => { active = false; };
  }, []);
  const matching = (title: string) => (!query || title.toLowerCase().includes(query.toLowerCase())) && (category === "For you" || !!topics.find(topic => topic.category === category)?.pattern.test(title));
  const visibleTopics = topics.filter(topic => matching(topic.name));
  const popularFeeds = popular.filter(feed => matching(`${feed.title} ${feed.ownerUsername}`));
  const visibleFeeds = feeds.filter(feed => matching(`${feed.title} ${feed.ownerUsername}`)).sort((a, b) => b.stars - a.stars);
  const setting = (icon: React.ReactNode, label: string, action: () => void) => <button type="button" className="setting-row" onClick={action}>{icon}<span>{t(label)}</span><ChevronRight size={17}/></button>;
  function changeTab(next: typeof tab) {
    setTab(next); setNotice(""); window.scrollTo({ top: 0 });
  }
  useEffect(() => { if (new URLSearchParams(window.location.search).get("view") === "settings" && props.account) setTab("settings"); }, []);
  return <main className={`experience product-refresh ${!props.account ? "guest-browse guest-landing landing-no-menu" : ""}`}>
    {(tab === "home" || !props.account) && <div className="ambient-lights" aria-hidden="true"/>}
    <AppHeader account={props.account} onAccount={props.onAccount}/>
    {(props.error || error) && <p className="error" role="alert">{props.error || error}</p>}
    {tab === "home" && props.account && <div className="home-view">
      <section className="welcome-hero"><div className="welcome-copy"><h1>{t("Welcome back!")}</h1><p>{t("You choose what matters.")}</p></div></section>
      <div className="explore-controls home-controls"><div className="explore-search"><Search size={18} aria-hidden/><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={t("Search feeds")} aria-label={t("Search feeds")}/>{query && <button type="button" className="search-clear" aria-label={t("Clear search")} onClick={() => setQuery("")}><X size={16}/></button>}</div><button className="primary-button home-add-feed" onClick={props.onCreate}><Plus size={20}/>{t("Create feed")}</button></div>
      <section className="your-feeds"><div className="experience-section-heading"><h2>{t("Your feeds")}</h2></div><div className="personal-feed-grid">{props.briefings.filter(feed => !query || feed.title.toLowerCase().includes(query.toLowerCase())).map(feed => <article className="topic-card" key={feed.id}><a href={feedUrl(feed)}><FeedArt canGenerate feed={feed} kind={topics.find(topic => topic.pattern.test(feed.title))?.art}/><span className="topic-name">{feed.title}<ArrowRight size={14}/></span></a><FeedCardActions feed={feed} owner onError={setError}/></article>)}</div>{!props.briefings.length && <p className="empty-copy">{t("Create your first feed to start following what matters to you.")}</p>}</section>
    </div>}
    {(tab === "explore" || !props.account) && <section className="explore-view">
      {props.account ? <div className="experience-title"><h1>{t("Explore")}</h1><p>{t("Find topics and feeds to follow.")}</p></div> : <div className="landing-introduction">
        <h1>{t("A calmer perspective on a complex world.")}</h1>
        <p>{t("You choose what matters.")}</p>
      </div>}
      <div className={props.account ? "explore-controls" : "landing-controls"}>
        <div className="explore-search"><Search size={18} aria-hidden/><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={t("Search feeds…")} aria-label={t("Search feeds")}/>{query && <button type="button" className="search-clear" aria-label={t("Clear search")} onClick={() => setQuery("")}><X size={16}/></button>}</div>
        <button type="button" className="primary-button landing-create" onClick={props.onCreate}><Plus size={18} aria-hidden/>{t("Create feed")}</button>
      </div>
      <div className="category-chips" aria-label={t("Topic categories")}>{["For you", ...topics.map(topic => topic.category)].map(item => <button key={item} aria-pressed={category === item} className={category === item ? "selected" : ""} onClick={() => setCategory(item)}>{t(item)}</button>)}</div>
      {(loading || visibleFeeds.length > 0) && <section className="top-feeds"><div className="experience-section-heading"><h2>{t("Top feeds")}</h2><span className="muted">{t("Ranked by stars from readers.")}</span></div>
        {loading ? <p role="status">{t("Loading feeds…")}</p> : visibleFeeds.length ? <div className="ranked-feed-list">{visibleFeeds.slice(0, 6).map((feed, index) => <article key={feed.id} className="ranked-feed"><span className="feed-rank">{index + 1}</span><a href={feedUrl(feed)}>{!props.account && <FeedArt canGenerate={props.briefings.some(owned => owned.id === feed.id)} feed={props.briefings.find(owned => owned.id === feed.id) ?? feed} kind={topics.find(topic => topic.pattern.test(feed.title))?.art}/>}<strong>{feed.title}</strong><small>@{feed.ownerUsername}</small><FeedUpdatedAt value={feed.latestUpdatedAt}/></a><FeedCardActions feed={feed} owner={props.account?.username === feed.ownerUsername} onError={setError} hideStar/><button type="button" className={feed.viewerHasStarred ? "star-vote is-starred" : "star-vote"} aria-label={`${feed.viewerHasStarred ? "Unstar" : "Star"} ${feed.title}`} aria-pressed={feed.viewerHasStarred ?? false} disabled={starBusy === feed.id || feed.viewerHasStarred === undefined} onClick={async () => { setStarBusy(feed.id); setError(""); try { const result = await setFeedStar(feed.ownerUsername, feed.slug, !feed.viewerHasStarred); setFeeds(current => current.map(item => item.id === feed.id ? { ...item, ...result } : item)); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } finally { setStarBusy(null); } }}><Star size={16}/>{feed.stars}</button></article>)}</div> : null}
      </section>}
      <div className="experience-section-heading topic-section-heading"><h2>{t("Popular topics")}</h2><button className="text-button" onClick={() => { setQuery(""); setCategory("For you"); }}>{t("See all")}</button></div><div className="topic-grid">{popularFeeds.map(feed => <article className="topic-card" key={feed.id}><a href={feedUrl(feed)}><FeedArt canGenerate={props.briefings.some(owned => owned.id === feed.id)} feed={props.briefings.find(owned => owned.id === feed.id) ?? feed}/><span className="topic-name">{feed.title}</span></a><FeedCardActions feed={feed} owner={props.account?.username === feed.ownerUsername} onError={setError}/></article>)}{visibleTopics.map(topic => <button className="topic-card" key={topic.name} onClick={() => { setQuery(""); setCategory(topic.category); }}><TopicArt kind={topic.art}/><span className="topic-name">{t(topic.name)}<ArrowRight size={14}/></span></button>)}</div>
    </section>}
    {tab === "settings" && <section className="settings-view"><div className="experience-title"><h1>{t("Settings")}</h1><p>{t("Customize your experience.")}</p></div><p className="settings-group-label">{t("Account")}</p><div className="settings-group">{setting(<User/>, "Profile", props.onAccount)}{setting(<Bell/>, "Notifications", () => void toggleNotifications().then(setNotice).catch(() => setNotice("Could not update notifications. Please try again.")))}</div><p className="settings-group-label">{t("App")}</p><div className="settings-group">{setting(<Smartphone/>, "Install app (PWA)", () => void installApp().then(setNotice))}{setting(<ShieldCheck/>, "Privacy", () => setNotice("Public feeds are visible to everyone. Private feeds are visible only to their owner."))}{setting(<HelpCircle/>, "Help & support", props.onHelp)}</div>{notice && <p role="status">{t(notice)}</p>}{props.account?.role === "admin" && props.children}</section>}
    {props.account && <nav className="bottom-navigation" aria-label={t("Main navigation")}><div className="sidebar-logo experience-brand" aria-label="Distilled.news"><BrandMark/></div>{([{ id: "home", label: "Home", icon: Home }, { id: "explore", label: "Explore", icon: Search }, { id: "settings", label: "Settings", icon: Settings }] as const).map(({ id, label, icon: Icon }) => <button key={id} aria-current={tab === id ? "page" : undefined} className={`${tab === id ? "active" : ""} ${id === "settings" ? "navigation-settings" : ""}`} onClick={() => changeTab(id)}><Icon size={23}/><span>{t(label)}</span></button>)}</nav>}
  </main>;
}

export function accountInitials(username: string) {
  const parts = username.trim().split(/[\s._-]+/u).filter(Boolean);
  return (parts.map(part => Array.from(part)[0]).join("") || "?").toLocaleUpperCase();
}

function FeedCardActions({ feed, owner, onError, hideStar = false }: { feed: Pick<PublicBriefing, "title" | "ownerUsername" | "slug" | "stars" | "publicFeedEnabled">; owner: boolean; onError: (message: string) => void; hideStar?: boolean }) {
  const { t } = useLanguage();
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (event: PointerEvent) => { if (!menu.current?.contains(event.target as Node) && menu.current) menu.current.open = false; };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  const [starred, setStarred] = useState(false);
  const [stars, setStars] = useState(feed.stars);
  const [busy, setBusy] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string>();
  useEffect(() => {
    let active = true;
    setUpdatedAt(undefined);
    if (!hideStar) getFeed(feed.ownerUsername, feed.slug).then(result => {
      if (!active) return;
      setStarred(result.viewerHasStarred); setStars(result.briefing.stars);
      setUpdatedAt(latestFeedUpdate(result.editions));
    }).catch(() => {});
    return () => { active = false; };
  }, [feed.ownerUsername, feed.slug, hideStar]);
  const url = () => window.location.origin + feedUrl(feed);
  return <>{!hideStar && <FeedUpdatedAt value={updatedAt}/>}<div className="feed-card-actions">
    {!hideStar && <button type="button" aria-label={t(starred ? "Unstar" : "Star")} aria-pressed={starred} disabled={busy} onClick={async () => { setBusy(true); try { const result = await setFeedStar(feed.ownerUsername, feed.slug, !starred); setStarred(result.viewerHasStarred); setStars(result.stars); } catch (cause) { onError(String(cause)); } finally { setBusy(false); } }}><Star size={16} fill={starred ? "currentColor" : "none"}/>{stars}</button>}
    {(owner || feed.publicFeedEnabled) && <details ref={menu} className="feed-options" onKeyDown={event => { if (event.key === "Escape" && menu.current) { menu.current.open = false; menu.current.querySelector("summary")?.focus(); } }} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node) && menu.current) menu.current.open = false; }}>
      <summary aria-label={t("Feed options")}><Ellipsis size={18}/></summary>
      <div className="feed-options-popover">
        {owner && <a href={`${feedUrl(feed)}?edit=1`}><Pencil size={16}/>{t("Edit feed settings")}</a>}
        {feed.publicFeedEnabled && <button type="button" onClick={() => { if (menu.current) menu.current.open = false; void (navigator.share ? navigator.share({ title: feed.title, url: url() }) : navigator.clipboard.writeText(url())).catch(cause => { if (cause instanceof Error && cause.name === "AbortError") return; onError(String(cause)); }); }}><Share size={16}/>{t("Share")}</button>}
      </div>
    </details>}
  </div></>;
}

function latestFeedUpdate(editions: Awaited<ReturnType<typeof getFeed>>["editions"]): string | undefined {
  return editions.map(edition => edition.updatedAt || edition.publishedAt)
    .filter(value => Number.isFinite(Date.parse(value)))
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0];
}

function FeedUpdatedAt({ value }: { value?: string }) {
  const { language } = useLanguage();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!value) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, [value]);
  return value ? <time className="feed-updated-at" dateTime={value}>{formatFeedUpdated(value, language, now)}</time> : null;
}

export function PublicNavigation() {
 const { t } = useLanguage();
 const path = window.location.pathname;
 const settings = new URLSearchParams(window.location.search).get("view") === "settings";
 return <nav className="bottom-navigation" aria-label={t("Main navigation")}><div className="sidebar-logo experience-brand"><BrandMark/></div><a href="/" aria-current={path === "/" && !settings ? "page" : undefined}><Home size={23}/><span>{t("Home")}</span></a><a href="/explore" aria-current={/^\/explore\/?$/.test(path) ? "page" : undefined}><Search size={23}/><span>{t("Explore")}</span></a><a className="navigation-settings" href="/?view=settings" aria-current={settings ? "page" : undefined}><Settings size={23}/><span>{t("Settings")}</span></a></nav>;
}
