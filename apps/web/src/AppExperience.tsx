import {ApiError,toUiError, type UiMessage} from './api-errors';
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AppearanceMenu } from './AppearanceMenu';
import { useVisibleFeedMenu } from "./useVisibleFeedMenu";
import { Archive, Play, PanelLeft, Ellipsis, Globe, Moon, Share, X, Pencil, Copy, Bell, Camera, ChevronLeft, ChevronRight, HelpCircle, Home, Plus, Search, Settings, Smartphone, Star, User } from "lucide-react";
import type { BriefingConfig } from "@distilled/core";
import type { AccountRecord, ExploreChannel, HealthStatus, PublicBriefing, FeedCardMetadata } from "./types";
import { getExploreChannel, getExploreChannels, getExploreFeeds, getExploreHighlights, setChannelFollow, setFeedStar, uploadChannelCover, type ExploreHighlight, type FeedStarResult } from "./api";
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

type ExperienceTab='home'|'explore'|'followed'|'settings';
type CatalogView = 'feeds' | 'channels' | 'trending' | 'top-channels';
function catalogViewFromLocation(): CatalogView | undefined {
  const section = new URLSearchParams(window.location.search).get('section');
  return section === 'feeds' || section === 'channels' || section === 'trending' || section === 'top-channels' ? section : undefined;
}
function tabFromLocation():ExperienceTab {
  const view = new URLSearchParams(window.location.search).get('view');
  if (view === 'settings' || view === 'followed') return view;
  return /^\/explore\/?$/.test(window.location.pathname)?'explore':'home';
}
const feedUrl = (feed: Pick<PublicBriefing, "ownerUsername" | "slug">) => `/${encodeURIComponent(feed.ownerUsername)}/${encodeURIComponent(feed.slug)}/`;
export const channelUrl = (username: string) => `/explore?channel=${encodeURIComponent(username)}`;
export const editionUrl = (feed: Pick<PublicBriefing, "ownerUsername" | "slug">, editionId: string) => `${feedUrl(feed)}briefing/${encodeURIComponent(editionId)}/`;
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
  pageTitle?: string;
}) {
  const [tab, setTab] = useState<ExperienceTab>(() => props.initialTab ?? tabFromLocation());
  const [query, setQuery] = useState("");
  const [catalogView, setCatalogView] = useState(catalogViewFromLocation);
  function showCatalog(view?: CatalogView) {
    const path = props.account ? "/explore" : window.location.pathname;
    window.history.pushState(null, "", view ? `${path}?section=${view}` : path);
    setCatalogView(view);
    document.querySelector(".app-pages > .screen-page-viewport")?.scrollTo({ top: 0 });
  }
  const [channelName, setChannelName] = useState(() => new URLSearchParams(window.location.search).get("channel") ?? "");
  const [catalogReady, setCatalogReady] = useState(false);
  const [channels, setChannels] = useState<ExploreChannel[]>([]);
  const channelSnapshots = useRef(new Map<string, ExploreChannel[]>());
  const [highlights, setHighlights] = useState<{ trending: ExploreHighlight[]; newest: ExploreHighlight[] }>({ trending: [], newest: [] });
  const [channel, setChannel] = useState<ExploreChannel>();
  const [channelFailed, setChannelFailed] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [resumingFeed, setResumingFeed] = useState<string | null>(null);
  const [archiveError, setArchiveError] = useState<UiMessage>("");
  const [archiveStatus, setArchiveStatus] = useState("");
  const [feeds, setFeeds] = useState<Array<PublicBriefing & { viewerHasStarred?: boolean; viewerFollowsChannel?: boolean; latestUpdatedAt?: string }>>([]);
  const feedSnapshots = useRef(new Map<string, typeof feeds>());
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
  useLayoutEffect(() => {
    if (tab !== "explore" && tab !== "followed") return;
    const scope = JSON.stringify([voteScope, tab]);
    setChannels(channelSnapshots.current.get(scope) ?? []);
    let active: AbortController | undefined;
    const loadChannel = () => {
      active?.abort();
      const request = new AbortController();
      active = request;
      if (channelName) {
        void getExploreChannel(channelName, request.signal)
          .then(value => { if (!request.signal.aborted) { setChannel(value); setChannelFailed(!value); } })
          .catch(() => {
            if (request.signal.aborted) return;
            setChannelFailed(true);
          });
      } else {
        const revealCatalog = () => {
          if (!request.signal.aborted) setCatalogReady(true);
        };
        const deadline = window.setTimeout(revealCatalog, 1800);
        request.signal.addEventListener("abort", () => window.clearTimeout(deadline), { once: true });
        void Promise.allSettled([
          getExploreChannels(request.signal, tab === "followed").then(result => {
            if (!request.signal.aborted) {
              channelSnapshots.current.set(scope, result);
              setChannels(result);
            }
          }),
          getExploreHighlights(request.signal).then(({ trending = [], newest = [] }) => {
            if (!request.signal.aborted) setHighlights({ trending, newest });
          }),
        ]).then(() => {
          window.clearTimeout(deadline);
          revealCatalog();
        });
      }
    };
    setChannel(undefined);
    setChannelFailed(false);
    loadChannel();
    window.addEventListener(EXPLORE_CHANGED_EVENT, loadChannel);
    return () => { active?.abort(); window.removeEventListener(EXPLORE_CHANGED_EVENT, loadChannel); };
  }, [tab, channelName, voteScope]);
  useEffect(() => { document.documentElement.lang = language; document.documentElement.dir = language === "ar" ? "rtl" : "ltr"; document.title = props.pageTitle ?? (props.account ? `${t(tab === "home" ? "Home" : tab === "explore" ? "Explore" : tab === "followed" ? "Followed" : "Settings")} · Distilled.News` : "Distilled.News - A calmer perspective on a complex world."); }, [tab, language, props.account, props.pageTitle]);
  useLayoutEffect(() => {
    let active = true;
    const scope = JSON.stringify([voteScope, channelName, tab === "followed"]);
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
          : await getExploreFeeds(offset, offset > 0 ? listingRevision : undefined, undefined, tab === "followed");
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
        const snapshot = offset === 0 ? page : [...new Map([...(feedSnapshots.current.get(scope) ?? []), ...page].map(feed => [feed.id, feed])).values()];
        feedSnapshots.current.set(scope, snapshot);
        setFeeds(snapshot);
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
    setFeeds(feedSnapshots.current.get(scope) ?? []);
    setNextOffset(null);
    void load();
    window.addEventListener(EXPLORE_CHANGED_EVENT, changed);
    return () => { active = false; window.removeEventListener(EXPLORE_CHANGED_EVENT, changed); };
  }, [channelName, tab === "followed", voteScope]);
  const matching = (title: string) => (!query || title.toLowerCase().includes(query.toLowerCase()));
  const ownListReady = !props.briefingsState || props.briefingsState === 'ready';
  const emptyLibrary = ownListReady && props.briefings.length === 0;
  const activeFeeds = props.briefings.filter(feed => !feed.paused);
  const archivedFeeds = props.briefings.filter(feed => feed.paused);
  const ownFeeds = activeFeeds.filter(feed => matching(feed.title));
  const owns = (feed: PublicBriefing) => Boolean(props.account && ((Boolean(props.account.id) && feed.ownerAccountId === props.account.id) || feed.ownerUsername === props.account.username));
  const visibleFeeds = feeds.filter(feed => feed.publicFeedEnabled && !feed.paused && (channelName ? feed.ownerUsername === channel?.username : !owns(feed)) && matching(`${feed.title} ${feed.ownerUsername}`));
  const visibleChannels = channels.filter(item => item.username !== props.account?.username && (tab === "followed" || !item.viewerFollowing) && matching(item.username));
  const trendingFeeds = highlights.trending.filter(feed => !owns(feed) && !(confirmedVotes.current.get(feed.id)?.viewerHasStarred ?? feed.viewerHasStarred));
  const newFeeds = highlights.newest.filter(feed => !owns(feed));
  const waitingForCatalog = tab === "explore" && !channelName && !query.trim() && !exploreError && !catalogReady;
  const showCatalogShelves = !channelName && tab === "explore" && !query && catalogReady && (!loading || feeds.length > 0);
  const isExplorePage = Boolean(props.account || tabFromLocation() === "explore");
  const ownChannel = Boolean(channel && props.account?.username === channel.username);
  const previewingChannel = ownChannel && new URLSearchParams(window.location.search).get("preview") === "1";
  const emptyChannel = channel?.publicFeedCount === 0;
  const channelFollow = channel && <ChannelFollowButton key={channel.username} channel={channel} ownChannel={ownChannel}
    signedIn={Boolean(props.account)} onSignIn={props.onAccount}
    onChange={updated => setChannel(current => current?.username === updated.username ? updated : current)} onError={setError}/>;
  const followedFeeds = visibleFeeds.filter(feed => feed.viewerHasStarred);
  const otherPublicFeeds = visibleFeeds.filter(feed => !props.account || !feed.viewerHasStarred);
  const illustratedEmpty = Boolean(props.account && (tab === "explore" || tab === "followed")
    && !channelName && !catalogView && !query.trim() && !waitingForCatalog && !loading && !exploreError && nextOffset === null
    && (tab === "followed" ? !followedFeeds.length && !visibleChannels.length : !otherPublicFeeds.length && !trendingFeeds.length));
  const renderExploreFeed = (feed: (typeof visibleFeeds)[number]) => <FeedTile
    key={feed.id}
    feed={feed}
    owner={owns(feed)}
    onError={setError}
    onStarChange={result => setFeeds(current => current.map(item => item.id === feed.id ? { ...item, ...result } : item))}
  />;
  const renderChannel = (item: ExploreChannel) => <a className="channel-card" key={item.username} href={channelUrl(item.username)}>
    <ChannelAvatar username={item.username}/>
    <strong><bdi>@{item.username}</bdi></strong>
    <ChannelCounts channel={item}/>
  </a>;
  const setting = (icon: React.ReactNode, label: string, action: () => void) => <button type="button" className="setting-row" onClick={action}>{icon}<span>{t(label)}</span><ChevronRight size={17}/></button>;
  function changeTab(next: typeof tab) {
    const url = next === "home" ? "/" : next === "explore" ? "/explore" : `/?view=${next}`;
    if(window.location.pathname + window.location.search !== url) window.history.pushState(null, "", url);
    setTab(next); setCatalogView(undefined); setChannelName(""); setArchiveOpen(false); setSettingsDialog(null);
    document.querySelector(".app-pages > .screen-page-viewport")?.scrollTo({ top: 0 });
  }
  useEffect(() => {
    const restore = () => { setTab(props.account ? tabFromLocation() : "explore"); setCatalogView(catalogViewFromLocation()); setChannelName(new URLSearchParams(window.location.search).get("channel") ?? ""); setArchiveOpen(false); setSettingsDialog(null); };
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
      <section className="welcome-hero"><div className="welcome-copy"><h1>{t("Welcome back!")}</h1><p>{t("You choose what matters.")}</p></div></section>
      {!emptyLibrary && <div className="explore-controls home-controls"><div className="explore-search"><Search size={18} aria-hidden/><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={t("Search feeds")} aria-label={t("Search feeds")}/>{query && <button type="button" className="search-clear" aria-label={t("Clear search")} onClick={() => setQuery("")}><X size={16}/></button>}</div><button type="button" className="home-archive-button" aria-label={t("Archived feeds")} title={t("Archived feeds")} aria-haspopup="dialog" onClick={() => { setArchiveError(""); setArchiveStatus(""); setArchiveOpen(true); }}><Archive size={20} aria-hidden/>{archivedFeeds.length > 0 && <span className="archive-count" aria-hidden="true">{archivedFeeds.length}</span>}</button><button className="primary-button home-add-feed" aria-label={t("Create feed")} onClick={props.onCreate}><Plus size={20} aria-hidden/><span className="create-feed-label">{t("Create feed")}</span></button></div>}
      <section className="your-feeds" aria-label={t("Your feeds")} aria-busy={props.briefingsState === "loading"}>
        {!ownListReady && !props.briefings.length && <FeedListState failed={props.briefingsState === "error"} onRetry={props.onRetryBriefings}/>}
        {emptyLibrary ? <EmptyFeedPage view="home" onAction={props.onCreate}/> : <>
          <AdaptiveFeedGrid view="home">{ownFeeds.map(feed => <FeedTile key={feed.id} feed={feed} owner onError={setError}/>)}</AdaptiveFeedGrid>
          {ownListReady && ownFeeds.length === 0 && <p className="empty-copy" role="status">
            {t(query.trim() ? "No feeds match your search." : "Your feeds are paused. Find them in the archive.")}
          </p>}
        </>}
      </section>
    </div>}
    <section className="explore-view" aria-busy={loading || waitingForCatalog} style={tab !== "explore" && tab !== "followed" && props.account ? { display: "none" } : undefined}>

      {channelName ? <div className="channel-heading">
        <a className="feed-nav-back" href={!props.account && document.referrer.split("?")[0] === new URL("/", window.location.origin).href ? "/" : "/explore"}><ChevronLeft size={24} aria-hidden/><span>{t("Back")}</span></a>
        {channel ? <ChannelHeader channel={channel} canEdit={ownChannel && !previewingChannel} onError={setError}/> : channelFailed ? <p role="status">{t("Channel not available")}</p> : <div className="channel-hero" aria-busy="true">
          <div className="channel-banner" aria-hidden="true"/>
          <span className="channel-avatar" aria-hidden="true"/>
          <p className="channel-loading-status" role="status">{t("Loading channel…")}</p>
        </div>}
      </div> : props.account ? <div className="experience-title"><h1>{t(tab === "followed" ? "Followed" : "Explore")}</h1><p>{t(tab === "followed" ? "Find your starred feeds and followed channels." : illustratedEmpty ? "Discover news that matters to you." : "Find topics and feeds to follow.")}</p></div> : <div className="landing-introduction">
        <h1 aria-label={t("A calmer perspective on a complex world.")}><span className="landing-headline-reference" aria-hidden="true">A calmer perspective on a complex world.</span><span className="landing-headline-text">{language === 'fr' ? <><span>{t('A calmer perspective')}</span><span>{t('on a complex world.')}</span></> : t("A calmer perspective on a complex world.")}</span></h1>
        <p>{t("You choose what matters.")}</p>
      </div>}
      {!illustratedEmpty && (!channelName || (channel && !emptyChannel)) && <div className={props.account ? "explore-controls" : "landing-controls"}>
        <div className="explore-search"><Search size={18} aria-hidden/><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={t("Search feeds")} aria-label={t("Search feeds")}/>{query && <button type="button" className="search-clear" aria-label={t("Clear search")} onClick={() => setQuery("")}><X size={16}/></button>}</div>
        {(!channelName
          ? <button type="button" className="primary-button landing-create" aria-label={t("Create feed")} onClick={props.onCreate}><Plus size={18} aria-hidden/><span className="create-feed-label">{t("Create feed")}</span></button>
          : channelFollow)}
      </div>}
      {emptyChannel && <EmptyFeedPage view="channel" following={channel.viewerFollowing} action={channelFollow}/>}
      {catalogView && <button type="button" className="catalog-back" onClick={() => showCatalog()}><ChevronLeft size={17} aria-hidden/>{t("Back")}</button>}
      {!catalogView && showCatalogShelves && !props.account && <>
        {visibleFeeds.length > 0 && <CatalogShelf title={t("Top feeds")} onShowAll={() => showCatalog("feeds")}>
          {visibleFeeds.slice(0, 8).map(feed => <FeedTile key={feed.id} feed={feed} onError={setError}/>)}
        </CatalogShelf>}
        {trendingFeeds.length > 0 && <CatalogShelf title={t("Trending topics")} onShowAll={() => showCatalog("trending")}>
          {trendingFeeds.map(feed => <FeedTile key={feed.id} feed={feed} onError={setError}/>)}
        </CatalogShelf>}
        {trendingFeeds.some(feed => feed.latestEditionId) && <CatalogShelf title={t("Trending briefings")}>
          {trendingFeeds.filter(feed => feed.latestEditionId).map(feed => <FeedTile key={feed.id} feed={feed} destination={editionUrl(feed, feed.latestEditionId!)} onError={setError}/>)}
        </CatalogShelf>}
        {newFeeds.length > 0 && <CatalogShelf title={t("New feeds")}>
          {newFeeds.map(feed => <FeedTile key={feed.id} feed={feed} onError={setError}/>)}
        </CatalogShelf>}
      </>}
      {channel?.viewerFollowing && !query.trim() && visibleFeeds.length > 0 && <CatalogShelf title={t("Followed feeds")}>
        {visibleFeeds.map(renderExploreFeed)}
      </CatalogShelf>}
      {(!channelName || (channel && !emptyChannel)) && (!catalogView || catalogView === "feeds") && (!waitingForCatalog || props.account) && <section className={props.account ? "featured-feeds your-feeds" : "featured-feeds"} aria-label={t("Community feeds")} style={waitingForCatalog ? { display: "none" } : undefined}>
        {channel && <h2 className="channel-section-title">{t("All public feeds")}</h2>}
        {!channelName && !catalogView && !isExplorePage && visibleFeeds.length > 0 && <h2 className="channel-section-title">{t("All public feeds")}</h2>}
        {exploreError && <div role="alert">
          {feeds.length > 0 && <p>{t("Some feeds could not be loaded. Previously loaded feeds are still available.")}</p>}
          <p className="error">{t(exploreError)}</p>
          <button type="button" className="feed-state-retry" onClick={() => void exploreLoader.current(failedOffset.current)}>{t("Try Again")}</button>
        </div>}

        {(channelName || !isExplorePage ? visibleFeeds : tab === "followed" ? followedFeeds : otherPublicFeeds).length ? (
          (isExplorePage || catalogView === "feeds") && !channelName ? <>
            {tab === "followed" && <CatalogShelf title={t("Followed feeds")}>{followedFeeds.map(renderExploreFeed)}</CatalogShelf>}
            {tab !== "followed" && <CatalogShelf title={t("Public feeds")} expanded={catalogView === "feeds"} onShowAll={() => showCatalog("feeds")}>
              {otherPublicFeeds.map(renderExploreFeed)}
            </CatalogShelf>}
          </> : <AdaptiveFeedGrid view="explore">{visibleFeeds.map(renderExploreFeed)}</AdaptiveFeedGrid>
        ) : !loading && !exploreError && (query.trim() || nextOffset === null) && (
          query.trim() || channelName ? (
            <p className="empty-copy" role="status">{t(query.trim()
              ? nextOffset !== null ? "No matches in loaded feeds. Load more feeds to continue searching." : "No feeds match your search."
              : "No community feeds are available yet.")}</p>
          ) : illustratedEmpty ? (
            <EmptyFeedPage view={tab === "followed" ? "followed" : "explore"}
              onAction={tab === "followed" ? () => changeTab("explore") : props.onCreate}/>
          ) : (
            <div className="community-feeds-empty">
              {tab === "followed" && <Star className="followed-empty-icon" size={44} strokeWidth={1.5} aria-hidden/>}
              <h2>{t(tab === "followed" ? "No starred feeds yet" : "No community feeds are available yet.")}</h2>
              <p>{t(tab === "followed" ? "Star feeds to find them here." : "Check back for new public feeds, or create a feed about a topic you follow.")}</p>
            </div>
          )
        )}
        {nextOffset !== null && !exploreError && <button type="button" className="feed-state-retry" disabled={loading} onClick={() => void exploreLoader.current(nextOffset)}>{t("Load more feeds")}</button>}
      </section>}
      {tab === "explore" && !channelName && !query && trendingFeeds.length > 0 && (!catalogView || catalogView === "trending") && (props.account || catalogView === "trending") &&
        <CatalogShelf title={t(props.account ? "Trending feeds" : "Trending topics")} expanded={catalogView === "trending"} onShowAll={() => showCatalog("trending")}>
          {trendingFeeds.map(renderExploreFeed)}
        </CatalogShelf>}
      {!waitingForCatalog && !channelName && visibleChannels.length > 0 && (!catalogView || catalogView === "channels" || catalogView === "top-channels") &&
        (tab === "followed" || tab === "explore") &&
        <CatalogShelf title={t(tab === "followed" ? "Followed channels" : catalogView === "top-channels" ? "Most followed channels" : isExplorePage ? "Explore channels" : "Top channels")}
          className="channel-shelf" expanded={Boolean(catalogView)} onShowAll={tab === "explore" ? () => showCatalog("channels") : undefined}>
          {(catalogView === "top-channels" ? visibleChannels.filter(item => item.followerCount > 0) : visibleChannels).map(renderChannel)}
        </CatalogShelf>}
      {showCatalogShelves && !catalogView && isExplorePage && visibleChannels.length > 1 && visibleChannels.some(item => item.followerCount > 0) &&
        <CatalogShelf title={t("Most followed channels")} className="channel-shelf" onShowAll={() => showCatalog("top-channels")}>
          {visibleChannels.filter(item => item.followerCount > 0).slice(0, 12).map(renderChannel)}
        </CatalogShelf>}
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
  const src = useChannelAvatarUrl(username);
  const [missingPictureFor, setMissingPictureFor] = useState<string>();
  const missingPicture = missingPictureFor === src;
  return <span className={`channel-avatar${missingPicture ? " channel-avatar-initials" : ""}`} aria-hidden="true">
    {missingPicture && accountInitials(username)}
    <img key={src} className="account-avatar-image" src={src} alt="" style={{ visibility: "hidden" }}
      onLoad={event => { event.currentTarget.style.visibility = "visible"; }}
      onError={() => setMissingPictureFor(src)}/>
  </span>;
}

const emptyFeedCopy = {
  home: { title: "No feeds yet", description: "Create your first feed or explore topics you are interested in." },
  explore: { title: "Stay curious.", description: "No public feeds yet. Create a personalized feed around the topics you care about." },
  followed: { title: "No followed feeds yet.", description: "Star feeds to find them here." },
  channel: { title: "No public feeds yet", description: "Follow this account to get notified when it adds a public feed." }
};

function EmptyFeedPage({ view, onAction, action, following }: { view: keyof typeof emptyFeedCopy; onAction?: () => void; action?: React.ReactNode; following?: boolean }) {
  const { t } = useLanguage();
  const { title, description } = emptyFeedCopy[view];
  const followed = view === "followed";
  return <div className={"feed-page-empty " + (view === "home" ? "feed-library-empty" : "community-feeds-empty")} data-empty-view={view}>
    <img src={"/empty-feeds-" + (view === "channel" ? "followed" : view) + "-cutout.webp"} alt="" />
    <h2>{t(title)}</h2>
    <p>{t(following ? "You’ll get notified when this account adds a public feed if notifications are enabled." : description)}</p>
    {action}
    {onAction && <button type="button" className="primary-button" onClick={onAction}>
      {followed ? <Star size={20} aria-hidden/> : <Plus size={20} aria-hidden/>}
      {t(followed ? "Star feeds" : "Create feed")}
    </button>}
  </div>;
}

function CatalogShelf({ title, children, className = "", expanded = false, onShowAll }: {
  title: string; children: React.ReactNode; className?: string; expanded?: boolean; onShowAll?: () => void;
}) {
  const track = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const [scrolling, setScrolling] = useState(false);
  const [edges, setEdges] = useState({ back: false, forward: false });
  const { language, t } = useLanguage();
  function measure() {
    const node = track.current;
    if (!node) return;
    const position = Math.abs(node.scrollLeft);
    setEdges({ back: position > 2, forward: position + node.clientWidth < node.scrollWidth - 2 });
  }
  useEffect(() => {
    const node = track.current;
    if (!node || expanded) return;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => { observer.disconnect(); window.clearTimeout(timer.current); };
  }, [children, expanded, language]);
  function onScroll() {
    measure();
    setScrolling(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setScrolling(false), 700);
  }
  function scroll(direction: number) {
    const node = track.current;
    if (!node) return;
    const sign = getComputedStyle(node).direction === "rtl" ? -1 : 1;
    const target = node.scrollLeft + direction * sign * node.clientWidth;
    node.scrollTo({ left: sign * Math.max(0, sign * target), behavior: "smooth" });
  }
  return <section className={`catalog-shelf ${className}`} aria-label={title}>
    <div className="catalog-shelf-header"><h2>{title}</h2>{onShowAll && !expanded && <button type="button" className="catalog-show-all" onClick={onShowAll}>{t("Show all")}</button>}</div>
    <div className="catalog-shelf-viewport" data-scrolling={scrolling || undefined}>
      <div className={expanded ? "catalog-vertical-grid" : "catalog-shelf-track"} ref={track}
        onScroll={expanded ? undefined : onScroll} tabIndex={expanded ? undefined : 0} role="region" aria-label={title}>{children}</div>
      {!expanded && edges.back && <button type="button" className="catalog-edge catalog-edge-back" onClick={() => scroll(-1)} aria-label={t("Scroll backward")}><ChevronRight size={17} aria-hidden/></button>}
      {!expanded && edges.forward && <button type="button" className="catalog-edge catalog-edge-forward" onClick={() => scroll(1)} aria-label={t("Scroll forward")}><ChevronRight size={17} aria-hidden/></button>}
    </div>
  </section>;
}

function ChannelCounts({ channel }: { channel: ExploreChannel }) {
  const { language, t } = useLanguage();
  const format = new Intl.NumberFormat(language);
  return <span className="channel-counts">
    <span>{t(channel.publicFeedCount === 1 ? "{count} public feed" : "{count} public feeds", { count: format.format(channel.publicFeedCount) })}</span>
    <span>{t(channel.followerCount === 1 ? "{count} follower" : "{count} followers", { count: format.format(channel.followerCount) })}</span>
  </span>;
}

function ChannelFollowButton({ channel, ownChannel, signedIn, onSignIn, onChange, onError }: {
  channel: ExploreChannel;
  ownChannel: boolean;
  signedIn: boolean;
  onSignIn: () => void;
  onChange: (channel: ExploreChannel) => void;
  onError: (message: UiMessage) => void;
}) {
  const { t } = useLanguage();
  const [followBusy, setFollowBusy] = useState(false);
  const toggleFollow = async () => {
    if (ownChannel) return;
    if (!signedIn) {
      onSignIn();
      return;
    }
    setFollowBusy(true);
    try {
      onChange(await setChannelFollow(channel.username, !channel.viewerFollowing));
    } catch (error) {
      onError(toUiError(error));
    } finally {
      setFollowBusy(false);
    }
  };
  return <button type="button" className="primary-button channel-follow-button" aria-pressed={Boolean(channel.viewerFollowing)}
    disabled={ownChannel || followBusy} onClick={() => void toggleFollow()}>
    {t(channel.viewerFollowing ? "Following" : "Follow")}
  </button>;
}

function ChannelHeader({ channel, canEdit, onError }: {
  channel: ExploreChannel;
  canEdit: boolean;
  onError: (message: UiMessage) => void;
}) {
  const { t } = useLanguage();
  const menu = useRef<HTMLDetailsElement>(null);
  const [copied, setCopied] = useState(false);
  const coverInput = useRef<HTMLInputElement>(null);
  const [coverVersion, setCoverVersion] = useState(0);
  const [coverBusy, setCoverBusy] = useState(false);
  const picturePath = `/api/explore/channels/${encodeURIComponent(channel.username)}`;
  const avatarUrl = useChannelAvatarUrl(channel.username);
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
    <div className="channel-banner" aria-hidden="true">
      <img key={avatarUrl} src={avatarUrl} alt="" style={{ visibility: "hidden" }} onLoad={event => { event.currentTarget.style.visibility = "visible"; }}/>
      <img key={coverVersion} className="channel-cover-photo" src={`${picturePath}/cover?v=${coverVersion}`} alt="" style={{ visibility: "hidden" }}
        onLoad={event => { event.currentTarget.style.visibility = "visible"; }}/>
    </div>
    {canEdit && <input ref={coverInput} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={async event => {
      const file = event.currentTarget.files?.[0];
      event.currentTarget.value = "";
      if (!file || coverBusy) return;
      setCoverBusy(true);
      onError("");
      try {
        await uploadChannelCover(file);
        setCoverVersion(Date.now());
      } catch (error) {
        onError(toUiError(error));
      } finally {
        setCoverBusy(false);
      }
    }}/>}
    <ChannelAvatar username={channel.username}/>
    <h1><bdi>@{channel.username}</bdi></h1>
    <ChannelCounts channel={channel}/>
    <details ref={menu} className="feed-options feed-tile-options channel-options"
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) event.currentTarget.open = false; }}
      onToggle={event => { if (!event.currentTarget.open) setCopied(false); }}
      onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); close(); } }}>
      <summary aria-label={t("Channel options")}><Ellipsis size={20} aria-hidden/></summary>
      <div className="feed-options-popover">
        {canEdit && <button type="button" disabled={coverBusy} onClick={() => { close(); coverInput.current?.click(); }}>{t("Upload cover photo")}<Camera size={16} aria-hidden/></button>}
        <button type="button" onClick={() => void share(false)}>{t("Share")}<Share size={16} aria-hidden/></button>
        <button type="button" onClick={() => void share(true)}><span aria-live="polite">{t(copied ? "Copied" : "Copy link")}</span><Copy size={16} aria-hidden/></button>
      </div>
    </details>
  </div>;
}

const ACCOUNT_AVATAR_UPDATED = "account-avatar-updated";
const avatarRevisions = new Map<string, number>();

export function refreshAccountAvatar(account: Pick<AccountRecord, "id" | "username">) {
  const revision = Date.now();
  avatarRevisions.set(`account:${account.id}`, revision);
  avatarRevisions.set(`channel:${account.username}`, revision);
  window.dispatchEvent(new Event(ACCOUNT_AVATAR_UPDATED));
}

function useAvatarRevision(key: string) {
  const [revision, setRevision] = useState(() => avatarRevisions.get(key) ?? 0);
  useEffect(() => {
    const updated = () => setRevision(avatarRevisions.get(key) ?? 0);
    window.addEventListener(ACCOUNT_AVATAR_UPDATED, updated);
    updated();
    return () => window.removeEventListener(ACCOUNT_AVATAR_UPDATED, updated);
  }, [key]);
  return revision;
}

function useChannelAvatarUrl(username: string) {
  const revision = useAvatarRevision(`channel:${username}`);
  return `/api/explore/channels/${encodeURIComponent(username)}/avatar${revision ? `?v=${revision}` : ""}`;
}

export function AccountAvatar({ account, className, onPictureChange }: { account: AccountRecord; className?: string; onPictureChange?: (available: boolean) => void }) {
  const revision = useAvatarRevision(`account:${account.id}`);
  const src = `/api/me/avatar?account=${encodeURIComponent(account.id)}&v=${revision}`;
  return <span className={className} aria-hidden="true">
    {accountInitials(account.username)}
    <img key={src} className="account-avatar-image" src={src} alt="" style={{ visibility: "hidden" }}
      onLoad={event => {
        event.currentTarget.style.visibility = "visible";
        onPictureChange?.(true);
      }}
      onError={() => onPictureChange?.(false)}/>
  </span>;
}

type FeedTileData = Pick<PublicBriefing, "id" | "title" | "ownerUsername" | "slug" | "stars" | "publicFeedEnabled" | "paused"> & FeedCardMetadata;

function FeedTile({ feed, owner = false, onError, onStarChange, destination }: {
  feed: FeedTileData;
  owner?: boolean;
  onError: (message: UiMessage) => void;
  onStarChange?: (result: FeedStarResult) => void;
  destination?: string;
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
      <a className="feed-tile-artwork" href={destination ?? href} aria-label={`${t(destination ? "Open briefing" : "Open feed")}: ${feed.title}`} tabIndex={-1}>
        <FeedArt feed={feed} centered/>
      </a>
      <div className="feed-tile-controls">
        {feed.publicFeedEnabled && <button type="button" className="feed-tile-star" aria-label={`${t(starred ? "Unstar" : "Star")} ${feed.title}`} aria-pressed={starred} disabled={busy || !canStar} onClick={() => void toggleStar()}>
          <Star size={19} fill={starred ? "currentColor" : "none"} aria-hidden/>
          <span>{stars}</span>
        </button>}
        {(feed.publicFeedEnabled || owner) && <details ref={menu} className="feed-options feed-tile-options" onToggle={event => { if (!event.currentTarget.open) setCopied(false); }} onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); closeMenu(); } }} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node) && menu.current) menu.current.open = false; }}>
          <summary aria-label={`${t("Feed options")}: ${feed.title}`}><Ellipsis size={21} aria-hidden/></summary>
          <div className="feed-options-popover">
            {canStar && !owner && <button type="button" aria-disabled={busy} onClick={() => { if (!busy) { closeMenu(); void toggleStar(); } }}><span>{t(starred ? "Unfollow feed" : "Follow feed")}</span><Star size={16} fill={starred ? "currentColor" : "none"} aria-hidden/></button>}
            {feed.publicFeedEnabled && <>
              <button type="button" onClick={() => void share(false)}><span>{t("Share")}</span><Share size={16} aria-hidden/></button>
              <button type="button" onClick={() => void share(true)}><span aria-live="polite">{t(copied ? "Copied" : "Copy link")}</span><Copy size={16} aria-hidden/></button>
            </>}
            {owner && <a href={`${href}?edit=1`}><span>{t("Edit feed settings")}</span><Pencil size={16} aria-hidden/></a>}
          </div>
        </details>}
      </div>
    </div>
    <div className="feed-tile-caption">
      <a href={destination ?? href}><bdi>{feed.title}</bdi></a>
      <small>{feed.publicFeedEnabled
        ? <a className="feed-tile-owner" href={channelUrl(feed.ownerUsername)}><ChannelAvatar username={feed.ownerUsername}/><bdi>@{feed.ownerUsername}</bdi></a>
        : <bdi>@{feed.ownerUsername}</bdi>}</small>
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

type NavigationTab = ExperienceTab;
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
    {([{ id: "home", label: "Home", icon: Home, href: "/" }, { id: "explore", label: "Explore", icon: Search, href: "/explore" }, { id: "followed", label: "Followed", icon: Star, href: "/?view=followed" }, { id: "settings", label: "Settings", icon: Settings, href: "/?view=settings" }] as const).map(({ id, label, icon: Icon, href }) => onNavigate
      ? <button key={id} type="button" data-nav-tab={id} className={`navigation-item ${id === "settings" ? "navigation-settings" : ""} ${active === id ? "active" : ""}`} aria-current={active === id ? "page" : undefined} aria-label={t(label)} title={t(label)} onClick={() => onNavigate(id)}><Icon size={23}/><span>{t(label)}</span></button>
      : <a key={id} data-nav-tab={id} className={`navigation-item ${id === "settings" ? "navigation-settings" : ""}`} href={href} aria-current={active === id ? "page" : undefined} aria-label={t(label)} title={t(label)}><Icon size={23}/><span>{t(label)}</span></a>)}
  </nav>;
}
export function PublicNavigation() {
  const path = window.location.pathname;
  const settings = new URLSearchParams(window.location.search).get("view") === "settings";
  return <SidebarNavigation active={settings ? "settings" : /^\/explore\/?$/.test(path) ? "explore" : path === "/" ? "home" : undefined}/>;
}
