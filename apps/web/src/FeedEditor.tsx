import { useState } from "react";
import { ChevronDown, X } from "lucide-react";
import type { BriefingConfig } from "@distilled/core";
import { preferredLanguage, useLanguage } from "./LanguageControl";
import { Dialog } from "./Dialog";
import { useConfirmation } from "./useConfirmation";
import { FeedArt } from "./FeedArt";

export type FeedInput = Pick<BriefingConfig, "title" | "interestProfile" | "briefingCadence" | "language" | "styleInstruction" | "briefingTimezone">;
export function FeedEditor(props: {
  feed?: BriefingConfig; onClose: () => void; onSave: (input: FeedInput) => Promise<void>;
  onPause?: () => Promise<void>; onCopy?: () => Promise<void>; onDelete?: () => Promise<void>;
}) {
  const [title, setTitle] = useState(props.feed?.title ?? "");
  const [prompt, setPrompt] = useState(props.feed?.interestProfile ?? "");
  const [rhythm, setRhythm] = useState<BriefingConfig["briefingCadence"]>(props.feed?.briefingCadence ?? "daily");
  const [feedLanguage, setFeedLanguage] = useState<BriefingConfig["language"]>(props.feed?.language ?? preferredLanguage());
  const [style, setStyle] = useState(props.feed?.styleInstruction ?? "Use calm, balanced wording.");
  const [timezone, setTimezone] = useState(props.feed?.briefingTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC");
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
      void run(() => props.onSave({ title: title.trim(), interestProfile: prompt.trim(), briefingCadence: rhythm, language: feedLanguage, styleInstruction: style.trim(), briefingTimezone: timezone.trim() }));
    }}>
      <button type="button" className="dialog-close quiet-icon" aria-label="Close dialog" onClick={props.onClose}><X size={20}/></button>
      <h2>{t(props.feed ? "Edit feed settings" : "Add feed")}</h2>
      <label>{t("Feed title")}<input autoFocus required maxLength={120} value={title} onChange={event => setTitle(event.target.value)}/></label>
      <label>{t("Prompt")}<textarea required rows={4} placeholder="What would you like to follow?" value={prompt} onChange={event => setPrompt(event.target.value)}/></label>
      <label>{t("Update rhythm")}<select value={rhythm} onChange={event => setRhythm(event.target.value as BriefingConfig["briefingCadence"])}><option value="hourly">{t("Hourly")}</option><option value="daily">{t("Daily")}</option><option value="weekly">{t("Weekly")}</option></select></label>
      <details className="feed-advanced">
        <summary>{t("Advanced settings")}<ChevronDown size={17} aria-hidden/></summary>
        <div className="feed-advanced-fields">
          <label>{t("Feed language")}<select value={feedLanguage} onChange={event => setFeedLanguage(event.target.value as BriefingConfig["language"])} aria-describedby="feed-language-help"><option value="en">English</option><option value="fr">Français</option><option value="ar">العربية</option></select></label>
          <p className="field-help" id="feed-language-help">{t("The language of new briefings in this feed. Your website language stays the same.")}</p>
          <label>{t("Writing style")}<textarea rows={3} value={style} onChange={event => setStyle(event.target.value)} placeholder={t("For example: concise, neutral, and easy to read.")}/></label>
          <label>{t("Time zone")}<input value={timezone} onChange={event => setTimezone(event.target.value)} placeholder="Asia/Beirut" aria-describedby="feed-timezone-help"/></label>
          <p className="field-help" id="feed-timezone-help">{t("Used for this feed’s publishing schedule.")}</p>
        </div>
      </details>
      {(title.trim() || prompt.trim()) && <div className="feed-sketch-settings">
        <FeedArt canGenerate feed={{ title, interestProfile: prompt, ...(title === props.feed?.title && prompt === props.feed?.interestProfile ? { id: props.feed.id, ownerUsername: props.feed.ownerUsername, slug: props.feed.slug } : {}) }}/>
        <p className="field-help">A custom AI illustration is created automatically when you save your topic. A matching placeholder appears while it is being drawn.</p>
      </div>}
      {message && <p role="status">{message}</p>}
      <div className="experience-dialog-actions"><button type="button" onClick={props.onClose}>{t("Cancel")}</button><button className="primary-button" disabled={busy || !title.trim() || !prompt.trim() || !timezone.trim()}>{busy ? "…" : t(props.feed ? "Save changes" : "Create feed")}</button></div>
      {props.feed && <div className="feed-editor-actions">
        <button type="button" disabled={busy} onClick={() => void run(async () => { await props.onPause?.(); props.onClose(); })}>{t(props.feed?.paused ? "Resume feed" : "Pause feed")}</button>
        <button type="button" disabled={busy} onClick={() => void run(async () => { await props.onCopy?.(); setMessage("URL copied"); })}>{t("Copy URL")}</button>
        <button type="button" className="danger-button" disabled={busy} onClick={async () => { if (await confirm(`Delete "${props.feed?.title}" and its published content?`)) void run(async () => { await props.onDelete?.(); }); }}>{t("Delete feed")}</button>
      </div>}
    </form>
    {confirmation}
  </Dialog>;
}
