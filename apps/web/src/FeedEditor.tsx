import { useState } from "react";
import { X } from "lucide-react";
import type { BriefingConfig } from "@distilled/core";
import { preferredLanguage, useLanguage } from "./LanguageControl";
import { Dialog } from "./Dialog";
import { useConfirmation } from "./useConfirmation";
import { FeedArt } from "./FeedArt";
import { recommendSources } from "./api";
import { VoiceInput } from "./VoiceInput";

export type FeedInput = Pick<BriefingConfig, "title" | "interestProfile" | "briefingCadence" | "language" | "styleInstruction" | "briefingTimezone" | "publicFeedEnabled"> & { sourceInputs?: string[] };
export function FeedEditor(props: {
  feed?: BriefingConfig; onClose: () => void; onSave: (input: FeedInput) => Promise<void>;
  onPause?: () => Promise<void>; onCopy?: () => Promise<void>; onDelete?: () => Promise<void>;
}) {
  const [title, setTitle] = useState(props.feed?.title ?? "");
  const [prompt, setPrompt] = useState(props.feed?.interestProfile ?? "");
  const [rhythm, setRhythm] = useState<BriefingConfig["briefingCadence"]>(props.feed?.briefingCadence ?? "daily");
  const [feedLanguage, setFeedLanguage] = useState<BriefingConfig["language"]>(props.feed?.language ?? preferredLanguage());
  const [style, setStyle] = useState(props.feed?.styleInstruction ?? "Use calm, balanced wording.");
  const [timezone] = useState(() => props.feed?.briefingTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  const [isPublic, setIsPublic] = useState(props.feed?.publicFeedEnabled ?? true);
  const [sourceText, setSourceText] = useState("");
  const [recommendations, setRecommendations] = useState<string[]>([]);
  const [recommending, setRecommending] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const { t } = useLanguage();
  const { confirm, confirmation } = useConfirmation();
  async function run(action: () => Promise<void>) { setBusy(true); setMessage(""); try { await action(); } catch (cause) { setMessage(cause instanceof Error ? cause.message : String(cause)); } finally { setBusy(false); } }
  return <Dialog className="feed-editor" label={t(props.feed ? "Edit feed settings" : "Add feed")} onClose={props.onClose}>
    <form className="dialog-inner" onSubmit={event => {
      event.preventDefault();
      try { new Intl.DateTimeFormat("en", { timeZone: timezone.trim() }).format(); }
      catch { setMessage(t("Enter a valid time zone, such as Asia/Beirut or UTC.")); return; }
      void run(() => props.onSave({ title: title.trim(), interestProfile: prompt.trim(), briefingCadence: rhythm, language: feedLanguage, styleInstruction: style.trim(), publicFeedEnabled: isPublic, briefingTimezone: timezone.trim(), sourceInputs: sourceText.split("\n").map(value => value.trim()).filter(Boolean) }));
    }}>
      <button type="button" className="dialog-close quiet-icon" aria-label={t("Close dialog")} onClick={props.onClose}><X size={20}/></button>
      <h2>{t(props.feed ? "Edit feed settings" : "Add feed")}</h2>
      <div className="feed-form-tabs"><button type="button" aria-pressed={!advanced} onClick={() => setAdvanced(false)}>{t("Feed details")}</button><button type="button" aria-pressed={advanced} onClick={() => setAdvanced(true)}>{t("Preferences")}</button></div>
      <div className="feed-visibility" role="group" aria-label={t("Feed visibility")}>
        <span>{t("Feed visibility")}</span>
        <button type="button" aria-pressed={isPublic} onClick={() => setIsPublic(true)}>{t("Public")}</button>
        <button type="button" aria-pressed={!isPublic} onClick={() => setIsPublic(false)}>{t("Private")}</button>
        <small>{t(isPublic ? "Anyone with the link can read this feed." : "Only you can read this feed.")}</small>
      </div>
      <div hidden={advanced}>
      <label>{t("Feed name")}<span className="voice-field"><input aria-label={t("Feed name")} autoFocus required maxLength={120} value={title} onChange={event => setTitle(event.target.value)}/><VoiceInput language={feedLanguage} label="Record feed title" onText={text => setTitle(text.slice(0,120))}/></span></label>
      <label>{t("What would you like to follow?")}<span className="voice-field"><textarea aria-label={t("What would you like to follow?")} required rows={2} value={prompt} onChange={event => setPrompt(event.target.value)}/><VoiceInput language={feedLanguage} onText={setPrompt}/></span></label>
      <label>{t("Sources")}<textarea aria-label={t("Sources")} rows={3} value={sourceText} onChange={event => setSourceText(event.target.value)} placeholder={t("One source URL or name per line")}/></label>
      <button type="button" disabled={recommending || !title.trim() || !prompt.trim()} onClick={async () => { setRecommending(true); setMessage(""); try { const sources = await recommendSources(title, prompt); setRecommendations(sources); } catch (cause) { setMessage(cause instanceof Error ? cause.message : String(cause)); } finally { setRecommending(false); } }}>{t(recommending ? "Finding sources..." : "Recommend sources with AI")}</button>
      {recommendations.length > 0 && <fieldset className="source-recommendations"><legend>{t("Select sources")}</legend>{recommendations.map(source => <label key={source}><input type="checkbox" checked={sourceText.split("\n").includes(source)} onChange={event => setSourceText(current => event.target.checked ? [...current.split("\n").filter(Boolean), source].join("\n") : current.split("\n").filter(value => value !== source).join("\n"))}/>{source}</label>)}</fieldset>}</div>
      <div hidden={!advanced}>
      <label>{t("Update rhythm")}<select value={rhythm} onChange={event => setRhythm(event.target.value as BriefingConfig["briefingCadence"])}><option value="hourly">{t("Hourly")}</option><option value="daily">{t("Daily")}</option><option value="weekly">{t("Weekly")}</option></select></label>
      <div className="feed-language-row"><span>{t("Feed language")}</span><button type="button" aria-label={`Feed language: ${feedLanguage}`} onClick={() => setFeedLanguage(({ en: "fr", fr: "ar", ar: "en" } as const)[feedLanguage])}>{feedLanguage}</button></div>
          <label>{t("Writing style")}<textarea rows={2} value={style} onChange={event => setStyle(event.target.value)} placeholder={t("For example: concise, neutral, and easy to read.")}/></label>
      </div>
      {!advanced && (title.trim() || prompt.trim()) && <div className="feed-sketch-settings">
        <FeedArt canGenerate feed={{ title, interestProfile: prompt, ...(title === props.feed?.title && prompt === props.feed?.interestProfile ? { id: props.feed.id, ownerUsername: props.feed.ownerUsername, slug: props.feed.slug } : {}) }}/>
        <p className="field-help">{t("Your illustration is created automatically.")}</p>
      </div>}
      {message && <p role="status">{message}</p>}
      <div className="experience-dialog-actions"><button type="button" onClick={props.onClose}>{t("Cancel")}</button><button className="primary-button" disabled={busy || !title.trim() || !prompt.trim() || !timezone.trim()}>{busy ? "…" : t(props.feed ? "Save changes" : "Create feed")}</button></div>
      {advanced && props.feed && <div className="feed-editor-actions">
        <button type="button" disabled={busy} onClick={() => void run(async () => { await props.onPause?.(); props.onClose(); })}>{t(props.feed?.paused ? "Resume feed" : "Pause feed")}</button>
        <button type="button" disabled={busy} onClick={() => void run(async () => { await props.onCopy?.(); setMessage(t("URL copied")); })}>{t("Copy URL")}</button>
        <button type="button" className="danger-button" disabled={busy} onClick={async () => { if (await confirm(`Delete "${props.feed?.title}" and its published content?`)) void run(async () => { await props.onDelete?.(); }); }}>{t("Delete feed")}</button>
      </div>}
    </form>
    {confirmation}
  </Dialog>;
}
