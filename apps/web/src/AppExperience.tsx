import {ApiError,toUiError, type UiMessage} from './api-errors';
import React, { useEffect, useRef, useState } from "react";
import { AppearanceMenu } from './AppearanceMenu';
import { useVisibleFeedMenu } from "./useVisibleFeedMenu";
import { Archive, Play, PanelLeft, Ellipsis, Globe, Moon, Share, X, Pencil, Copy, Bell, ChevronRight, HelpCircle, Home, MessageSquareWarning, Newspaper, Plus, Search, Settings, Smartphone, Star, User } from "lucide-react";
import type { BriefingConfig } from "@distilled/core";
import type { AccountRecord, ExploreChannel, HealthStatus, PublicBriefing, FeedCardMetadata } from "./types";
import { getExploreChannel, getExploreChannels, getExploreFeeds, setFeedStar, type FeedStarResult } from "./api";
import type {ExploreChangeDetail} from './explore-events';
import { ThemeToggle, useTheme } from "./ThemeToggle";
import { LanguageControl, languageNames, setWebsiteLanguage, useLanguage } from "./LanguageControl";
import { installApp, notificationsEnabled, setNotificationsEnabled } from "./pwa";
import { InstallDialog, type InstallStatus } from "./SettingsDialogs";
import { Dialog } from "./Dialog";
import { FeedArt } from "./FeedArt";
import { FeedListState } from './FeedListState';
import { AdaptiveFeedGrid } from "./AdaptiveFeedGrid";
import { formatFeedUpdated } from "./helpers";
import { EXPLORE_CHANGED_EVENT } from "./ExplorePublishingControl";

type ExperienceTab='home'|'explore'|'settings';
function tabFromLocation():ExperienceTab {
  if(new URLSearchParams(window.location.search).get('view')==='settings')return 'settings';
  return /^\/explore\/?$/.test(window.location.pathname)?'explore':'home';
}
const feedUrl = (feed: Pick<PublicBriefing, "ownerUsername" | "slug">) => `/${encodeURIComponent(feed.ownerUsername)}/${encodeURIComponent(feed.slug)}/`;
export const channelUrl = (username: string) => `/explore?channel=${encodeURIComponent(username)}`;
export function BrandMark() { return <span className="distilled-logo" aria-hidden="true"><span className="distilled-logo-symbol"/><span className="distilled-logo-wordmark">Distilled<span className="distilled-logo-dot">.</span>News</span></span>; }
export function AppHeader({ account, onAccount, leading, actions, contextual, loading = false }: { account: AccountRecord | null; onAccount: () => void; leading?: React.ReactNode; actions?: React.ReactNode; contextual?: boolean; loading?: boolean }) {
  const { t } = useLanguage();
  return <header aria-busy={loading || undefined} className={`experience-header${loading ? " is-loading" : account ? " has-account" : " is-guest"}${contextual && account ? " is-contextual" : ""}`}>
    {leading ? <div className="experience-leading">{leading}</div> : <div className="experience-brand" aria-label="Distilled.news"><BrandMark/></div>}
    <div className="experience-header-actions" aria-hidden={loading || undefined} inert={loading || undefined} style={loading ? {visibility: 'hidden'} : undefined}>
      {(!contextual || !account) && actions}
      <LanguageControl/><ThemeToggle/>
      {!account && !contextual && <AppearanceMenu/>}
      {account ? <button type="button" className="avatar-button" aria-label={t("Account profile")} onClick={onAccount}><AccountAvatar account={account}/></button> : <a className="button-link" href="/login">{t("Log in")}</a>}
      {contextual && account && actions}
    </div>
  </header>;
}

export function AppExperience(props: {
  account: AccountRecord | null; briefings: Array<BriefingConfig & FeedCardMetadata>; briefingsState?: 'loading' | 'ready' | 'error'; briefing?: BriefingConfig; health?: HealthStatus | null;
  onRetryBriefings?: () => Promise<void>;
  onAccount: () => void; onFeedSettings?: () => void; onCreate?: () => void;
  onHelp: () => void; onResumeFeed?: (feed: BriefingConfig) => Promise<void>; error?: UiMessage; children?: React.ReactNode; initialTab?: "home" | "explore" | "settings";
}) {
  const [tab, setTab] = useState<ExperienceTab>(() => props.initialTab ?? tabFromLocation());
  const [query, setQuery] = useState("");
  const [channelName, setChannelName] = useState(() => new URLSearchParams(window.location.search).get("channel") ?? "");
  const [channels, setChannels] = useState<ExploreChannel[]>([]);
  const [channel, setChannel] = useState<ExploreChannel>();
  const [channelFailed, setChannelFailed] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [resumingFeed, setResumingFeed] = useState<string | null>(null);
  const [archiveError, setArchiveError] = useState<UiMessage>("");
  const [archiveStatus, setArchiveStatus] = useState("");
  const [feeds, setFeeds] = useState<Array<PublicBriefing & { viewerHasStarred?: boolean; latestUpdatedAt?: string }>>([]);
  const currentFeeds=useRef(feeds);currentFeeds.current=feeds;
  const confirmedVotes=useRef(new Map<string,FeedStarResult>());
  const voteScope=JSON.stringify(props.account?['account',props.account.id??props.account.username]:['anonymous']);
  const previousVoteScope=useRef(voteScope);
  if(previousVoteScope.current!==voteScope){confirmedVotes.current.clear();previousVoteScope.current=voteScope;}
  const [loading, setLoading] = useState(true);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const exploreLoader = useRef<(offset?: number) => Promise<void>>(async () => {});
  const failedOffset = useRef(0);
  const [error, setError] = useState<UiMessage>("");
  const [exploreError, setExploreError] = useState<UiMessage>("");
  const [settingsDialog, setSettingsDialog] = useState<"install" | null>(null);
  const [notificationEnabled, setNotificationEnabled] = useState<boolean>();
  const [notificationBusy, setNotificationBusy] = useState(false);
  const [notificationError, setNotificationError] = useState<UiMessage>("");
  const [installStatus, setInstallStatus] = useState<InstallStatus>("pending");
  const [installError, setInstallError] = useState("");
  const { language, t } = useLanguage();
  const { theme, setTheme } = useTheme();
  useEffect(() => {
    if (tab !== "explore") return;
    let active: AbortController | undefined;
    const loadChannel = () => {
      active?.abort();
      const request = new AbortController();
      active = request;
      if (channelName) {
        void getExploreChannel(channelName, request.signal)
          .then(value => { if (!request.signal.aborted) { setChannel(value); setChannelFailed(!value); } })
          .catch(() => { if (!request.signal.aborted) setChannelFailed(true); });
      } else {
        void getExploreChannels(request.signal)
          .then(value => { if (!request.signal.aborted) setChannels(value); })
          .catch(() => { /* Feed discovery remains usable when channel rankings are unavailable. */ });
      }
    };
    setChannel(undefined);
    setChannelFailed(false);
    loadChannel();
    window.addEventListener(EXPLORE_CHANGED_EVENT, loadChannel);
    return () => { active?.abort(); window.removeEventListener(EXPLORE_CHANGED_EVENT, loadChannel); };
  }, [tab, channelName]);
  useEffect(() => { document.documentElement.lang = language; document.documentElement.dir = language === "ar" ? "rtl" : "ltr"; document.title = props.account ? `${t(tab === "home" ? "Home" : tab === "explore" ? "Explore" : "Settings")} · Distilled.News` : "Distilled.News - A calmer perspective on a complex world."; }, [tab, language, props.account]);
  useEffect(() => {
    let active = true;
    let version = 0;
    let inFlight = false;
    let refreshRequested = false;
    let loadedIds=new Set<string>();
    let listingRevision:string|undefined;
    async function load(offset = 0) {
      if (inFlight) { if (offset === 0) refreshRequested = true; return; }
      inFlight = true;
      const request = ++version;
      failedOffset.current = offset;
      setLoading(true); setExploreError("");
      try {
        const result = channelName
          ? await getExploreFeeds(offset, offset > 0 ? listingRevision : undefined, channelName)
          : await getExploreFeeds(offset, offset > 0 ? listingRevision : undefined);
        if (!active || version !== request) return;
        if(offset>0&&listingRevision!==undefined&&result.revision!==listingRevision){refreshRequested=true;setNextOffset(null);return;}
        if(offset>0&&result.feeds.some(feed=>loadedIds.has(feed.id))){
          // A changed ranking crossed a page boundary. Deduplicating this page
          // would hide a skipped feed; restart the prefix instead.
          refreshRequested=true;setNextOffset(null);return;
        }
        if(offset===0){loadedIds=new Set(result.feeds.map(feed=>feed.id));listingRevision=result.revision;}
        else for(const feed of result.feeds)loadedIds.add(feed.id);
        const page=result.feeds.map(feed=>{
          const idKey=JSON.stringify(['id',feed.id]),urlKey=JSON.stringify(['url',feed.ownerUsername,feed.slug]);
          const key=confirmedVotes.current.has(idKey)?idKey:urlKey,confirmed=confirmedVotes.current.get(key);
          if(!confirmed)return feed;
          if(feed.viewerHasStarred===confirmed.viewerHasStarred){confirmedVotes.current.delete(key);return feed;}
          return {...feed,...confirmed};
        });
        setFeeds(current => offset === 0 ? page : [...new Map([...current, ...page].map(feed => [feed.id, feed])).values()]);
        setNextOffset(result.nextOffset);
      } catch (cause) {
        if (active && version === request) {
          if(offset>0&&cause instanceof ApiError&&cause.id==='EXPLORE_CHANGED'){refreshRequested=true;setNextOffset(null);}
          else setExploreError(toUiError(cause));
        }
      } finally {
        inFlight = false;
        if (active && version === request) setLoading(false);
        if (active && refreshRequested) { refreshRequested = false; void load(); }
      }
    }
    exploreLoader.current = load;
    const changed = (event:Event) => {
      const vote=(event as CustomEvent<ExploreChangeDetail>).detail?.vote;
      if(vote){
        const feed=currentFeeds.current.find(feed=>feed.ownerUsername===vote.ownerUsername&&feed.slug===vote.slug);
        confirmedVotes.current.set(feed?JSON.stringify(['id',feed.id]):JSON.stringify(['url',vote.ownerUsername,vote.slug]),{stars:vote.stars,viewerHasStarred:vote.viewerHasStarred});
        setFeeds(current=>current.map(item=>item.ownerUsername===vote.ownerUsername&&item.slug===vote.slug?{...item,stars:vote.stars,viewerHasStarred:vote.viewerHasStarred}:item));
      }
      // A ranking change invalidates every following offset. Discard any old
      // page still in flight and restart before offering the next page.
      version++;setNextOffset(null);
      if(inFlight)refreshRequested=true;else void load();
    };
    setFeeds([]);
    setNextOffset(null);
    void load();
    window.addEventListener(EXPLORE_CHANGED_EVENT, changed);
    return () => { active = false; window.removeEventListener(EXPLORE_CHANGED_EVENT, changed); };
  }, [channelName]);
  const matching = (title: string) => (!query || title.toLowerCase().includes(query.toLowerCase()));
  const ownListReady = !props.briefingsState || props.briefingsState === 'ready';
  const emptyLibrary = ownListReady && props.briefings.length === 0;
  const activeFeeds = props.briefings.filter(feed => !feed.paused);
  const archivedFeeds = props.briefings.filter(feed => feed.paused);
  const ownFeeds = activeFeeds.filter(feed => matching(feed.title));
  const owns = (feed: PublicBriefing) => Boolean(props.account && ((Boolean(props.account.id) && feed.ownerAccountId === props.account.id) || feed.ownerUsername === props.account.username));
  const visibleFeeds = feeds.filter(feed => !feed.paused && (channelName ? feed.publicFeedEnabled && feed.ownerUsername === channel?.username : !owns(feed)) && matching(`${feed.title} ${feed.ownerUsername}`));
  const recentFeeds = channel && !query ? visibleFeeds.filter(feed => feed.latestUpdatedAt)
    .sort((a, b) => b.latestUpdatedAt!.localeCompare(a.latestUpdatedAt!)).slice(0, 6) : [];
  const setting = (icon: React.ReactNode, label: string, action: () => void) => <button type="button" className="setting-row" onClick={action}>{icon}<span>{t(label)}</span><ChevronRight size={17}/></button>;
  function changeTab(next: typeof tab) {
    const url = next === "home" ? "/" : next === "explore" ? "/explore" : "/?view=settings";
    if(window.location.pathname + window.location.search !== url) window.history.pushState(null, "", url);
    setTab(next); setChannelName(""); setArchiveOpen(false); setSettingsDialog(null); window.scrollTo({ top: 0 });
  }
  useEffect(() => {
    const restore = () => { setTab(tabFromLocation()); setChannelName(new URLSearchParams(window.location.search).get("channel") ?? ""); setArchiveOpen(false); setSettingsDialog(null); };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);
  useEffect(() => {
    if (tab !== "settings" || !props.account) return;
    let active = true;
    setNotificationEnabled(undefined);
    setNotificationError("");
    void notificationsEnabled().then(value => { if (active) setNotificationEnabled(value); })
      .catch(cause => { if (active) { setNotificationEnabled(false); setNotificationError(toUiError(cause)); } });
    return () => { active = false; };
  }, [tab, props.account?.id]);
  async function toggleNotifications() {
    if (notificationEnabled === undefined || notificationBusy) return;
    setNotificationBusy(true); setNotificationError("");
    try { await setNotificationsEnabled(!notificationEnabled); setNotificationEnabled(!notificationEnabled); }
    catch (cause) {
      setNotificationError(toUiError(cause));
      // A rejected server cleanup can still have unsubscribed this browser.
      try { setNotificationEnabled(await notificationsEnabled()); }
      catch { setNotificationEnabled(undefined); }
    }
    finally { setNotificationBusy(false); }
  }
  return <main className={`experience product-refresh ${!props.account ? "guest-browse guest-landing landing-no-menu" : ""}`}>
    {(tab === "home" || !props.account) && <div className="ambient-lights" aria-hidden="true"/>}
    <AppHeader account={props.account} onAccount={props.onAccount}/>
    {(props.error || error) && <p className="error" role="alert">{t(props.error || error)}</p>}
    {/* Keep both feed views mounted so illustrations load ahead of navigation
        and their decoded images survive tab switches. */}
    {props.account && <div className="home-view" style={tab !== "home" ? { display: "none" } : undefined}>
      {!emptyLibrary && <><section className="welcome-hero"><div className="welcome-copy"><h1>{t("Welcome back!")}</h1><p>{t("You choose what matters.")}</p></div></section>
      <div className="explore-controls home-controls"><div className="explore-search"><Search size={18} aria-hidden/><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={t("Search feeds")} aria-label={t("Search feeds")}/>{query && <button type="button" className="search-clear" aria-label={t("Clear search")} onClick={() => setQuery("")}><X size={16}/></button>}</div><button type="button" className="home-archive-button" aria-label={t("Archived feeds")} title={t("Archived feeds")} aria-haspopup="dialog" onClick={() => { setArchiveError(""); setArchiveStatus(""); setArchiveOpen(true); }}><Archive size={20} aria-hidden/>{archivedFeeds.length > 0 && <span className="archive-count" aria-hidden="true">{archivedFeeds.length}</span>}</button><button className="primary-button home-add-feed" aria-label={t("Create feed")} onClick={props.onCreate}><Plus size={20} aria-hidden/><span className="create-feed-label">{t("Create feed")}</span></button></div>
      </>}
      <section className="your-feeds" aria-label={t("Your feeds")} aria-busy={props.briefingsState === "loading"}>
        {!ownListReady && !props.briefings.length && <FeedListState failed={props.briefingsState === "error"} onRetry={props.onRetryBriefings}/>}
        {emptyLibrary ? <div className="feed-library-empty">
          <h1>{t("You haven?t created any feeds yet.")}</h1>
          <p>{t("Create your first feed to start following what matters to you.")}</p>
          <button type="button" className="primary-button" onClick={props.onCreate}>{t("Create feed")}</button>
        </div> : <>
          <AdaptiveFeedGrid view="home">{ownFeeds.map(feed => <FeedTile key={feed.id} feed={feed} owner onError={setError}/>)}</AdaptiveFeedGrid>
          {ownListReady && ownFeeds.length === 0 && <p className="empty-copy" role="status">
            {t(query.trim() ? "No feeds match your search." : "Your feeds are paused. Find them in the archive.")}
          </p>}
        </>}
      </section>
    </div>}
    <section className="explore-view" aria-busy={loading} style={tab !== "explore" && props.account ? { display: "none" } : undefined}>
      {channelName ? <div className="channel-heading">
        <a className="channel-back" href="/explore">{t("Back to Explore")}</a>
        {channel ? <ChannelHeader channel={channel} onError={setError} onReport={props.onHelp}/> : <p role="status">{t(channelFailed ? "Channel not available" : "Loading channel…")}</p>}
      </div> : props.account ? <div className="experience-title"><h1>{t("Explore")}</h1><p>{t("Find topics and feeds to follow.")}</p></div> : <div className="landing-introduction">
        <h1 aria-label={t("A calmer perspective on a complex world.")}><span className="landing-headline-reference" aria-hidden="true">A calmer perspective on a complex world.</span><span className="landing-headline-text">{language === 'fr' ? <><span>{t('A calmer perspective')}</span><span>{t('on a complex world.')}</span></> : t("A calmer perspective on a complex world.")}</span></h1>
        <p>{t("You choose what matters.")}</p>
      </div>}
      <div className={props.account ? "explore-controls" : "landing-controls"}>
        <div className="explore-search"><Search size={18} aria-hidden/><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={t("Search feeds")} aria-label={t("Search feeds")}/>{query && <button type="button" className="search-clear" aria-label={t("Clear search")} onClick={() => setQuery("")}><X size={16}/></button>}</div>
        <button type="button" className="primary-button landing-create" aria-label={t("Create feed")} onClick={props.onCreate}><Plus size={18} aria-hidden/><span className="create-feed-label">{t("Create feed")}</span></button>
      </div>
      {!channelName && tab === "explore" && !query && channels.length > 0 && <section className="channel-discovery" aria-labelledby="top-channels-heading">
        <h2 id="top-channels-heading">{t("Top channels")}</h2>
        <div className="channel-grid">{channels.map(item => <a className="channel-card" key={item.username} href={channelUrl(item.username)}>
          <ChannelAvatar username={item.username}/>
          <strong><bdi>@{item.username}</bdi></strong>
          <ChannelCounts channel={item}/>
        </a>)}</div>
      </section>}
      <section className={props.account ? "featured-feeds your-feeds" : "featured-feeds"} aria-label={t("Community feeds")}>
        {channel && <h2 className="channel-section-title">{t("Public feeds")}</h2>}
        {exploreError && <div role="alert">
          {feeds.length > 0 && <p>{t("Some feeds could not be loaded. Previously loaded feeds are still available.")}</p>}
          <p className="error">{t(exploreError)}</p>
          <button type="button" className="feed-state-retry" onClick={() => void exploreLoader.current(failedOffset.current)}>{t("Try Again")}</button>
        </div>}

        {visibleFeeds.length ? <AdaptiveFeedGrid view="explore">{visibleFeeds.map(feed => <FeedTile
          key={feed.id}
          feed={feed}
          owner={owns(feed)}
          onError={setError}
          onStarChange={result => setFeeds(current => current.map(item => item.id === feed.id ? { ...item, ...result } : item))}
        />)}</AdaptiveFeedGrid> : !loading && !exploreError && (query.trim()||nextOffset===null) ? <p className="empty-copy" role="status">{t(query.trim()?(nextOffset!==null?"No matches in loaded feeds. Load more feeds to continue searching.":"No feeds match your search."):"No community feeds are available yet.")}</p> : null}
        {nextOffset !== null && !exploreError && <button type="button" className="feed-state-retry" disabled={loading} onClick={() => void exploreLoader.current(nextOffset)}>{t("Load more feeds")}</button>}
      </section>
      {recentFeeds.length > 0 && <section className="channel-recent" aria-labelledby="channel-recent-heading">
        <h2 id="channel-recent-heading">{t("Recently updated")}</h2>
        <ul>{recentFeeds.map(feed => <li key={feed.id}><a href={feedUrl(feed)}>
          <span className="channel-recent-art"><FeedArt feed={feed} centered/></span>
          <span><strong><bdi>{feed.title}</bdi></strong><FeedUpdatedAt value={feed.latestUpdatedAt}/></span>
        </a></li>)}</ul>
      </section>}
    </section>
    {tab === "settings" && <section className="settings-view"><div className="experience-title"><h1>{t("Settings")}</h1><p>{t("Customize your experience.")}</p></div><p className="settings-group-label settings-account-label">{t("Account")}</p><div className="settings-group settings-account-group">{setting(<User/>, "Profile", props.onAccount)}<button type="button" className="setting-row notification-setting-row" role="switch" aria-label={t("Notifications")} aria-checked={notificationEnabled ?? false} disabled={notificationBusy || notificationEnabled === undefined} onClick={() => void toggleNotifications()}><Bell/><span>{t("Notifications")}</span><span className="notification-switch" aria-hidden="true"><span/></span></button></div>{notificationError && <p className="error" role="alert">{t(notificationError)}</p>}<p className="settings-group-label settings-preferences-label">{t("Preferences")}</p><div className="settings-group settings-preferences-group"><div className="setting-row setting-language" role="group" aria-label={t("Language")}><Globe/><span>{t("Language")}</span><span className="language-segments">{(["en", "fr", "ar"] as const).map(code => <button key={code} type="button" lang={code} aria-pressed={language === code} onClick={() => setWebsiteLanguage(code)} aria-label={languageNames[code]}><span className="language-name">{languageNames[code]}</span><span className="language-code" aria-hidden="true">{code.toUpperCase()}</span></button>)}</span></div><button type="button" className="setting-row notification-setting-row" role="switch" aria-label={t("Dark mode")} aria-checked={theme === "dark"} onClick={() => setTheme(theme === "dark" ? "light" : "dark")}><Moon/><span>{t("Dark mode")}</span><span className="notification-switch" aria-hidden="true"><span/></span></button></div><p className="settings-group-label settings-app-label">{t("App")}</p><div className="settings-group settings-app-group">{setting(<Smartphone/>, "Install app", () => { setSettingsDialog("install"); setInstallStatus("pending"); setInstallError(""); void installApp().then(result => setInstallStatus(current => current === "installed" ? current : result)).catch(cause => { setInstallStatus("error"); setInstallError(String(cause)); }); })}{setting(<HelpCircle/>, "Help & Support", props.onHelp)}</div>{props.account?.role === "admin" && props.children}</section>}
    {props.account && archiveOpen && <Dialog label={t("Archived feeds")} className="feed-archive-dialog" onClose={() => setArchiveOpen(false)}>
      <section className="dialog-inner feed-archive-content">
        <button type="button" className="dialog-close" aria-label={t("Close dialog")} onClick={() => setArchiveOpen(false)}><X size={22}/></button>
        <div className="archive-heading"><Archive size={26} aria-hidden/><h2>{t("Archived feeds")}</h2></div>
        <p className="archive-description">{t("Paused feeds keep their published briefings. Resume one to receive new updates.")}</p>
        {archiveError && <p className="error" role="alert">{t(archiveError)}</p>}
        <p className="archive-status" role="status">{archiveStatus}</p>
        {archivedFeeds.length ? <ul className="archived-feed-list">{archivedFeeds.map(feed => <li key={feed.id}>
          <a className="archived-feed-link" href={feedUrl(feed)}><FeedArt feed={feed}/><span><strong dir="auto">{feed.title}</strong><small>{t("Paused")}</small></span></a>
          <button type="button" className="archive-resume-button" disabled={Boolean(resumingFeed) || !props.onResumeFeed} aria-label={`${t("Resume feed")}: ${feed.title}`} onClick={async () => {
            if (!props.onResumeFeed || resumingFeed) return;
            setResumingFeed(feed.id); setArchiveError(""); setArchiveStatus("");
            try { await props.onResumeFeed(feed); setArchiveStatus(t("Feed resumed.")); }
            catch (cause) { setArchiveError(toUiError(cause)); }
            finally { setResumingFeed(null); }
          }}><Play size={16} aria-hidden/>{t(resumingFeed === feed.id ? "Resuming…" : "Resume")}</button>
        </li>)}</ul> : ownListReady ? <div className="archive-empty"><Archive size={36} aria-hidden/><h3>{t("No archived feeds")}</h3><p>{t("Feeds you pause will appear here.")}</p></div> : <FeedListState failed={props.briefingsState === "error"} onRetry={props.onRetryBriefings}/> }
      </section>
    </Dialog>}
    {settingsDialog === "install" && <InstallDialog status={installStatus} error={installError} onInstalled={() => setInstallStatus("installed")} onClose={() => setSettingsDialog(null)}/>}
    {props.account && <SidebarNavigation active={tab} onNavigate={changeTab}/>}
  </main>;
}

export function accountInitials(username: string) {
  const parts = username.trim().split(/[\s._-]+/u).filter(Boolean);
  const initials = Array.from((parts.slice(0, 2).map(part => Array.from(part)[0]).join("") || "?").toLocaleUpperCase()).slice(0, 2);
  // Prevent Arabic initials from joining while retaining the two-letter limit.
  return initials.join(initials.some(letter => /\p{Script=Arabic}/u.test(letter)) ? "\u200c" : "");
}

function ChannelAvatar({ username }: { username: string }) {
  return <span className="channel-avatar" aria-hidden="true">
    {accountInitials(username)}
    <img className="account-avatar-image" src={`/api/explore/channels/${encodeURIComponent(username)}/avatar`} alt="" style={{ visibility: "hidden" }}
      onLoad={event => { event.currentTarget.style.visibility = "visible"; }}/>
  </span>;
}

function ChannelCounts({ channel }: { channel: ExploreChannel }) {
  const { language, t } = useLanguage();
  const format = new Intl.NumberFormat(language);
  return <span className="channel-counts">
    <span>{t(channel.publicFeedCount === 1 ? "{count} public feed" : "{count} public feeds", { count: format.format(channel.publicFeedCount) })}</span>
    <span>{t(channel.followerCount === 1 ? "{count} follower" : "{count} followers", { count: format.format(channel.followerCount) })}</span>
  </span>;
}

function ChannelHeader({ channel, onError, onReport }: { channel: ExploreChannel; onError: (message: UiMessage) => void; onReport: () => void }) {
  const { t } = useLanguage();
  const menu = useRef<HTMLDetailsElement>(null);
  const [copied, setCopied] = useState(false);
  useVisibleFeedMenu(menu);
  const close = () => {
    if (!menu.current) return;
    menu.current.open = false;
    menu.current.querySelector("summary")?.focus();
  };
  const share = async (copy: boolean) => {
    const url = new URL(channelUrl(channel.username), window.location.origin).href;
    try {
      if (!copy && navigator.share) {
        await navigator.share({ title: `@${channel.username}`, url });
        close();
      } else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
      }
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError")) onError(toUiError(error));
    }
  };
  return <div className="channel-hero">
    <ChannelAvatar username={channel.username}/>
    <h1><bdi>@{channel.username}</bdi></h1>
    <ChannelCounts channel={channel}/>
    <details ref={menu} className="feed-options feed-tile-options channel-options"
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) event.currentTarget.open = false; }}
      onToggle={event => { if (!event.currentTarget.open) setCopied(false); }}
      onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); close(); } }}>
      <summary aria-label={t("Channel options")}><Ellipsis size={20} aria-hidden/></summary>
      <div className="feed-options-popover">
        <button type="button" onClick={() => void share(false)}>{t("Share")}<Share size={16} aria-hidden/></button>
        <button type="button" onClick={() => void share(true)}><span aria-live="polite">{t(copied ? "Copied" : "Copy link")}</span><Copy size={16} aria-hidden/></button>
        <button type="button" onClick={() => { close(); onReport(); }}>{t("Report a concern")}<MessageSquareWarning size={16} aria-hidden/></button>
      </div>
    </details>
  </div>;
}

export const ACCOUNT_AVATAR_UPDATED = "account-avatar-updated";

export function AccountAvatar({ account, className }: { account: AccountRecord; className?: string }) {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const updated = (event: Event) => {
      if ((event as CustomEvent<string>).detail === account.id) setRevision(Date.now());
    };
    window.addEventListener(ACCOUNT_AVATAR_UPDATED, updated);
    return () => window.removeEventListener(ACCOUNT_AVATAR_UPDATED, updated);
  }, [account.id]);
  const src = `/api/me/avatar?account=${encodeURIComponent(account.id)}&v=${revision}`;
  return <span className={className} aria-hidden="true">
    {accountInitials(account.username)}
    <img key={src} className="account-avatar-image" src={src} alt="" style={{ visibility: "hidden" }}
      onLoad={event => { event.currentTarget.style.visibility = "visible"; }}/>
  </span>;
}

type FeedTileData = Pick<PublicBriefing, "id" | "title" | "ownerUsername" | "slug" | "stars" | "publicFeedEnabled" | "paused"> & FeedCardMetadata;

function FeedTile({ feed, owner = false, onError, onStarChange }: {
  feed: FeedTileData;
  owner?: boolean;
  onError: (message: UiMessage) => void;
  onStarChange?: (result: FeedStarResult) => void;
}) {
  const { t } = useLanguage();
  const menu = useRef<HTMLDetailsElement>(null);
  useVisibleFeedMenu(menu);
  useEffect(() => {
    const close = (event: PointerEvent) => { if (menu.current && !menu.current.contains(event.target as Node)) menu.current.open = false; };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  const [vote, setVote] = useState<FeedStarResult>();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => { setVote(undefined); }, [feed.stars, feed.viewerHasStarred]);
  const starred = vote?.viewerHasStarred ?? feed.viewerHasStarred ?? false;
  const stars = vote?.stars ?? feed.stars;
  const canStar = Boolean(feed.publicFeedEnabled && (owner || feed.viewerHasStarred !== undefined));
  const href = feedUrl(feed);
  const closeMenu = () => {
    if (!menu.current) return;
    menu.current.open = false;
    menu.current.querySelector("summary")?.focus();
  };
  const toggleStar = async () => {
    if (busy || !canStar) return;
    setBusy(true);
    onError("");
    try {
      const result = await setFeedStar(feed.ownerUsername, feed.slug, !starred);
      setVote(result);
      onStarChange?.(result);
    } catch (cause) {
      onError(toUiError(cause));
    } finally {
      setBusy(false);
    }
  };
  const share = async (copy: boolean) => {
    const url = window.location.origin + href;
    try {
      if (!copy && navigator.share) {
        await navigator.share({ title: feed.title, url });
        closeMenu();
      } else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
      }
    } catch (cause) {
      if (!(cause instanceof Error && cause.name === "AbortError")) onError(toUiError(cause));
    }
  };

  return <article className="feed-tile">
    <div className="feed-tile-cover">
      <a className="feed-tile-artwork" href={href} aria-label={`${t("Open feed")}: ${feed.title}`} tabIndex={-1}>
        <FeedArt feed={feed} centered/>
      </a>
      <div className="feed-tile-controls">
        {feed.publicFeedEnabled && <button type="button" className="feed-tile-star" aria-label={`${t(starred ? "Unstar" : "Star")} ${feed.title}`} aria-pressed={starred} disabled={busy || !canStar} onClick={() => void toggleStar()}>
          <Star size={19} fill={starred ? "currentColor" : "none"} aria-hidden/>
          <span>{stars}</span>
        </button>}
        <details ref={menu} className="feed-options feed-tile-options" onToggle={event => { if (!event.currentTarget.open) setCopied(false); }} onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); closeMenu(); } }} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node) && menu.current) menu.current.open = false; }}>
          <summary aria-label={`${t("Feed options")}: ${feed.title}`}><Ellipsis size={21} aria-hidden/></summary>
          <div className="feed-options-popover">
            <a href={href}><span>{t("Open feed")}</span><Newspaper size={16} aria-hidden/></a>
            {canStar && !owner && <button type="button" aria-disabled={busy} onClick={() => { if (!busy) { closeMenu(); void toggleStar(); } }}><span>{t(starred ? "Unfollow feed" : "Follow feed")}</span><Star size={16} fill={starred ? "currentColor" : "none"} aria-hidden/></button>}
            {feed.publicFeedEnabled && <>
              <button type="button" onClick={() => void share(false)}><span>{t("Share")}</span><Share size={16} aria-hidden/></button>
              <button type="button" onClick={() => void share(true)}><span aria-live="polite">{t(copied ? "Copied" : "Copy link")}</span><Copy size={16} aria-hidden/></button>
            </>}
            {owner && <a href={`${href}?edit=1`}><span>{t("Edit feed settings")}</span><Pencil size={16} aria-hidden/></a>}
          </div>
        </details>
      </div>
    </div>
    <div className="feed-tile-caption">
      <a href={href}><bdi>{feed.title}</bdi></a>
      <small><bdi>@{feed.ownerUsername}</bdi></small>
      <FeedUpdatedAt value={feed.latestUpdatedAt}/>
      {feed.paused && <small>{t("Paused")}</small>}
    </div>
  </article>;
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
