import React, { useEffect, useRef, useState } from "react";
import { useVisibleFeedMenu } from "./useVisibleFeedMenu";
import { PanelLeft, Ellipsis, Globe, Moon, Share, X, Pencil, ArrowRight, Bell, ChevronRight, HelpCircle, Home, Plus, Search, Settings, Smartphone, Star, User } from "lucide-react";
import type { BriefingConfig } from "@distilled/core";
import type { AccountRecord, HealthStatus, PublicBriefing } from "./types";
import { getExploreFeeds, getFeed, setFeedStar } from "./api";
import { ThemeToggle, useTheme } from "./ThemeToggle";
import { LanguageControl, languageNames, setWebsiteLanguage, useLanguage } from "./LanguageControl";
import { installApp, notificationsEnabled, setNotificationsEnabled } from "./pwa";
import { InstallDialog, type InstallStatus } from "./SettingsDialogs";
import { FeedArt } from "./FeedArt";
import { AdaptiveFeedGrid } from "./AdaptiveFeedGrid";
import { formatFeedUpdated } from "./helpers";
import { EXPLORE_CHANGED_EVENT } from "./ExplorePublishingControl";

const topics = [
  { name: "Lebanon", category: "Lebanon", art: "coast", pattern: /lebanon|lebanese|beirut/i },
  { name: "Global Affairs", category: "World", art: "world", pattern: /world|global|international/i },
  { name: "AI & Technology", category: "Tech", art: "tech", pattern: /\bai\b|tech|artificial intelligence/i },
  { name: "Business & Markets", category: "Business", art: "city", pattern: /business|market|finance|econom/i },
  { name: "Health & Science", category: "Science", art: "science", pattern: /health|science|medical/i },
  { name: "Culture & Media", category: "Culture", art: "culture", pattern: /culture|media|arts|film/i }
];
const feedUrl = (feed: Pick<PublicBriefing, "ownerUsername" | "slug">) => `/${encodeURIComponent(feed.ownerUsername)}/${encodeURIComponent(feed.slug)}/`;
export function BrandMark() { return <span className="distilled-logo" aria-hidden="true"><span className="distilled-logo-symbol"/><span className="distilled-logo-wordmark">Distilled<span className="distilled-logo-dot">.</span>News</span></span>; }
export function AppHeader({ account, onAccount, leading, actions, contextual }: { account: AccountRecord | null; onAccount: () => void; leading?: React.ReactNode; actions?: React.ReactNode; contextual?: boolean }) {
  const { t } = useLanguage();
  return <header className={`experience-header${account ? " has-account" : ""}${contextual && account ? " is-contextual" : ""}`}>{leading ? <div className="experience-leading">{leading}</div> : <div className="experience-brand" aria-label="Distilled.news"><BrandMark/></div>}<div className="experience-header-actions">{actions}{contextual && account ? null : <><LanguageControl/><ThemeToggle/></>}{account ? contextual ? null : <button type="button" className="avatar-button" aria-label={t("Account profile")} onClick={onAccount}><span aria-hidden="true">{accountInitials(account.username)}</span></button> : <a className="button-link" href="/login">{t("Log in")}</a>}</div></header>;
}

export function AppExperience(props: {
  account: AccountRecord | null; briefings: BriefingConfig[]; briefing?: BriefingConfig; health?: HealthStatus | null;
  onAccount: () => void; onFeedSettings?: () => void; onCreate?: () => void;
  onHelp: () => void; error?: string; children?: React.ReactNode; initialTab?: "home" | "explore" | "settings";
}) {
  const [tab, setTab] = useState(props.initialTab ?? "home");
  const [query, setQuery] = useState("");
  const [feeds, setFeeds] = useState<Array<PublicBriefing & { viewerHasStarred?: boolean; latestUpdatedAt?: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [starBusy, setStarBusy] = useState<string | null>(null);
  const [settingsDialog, setSettingsDialog] = useState<"install" | null>(null);
  const [notificationEnabled, setNotificationEnabled] = useState<boolean>();
  const [notificationBusy, setNotificationBusy] = useState(false);
  const [notificationError, setNotificationError] = useState("");
  const [installStatus, setInstallStatus] = useState<InstallStatus>("pending");
  const [installError, setInstallError] = useState("");
  const { language, t } = useLanguage();
  const { theme, setTheme } = useTheme();
  useEffect(() => { document.documentElement.lang = language; document.documentElement.dir = language === "ar" ? "rtl" : "ltr"; document.title = props.account ? `${t(tab === "home" ? "Home" : tab === "explore" ? "Explore" : "Settings")} · Distilled.news` : "distilled.news — A calmer perspective on a complex world."; }, [tab, language, props.account]);
  useEffect(() => {
    let active = true;
    let version = 0;
    async function load() {
      const request = ++version;
      try {
        const result = await getExploreFeeds();
        if (!active || version !== request) return;
        setFeeds(result); setLoading(false); setError("");
        const states = await Promise.allSettled(result.map(feed => getFeed(feed.ownerUsername, feed.slug)));
        if (active && version === request) setFeeds(result.map((feed, index) => {
          const state = states[index];
          const payload = state.status === "fulfilled" ? state.value : undefined;
          return { ...feed, viewerHasStarred: payload?.viewerHasStarred, latestUpdatedAt: latestFeedUpdate(payload?.editions ?? []) };
        }));
      } catch (cause) { if (active && version === request) { setError(cause instanceof Error ? cause.message : String(cause)); setLoading(false); } }
    }
    const changed = () => { void load(); };
    void load();
    window.addEventListener(EXPLORE_CHANGED_EVENT, changed);
    return () => { active = false; window.removeEventListener(EXPLORE_CHANGED_EVENT, changed); };
  }, []);
  const matching = (title: string) => (!query || title.toLowerCase().includes(query.toLowerCase()));
  const ownFeeds = props.briefings.filter(feed => !query || feed.title.toLowerCase().includes(query.toLowerCase()));
  const visibleFeeds = feeds.filter(feed => matching(`${feed.title} ${feed.ownerUsername}`));
  const setting = (icon: React.ReactNode, label: string, action: () => void) => <button type="button" className="setting-row" onClick={action}>{icon}<span>{t(label)}</span><ChevronRight size={17}/></button>;
  function changeTab(next: typeof tab) {
    setTab(next); setSettingsDialog(null); window.scrollTo({ top: 0 });
  }
  useEffect(() => { if (new URLSearchParams(window.location.search).get("view") === "settings" && props.account) setTab("settings"); }, []);
  useEffect(() => {
    if (tab !== "settings" || !props.account) return;
    let active = true;
    setNotificationEnabled(undefined);
    setNotificationError("");
    void notificationsEnabled().then(value => { if (active) setNotificationEnabled(value); })
      .catch(cause => { if (active) { setNotificationEnabled(false); setNotificationError(cause instanceof Error ? cause.message : String(cause)); } });
    return () => { active = false; };
  }, [tab, props.account?.id]);
  async function toggleNotifications() {
    if (notificationEnabled === undefined || notificationBusy) return;
    setNotificationBusy(true); setNotificationError("");
    try { await setNotificationsEnabled(!notificationEnabled); setNotificationEnabled(!notificationEnabled); }
    catch (cause) { setNotificationError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setNotificationBusy(false); }
  }
  return <main className={`experience product-refresh ${!props.account ? "guest-browse guest-landing landing-no-menu" : ""}`}>
    {(tab === "home" || !props.account) && <div className="ambient-lights" aria-hidden="true"/>}
    <AppHeader account={props.account} onAccount={props.onAccount}/>
    {(props.error || error) && <p className="error" role="alert">{props.error || error}</p>}
    {/* Keep both feed views mounted so illustrations load ahead of navigation
        and their decoded images survive tab switches. */}
    {props.account && <div className="home-view" style={tab !== "home" ? { display: "none" } : undefined}>
      <section className="welcome-hero"><div className="welcome-copy"><h1>{t("Welcome back!")}</h1><p>{t("You choose what matters.")}</p></div></section>
      <div className="explore-controls home-controls"><div className="explore-search"><Search size={18} aria-hidden/><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={t("Search feeds")} aria-label={t("Search feeds")}/>{query && <button type="button" className="search-clear" aria-label={t("Clear search")} onClick={() => setQuery("")}><X size={16}/></button>}</div><button className="primary-button home-add-feed" aria-label={t("Create feed")} onClick={props.onCreate}><Plus size={20} aria-hidden/><span className="create-feed-label">{t("Create feed")}</span></button></div>
      <section className="your-feeds" aria-label={t("Your feeds")}><AdaptiveFeedGrid count={ownFeeds.length} className="personal-feed-grid">{ownFeeds.map(feed => <article className="topic-card" key={feed.id}><a href={feedUrl(feed)}><FeedArt feed={feed} kind={topics.find(topic => topic.pattern.test(feed.title))?.art}/><span className="topic-name"><span className="feed-card-identity"><strong title={feed.title}>{feed.title}</strong><small title={`@${feed.ownerUsername}`}>@{feed.ownerUsername}</small></span>{props.account && <ArrowRight size={14}/>}</span><span className={`feed-card-status ${feed.paused ? "paused" : "live"}`}>{t(feed.paused ? "Paused" : "Live")}</span></a><FeedCardActions feed={feed} owner onError={setError}/></article>)}</AdaptiveFeedGrid>{ownFeeds.length === 0 ? <p className="empty-copy" role="status">{t(props.briefings.length === 0 ? "You haven’t created any feeds yet." : "No feeds match your search.")}</p> : null}{!props.briefings.length && <p className="empty-copy">{t("Create your first feed to start following what matters to you.")}</p>}</section>
    </div>}
    <section className="explore-view" style={tab !== "explore" && props.account ? { display: "none" } : undefined}>
      {props.account ? <div className="experience-title"><h1>{t("Explore")}</h1><p>{t("Find topics and feeds to follow.")}</p></div> : <div className="landing-introduction">
        <h1>{t("A calmer perspective on a complex world.")}</h1>
        <p>{t("You choose what matters.")}</p>
      </div>}
      <div className={props.account ? "explore-controls" : "landing-controls"}>
        <div className="explore-search"><Search size={18} aria-hidden/><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={t("Search feeds")} aria-label={t("Search feeds")}/>{query && <button type="button" className="search-clear" aria-label={t("Clear search")} onClick={() => setQuery("")}><X size={16}/></button>}</div>
        <button type="button" className="primary-button landing-create" aria-label={t("Create feed")} onClick={props.onCreate}><Plus size={18} aria-hidden/><span className="create-feed-label">{t("Create feed")}</span></button>
      </div>
      <section className={props.account ? "featured-feeds your-feeds" : "featured-feeds"} aria-label={t("Community feeds")}>

        {loading ? <p role="status">{t("Loading feeds…")}</p> : visibleFeeds.length ? <AdaptiveFeedGrid count={visibleFeeds.length} className="topic-grid curated-feed-grid">{visibleFeeds.map(feed => <article className="topic-card" key={feed.id}>
          <a href={feedUrl(feed)}><FeedArt feed={props.briefings.find(owned => owned.id === feed.id) ?? feed}/><span className="topic-name"><span className="feed-card-identity"><strong title={feed.title}>{feed.title}</strong><small title={`@${feed.ownerUsername}`}>@{feed.ownerUsername}</small></span>{props.account && <ArrowRight size={14}/>}</span><span className={`feed-card-status ${feed.paused ? "paused" : "live"}`}>{t(feed.paused ? "Paused" : "Live")}</span></a>
          <FeedUpdatedAt value={feed.latestUpdatedAt}/>
          <FeedCardActions feed={feed} owner={props.account?.username === feed.ownerUsername} onError={setError} hideStar>
            <button type="button" className={feed.viewerHasStarred ? "star-vote is-starred" : "star-vote"} aria-label={`${feed.viewerHasStarred ? "Unstar" : "Star"} ${feed.title}`} aria-pressed={feed.viewerHasStarred ?? false} disabled={starBusy === feed.id || feed.viewerHasStarred === undefined} onClick={async () => { setStarBusy(feed.id); setError(""); try { const result = await setFeedStar(feed.ownerUsername, feed.slug, !feed.viewerHasStarred); setFeeds(current => current.map(item => item.id === feed.id ? { ...item, ...result } : item)); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } finally { setStarBusy(null); } }}><Star size={16}/>{feed.stars}</button>
          </FeedCardActions>
        </article>)}</AdaptiveFeedGrid> : query.trim() ? <p className="empty-copy" role="status">{t("No feeds match your search.")}</p> : null}
      </section>
    </section>
    {tab === "settings" && <section className="settings-view"><div className="experience-title"><h1>{t("Settings")}</h1><p>{t("Customize your experience.")}</p></div><p className="settings-group-label settings-account-label">{t("Account")}</p><div className="settings-group settings-account-group">{setting(<User/>, "Profile", props.onAccount)}<button type="button" className="setting-row notification-setting-row" role="switch" aria-label={t("Notifications")} aria-checked={notificationEnabled ?? false} disabled={notificationBusy || notificationEnabled === undefined} onClick={() => void toggleNotifications()}><Bell/><span>{t("Notifications")}</span><span className="notification-switch" aria-hidden="true"><span/></span></button></div>{notificationError && <p className="error" role="alert">{t(notificationError)}</p>}<p className="settings-group-label settings-preferences-label">{t("Preferences")}</p><div className="settings-group settings-preferences-group"><div className="setting-row setting-language" role="group" aria-label={t("Language")}><Globe/><span>{t("Language")}</span><span className="language-segments">{(["en", "fr", "ar"] as const).map(code => <button key={code} type="button" lang={code} aria-pressed={language === code} onClick={() => setWebsiteLanguage(code)} aria-label={languageNames[code]}><span className="language-name">{languageNames[code]}</span><span className="language-code" aria-hidden="true">{code.toUpperCase()}</span></button>)}</span></div><button type="button" className="setting-row notification-setting-row" role="switch" aria-label={t("Dark mode")} aria-checked={theme === "dark"} onClick={() => setTheme(theme === "dark" ? "light" : "dark")}><Moon/><span>{t("Dark mode")}</span><span className="notification-switch" aria-hidden="true"><span/></span></button></div><p className="settings-group-label settings-app-label">{t("App")}</p><div className="settings-group settings-app-group">{setting(<Smartphone/>, "Install app", () => { setSettingsDialog("install"); setInstallStatus("pending"); setInstallError(""); void installApp().then(result => setInstallStatus(current => current === "installed" ? current : result)).catch(cause => { setInstallStatus("error"); setInstallError(String(cause)); }); })}{setting(<HelpCircle/>, "Help & Support", props.onHelp)}</div>{props.account?.role === "admin" && props.children}</section>}
    {settingsDialog === "install" && <InstallDialog status={installStatus} error={installError} onInstalled={() => setInstallStatus("installed")} onClose={() => setSettingsDialog(null)}/>}
    {props.account && <SidebarNavigation active={tab} onNavigate={changeTab}/>}
  </main>;
}

export function accountInitials(username: string) {
  const parts = username.trim().split(/[\s._-]+/u).filter(Boolean);
  return (parts.map(part => Array.from(part)[0]).join("") || "?").toLocaleUpperCase();
}

function FeedCardActions({ feed, owner, onError, hideStar = false, children }: { feed: Pick<PublicBriefing, "id" | "title" | "ownerUsername" | "slug" | "stars" | "publicFeedEnabled">; owner: boolean; onError: (message: string) => void; hideStar?: boolean; children?: React.ReactNode }) {
  const { t } = useLanguage();
  const menu = useRef<HTMLDetailsElement>(null);
  useVisibleFeedMenu(menu);
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
    {children}
    <a className="feed-card-open" href={feedUrl(feed)} aria-label={`${t("Open feed")}: ${feed.title}`}><ArrowRight size={20}/></a>
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

type NavigationTab = "home" | "explore" | "settings";
function SidebarNavigation({ active, onNavigate }: { active?: string; onNavigate?: (tab: NavigationTab) => void }) {
  const { t } = useLanguage();
  const [unpinned, setUnpinned] = useState(() => {
    try { return localStorage.getItem("dn-sidebar-collapsed") !== "false"; } catch { return true; }
  });
  const [hovered, setHovered] = useState(false);
  const collapsed = unpinned && !hovered;
  const toggle = () => setUnpinned(current => {
    try { localStorage.setItem("dn-sidebar-collapsed", String(!current)); } catch {}
    return !current;
  });
  return <nav className={`bottom-navigation collapsible-navigation${collapsed ? " is-collapsed" : ""}`} aria-label={t("Main navigation")} onPointerEnter={event => { if (event.pointerType === "mouse" && window.matchMedia("(min-width: 900px)").matches) setHovered(true); }} onPointerLeave={() => setHovered(false)}>
    <div className="sidebar-top">
      <div className="sidebar-brand" aria-label="Distilled.news"><BrandMark/></div>
      <button type="button" className="sidebar-toggle" aria-label={t(unpinned ? "Pin sidebar" : "Unpin sidebar")} title={t(unpinned ? "Pin sidebar" : "Unpin sidebar")} aria-expanded={!collapsed} aria-pressed={!unpinned} onClick={toggle}><PanelLeft size={22}/></button>
    </div>
    {([{ id: "home", label: "Home", icon: Home, href: "/" }, { id: "explore", label: "Explore", icon: Search, href: "/explore" }, { id: "settings", label: "Settings", icon: Settings, href: "/?view=settings" }] as const).map(({ id, label, icon: Icon, href }) => onNavigate
      ? <button key={id} type="button" className={`navigation-item ${id === "settings" ? "navigation-settings" : ""} ${active === id ? "active" : ""}`} aria-current={active === id ? "page" : undefined} aria-label={t(label)} title={t(label)} onClick={() => onNavigate(id)}><Icon size={23}/><span>{t(label)}</span></button>
      : <a key={id} className={`navigation-item ${id === "settings" ? "navigation-settings" : ""}`} href={href} aria-current={active === id ? "page" : undefined} aria-label={t(label)} title={t(label)}><Icon size={23}/><span>{t(label)}</span></a>)}
  </nav>;
}
export function PublicNavigation() {
  const path = window.location.pathname;
  const settings = new URLSearchParams(window.location.search).get("view") === "settings";
  return <SidebarNavigation active={settings ? "settings" : /^\/explore\/?$/.test(path) ? "explore" : path === "/" ? "home" : undefined}/>;
}
