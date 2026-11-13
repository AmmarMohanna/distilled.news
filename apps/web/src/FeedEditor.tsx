import {toUiError, type UiMessage} from './api-errors';
const rhythmLabels = { 30: "Every 30 min", 60: "Every hour", 120: "Every 2 hours", 360: "Every 6 hours", 720: "Every 12 hours", 1440: "Daily" } as const;
import { useEffect, useRef, useState } from "react";
import { CalendarDays, Check, ChevronDown, Clock, Copy, Globe, Pause, Play, Plus, Search, Settings, SquarePlus, Trash2, Users, X } from "lucide-react";
import type { BriefingConfig } from "@distilled/core";
import { FEED_TITLE_MAX_LENGTH } from "@distilled/core";
import { preferredLanguage, useLanguage } from "./LanguageControl";
import { Dialog } from "./Dialog";
import { useConfirmation } from "./useConfirmation";
import { getSources, recommendSourceCandidates, assessSourceInput, searchSourceCandidates, getSourceQuerySuggestions, type SourceSearchResult, type SourceAssessment } from "./api";
import { VoiceInput } from "./VoiceInput";
import {FeedLanguageSelect, FeedSettingsSelect} from './FeedLanguageSelect';
import { SourceLogo } from "./SourceLogo";
import {sourcePublisherKey} from './source-publisher-key';
import {sourceSearchSuggestions} from './source-search-suggestions';

export type FeedInput = Pick<BriefingConfig, "title" | "interestProfile" | "language" | "briefingTimezone" | "publicFeedEnabled"> & { id: string; sourceInputs: string[]; updateIntervalMinutes: 30 | 60 | 120 | 360 | 720 | 1440; briefingTimeOfDay?: string };
export function FeedEditor(props: {
  feed?: BriefingConfig; onClose: () => void; onSave: (input: FeedInput) => Promise<void>;
  onPause?: () => Promise<void>; onCopy?: () => Promise<void>; onDelete?: () => Promise<void>;
}) {
  const {t,language:interfaceLanguage}=useLanguage();
  const [id] = useState(() => props.feed?.id ?? `briefing_${crypto.randomUUID()}`);
  const editing = Boolean(props.feed);
  const [sourcesReady, setSourcesReady] = useState(!props.feed);
  useEffect(() => {
    if (!props.feed) return;
    let active = true;
    getSources(props.feed.id).then(items => { if (active) { setSources(items.filter(s=>s.enabled).map(s=>s.input || s.sourceUrl || s.url || s.title)); setSourcesReady(true); } }).catch(cause => { if (active) setMessage(toUiError(cause)); });
    return () => { active = false; };
  }, [props.feed?.id]);
  const [title, setTitle] = useState(props.feed?.title ?? "");
  const [prompt, setPrompt] = useState(props.feed?.interestProfile ?? "");
  const [rhythm, setRhythm] = useState<FeedInput["updateIntervalMinutes"]>(props.feed?.updateIntervalMinutes ?? (props.feed?.briefingCadence === "hourly" ? 60 : 1440));
  const [feedLanguage, setFeedLanguage] = useState<BriefingConfig["language"]>(props.feed?.language ?? preferredLanguage());
  const [publicFeedEnabled, setPublicFeedEnabled] = useState(props.feed?.publicFeedEnabled ?? true);
  const [deliveryTime, setDeliveryTime] = useState(props.feed?.briefingTimeOfDay ?? "08:00");
  const deliveryTimeInput = useRef<HTMLInputElement>(null);
  const [timezone] = useState(() => props.feed?.briefingTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  const [sources, setSources] = useState<string[]>([]);
  const [sourceQuery, setSourceQuery] = useState("");
  const [submittedSearch,setSubmittedSearch]=useState<{query:string;context:string}|null>(null);
  const [suggestionsOpen,setSuggestionsOpen]=useState(false);
  const [suggestionIndex,setSuggestionIndex]=useState(-1);
  const [liveSuggestions,setLiveSuggestions]=useState<{query:string;language:string;values:string[]}|null>(null);
  const suggestionCache=useRef(new Map<string,string[]>());
  const [searchResults, setSearchResults] = useState<SourceSearchResult[]>([]);
  const addedPublishers=new Set(sources.map(sourcePublisherKey));
  const visibleSearchResults=searchResults.filter(result=>!addedPublishers.has(sourcePublisherKey(result.source)));
  const [searching, setSearching] = useState(false);
  const [searchStatus, setSearchStatus] = useState("");
  const searchCache=useRef(new Map<string,{at:number;query:string;result:Awaited<ReturnType<typeof searchSourceCandidates>>}>());
  const sourceQueryRef = useRef(sourceQuery);
  sourceQueryRef.current = sourceQuery;
  const directSource=/^(?:https?:\/\/|(?:rss|news|x|telegram|linkedin)\s*:|(?:[\w-]+\.)+[a-z]{2,}(?:\/|$))/i.test(sourceQuery.trim());
  const querySuggestions=directSource?[]:liveSuggestions?.query===sourceQuery.trim()&&liveSuggestions.language===interfaceLanguage?liveSuggestions.values:sourceSearchSuggestions(sourceQuery);
  useEffect(()=>{
    const query=sourceQuery.trim();
    if(!suggestionsOpen||directSource||query.length<2||query.length>200)return;
    const key=JSON.stringify([interfaceLanguage,query.toLocaleLowerCase()]),saved=suggestionCache.current.get(key);
    if(saved){setLiveSuggestions({query,language:interfaceLanguage,values:saved});return;}
    const controller=new AbortController();
    const timer=window.setTimeout(()=>{
      void getSourceQuerySuggestions(query,interfaceLanguage,controller.signal).then(result=>{
        if(controller.signal.aborted)return;
        if(!result.unavailable){if(suggestionCache.current.size>=40)suggestionCache.current.delete(suggestionCache.current.keys().next().value!);suggestionCache.current.set(key,result.suggestions);setLiveSuggestions({query,language:interfaceLanguage,values:result.suggestions});setSuggestionIndex(-1);}
      }).catch(()=>{});
    },150);
    return ()=>{window.clearTimeout(timer);controller.abort();};
  },[sourceQuery,directSource,suggestionsOpen,interfaceLanguage]);
  const queryContext=JSON.stringify([title.trim(),prompt.trim()]);
  const submitSourceSearch=(query=sourceQuery.trim())=>{if(query.length<2||query.length>200)return;if(!title.trim()||!prompt.trim()){setMessage('Enter a feed name and interests before checking a source.');return;}setSourceQuery(query);setSuggestionsOpen(false);setSuggestionIndex(-1);setSubmittedSearch({query,context:queryContext});};
  useEffect(()=>{
    const query=sourceQuery.trim();
    setSearchResults([]);setSearchStatus("");setSearching(false);
    if(query.length<2||query.length>200||directSource||submittedSearch?.query!==query||submittedSearch.context!==queryContext)return;
    const cacheKey=JSON.stringify([query,queryContext]);
    const status=(result:Awaited<ReturnType<typeof searchSourceCandidates>>)=>result.unavailable?'Web search is unavailable right now. You can still paste a source URL.':result.topicMismatch?'No results matched this feed’s topic. Try a more specific search.':result.results.length?'':'No freely accessible sources found. Try another name or a public feed URL.';
    const cached=searchCache.current.get(cacheKey);
    if(cached&&Date.now()-cached.at<(cached.result.accessIncomplete?15_000:60_000)){setSearchResults(cached.result.results.filter(row=>!row.blocked));setSearchStatus(status(cached.result));return;}
    const controller=new AbortController();
    setSearching(true);
      void searchSourceCandidates(query,controller.signal,{title:title.trim(),description:prompt.trim()}).then(result=>{
        if(controller.signal.aborted||sourceQueryRef.current.trim()!==query)return;
        if(!result.unavailable&&(!result.accessIncomplete||result.results.length>0)){if(searchCache.current.size>=20)searchCache.current.delete(searchCache.current.keys().next().value!);searchCache.current.set(cacheKey,{at:Date.now(),query,result});}
        setSearchResults(result.results.filter(row=>!row.blocked));
        setSearchStatus(status(result));
      }).catch(()=>{
        if(!controller.signal.aborted)setSearchStatus('Web search is unavailable right now. You can still paste a source URL.');
      }).finally(()=>{if(!controller.signal.aborted)setSearching(false);});
    return ()=>{controller.abort();};
  },[sourceQuery,directSource,submittedSearch,queryContext]);
  const [sourceChecks, setSourceChecks] = useState<SourceAssessment[]>([]);
  const [checkingSource, setCheckingSource] = useState(false);
  const [checkingSourceInput, setCheckingSourceInput] = useState("");
  const sourceContext = useRef("");
  const recommendationContext = useRef("");
  sourceContext.current = JSON.stringify([title, prompt]);
  const [recommendations, setRecommendations] = useState<string[]>([]);
  const [recommendationQuery, setRecommendationQuery] = useState("");
  const sourceSearchRef = useRef<HTMLInputElement>(null);
  const [recommending, setRecommending] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [busy, setBusy] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [message, setMessage] = useState<UiMessage>("");
  const { confirm, confirmation } = useConfirmation();
  async function findSources() {
    setRecommending(true); setMessage("");
    const context=sourceContext.current;
    const showRecommendations=(result:Awaited<ReturnType<typeof recommendSourceCandidates>>)=>{
      if(sourceContext.current!==context)return;
      recommendationContext.current=context;
      setRecommendations(result.sources);setSourceChecks((result.checks??[]).filter(check=>result.sources.includes(check.input)));setRecommendationQuery(sourceQuery.trim());
    };
    try {
      const result=await recommendSourceCandidates(title.trim(), [prompt.trim(), sourceQuery.trim()].filter(Boolean).join("\n"),showRecommendations);
      if(sourceContext.current!==context)return;
      showRecommendations(result);
      if(!result.sources.length)setMessage("No matching sources found. Try a broader topic or add a source link.");
    }
    catch (cause) { setMessage(toUiError(cause)); }
    finally { setRecommending(false); }
  }
  async function addSource(source: string): Promise<boolean> {
    if(checkingSource||!title.trim()||!prompt.trim()) { setMessage("Enter a feed name and interests before checking a source."); return false; }
    if(sources.includes(source))return true;
    const context=sourceContext.current;
    const checked=sourceChecks.find(check=>check.input===source&&check.status==='accepted');
    const age=checked?Date.now()-Date.parse(checked.checkedAt):Infinity;
    if(recommendationContext.current===context&&recommendations.includes(source)&&age>=0&&age<5*60_000){
      setSources(current=>current.includes(source)?current:[...current,source]);return true;
    }
    setCheckingSource(true);setCheckingSourceInput(source); setMessage("");
    try {
      const searchQuery=!directSource&&sourceQuery.trim().length>=2&&sourceQuery.trim().length<=200?sourceQuery.trim():undefined;
      const options=searchQuery?{searchQuery}:undefined;
      const check=options?await assessSourceInput(title.trim(),prompt.trim(),source,options):await assessSourceInput(title.trim(),prompt.trim(),source);
      if(context!==sourceContext.current)return false;
      setSourceChecks(current=>[...current.filter(item=>item.input!==source),check]);
      if(check.freeAccessUnavailable||check.paidRetryMaxUsd||check.status==='rejected'){
        setSearchResults(current=>current.filter(row=>row.source!==source));
        setRecommendations(current=>current.filter(item=>item!==source));
        for(const saved of searchCache.current.values())saved.result.results=saved.result.results.filter(row=>row.source!==source);
      }
      if(check.status!=='accepted') { setMessage(check.reason); return false; }
      setSources(current=>current.includes(source)?current:[...current,source]); return true;
    } catch(cause) { setMessage(toUiError(cause)); return false; }
    finally { setCheckingSource(false);setCheckingSourceInput(""); }
  }
  const matchingSources = recommendations.filter(source => !addedPublishers.has(sourcePublisherKey(source)) && (!sourceQuery.trim() || sourceQuery.trim() === recommendationQuery || source.toLowerCase().includes(sourceQuery.trim().toLowerCase())));
  async function run(action: () => Promise<void>) { setBusy(true); setMessage(""); try { await action(); } catch (cause) { setMessage(toUiError(cause)); } finally { setBusy(false); } }
  return <Dialog className="feed-editor" label={t(editing ? "Edit feed settings" : "Add feed")} onClose={props.onClose}>

    <form className="dialog-inner" onSubmit={event => {
      event.preventDefault();
      if (title.trim().length > FEED_TITLE_MAX_LENGTH) { setMessage({id:'FEED_NAME_TOO_LONG',details:{max:FEED_TITLE_MAX_LENGTH}}); return; }
      try { new Intl.DateTimeFormat("en", { timeZone: timezone.trim() }).format(); }
      catch { setMessage("Enter a valid time zone, such as Asia/Beirut or UTC."); return; }
      if (checkingSource) return;
      if (!sourcesReady || sources.length === 0) { setMessage("Add at least one source."); return; }
      void run(() => props.onSave({ id, title: title.trim(), interestProfile: prompt.trim(), updateIntervalMinutes: rhythm, briefingTimeOfDay: rhythm === 1440 ? deliveryTime : undefined, language: feedLanguage, publicFeedEnabled, briefingTimezone: timezone.trim(), sourceInputs: sources }));
    }}>
      <button type="button" className="dialog-close quiet-icon" aria-label={t("Close dialog")} onClick={props.onClose}><X size={20}/></button>
      <div className="feed-editor-heading"><span className="feed-heading-icon"><SquarePlus size={23}/></span><h2>{t(editing ? "Edit feed settings" : "Add feed")}</h2></div>

      <div className="feed-details-fields">
        <label>{t("Feed name")}<span className="voice-field"><input aria-label={t("Feed name")} aria-describedby="feed-title-limit" placeholder={t("e.g. My news feed")} autoFocus required maxLength={FEED_TITLE_MAX_LENGTH} value={title} onChange={event => setTitle(event.target.value)}/><VoiceInput language={feedLanguage} label="Record feed title" onText={text => setTitle(text.slice(0,FEED_TITLE_MAX_LENGTH))}/></span><small id="feed-title-limit">{t("{count}/{max} characters", {count: title.length, max: FEED_TITLE_MAX_LENGTH})}</small></label>
        <label>{t("What would you like to follow?")}<span className="voice-field"><textarea aria-label={t("What would you like to follow?")} placeholder={t("e.g. topics, keywords...")} required rows={2} value={prompt} onChange={event => setPrompt(event.target.value)}/><VoiceInput language={feedLanguage} onText={setPrompt}/></span></label>
        <div className="source-picker">
          <label htmlFor="feed-source-search">{t("Sources")}</label>
          <div className="source-search-field"><Search size={21}/><input id="feed-source-search" ref={sourceSearchRef} value={sourceQuery} maxLength={500} role="combobox" aria-autocomplete="list" aria-expanded={suggestionsOpen&&querySuggestions.length>0} aria-controls="source-query-suggestions" aria-activedescendant={suggestionsOpen&&suggestionIndex>=0?`source-query-option-${suggestionIndex}`:undefined} aria-describedby="feed-source-search-help feed-source-search-status" placeholder={t("Search sources or paste a URL")} onChange={event => {setSourceQuery(event.target.value);setSubmittedSearch(null);setSuggestionsOpen(true);setSuggestionIndex(-1);}} onKeyDown={event => {
            if((event.key==='ArrowDown'||event.key==='ArrowUp')&&querySuggestions.length){event.preventDefault();setSuggestionsOpen(true);setSuggestionIndex(index=>index<0?(event.key==='ArrowDown'?0:querySuggestions.length-1):(index+(event.key==='ArrowDown'?1:-1)+querySuggestions.length)%querySuggestions.length);}
            if(event.key==='Escape'){setSuggestionsOpen(false);setSuggestionIndex(-1);}
            if(event.key==='Enter'){event.preventDefault();if(sourceQuery.trim()&&directSource){void addSource(sourceQuery.trim()).then(added=>{if(added)setSourceQuery('');});}else submitSourceSearch(suggestionsOpen&&suggestionIndex>=0?querySuggestions[suggestionIndex]:sourceQuery.trim());}
          }}/>{sourceQuery && <button type="button" aria-label={t("Clear source search")} onClick={() => {setSourceQuery('');setSubmittedSearch(null);setSuggestionsOpen(false);}}><X size={18}/></button>}</div>
          {suggestionsOpen&&querySuggestions.length>0&&<div className="source-query-suggestions" id="source-query-suggestions" role="listbox" aria-label={t('Suggested searches')}>{querySuggestions.map((query,index)=><button type="button" role="option" id={`source-query-option-${index}`} aria-selected={suggestionIndex===index} key={query} onMouseDown={event=>event.preventDefault()} onClick={()=>submitSourceSearch(query)}><Search size={16} aria-hidden/><span>{query}</span></button>)}</div>}
          {!directSource&&sourceQuery.trim().length>=2&&<button type="button" className="source-search-submit" disabled={searching||sourceQuery.trim().length>200} onClick={()=>submitSourceSearch()}><Search size={16} aria-hidden/>{t('Search sources')}</button>}
          <small id="feed-source-search-help">{t("Search by publisher or article title. Select a result to follow its publisher.")}</small>
          <small id="feed-source-search-status" role="status" hidden={!searching&&!searchStatus}>{t(searching?'Searching sources...':searchStatus)}</small>
          {checkingSource&&<small role="status">{t("Checking {source}...",{source:checkingSourceInput})}</small>}
          {visibleSearchResults.length>0&&<div className="source-search-results source-web-results" aria-label={t("Source search results")} aria-busy={searching||checkingSource}>{visibleSearchResults.map((result,index)=>{
            const check=sourceChecks.find(check=>check.input===result.source);
            const selected=sources.includes(result.source);
            return <div className="source-web-result-row" key={`${result.source}:${index}`}>
              <button className="source-web-result-choice" type="button" disabled={checkingSource||selected} aria-busy={checkingSourceInput===result.source} onClick={()=>void addSource(result.source).then(added=>{if(added)setSourceQuery("");})}><SourceLogo source={result.source}/><span className="source-web-result"><strong>{result.title}</strong><small>{result.publisher}</small>{result.blocked&&<small>{t("Direct access was blocked. Select to check other configured collection routes.")}{result.httpStatus?` (HTTP ${result.httpStatus})`:""}</small>}{selected&&<small>{t("Already added")}</small>}{result.excerpt&&<span>{result.excerpt}</span>}</span>{selected?<Check size={18} aria-hidden="true"/>:<Plus size={18} aria-hidden="true"/>}</button>
              {check&&check.status!=='accepted'&&<small className="source-result-status" role="status">{t(check.reason)}</small>}
            </div>;
          })}</div>}
          <small>{t("Paste a website, feed, Telegram, X or LinkedIn link, or enter a news topic.")}</small>
          {matchingSources.length > 0 && <div className="source-search-results" aria-label={t("Suggested sources")}>{matchingSources.map(source => <button type="button" key={source} className={sources.includes(source) ? "selected" : ""} aria-pressed={sources.includes(source)} disabled={checkingSource} onClick={() => void addSource(source)}><span className="source-recommendation-option"><span className="source-recommendation-identity"><SourceIdentity source={source}/></span>{sourceChecks.find(check=>check.input===source)?.evidenceQuote && <q className="source-recommendation-evidence">{sourceChecks.find(check=>check.input===source)?.evidenceQuote}</q>}</span></button>)}</div>}
          {directSource && sourceQuery.trim() && !sources.includes(sourceQuery.trim()) && <button className="add-source-button" type="button" disabled={checkingSource} onClick={() => { void addSource(sourceQuery.trim()).then(added=>{if(added)setSourceQuery(""); sourceSearchRef.current?.focus();}); }}><Plus size={24}/>{t("Add source")}</button>}
          <button className="source-recommend-button" type="button" disabled={recommending || checkingSource || !title.trim() || !prompt.trim()} onClick={() => void findSources()}>{t(recommending ? "Finding sources..." : "Recommend sources with AI")}</button>
        </div>
        {sources.length > 0 && <div className="selected-sources"><span className="selected-sources-label">{t("Selected sources")}</span>{sources.map(source => <div className="selected-source-row" key={source}><SourceIdentity source={source}/><button type="button" aria-label={`${t("Remove source")}: ${source}`} onClick={() => setSources(current => current.filter(value => value !== source))}><X size={20}/></button></div>)}
        </div>}
      </div>
      <section className="feed-preferences-card">
      <button type="button" className="feed-preferences-disclosure" aria-label={t("Preferences")} aria-expanded={advanced} aria-controls="feed-preferences" onClick={() => setAdvanced(value => !value)}><Settings size={26}/><span><strong>{t("Preferences")}</strong><small>{t(publicFeedEnabled ? "Public" : "Private")} · {t(rhythmLabels[rhythm])}{rhythm === 1440 ? ` ${t("at {time}", {time: deliveryTime})}` : ""} · {t(({ en: "English", fr: "French", ar: "Arabic" } as const)[feedLanguage])}</small></span><ChevronDown size={20}/></button>
      <div id="feed-preferences" className="feed-preferences-fields" hidden={!advanced}>
      <p className="feed-preferences-group-label">{t("Schedule")}</p>
      <div className="feed-preference-row"><span className="feed-preference-label" id="feed-rhythm-label"><CalendarDays aria-hidden="true"/>{t("Update rhythm")}</span><FeedSettingsSelect value={String(rhythm)} onChange={value => setRhythm(Number(value) as FeedInput['updateIntervalMinutes'])} labelId="feed-rhythm-label" kind="rhythm" options={Object.entries(rhythmLabels).map(([value,label]) => ({value,label:t(label)}))}/></div>
      {rhythm === 1440 && <div className="feed-preference-row"><label className="feed-preference-label" htmlFor="feed-delivery-time"><Clock aria-hidden="true"/>{t("Deliver at")}</label><span className="feed-time-field"><input id="feed-delivery-time" ref={deliveryTimeInput} type="time" step={!props.feed || props.feed.briefingScheduleClockStartAt ? 1800 : 60} required value={deliveryTime} onChange={event => setDeliveryTime(event.target.value)}/><button type="button" aria-label={t('Choose delivery time')} onClick={() => {const input = deliveryTimeInput.current; if (!input) return; try {if (input.showPicker) input.showPicker(); else input.focus();} catch {input.focus();}}}><Clock size={18} aria-hidden/></button></span></div>}
      <p className="feed-preferences-group-label">{t("General")}</p>
      <div className="feed-preference-row"><span className="feed-preference-label" id="feed-visibility-label"><Users aria-hidden="true"/>{t("Feed visibility")}</span><span className="feed-visibility-options" role="group" aria-labelledby="feed-visibility-label">{([true, false] as const).map(option=><label key={String(option)}><input type="radio" name="feed-visibility" checked={publicFeedEnabled===option} onChange={()=>setPublicFeedEnabled(option)}/><span>{t(option?"Public":"Private")}</span></label>)}</span></div>
      <div className="feed-preference-row"><span className="feed-preference-label" id="feed-language-label"><Globe aria-hidden="true"/>{t("Briefing language")}</span><FeedLanguageSelect value={feedLanguage} onChange={setFeedLanguage} labelId="feed-language-label"/></div>
      </div>
      </section>
      {message && <p className="error" role="alert">{t(message)}</p>}
      {editing && props.feed && <section className="feed-actions-panel" aria-labelledby="feed-actions-title">
        <h3 id="feed-actions-title">{t("Feed actions")}</h3>
        <p>{t("Manage this feed or copy its link.")}</p>
        <div className="feed-editor-actions">
          <button type="button" disabled={busy || !props.onPause} onClick={() => void run(async () => { await props.onPause?.(); props.onClose(); })}>{props.feed.paused ? <Play size={18} aria-hidden/> : <Pause size={18} aria-hidden/>}<span>{t(props.feed.paused ? "Resume feed" : "Pause feed")}</span></button>
          <button type="button" disabled={busy || !props.onCopy} onClick={() => void run(async () => { await props.onCopy?.(); setLinkCopied(true); })}><Copy size={18} aria-hidden/><span aria-live="polite">{t(linkCopied ? "Copied" : "Copy link")}</span></button>
          <button type="button" className="danger-button" disabled={busy || !props.onDelete} onClick={async () => { if (await confirm(t('Delete "{name}" and its published content?', {name: props.feed?.title ?? ''}))) void run(async () => { await props.onDelete?.(); }); }}><Trash2 size={18} aria-hidden/><span>{t("Delete feed")}</span></button>
        </div>
      </section>}
      <div className="experience-dialog-actions"><button type="button" onClick={props.onClose}>{t("Cancel")}</button><button className="primary-button" disabled={busy || checkingSource || !sourcesReady || !title.trim() || !prompt.trim() || !timezone.trim()}>{busy ? "…" : t(editing ? "Save changes" : "Create feed")}</button></div>

    </form>
    {confirmation}
  </Dialog>;
}

function SourceIdentity({ source }: { source: string }) {
  let host = "";
  const value=source.replace(/^rss:\s*/i, "");
  let detail = value;
  try { const url = new URL(value.includes("://") ? value : `https://${value}`); if (url.hostname.includes(".")) { host = url.hostname.replace(/^www\./, ""); detail = `${host}${url.pathname === "/" ? "" : url.pathname}`; } } catch { /* Source names are also supported. */ }
  const platform = /^rss:/i.test(source) ? "RSS" : /(^|\.)(twitter\.com|x\.com)$/.test(host) ? "X" : host === "t.me" || host === "telegram.me" ? "Telegram" : /(^|\.)linkedin\.com$/.test(host) ? "LinkedIn" : host ? "Website" : "Source";
  const title = platform === "Website" || platform === "Source" || platform === "RSS" ? host || source : detail.split("/").filter(Boolean).slice(1).join("/") || source;
  return <><span className={`source-platform-icon platform-${platform.toLowerCase()}`} aria-hidden="true">{platform === "X" ? "𝕏" : platform === "Telegram" ? "➤" : platform === "LinkedIn" ? "in" : <SourceLogo source={value}/>}</span><span className="source-identity"><strong>{title}</strong><small>{detail}</small></span><span className="source-platform-label">{platform}</span></>;
}
