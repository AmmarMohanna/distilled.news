const rhythmLabels = { 30: "Every 30 min", 60: "Every hour", 120: "Every 2 hours", 360: "Every 6 hours", 720: "Every 12 hours", 1440: "Daily" } as const;
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Globe, Plus, Search, Settings, SquarePlus, X } from "lucide-react";
import type { BriefingConfig } from "@distilled/core";
import { preferredLanguage, useLanguage } from "./LanguageControl";
import { Dialog } from "./Dialog";
import { useConfirmation } from "./useConfirmation";
import { getSources, recommendSources } from "./api";
import { VoiceInput } from "./VoiceInput";

export type FeedInput = Pick<BriefingConfig, "title" | "interestProfile" | "language" | "briefingTimezone" | "publicFeedEnabled"> & { id: string; sourceInputs: string[]; updateIntervalMinutes: 30 | 60 | 120 | 360 | 720 | 1440; briefingTimeOfDay?: string };
export function FeedEditor(props: {
  feed?: BriefingConfig; onClose: () => void; onSave: (input: FeedInput) => Promise<void>;
  onPause?: () => Promise<void>; onCopy?: () => Promise<void>; onDelete?: () => Promise<void>;
}) {
  const [id] = useState(() => props.feed?.id ?? `briefing_${crypto.randomUUID()}`);
  const [sourcesReady, setSourcesReady] = useState(!props.feed);
  useEffect(() => {
    if (!props.feed) return;
    let active = true;
    getSources(props.feed.id).then(items => { if (active) { setSources(items.filter(s=>s.enabled).map(s=>s.input || s.sourceUrl || s.url || s.title)); setSourcesReady(true); } }).catch(cause => { if (active) setMessage(String(cause)); });
    return () => { active = false; };
  }, [props.feed?.id]);
  const [title, setTitle] = useState(props.feed?.title ?? "");
  const [prompt, setPrompt] = useState(props.feed?.interestProfile ?? "");
  const [rhythm, setRhythm] = useState<FeedInput["updateIntervalMinutes"]>(props.feed?.updateIntervalMinutes ?? (props.feed?.briefingCadence === "hourly" ? 60 : 1440));
  const [feedLanguage, setFeedLanguage] = useState<BriefingConfig["language"]>(props.feed?.language ?? preferredLanguage());
  const [deliveryTime, setDeliveryTime] = useState(props.feed?.briefingTimeOfDay ?? "08:00");
  const [timezone] = useState(() => props.feed?.briefingTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  const [sources, setSources] = useState<string[]>([]);
  const [sourceQuery, setSourceQuery] = useState("");
  const [recommendations, setRecommendations] = useState<string[]>([]);
  const [recommendationQuery, setRecommendationQuery] = useState("");
  const sourceSearchRef = useRef<HTMLInputElement>(null);
  const [recommending, setRecommending] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const { t } = useLanguage();
  const { confirm, confirmation } = useConfirmation();
  async function findSources() {
    setRecommending(true); setMessage("");
    try { setRecommendations(await recommendSources(title.trim(), [prompt.trim(), sourceQuery.trim()].filter(Boolean).join("\n"))); setRecommendationQuery(sourceQuery.trim()); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : String(cause)); }
    finally { setRecommending(false); }
  }
  function addSource(source: string) { setSources(current => current.includes(source) ? current : [...current, source]); }
  const matchingSources = recommendations.filter(source => !sourceQuery.trim() || sourceQuery.trim() === recommendationQuery || source.toLowerCase().includes(sourceQuery.trim().toLowerCase()));
  async function run(action: () => Promise<void>) { setBusy(true); setMessage(""); try { await action(); } catch (cause) { setMessage(cause instanceof Error ? cause.message : String(cause)); } finally { setBusy(false); } }
  return <Dialog className="feed-editor" label={t(props.feed ? "Edit feed settings" : "Add feed")} onClose={props.onClose}>
    <form className="dialog-inner" onSubmit={event => {
      event.preventDefault();
      try { new Intl.DateTimeFormat("en", { timeZone: timezone.trim() }).format(); }
      catch { setMessage(t("Enter a valid time zone, such as Asia/Beirut or UTC.")); return; }
      if (!sourcesReady || sources.length === 0) { setMessage(t("Add at least one source.")); return; }
      void run(() => props.onSave({ id, title: title.trim(), interestProfile: prompt.trim(), updateIntervalMinutes: rhythm, briefingTimeOfDay: rhythm === 1440 ? deliveryTime : undefined, language: feedLanguage, publicFeedEnabled: true, briefingTimezone: timezone.trim(), sourceInputs: sources }));
    }}>
      <button type="button" className="dialog-close quiet-icon" aria-label={t("Close dialog")} onClick={props.onClose}><X size={20}/></button>
      <div className="feed-editor-heading"><span className="feed-heading-icon"><SquarePlus size={23}/></span><h2>{t(props.feed ? "Edit feed settings" : "Add feed")}</h2></div>
      <div className="feed-details-fields">
        <label>{t("Feed name")}<span className="voice-field"><input aria-label={t("Feed name")} placeholder={t("e.g. My news feed")} autoFocus required maxLength={120} value={title} onChange={event => setTitle(event.target.value)}/><VoiceInput language={feedLanguage} label="Record feed title" onText={text => setTitle(text.slice(0,120))}/></span></label>
        <label>{t("What would you like to follow?")}<span className="voice-field"><textarea aria-label={t("What would you like to follow?")} placeholder={t("e.g. topics, keywords...")} required rows={1} value={prompt} onChange={event => setPrompt(event.target.value)}/><VoiceInput language={feedLanguage} onText={setPrompt}/></span></label>
        <div className="source-picker">
          <label htmlFor="feed-source-search">{t("Sources")}</label>
          <div className="source-search-field"><Search size={21}/><input id="feed-source-search" ref={sourceSearchRef} value={sourceQuery} placeholder={t("Search sources or paste a URL")} onChange={event => setSourceQuery(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); if (sourceQuery.trim()) { addSource(sourceQuery.trim()); setSourceQuery(""); } } }}/>{sourceQuery && <button type="button" aria-label={t("Clear source search")} onClick={() => setSourceQuery("")}><X size={18}/></button>}</div>
          <small>{t("Paste a website, feed, Telegram, X or LinkedIn link, or enter a news topic.")}</small>
          {matchingSources.length > 0 && <div className="source-search-results" aria-label={t("Suggested sources")}>{matchingSources.map(source => <button type="button" key={source} className={sources.includes(source) ? "selected" : ""} aria-pressed={sources.includes(source)} onClick={() => addSource(source)}><SourceIdentity source={source}/></button>)}</div>}
          {sourceQuery.trim() && <button className="add-source-button" type="button" onClick={() => { addSource(sourceQuery.trim()); setSourceQuery(""); sourceSearchRef.current?.focus(); }}><Plus size={24}/>{t("Add source")}</button>}
          <button className="source-recommend-button" type="button" disabled={recommending || !title.trim() || !prompt.trim()} onClick={() => void findSources()}>{t(recommending ? "Finding sources..." : "Recommend sources with AI")}</button>
        </div>
        {sources.length > 0 && <div className="selected-sources"><span className="selected-sources-label">{t("Selected sources")}</span>{sources.map(source => <div className="selected-source-row" key={source}><SourceIdentity source={source}/><button type="button" aria-label={`${t("Remove source")}: ${source}`} onClick={() => setSources(current => current.filter(value => value !== source))}><X size={20}/></button></div>)}
        </div>}
      </div>
      <button type="button" className="feed-preferences-disclosure" aria-label={t("Preferences")} aria-expanded={advanced} aria-controls="feed-preferences" onClick={() => setAdvanced(value => !value)}><Settings size={26}/><span><strong>{t("Preferences")}</strong><small>{t("Public")} ? {t(rhythmLabels[rhythm])}{rhythm === 1440 ? ` at ${deliveryTime}` : ""} ? {t(({ en: "English", fr: "French", ar: "Arabic" } as const)[feedLanguage])}</small></span><ChevronDown size={20}/></button>
      <div id="feed-preferences" className="feed-preferences-fields" hidden={!advanced}>
      <label>{t("Update rhythm")}<select value={rhythm} onChange={event => setRhythm(Number(event.target.value) as FeedInput["updateIntervalMinutes"])}>{Object.entries(rhythmLabels).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</select></label>
      {rhythm === 1440 && <label>{t("Deliver at")}<input type="time" required value={deliveryTime} onChange={event => setDeliveryTime(event.target.value)}/></label>}
      <div className="feed-language-row"><span>{t("Briefing language")}</span><button type="button" aria-label={`Feed language: ${feedLanguage}`} onClick={() => setFeedLanguage(({ en: "fr", fr: "ar", ar: "en" } as const)[feedLanguage])}>{feedLanguage}</button></div>
      </div>
      {message && <p role="status">{message}</p>}
      <div className="experience-dialog-actions"><button type="button" onClick={props.onClose}>{t("Cancel")}</button><button className="primary-button" disabled={busy || !sourcesReady || !title.trim() || !prompt.trim() || !timezone.trim()}>{busy ? "…" : t(props.feed ? "Save changes" : "Create feed")}</button></div>
      {advanced && props.feed && <div className="feed-editor-actions">
        <button type="button" disabled={busy} onClick={() => void run(async () => { await props.onPause?.(); props.onClose(); })}>{t(props.feed?.paused ? "Resume feed" : "Pause feed")}</button>
        <button type="button" disabled={busy} onClick={() => void run(async () => { await props.onCopy?.(); setMessage(t("URL copied")); })}>{t("Copy URL")}</button>
        <button type="button" className="danger-button" disabled={busy} onClick={async () => { if (await confirm(`Delete "${props.feed?.title}" and its published content?`)) void run(async () => { await props.onDelete?.(); }); }}>{t("Delete feed")}</button>
      </div>}
    </form>
    {confirmation}
  </Dialog>;
}

function SourceIdentity({ source }: { source: string }) {
  let host = "";
  let detail = source;
  try { const url = new URL(source.includes("://") ? source : `https://${source}`); if (url.hostname.includes(".")) { host = url.hostname.replace(/^www\./, ""); detail = `${host}${url.pathname === "/" ? "" : url.pathname}`; } } catch { /* Source names are also supported. */ }
  const platform = /(^|\.)(twitter\.com|x\.com)$/.test(host) ? "X" : host === "t.me" || host === "telegram.me" ? "Telegram" : /(^|\.)linkedin\.com$/.test(host) ? "LinkedIn" : host ? "Website" : "Source";
  const title = platform === "Website" || platform === "Source" ? host || source : detail.split("/").filter(Boolean).slice(1).join("/") || source;
  return <><span className={`source-platform-icon platform-${platform.toLowerCase()}`} aria-hidden="true">{platform === "X" ? "𝕏" : platform === "Telegram" ? "➤" : platform === "LinkedIn" ? "in" : <Globe size={23}/>}</span><span className="source-identity"><strong>{title}</strong><small>{detail}</small></span><span className="source-platform-label">{platform}</span></>;
}
