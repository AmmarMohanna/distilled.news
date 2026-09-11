import React, { useEffect, useState } from "react";
import { ArrowRight, Bell, ChevronRight, HelpCircle, Home, Plus, Search, Settings, ShieldCheck, Smartphone, Star, User } from "lucide-react";
import type { BriefingConfig } from "@distilled/core";
import type { AccountRecord, HealthStatus, PublicBriefing } from "./types";
import { getExploreFeeds, getFeed, getSession, setFeedStar } from "./api";
import { ThemeToggle } from "./ThemeToggle";
import { LanguageControl, useLanguage } from "./LanguageControl";
import { FeedEditor, type FeedInput } from "./FeedEditor";

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
function TopicArt({ kind }: { kind: string }) { return <span className={`topic-art art-${kind}`} aria-hidden="true"/>; }

export function PublicExplorePage() {
  const [account, setAccount] = useState<AccountRecord | null>(null);
  useEffect(() => { getSession().then(session => setAccount(session.account ?? null)).catch(() => {}); }, []);
  return <AppExperience account={account} briefings={[]} initialTab="explore" onAccount={() => { window.location.href = "/"; }} onHelp={() => {}}/>;
}

export function AppExperience(props: {
  account: AccountRecord | null; briefings: BriefingConfig[]; briefing?: BriefingConfig; health?: HealthStatus | null;
  onAccount: () => void; onFeedSettings?: () => void; onCreate?: (input: FeedInput) => Promise<void>;
  onHelp: () => void; error?: string; children?: React.ReactNode; initialTab?: "home" | "explore" | "settings";
}) {
  const [tab, setTab] = useState(props.initialTab ?? "home");
  const guestView = "search";
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("For you");
  const [feeds, setFeeds] = useState<Array<PublicBriefing & { viewerHasStarred?: boolean }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [starBusy, setStarBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [adding, setAdding] = useState(false);
  const { language, t } = useLanguage();
  useEffect(() => { document.documentElement.lang = language; document.documentElement.dir = language === "ar" ? "rtl" : "ltr"; document.title = `${t(tab === "home" ? "Home" : tab === "explore" ? "Explore" : "Settings")} · Distilled.news`; }, [tab, language]);
  useEffect(() => {
    let active = true;
    getExploreFeeds().then(async result => {
      if (active) { setFeeds(result); setLoading(false); }
      const states = await Promise.allSettled(result.map(feed => getFeed(feed.ownerUsername, feed.slug)));
      if (active) setFeeds(result.map((feed, index) => ({ ...feed, viewerHasStarred: states[index].status === "fulfilled" ? (states[index] as PromiseFulfilledResult<Awaited<ReturnType<typeof getFeed>>>).value.viewerHasStarred : undefined })));
    }).catch(cause => { if (active) { setError(String(cause.message ?? cause)); setLoading(false); } });
    return () => { active = false; };
  }, []);
  const matching = (title: string) => (!query || title.toLowerCase().includes(query.toLowerCase())) && (category === "For you" || !!topics.find(topic => topic.category === category)?.pattern.test(title));
  const visibleTopics = topics.filter(topic => matching(topic.name));
  const visibleFeeds = feeds.filter(feed => matching(`${feed.title} ${feed.ownerUsername}`)).sort((a, b) => b.stars - a.stars);
  const setting = (icon: React.ReactNode, label: string, action: () => void) => <button type="button" className="setting-row" onClick={action}>{icon}<span>{t(label)}</span><ChevronRight size={17}/></button>;
  function changeTab(next: typeof tab) {
    if (props.initialTab === "explore" && next !== "explore") { window.location.href = next === "settings" ? "/?view=settings" : "/"; return; }
    setTab(next); setNotice(""); window.scrollTo({ top: 0 });
  }
  useEffect(() => { if (new URLSearchParams(window.location.search).get("view") === "settings" && props.account) setTab("settings"); }, []);
  return <main className={`experience product-refresh ${!props.account ? `guest-browse guest-${guestView}` : ""}`}>
    <header className="experience-header"><div className="experience-brand" aria-label="Distilled.news"><BrandMark/></div><div className="experience-header-actions"><LanguageControl/><ThemeToggle/>{props.account ? <button className="avatar-button" aria-label="Account profile" onClick={props.onAccount}><User size={23}/></button> : null}</div></header>
    {(props.error || error) && <p className="error" role="alert">{props.error || error}</p>}
    {tab === "home" && props.account && <div className="home-view">
      <section className="welcome-hero"><div className="welcome-copy"><h1><span>{t("Welcome back,")}</span><br/><strong className="user-name">{props.account.username}</strong></h1><p>{t("Distilling to you what is important.")}</p></div></section>
      <button className="primary-button home-add-feed" onClick={() => setAdding(true)}><Plus size={20}/>{t("Add feed")}</button>
      <section className="your-feeds"><div className="experience-section-heading"><h2>{t("Your feeds")}</h2></div><div className="personal-feed-grid">{props.briefings.map(feed => <a className="topic-card" href={feedUrl(feed)} key={feed.id}><TopicArt kind={topics.find(topic => topic.pattern.test(feed.title))?.art ?? "world"}/><span className="topic-name">{feed.title}<ArrowRight size={14}/></span><small className="feed-card-status">{feed.paused ? "Paused" : "View briefing"}</small></a>)}</div>{!props.briefings.length && <p className="empty-copy">Create your first feed to start following what matters to you.</p>}</section>
    </div>}
    {tab === "explore" && <section className="explore-view"><div className="experience-title"><h1>{t("Explore")}</h1><p>{t("Find topics and feeds to follow.")}</p></div>
      <label className="explore-search"><Search size={19}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder={t("Search topics, feeds, or keywords…")} aria-label="Search topics, sources, or keywords"/></label>
      <div className="category-chips" aria-label="Topic categories">{["For you", ...topics.map(topic => topic.category)].map(item => <button key={item} aria-pressed={category === item} className={category === item ? "selected" : ""} onClick={() => setCategory(item)}>{t(item)}</button>)}</div>
      {(props.account || query || category !== "For you") && <section className="top-feeds"><div className="experience-section-heading"><h2>{t("Top feeds")}</h2><span className="muted">{t("Ranked by stars from readers.")}</span></div>
        {loading ? <p role="status">Loading feeds…</p> : visibleFeeds.length ? <div className="ranked-feed-list">{visibleFeeds.slice(0, 6).map((feed, index) => <article key={feed.id} className="ranked-feed"><span className="feed-rank">{index + 1}</span><a href={feedUrl(feed)}>{!props.account && <TopicArt kind={topics.find(topic => topic.pattern.test(feed.title))?.art ?? "world"}/>}<strong>{feed.title}</strong><small>@{feed.ownerUsername}</small></a><button type="button" className={feed.viewerHasStarred ? "star-vote is-starred" : "star-vote"} aria-label={`${feed.viewerHasStarred ? "Unstar" : "Star"} ${feed.title}`} aria-pressed={feed.viewerHasStarred ?? false} disabled={starBusy === feed.id || feed.viewerHasStarred === undefined} onClick={async () => { setStarBusy(feed.id); setError(""); try { const result = await setFeedStar(feed.ownerUsername, feed.slug, !feed.viewerHasStarred); setFeeds(current => current.map(item => item.id === feed.id ? { ...item, ...result } : item)); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } finally { setStarBusy(null); } }}><Star size={16}/>{feed.stars}</button></article>)}</div> : <p className="empty-copy">No published feeds match your search yet.</p>}
      </section>}
      <div className="experience-section-heading topic-section-heading"><h2>{t("Popular topics")}</h2><button className="text-button" onClick={() => { setQuery(""); setCategory("For you"); }}>{t("See all")}</button></div><div className="topic-grid">{visibleTopics.map(topic => <button className="topic-card" key={topic.name} onClick={() => { setQuery(""); setCategory(topic.category); }}><TopicArt kind={topic.art}/><span className="topic-name">{topic.name}<ArrowRight size={14}/></span></button>)}</div>
    </section>}
    {tab === "settings" && <section className="settings-view"><div className="experience-title"><h1>{t("Settings")}</h1><p>{t("Customize your experience.")}</p></div><p className="settings-group-label">{t("Account")}</p><div className="settings-group">{setting(<User/>, "Profile", props.onAccount)}{setting(<Bell/>, "Notifications", () => setNotice("Push notifications are planned for a future update."))}</div><p className="settings-group-label">App</p><div className="settings-group">{setting(<Smartphone/>, "Install app (PWA)", () => setNotice("Choose Add to Home Screen or Install app in your browser menu, if available."))}{setting(<ShieldCheck/>, "Privacy", () => setNotice("Published feeds are public. Your account settings are available from Profile."))}{setting(<HelpCircle/>, "Help & support", props.onHelp)}</div>{notice && <p role="status">{notice}</p>}{props.account?.role === "admin" && props.children}</section>}
    <nav className="bottom-navigation" aria-label="Main navigation"><div className="sidebar-logo experience-brand" aria-label="Distilled.news"><BrandMark/></div>{props.account ? ([{ id: "home", label: "Home", icon: Home }, { id: "explore", label: "Explore", icon: Search }, { id: "settings", label: "Settings", icon: Settings }] as const).map(({ id, label, icon: Icon }) => <button key={id} aria-current={tab === id ? "page" : undefined} className={tab === id ? "active" : ""} onClick={() => changeTab(id)}><Icon size={23}/><span>{t(label)}</span></button>) : <GuestMenuItems active="explore"/>}</nav>
    {adding && props.onCreate && <FeedEditor onClose={() => setAdding(false)} onSave={async input => { await props.onCreate?.(input); setAdding(false); }}/ >}
  </main>;
}

export function GuestMenuItems({ active }: { active: "home" | "explore" }) {
 const { t } = useLanguage();
 return <>{([{id: "home", label: "Home", href: "/", icon: Home}, {id: "explore", label: "Explore", href: "/explore", icon: Search}] as const).map(({id,label,href,icon: Icon}) => <a key={id} href={href} className={`guest-nav-link ${active === id ? "active" : ""}`} aria-current={active === id ? "page" : undefined}><Icon size={23}/><span>{t(label)}</span></a>)}</>;
}
