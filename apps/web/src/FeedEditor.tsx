import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { BriefingConfig } from "@distilled/core";
import { useLanguage } from "./LanguageControl";

export type FeedInput = { title: string; interestProfile: string; briefingCadence: BriefingConfig["briefingCadence"] };
export function FeedEditor(props: {
  feed?: BriefingConfig; onClose: () => void; onSave: (input: FeedInput) => Promise<void>;
  onPause?: () => Promise<void>; onCopy?: () => Promise<void>; onDelete?: () => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState(props.feed?.title ?? "");
  const [prompt, setPrompt] = useState(props.feed?.interestProfile ?? "");
  const [rhythm, setRhythm] = useState<BriefingConfig["briefingCadence"]>(props.feed?.briefingCadence ?? "daily");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const { t } = useLanguage();
  useEffect(() => { const focus = document.activeElement as HTMLElement; dialog.current?.showModal(); const overflow = document.body.style.overflow; document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = overflow; focus?.focus(); }; }, []);
  async function run(action: () => Promise<void>) { setBusy(true); setMessage(""); try { await action(); } catch (cause) { setMessage(cause instanceof Error ? cause.message : String(cause)); } finally { setBusy(false); } }
  return <dialog ref={dialog} className="experience-dialog feed-editor" aria-label={t(props.feed ? "Edit feed settings" : "Add feed")} onCancel={event => { event.preventDefault(); if (!busy) props.onClose(); }}>
    <form className="dialog-inner" onSubmit={event => { event.preventDefault(); void run(() => props.onSave({ title: title.trim(), interestProfile: prompt.trim(), briefingCadence: rhythm })); }}>
      <button type="button" className="dialog-close quiet-icon" aria-label="Close dialog" disabled={busy} onClick={props.onClose}><X size={20}/></button>
      <h2>{t(props.feed ? "Edit feed settings" : "Add feed")}</h2>
      <label>{t("Feed title")}<input autoFocus required maxLength={120} value={title} onChange={event => setTitle(event.target.value)}/></label>
      <label>{t("Prompt")}<textarea required rows={4} placeholder="What would you like to follow?" value={prompt} onChange={event => setPrompt(event.target.value)}/></label>
      <label>{t("Update rhythm")}<select value={rhythm} onChange={event => setRhythm(event.target.value as BriefingConfig["briefingCadence"])}><option value="hourly">{t("Hourly")}</option><option value="daily">{t("Daily")}</option><option value="weekly">{t("Weekly")}</option></select></label>
      {message && <p role="status">{message}</p>}
      <div className="experience-dialog-actions"><button type="button" disabled={busy} onClick={props.onClose}>{t("Cancel")}</button><button className="primary-button" disabled={busy || !title.trim() || !prompt.trim()}>{busy ? "…" : t(props.feed ? "Save changes" : "Create feed")}</button></div>
      {props.feed && <div className="feed-editor-actions">
        <button type="button" disabled={busy} onClick={() => void run(async () => { await props.onPause?.(); props.onClose(); })}>{t(props.feed?.paused ? "Resume feed" : "Pause feed")}</button>
        <button type="button" disabled={busy} onClick={() => void run(async () => { await props.onCopy?.(); setMessage("URL copied"); })}>{t("Copy URL")}</button>
        <button type="button" className="danger-button" disabled={busy} onClick={() => { if (window.confirm(`Delete "${props.feed?.title}" and its published content?`)) void run(async () => { await props.onDelete?.(); }); }}>{t("Delete feed")}</button>
      </div>}
    </form>
  </dialog>;
}
